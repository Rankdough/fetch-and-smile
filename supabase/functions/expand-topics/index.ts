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
    const { topic, context } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log(`Expanding topics for: "${topic}"`);

    const system = `You are a world-class SEO strategist and content planner. Given a topic and optional context about a brand/product, your job is to THINK LATERALLY and identify ALL related subtopics, adjacent themes, and semantic territories that a comprehensive content strategy should cover.

CRITICAL THINKING PROCESS:
1. Start with the core topic and think about EVERY angle someone might search for related to it
2. Think about the PROBLEMS people face (pain points, frustrations, emotions)
3. Think about SOLUTIONS (tools, apps, methods, strategies, communities)
4. Think about RELATED ACTIVITIES that overlap with this topic
5. Think about DEMOGRAPHICS (who are the different types of people interested in this?)
6. Think about CONTEXTS (when, where, why would someone search for this?)
7. Think about ADJACENT TOPICS that aren't obviously connected but share audience overlap
8. Think about COMMERCIAL INTENT (products, services, comparisons, reviews)
9. Think about INFORMATIONAL INTENT (how-to, guides, tips, advice)
10. Think about EMOTIONAL/SOCIAL aspects (loneliness, excitement, community, belonging)

EXAMPLES:
- Topic "meeting new people" should expand to: loneliness, expat life, moving to a new city, social anxiety, dating alternatives, anti-dating, finding friends as an adult, hobby groups, city events, community activities, social apps, networking, coworking, volunteer work, sports clubs, language exchange, etc.
- Topic "toys" should expand to: Lego, PlayStation, dolls, trampolines, balance bikes, educational toys, board games, outdoor play, kids tablets, toy safety, age-appropriate gifts, toy trends, collectibles, STEM toys, etc.

Each subtopic should be a CONTENT TERRITORY — broad enough to generate 15-30 specific search keywords, but specific enough to be a coherent theme.`;

    const user = `TOPIC: "${topic}"
${context ? `\nCONTEXT: ${context}` : ""}

Generate 15-25 subtopic territories. For each, provide:
- A clear, descriptive name
- A brief explanation of what keywords/content this territory covers
- 3-5 example search queries that would fall under this territory`;

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
        tools: [
          {
            type: "function",
            function: {
              name: "return_subtopics",
              description: "Return the expanded subtopic territories",
              parameters: {
                type: "object",
                properties: {
                  subtopics: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Subtopic territory name" },
                        description: { type: "string", description: "What this territory covers" },
                        example_queries: {
                          type: "array",
                          items: { type: "string" },
                          description: "3-5 example search queries",
                        },
                      },
                      required: ["name", "description", "example_queries"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["subtopics"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_subtopics" } },
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
    console.log(`Generated ${results.subtopics.length} subtopics`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Expand topics error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to expand topics";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
