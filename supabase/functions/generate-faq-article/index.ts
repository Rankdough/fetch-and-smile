import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { question, sport } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const system = `You write concise, factual FAQ-style answers for a Shopify sports blog. British English. No em/en dashes. No buzzwords. No first-person pronouns. Plain, practical language. Always answer the actual question with specifics.`;

    const userPrompt = `Question: "${question}"${sport ? `\nSport context: ${sport}` : ""}

Generate a SHORT FAQ article (~450-550 words total) and return ONLY a JSON object via the provided tool.`;

    const tool = {
      type: "function",
      function: {
        name: "emit_article",
        description: "Return all fields needed to populate a Shopify FAQ article row.",
        parameters: {
          type: "object",
          properties: {
            h1: { type: "string", description: "Article H1 - rephrase question as a clear title." },
            tldr: { type: "string", description: "1 dense paragraph (40-70 words) directly answering the question with specifics." },
            quickTips: {
              type: "array", minItems: 3, maxItems: 3,
              items: { type: "string", description: "One actionable sentence, max 15 words." }
            },
            sections: {
              type: "array", minItems: 2, maxItems: 2,
              items: {
                type: "object",
                properties: {
                  heading: { type: "string", description: "H2 phrased as a question." },
                  paragraph: { type: "string", description: "60-90 words." },
                  bullets: { type: "array", minItems: 3, maxItems: 4, items: { type: "string" } },
                  paragraph2: { type: "string", description: "30-50 words follow-up." }
                },
                required: ["heading", "paragraph", "bullets", "paragraph2"],
                additionalProperties: false
              }
            },
            table: {
              type: "object",
              properties: {
                caption: { type: "string" },
                headers: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
                rows: { type: "array", minItems: 3, maxItems: 5, items: { type: "array", items: { type: "string" } } }
              },
              required: ["caption", "headers", "rows"],
              additionalProperties: false
            },
            faqs: {
              type: "array", minItems: 3, maxItems: 3,
              items: {
                type: "object",
                properties: { q: { type: "string" }, a: { type: "string", description: "1-2 sentences." } },
                required: ["q", "a"], additionalProperties: false
              }
            },
            summary: { type: "string", description: "1-2 sentence direct answer (used as Summary HTML and subheading)." },
            titleTag: { type: "string", description: "SEO title under 60 chars." },
            descriptionTag: { type: "string", description: "SEO meta description under 160 chars." },
            tags: { type: "string", description: "Comma-separated 3-5 tags, lowercase." }
          },
          required: ["h1","tldr","quickTips","sections","table","faqs","summary","titleTag","descriptionTag","tags"],
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
