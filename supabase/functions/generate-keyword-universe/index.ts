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
    const { topic, context, subtopics } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subtopics || !Array.isArray(subtopics) || subtopics.length === 0) {
      return new Response(
        JSON.stringify({ error: "Subtopics are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log(`Generating keywords for "${topic}" with ${subtopics.length} subtopics`);

    const subtopicList = subtopics
      .map((s: any, i: number) => `${i + 1}. "${s.name}" — ${s.description}${s.example_queries?.length ? `\n   Examples: ${s.example_queries.join(", ")}` : ""}`)
      .join("\n");

    const system = `You are a world-class SEO keyword researcher. You are given a main topic and a set of subtopic territories. For EACH subtopic, generate 15-30 real search queries that people actually type into Google.

CRITICAL RULES:
- Every keyword MUST be something a real person would actually type into Google
- Prioritize long-tail, specific phrases (3-7 words) that reflect real search intent
- Include actual brand names, app names, platform names that exist in this space
- DO NOT return generic marketing jargon that nobody searches for
- DO NOT use special characters like bullets, em-dashes, or non-ASCII characters
- Mix search intents: informational (how to, what is), commercial (best, top, review), transactional (buy, download, sign up), navigational (specific brands/products)
- Include question-format queries (how, what, why, where, when)
- Include comparison queries (vs, alternative, compared to)
- Every subtopic/category MUST have at least 15 terms`;

    const user = `MAIN TOPIC: "${topic}"
${context ? `CONTEXT: ${context}` : ""}

SUBTOPIC TERRITORIES TO GENERATE KEYWORDS FOR:
${subtopicList}

Generate 15-30 highly specific, real Google search queries for EACH subtopic territory. Use the subtopic name as the category name.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 12000,
        tools: [
          {
            type: "function",
            function: {
              name: "generate_keyword_universe",
              description: "Return a structured keyword universe organized by categories",
              parameters: {
                type: "object",
                properties: {
                  categories: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        terms: { type: "array", items: { type: "string" } },
                      },
                      required: ["name", "terms"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["categories"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_keyword_universe" } },
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
    const totalTerms = results.categories.reduce((sum: number, cat: any) => sum + cat.terms.length, 0);
    console.log(`Generated ${results.categories.length} categories with ${totalTerms} total terms`);

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
