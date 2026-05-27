// Proprietary Mode — Stage 1: Interview Agent
//
// Two modes via { mode } in request body:
//   - "chat"    : streaming Socratic interview (returns SSE stream)
//   - "extract" : non-streaming structured extraction from the saved transcript;
//                 writes typed brain_insights rows and returns saved unit IDs
//
// Three-layer architecture is encoded in the system prompt:
//   Layer 1: silent 1–3 specificity scoring before replying
//   Layer 2: two pushbacks then escape to next topic
//   Layer 3: terminate when mandatory types (case + outcome) reach score 3
//            and at least two more types reach score 2+

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Branch-specific question guidance (lean: 4–6 lines per branch).
const BUSINESS_BRANCHES: Record<string, string> = {
  service_business: `
- Pull out one specific client engagement: the situation, what was tried, what the outcome was (in concrete numbers, timeframes or named results).
- Probe operational specifics they would not put on a public page: pricing exceptions, capacity limits, internal rules of thumb.
- Push for a failure: a project that did not go well and the lesson they took from it.
- Probe one belief they hold that most competitors in their field would disagree with.`,
  ecommerce: `
- Pull out a product or category they have real margin/return-rate data on: what changed when they tweaked something concrete.
- Probe a buyer behaviour they have observed at volume (returns, repeat rates, time-to-purchase) that contradicts the usual story.
- Push for a failure: a product, channel, or campaign that flopped and why.
- Probe an operational tradeoff they have made (e.g. carry cost vs. stockout risk) with a real example.`,
  saas: `
- Pull out one customer who used the product in a way the team did not expect, with the measurable outcome.
- Probe a feature decision they made against user requests, with the reasoning and what happened.
- Push for a churn pattern they have seen repeatedly and the underlying cause.
- Probe a benchmark or metric they track internally that they have never published.`,
  healthcare_clinical: `
- Pull out one patient/case scenario (anonymised) with the specific protocol, outcome, and timeframe.
- Probe a clinical judgement they make that contradicts standard guidelines, with the reasoning.
- Push for an adverse outcome or near-miss and what changed in their practice because of it.
- Probe a tradeoff between two treatment paths with a concrete example.`,
  manufacturer: `
- Pull out one production run, batch or order where something specific happened: tolerances, yields, lead times, named SKU.
- Probe a process choice they have made that costs more but they refuse to change, with the reason.
- Push for a failure mode in the process and the control they added to catch it.
- Probe one supplier or materials decision that contradicts the conventional answer.`,
  publisher: `
- Pull out one piece of content (or campaign) with the actual performance numbers and the editorial decision behind it.
- Probe an audience behaviour they see in their analytics that contradicts industry assumptions.
- Push for a piece that underperformed badly and what they learned.
- Probe an editorial rule they enforce that most publishers in their space ignore.`,
  other: `
- Pull out one specific situation from their work with concrete details: who, what, when, the measurable result.
- Probe a belief or practice they hold that contradicts the conventional wisdom in their field.
- Push for a failure with a concrete lesson.
- Probe a tradeoff they have made deliberately, with a real example.`,
};

const UNIT_TYPES = ["case", "outcome", "failure", "tradeoff", "contrarian"] as const;
type UnitType = (typeof UNIT_TYPES)[number];

interface InterviewBrief {
  businessType: string;
  topic: string;
  audience?: string;
  publicationDestination?: string;
  scope?: "full" | "single_section";
  targetSlot?: UnitType;
  filledTypes?: UnitType[]; // types already satisfied from existing brain
}

