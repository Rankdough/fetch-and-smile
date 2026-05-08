import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { question, sport, wordCount: wcRaw } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const wordCount: number = [300, 500, 700].includes(Number(wcRaw)) ? Number(wcRaw) : 500;

    // Section sizing per target word count
    const profile = wordCount === 300
      ? { sectionsMin: 1, sectionsMax: 2, paraWords: "40-60", para2Words: "20-35", bulletsMin: 3, bulletsMax: 3, faqMin: 2, faqMax: 3, includeTable: false, tldrWords: "30-45" }
      : wordCount === 700
        ? { sectionsMin: 3, sectionsMax: 3, paraWords: "70-110", para2Words: "30-55", bulletsMin: 3, bulletsMax: 4, faqMin: 3, faqMax: 4, includeTable: true, tldrWords: "50-80" }
        : { sectionsMin: 2, sectionsMax: 2, paraWords: "60-90", para2Words: "30-50", bulletsMin: 3, bulletsMax: 4, faqMin: 3, faqMax: 3, includeTable: true, tldrWords: "40-70" };

    const system = `You write concise, factual FAQ-style answers for a Shopify sports blog. British English. No em/en dashes. No buzzwords. No first-person pronouns. Plain, practical language. Always answer the actual question with specifics.

CRITICAL OPENING RULE: The VERY FIRST SENTENCE of the "opening" paragraph MUST be a complete, standalone, AI-quotable answer to the title question (max 30 words). No throat-clearing. No "When it comes to...", "In the world of...", or scene-setting. The reader (or an AI assistant quoting the article) must get the literal answer in sentence one. Subsequent sentences may add brief context.`;

    const userPrompt = `Question: "${question}"${sport ? `\nSport context: ${sport}` : ""}

Generate an FAQ article of approximately ${wordCount} words total (±10%). Return ONLY a JSON object via the provided tool.`;

    const sectionProps: Record<string, any> = {
      heading: { type: "string", description: "H2 phrased as a question." },
      paragraph: { type: "string", description: `${profile.paraWords} words.` },
      bullets: { type: "array", minItems: profile.bulletsMin, maxItems: profile.bulletsMax, items: { type: "string" } },
      paragraph2: { type: "string", description: `${profile.para2Words} words follow-up.` }
    };

    const properties: Record<string, any> = {
      h1: { type: "string", description: "Article H1 - rephrase question as a clear title using proper Title Case." },
      opening: { type: "string", description: "1 short paragraph (35-55 words). CRITICAL: The VERY FIRST SENTENCE must be a complete, standalone, AI-quotable answer to the title question (max 30 words). No throat-clearing, no scene-setting, no context before the answer. Sentence 1 = the answer. Sentences 2-3 = brief expansion or framing. Must NOT repeat the TL;DR verbatim. Conversational, no buzzwords." },
      tldr: { type: "string", description: `1 dense paragraph (${profile.tldrWords} words) directly answering the question with concrete specifics (numbers, names, durations). Different wording than the opening.` },
      quickTips: {
        type: "array", minItems: 3, maxItems: 3,
        items: { type: "string", description: "One actionable sentence, max 15 words. No bold markdown, no leading numbers." }
      },
      sections: {
        type: "array", minItems: profile.sectionsMin, maxItems: profile.sectionsMax,
        items: {
          type: "object",
          properties: sectionProps,
          required: ["heading", "paragraph", "bullets", "paragraph2"],
          additionalProperties: false
        }
      },
      faqs: {
        type: "array", minItems: profile.faqMin, maxItems: profile.faqMax,
        items: {
          type: "object",
          properties: { q: { type: "string" }, a: { type: "string", description: "1-2 sentences." } },
          required: ["q", "a"], additionalProperties: false
        }
      },
      summary: { type: "string", description: "1-2 sentence direct answer (used for meta summary)." },
      titleTag: { type: "string", description: "SEO title under 60 chars." },
      descriptionTag: { type: "string", description: "SEO meta description under 160 chars." },
      tags: { type: "string", description: "Comma-separated 3-5 tags, lowercase." }
    };

    const required = ["h1","opening","tldr","quickTips","sections","faqs","summary","titleTag","descriptionTag","tags"];

    if (profile.includeTable) {
      properties.table = {
        type: "object",
        properties: {
          caption: { type: "string" },
          headers: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
          rows: { type: "array", minItems: 3, maxItems: 5, items: { type: "array", items: { type: "string" } } }
        },
        required: ["caption", "headers", "rows"],
        additionalProperties: false
      };
      required.push("table");
    }

    const tool = {
      type: "function",
      function: {
        name: "emit_article",
        description: "Return all fields needed to populate a Shopify FAQ article row.",
        parameters: {
          type: "object",
          properties,
          required,
          additionalProperties: false
        }
      }
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt }
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_article" } }
      })
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${resp.status}`);
    }

    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("No tool call returned");
    const article = JSON.parse(call.function.arguments);

    return new Response(JSON.stringify({ article }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("generate-faq-article error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
