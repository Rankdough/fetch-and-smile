import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildPrompt(topic: string, context?: string, brandAnalysis?: any, seedKeywords?: string[]): { system: string; user: string } {
  const hasBrand = !!brandAnalysis;
  const hasSeeds = seedKeywords && seedKeywords.length > 0;

  // If we have seed data, sample up to 300 representative keywords
  let seedSample: string[] = [];
  if (hasSeeds) {
    // Deduplicate and take a representative sample
    const unique = [...new Set(seedKeywords)];
    if (unique.length > 300) {
      // Take evenly distributed sample
      const step = Math.floor(unique.length / 300);
      seedSample = unique.filter((_, i) => i % step === 0).slice(0, 300);
    } else {
      seedSample = unique;
    }
  }

  const system = `You are a world-class SEO keyword researcher. Your job is to produce a COMPREHENSIVE keyword universe of real search queries.

CRITICAL RULES:
- Every keyword MUST be something a real person would actually type into Google
- Prioritize long-tail, specific phrases (3-7 words) that reflect real search intent
- Include actual brand names, app names, platform names that exist in this space
- DO NOT return generic marketing jargon that nobody searches for
- DO NOT use special characters like bullets, em-dashes, or non-ASCII characters
- You MUST produce at least 200 total terms across all categories
${hasSeeds ? `
SEED DATA INSTRUCTIONS:
You have been given REAL keyword data from Ahrefs/GSC. These are PROVEN search queries with actual volume.
Your job is to:
1. ANALYZE the patterns in the seed data — common modifiers, structures, demographics, intents
2. IDENTIFY GAPS — what intent categories or topic angles are NOT covered by the seed data
3. GENERATE NEW KEYWORDS using the same patterns and structures found in the real data
4. DO NOT simply repeat the seed keywords — expand into new territory using proven patterns
5. Every generated keyword should follow patterns observed in the real data (e.g., if "[activity] near me" appears often, generate more of those)
` : ""}`;

  let user: string;

  if (hasBrand) {
    const ba = brandAnalysis;
    user = `TOPIC: "${topic}"
${context ? `CONTEXT: ${context}` : ""}

BRAND PROFILE:
- Brand: ${ba.brand}
- Industry: ${ba.industry}
- Product Type: ${ba.products_services}
- Target Audience: ${ba.target_audience}
- Goals: ${ba.goals}
- Competitors: ${ba.competitors?.join(", ") || "Unknown"}
- Key Insights: ${ba.key_insights?.join("; ") || "None"}`;
  } else {
    user = `TOPIC: "${topic}"
${context ? `CONTEXT: ${context}` : ""}`;
  }

  if (hasSeeds) {
    user += `

REAL SEED KEYWORD DATA (${seedKeywords!.length} total, sample of ${seedSample.length} shown):
${seedSample.join("\n")}

Based on these REAL keywords with proven search volume, analyze the patterns and generate a comprehensive keyword universe. Group into intent-based categories. Focus on:
1. Patterns you see repeated (e.g., "[thing] near me", "best [thing] for [audience]", "how to [action]")
2. Topics/intents NOT covered in the seed data but relevant to the topic
3. Long-tail variations of high-value seed terms
4. Question-format queries related to the topic
5. Comparison and alternative queries

Create 12-20 categories with 15-30 terms each. Every term must follow patterns from real search data.`;
  } else {
    user += `

Generate a massive, highly specific keyword universe. Create 12-18 categories with 15-30 terms each.
Categories MUST include problem-aware, solution-aware, comparison, activity-specific, demographic-specific, "best of", local-intent, how-to, and question-format queries.
Every term must be a plausible Google search query. Be extremely specific.`;
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
            description: "Return a structured keyword universe organized by categories with real search queries",
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
                        description: "Real Google search queries based on patterns from seed data",
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
    const { topic, context, brandAnalysis, seedKeywords } = await req.json();

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

    console.log(`Generating keywords for "${topic}" with ${seedKeywords?.length || 0} seed keywords`);

    const { system, user } = buildPrompt(topic, context, brandAnalysis, seedKeywords);
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
    console.log(`Generated ${results.categories.length} categories with ${totalTerms} total terms`);

    // Retry once if under 150 terms
    if (totalTerms < 150) {
      console.log(`Only ${totalTerms} terms, retrying...`);
      const retryResponse = await callAI(
        system,
        user + `\n\nIMPORTANT: Your previous attempt only produced ${totalTerms} terms. You MUST produce at least 200 unique, specific search queries. Add more categories and more terms per category.`,
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