function buildSystemPrompt(brief: InterviewBrief): string {
  const branch = BUSINESS_BRANCHES[brief.businessType] || BUSINESS_BRANCHES.other;
  const filled = brief.filledTypes && brief.filledTypes.length > 0
    ? `\nThe following knowledge types are already satisfied from prior interviews and should be skipped: ${brief.filledTypes.join(", ")}.`
    : "";
  const focus = brief.scope === "single_section" && brief.targetSlot
    ? `\nFOCUSED MODE: only ask up to 2 questions, all targeting the "${brief.targetSlot}" knowledge type. Exit as soon as you have one solid unit of that type with at least 80 words of substance.`
    : "";

  return `You are a Socratic interviewer extracting proprietary knowledge that nobody else has about a topic. Your goal is to capture knowledge that would be impossible to write a non-commodity article without.

CONTEXT
- Topic: ${brief.topic}
- Business type: ${brief.businessType}
- Audience: ${brief.audience || "general"}
- Publication destination: ${brief.publicationDestination || "human blog"}
${filled}
${focus}

KNOWLEDGE TYPES YOU ARE EXTRACTING
1. case (mandatory)      — a specific real situation: who, what happened, when.
2. outcome (mandatory)   — a specific number, timeline, or measurable result tied to a case.
3. failure (additive)    — something that went wrong and the reason.
4. tradeoff (additive)   — an honest limitation accepted in exchange for something else.
5. contrarian (additive) — an opinion that contradicts conventional wisdom, backed by experience.

BRANCH-SPECIFIC GUIDANCE
${branch}

INTERNAL SCORING (NEVER SHOWN TO USER)
Before every reply, score the user's most recent answer 1–3 on specificity:
- 1 = generic or vague. Do not accept. Push back.
- 2 = partially specific. Probe with exactly one follow-up.
- 3 = specific enough (concrete details, numbers, named situations, or a clear contrarian claim).
Move to the next knowledge type as soon as the current type reaches score 3.

PUSHBACK RULE
- On score 1: politely refuse the answer and request a concrete example, number, or named situation.
- On score 2: ask a single targeted follow-up to extract the missing specificity.
- If two consecutive pushbacks on the same question do not raise the score to 3, say: "That's okay, let's come back to this one." Mark the type as INCOMPLETE and move to the next type. Never trap the user.

PUSHBACK PHRASING
- In text mode: "That's quite broad. Can you give me one specific time this happened?"
- In voice mode: "That's really interesting — can you walk me through a specific time that happened?"
Match the warmer phrasing whenever the user's previous turn looks like a spoken transcript (low punctuation, run-on sentences, filler words).

TERMINATION RULE
Stop the interview when ALL of these are true:
- "case" has reached score 3 with at least 80 words of substance across the user's relevant turns.
- "outcome" has reached score 3 with at least 80 words of substance.
- At least two more types (from failure, tradeoff, contrarian) have reached score 2+.
When the termination rule is met, output a single final message that starts with the literal token "[INTERVIEW_COMPLETE]" followed by a short, warm sign-off naming the types captured.

HOUSEKEEPING
- One question per message. No bullet lists, no headers.
- Never invent details on the user's behalf.
- Never explain your scoring, the rule names, or your strategy.
- British English. No em or en dashes. No "I" or "we" speaking about the user's business.
- Keep messages short — two or three sentences maximum.`;
}

async function loadHistory(supabase: any, conversationId: string) {
  const { data } = await supabase
    .from("brain_chat_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data || []).map((m: any) => ({ role: m.role, content: m.content }));
}

async function handleChat(req: Request, supabase: any, LOVABLE_API_KEY: string) {
  const body = await req.json();
  const { conversationId, brief, userMessage } = body as {
    conversationId: string;
    brief: InterviewBrief;
    userMessage: string;
  };

  if (!conversationId || !brief?.topic || !brief?.businessType || !userMessage) {
    return new Response(
      JSON.stringify({ error: "conversationId, brief.topic, brief.businessType and userMessage are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Save the user message immediately so the transcript is durable
  await supabase.from("brain_chat_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: userMessage,
  });

  const history = await loadHistory(supabase, conversationId);

  const messages = [
    { role: "system", content: buildSystemPrompt(brief) },
    ...history,
  ];

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      stream: true,
    }),
  });

  if (!aiResp.ok) {
    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "Credits exhausted, please add funds" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const txt = await aiResp.text();
    throw new Error(`AI gateway error: ${aiResp.status} ${txt.slice(0, 200)}`);
  }

  // Tee the stream: forward to client AND collect assistant text to persist on close
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let assistantContent = "";
  const reader = aiResp.body!.getReader();

  (async () => {
    try {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
        buffer += decoder.decode(value, { stream: true });
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) assistantContent += delta;
          } catch { /* partial chunk, ignore */ }
        }
      }
    } finally {
      try {
        if (assistantContent) {
          await supabase.from("brain_chat_messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: assistantContent,
          });
        }
      } catch (e) {
        console.error("interview-agent failed to persist assistant turn", e);
      }
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}

