import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildPrompt(topic: string, context?: string, brandAnalysis?: any): { system: string; user: string } {
  const hasBrand = !!brandAnalysis;

  const system = `You are a world-class SEO keyword researcher with deep expertise in search behavior and real search data patterns. You know exactly what phrases real people type into Google — not generic marketing terms, but actual search queries with real volume.

Your job is to produce an EXHAUSTIVE keyword universe that a content strategist could use to capture organic traffic.

CRITICAL RULES:
- Every keyword MUST be something a real person would actually type into Google
- Prioritize long-tail, specific phrases (3-7 words) that reflect real search intent
- Include actual brand names, app names, platform names that exist in this space
- DO NOT return generic marketing jargon that nobody searches for
- DO NOT use special characters like bullets (•), em-dashes (—), or non-ASCII characters
- You MUST produce at least 200 total terms across all categories`;

  let user: string;

  if (hasBrand) {
    const ba = brandAnalysis;
    user = `I need a keyword universe for a brand with the following profile:

BRAND: ${ba.brand}
INDUSTRY: ${ba.industry}
PRODUCT TYPE: ${ba.products_services}
TARGET AUDIENCE: ${ba.target_audience}
GOALS: ${ba.goals}
COMPETITORS: ${ba.competitors?.join(", ") || "Unknown"}
KEY INSIGHTS: ${ba.key_insights?.join("; ") || "None"}

TOPIC FOCUS: "${topic}"
${context ? `ADDITIONAL CONTEXT: ${context}` : ""}

STEP 1 — UNDERSTAND THE SEARCH LANDSCAPE:
This is a ${ba.products_services}. The target user is: ${ba.target_audience}. Think about what these specific people would search for when:
- They don't know this product exists yet (problem-aware searches)
- They're looking for solutions (solution-aware searches)  
- They're comparing options (comparison searches)
- They're searching for specific activities or experiences
- They're searching for competitor products by name

STEP 2 — GENERATE KEYWORDS BY THESE CATEGORIES (create 12-20 categories, 15-30 terms each):

1. **Problem-aware queries**: What pain points drive the target audience to search? (e.g., "how to meet people after 40", "lonely after divorce", "how to make friends as an adult")
2. **Solution-aware queries**: Searches for the type of solution (e.g., "apps for making friends", "social apps for over 50", "group activity apps")
3. **Competitor brand searches**: Real competitor names + related queries (e.g., "${ba.competitors?.[0] || "meetup"} alternatives", "${ba.competitors?.[0] || "meetup"} vs ${ba.competitors?.[1] || "bumble bff"}")
4. **Activity-specific searches**: What activities does the target audience search for? (e.g., "hiking groups near me", "book clubs for adults", "walking groups for over 50s")
5. **Demographic-specific searches**: Queries that include the target demographic (e.g., "social events for over 40s", "friends apps for seniors", "activities for retired people")
6. **"Best of" and recommendation queries**: (e.g., "best apps for meeting people", "best social clubs for adults")
7. **Location-intent queries**: Searches with local intent (e.g., "social groups near me", "things to do with people near me")
8. **How-to and advice queries**: Informational content the audience searches (e.g., "how to expand your social circle", "how to overcome social anxiety")
9. **Review and comparison queries**: (e.g., "is ${ba.brand} worth it", "${ba.brand} reviews", "best friend-finding apps 2025")
10. **Seasonal and trending queries**: Time-specific searches
11. **Long-tail conversational queries**: 5-8 word natural language searches
12. **Question-format queries**: Starting with what/how/why/where/which/is/can

IMPORTANT: Every term must be a plausible Google search query. Think about what a ${ba.target_audience} would actually type. Be extremely specific — use real app names, real activity names, real demographics.`;
  } else {
    user = `Generate a massive, highly specific semantic keyword universe for: "${topic}"

${context ? `Additional context/guidance: ${context}` : ""}

CRITICAL REQUIREMENTS:

1. SPECIFICITY IS EVERYTHING. Give REAL, SPECIFIC examples — actual brand names, product names, real search queries.

2. Create 12-18 categories with 15-30 terms each. Categories MUST include:
   - Specific product/brand names and comparisons
   - Problem-aware searches (what pain drives people to search)
   - Solution-aware searches (looking for answers)
   - Activity or use-case specific searches
   - "Best of" and recommendation queries
   - Competitor comparisons
   - Troubleshooting/problem queries
   - Long-tail conversational phrases (4-8 words)
   - Question-format queries (what/how/why/where)
   - Demographic-specific queries if applicable
   - Local-intent queries if applicable

3. You MUST produce at least 200 total terms. Each must be a plausible Google search query.

4. DO NOT use special characters like bullets (•), em-dashes (—), or non-ASCII characters.`;
  }

  return { system, user };
}

async function callAI(system: string, user: string, apiKey: string, maxTokens: number) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      tools: [
        {
          type: "function",
          function: {
            name: "generate_keyword_universe",
            description: "Return a structured keyword universe organized by categories with real search queries people actually type into Google",
            parameters: {
              type: "object",
              properties: {
                categories: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Category name" },
                      terms: {
                        type: "array",
                        items: { type: "string" },
                        description: "Real Google search queries — specific, long-tail, with actual brand/product names",
                      },
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

  return response;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, context, brandAnalysis } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { system, user } = buildPrompt(topic, context, brandAnalysis);
    const response = await callAI(system, user, LOVABLE_API_KEY, 10000);

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

    let data = await response.json();
    let toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error("No structured output returned from AI");
    }

    let results = JSON.parse(toolCall.function.arguments);
    let totalTerms = results.categories.reduce((sum: number, cat: any) => sum + cat.terms.length, 0);
    console.log(`Generated ${results.categories.length} categories with ${totalTerms} total terms for topic: ${topic}`);

    // Retry once if under 150 terms
    if (totalTerms < 150) {
      console.log(`Only ${totalTerms} terms, retrying...`);
      const retryResponse = await callAI(
        system,
        user + `\n\nIMPORTANT: Your previous attempt only produced ${totalTerms} terms. You MUST produce at least 200 unique, specific search queries. Add more categories and more terms per category. Every term must be a real search query.`,
        LOVABLE_API_KEY,
        12000
      );

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        const retryToolCall = retryData.choices?.[0]?.message?.tool_calls?.[0];
        if (retryToolCall) {
          const retryResults = JSON.parse(retryToolCall.function.arguments);
          const retryTotal = retryResults.categories.reduce((sum: number, cat: any) => sum + cat.terms.length, 0);
          if (retryTotal > totalTerms) {
            results = retryResults;
            totalTerms = retryTotal;
            console.log(`Retry produced ${totalTerms} terms`);
          }
        }
      }
    }

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
