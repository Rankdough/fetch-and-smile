import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, audience, country, language } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log(`Generating semantic keyword universe for: "${topic}"`);

    const system = `You are a semantic keyword and entity discovery engine.

Goal: Given ONE topic, generate a comprehensive set of seed keywords and question-intents that fully map the topic as a knowledge graph, across product types, sub-categories, audiences, use-cases, problems, contexts, and modifiers.

Rules:
- Do NOT return a simple list of synonyms.
- Prefer concrete entities and common phrases people actually search.
- Cover breadth first, then depth.
- Avoid duplicates.
- Keep items short (2–6 words for seed keywords).
- Include regional variants only if the user specifies a country.
- Seed keywords must be SHORT and REAL — things you'd type into Ahrefs or Google, not hallucinated long-tail phrases.
- Think like an SEO strategist building a content map: capture every angle, entity, subtopic, and adjacent concept.

For the given topic:
1. Identify the core entity definition.
2. Create 12-20 clusters. For each cluster provide:
   - "cluster_name"
   - "seed_keywords" (20–50 short, concrete terms)
   - "example_entities" (10–30 proper nouns / recognisable items where relevant)
   - "questions" (15–30 natural-language queries)
   - "modifiers" (10–30 adjectives/constraints like "best", "cheap", "safe", "for toddlers")
3. Add "negative_keywords" (things often confused with the topic but not in scope).
4. Add "cross_cutting_modifiers" — dimensions that apply across all clusters (age, budget, location, intent).
5. Add "notes" with any ambiguity you detected and how you resolved it.
6. Do NOT append intent labels or tags like [transactional] or [informational] to keywords. Return plain, clean keywords only.`;

    const lang = language || "English (UK)";
    const user = `Topic: ${topic}
${audience ? `Audience (optional): ${audience}` : ""}
${country ? `Country (optional): ${country}` : ""}
Language: ${lang}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 16000,
        tools: [
          {
            type: "function",
            function: {
              name: "return_semantic_map",
              description: "Return the structured semantic keyword universe",
              parameters: {
                type: "object",
                properties: {
                  topic: { type: "string" },
                  definition: { type: "string" },
                  clusters: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        cluster_name: { type: "string" },
                        seed_keywords: { type: "array", items: { type: "string" } },
                        example_entities: { type: "array", items: { type: "string" } },
                        questions: { type: "array", items: { type: "string" } },
                        modifiers: { type: "array", items: { type: "string" } },
                      },
                      required: ["cluster_name", "seed_keywords", "questions", "modifiers"],
                      additionalProperties: false,
                    },
                  },
                  cross_cutting_modifiers: { type: "array", items: { type: "string" } },
                  negative_keywords: { type: "array", items: { type: "string" } },
                  notes: { type: "string" },
                },
                required: ["topic", "definition", "clusters", "cross_cutting_modifiers", "negative_keywords", "notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_semantic_map" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI generation failed: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No structured output returned from AI");

    const results = JSON.parse(toolCall.function.arguments);

    const totalSeeds = results.clusters.reduce((sum: number, c: any) => sum + (c.seed_keywords?.length || 0), 0);
    const totalQuestions = results.clusters.reduce((sum: number, c: any) => sum + (c.questions?.length || 0), 0);
    console.log(`Generated ${results.clusters.length} clusters, ${totalSeeds} seed keywords, ${totalQuestions} questions`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate keyword universe error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate keywords";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