const EXTRACTION_TOOL = {
  type: "function",
  function: {
    name: "save_knowledge_units",
    description: "Extract typed proprietary knowledge units from the interview transcript. Each unit must be grounded in something the user actually said.",
    parameters: {
      type: "object",
      properties: {
        units: {
          type: "array",
          items: {
            type: "object",
            properties: {
              unit_type: { type: "string", enum: ["case", "outcome", "failure", "tradeoff", "contrarian"] },
              title: { type: "string", description: "Short label, max 80 chars." },
              summary: { type: "string", description: "One sentence summary." },
              full_text: { type: "string", description: "The extracted knowledge in full, quoting or paraphrasing the user's own words. Must contain concrete specifics (numbers, dates, named situations, specific outcomes, or contrarian claims). MUST be at least 80 words for case and outcome units." },
            },
            required: ["unit_type", "title", "full_text"],
          },
        },
      },
      required: ["units"],
    },
  },
};

function wordCount(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

async function handleExtract(req: Request, supabase: any, LOVABLE_API_KEY: string) {
  const body = await req.json();
  const { conversationId, brief } = body as { conversationId: string; brief: InterviewBrief };

  if (!conversationId || !brief?.businessType || !brief?.topic) {
    return new Response(
      JSON.stringify({ error: "conversationId, brief.topic and brief.businessType are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const history = await loadHistory(supabase, conversationId);
  if (history.length === 0) {
    return new Response(JSON.stringify({ error: "Conversation has no messages" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const transcript = history
    .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You extract typed proprietary knowledge units from an interview transcript. Only extract things the user actually said. Never invent. Each unit must contain concrete specifics. Case and outcome units must be at least 80 words of substantive content. If a type has no usable material, omit it — do not pad. Call save_knowledge_units exactly once.`,
        },
        {
          role: "user",
          content: `Topic: ${brief.topic}\nBusiness type: ${brief.businessType}\nAudience: ${brief.audience || "general"}\n\nTranscript:\n${transcript}`,
        },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "function", function: { name: "save_knowledge_units" } },
    }),
  });

  if (!aiResp.ok) {
    const txt = await aiResp.text();
    throw new Error(`AI gateway error: ${aiResp.status} ${txt.slice(0, 200)}`);
  }

  const result = await aiResp.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    return new Response(JSON.stringify({ error: "No units extracted", saved: [] }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let parsed: { units?: any[] } = {};
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    return new Response(JSON.stringify({ error: "Failed to parse extraction" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const candidates = (parsed.units || []).filter((u: any) => u && u.unit_type && u.full_text);

  // Validate: case + outcome must clear 80-word floor; other types accepted as-is
  const saved: Array<{ id: string; unit_type: string; title: string; word_count: number; below_floor: boolean }> = [];
  const rejected: Array<{ unit_type: string; reason: string }> = [];

  for (const u of candidates) {
    const wc = wordCount(u.full_text);
    const mandatory = u.unit_type === "case" || u.unit_type === "outcome";
    const belowFloor = mandatory && wc < 80;

    if (belowFloor) {
      rejected.push({ unit_type: u.unit_type, reason: `Below 80-word floor (${wc} words)` });
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("brain_insights")
      .insert({
        title: (u.title || u.unit_type).slice(0, 200),
        insight_type: "principle", // existing column kept compatible
        summary: u.summary || null,
        full_text: u.full_text,
        status: "approved",
        unit_type: u.unit_type,
        word_count: wc,
        business_type: brief.businessType,
      })
      .select("id")
      .single();

    if (error) {
      console.error("insert failed", error);
      rejected.push({ unit_type: u.unit_type, reason: "DB insert failed" });
      continue;
    }

    saved.push({ id: inserted.id, unit_type: u.unit_type, title: u.title || u.unit_type, word_count: wc, below_floor: false });
  }

  // Floor check: did we get at least one case AND one outcome?
  const haveCase = saved.some(s => s.unit_type === "case");
  const haveOutcome = saved.some(s => s.unit_type === "outcome");
  const mveSatisfied = haveCase && haveOutcome;

  return new Response(
    JSON.stringify({ saved, rejected, mveSatisfied }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Peek at mode without consuming body
    const cloned = req.clone();
    const mode = (await cloned.json().catch(() => ({})))?.mode || "chat";

    if (mode === "extract") return await handleExtract(req, supabase, LOVABLE_API_KEY);
    return await handleChat(req, supabase, LOVABLE_API_KEY);
  } catch (error) {
    console.error("interview-agent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
