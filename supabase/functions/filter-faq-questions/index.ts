import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { questions, rules } = await req.json() as { questions: string[]; rules: string };
    if (!Array.isArray(questions) || questions.length === 0) {
      return new Response(JSON.stringify({ error: "No questions provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!rules || !rules.trim()) {
      return new Response(JSON.stringify({ error: "No filter rules provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const indexed = questions.map((q, i) => `${i}. ${q}`).join("\n");

    const systemPrompt = `You are a content quality filter. The user provides FILTER RULES describing which questions should be removed from a list. Your job: identify the questions that match those rules and should be removed.

Return STRICT JSON only, no markdown:
{"flagged":[{"index":<number>,"reason":"<short reason>"}]}

Rules:
- "index" is the integer at the start of each question line.
- Only flag questions that clearly match the user's removal rules.
- "reason" must be brief (under 12 words), referencing which rule applies.
- If nothing matches, return {"flagged":[]}.`;

    const userPrompt = `FILTER RULES (questions matching these should be REMOVED):
${rules.trim()}

QUESTIONS:
${indexed}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `AI gateway error: ${resp.status} ${t}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { flagged: { index: number; reason: string }[] } = { flagged: [] };
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    const flagged = (parsed.flagged || [])
      .filter((f) => Number.isInteger(f.index) && f.index >= 0 && f.index < questions.length)
      .map((f) => ({ index: f.index, reason: String(f.reason || "").slice(0, 200), question: questions[f.index] }));

    return new Response(JSON.stringify({ flagged }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
