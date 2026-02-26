import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SeedThemes {
  coreTopics: string[];
  demographics: string[];
  activities: string[];
  intentModifiers: string[];
  locations: string[];
  patterns: string[];
}

function buildPrompt(
  topic: string,
  context?: string,
  brandAnalysis?: any,
  seedThemes?: SeedThemes,
  rawSample?: string[]
): { system: string; user: string } {
  const hasThemes = seedThemes && Object.values(seedThemes).some(
    (v) => Array.isArray(v) && v.length > 0
  );

  const system = `You are a world-class SEO keyword researcher. Your job is to produce a COMPREHENSIVE keyword universe of real search queries.

CRITICAL RULES:
- Every keyword MUST be something a real person would actually type into Google
- Prioritize long-tail, specific phrases (3-7 words) that reflect real search intent
- Include actual brand names, app names, platform names that exist in this space
- DO NOT return generic marketing jargon that nobody searches for
- DO NOT use special characters like bullets, em-dashes, or non-ASCII characters
- You MUST produce at least 200 total terms across all categories
${hasThemes ? `
SEED THEME INSTRUCTIONS:
You have been given DECOMPOSED SEMANTIC BUILDING BLOCKS extracted from real keyword data (Ahrefs/GSC).
These are the core concepts, modifiers, demographics, activities, intents, and locations found in proven search queries.

Your job is to COMBINATORIALLY EXPAND these building blocks:
1. COMBINE core topics × demographics × intents to create long-tail keywords
2. COMBINE activities × locations × modifiers for local/activity queries  
3. COMBINE demographics × activities for audience-specific queries
4. CREATE question-format queries using the core topics and demographics
5. ADD comparison queries using competitor/alternative terms
6. IDENTIFY gaps — what combinations are NOT obvious but highly relevant?
7. Every generated keyword should be a plausible Google search, not a random combination
` : ""}`;

  let user = "";

  if (brandAnalysis) {
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

  if (hasThemes) {
    user += `

SEMANTIC BUILDING BLOCKS (extracted from real search data):

${seedThemes!.coreTopics.length > 0 ? `CORE TOPIC WORDS: ${seedThemes!.coreTopics.join(", ")}` : ""}
${seedThemes!.demographics.length > 0 ? `DEMOGRAPHIC MODIFIERS: ${seedThemes!.demographics.join(", ")}` : ""}
${seedThemes!.activities.length > 0 ? `ACTIVITIES & INTERESTS: ${seedThemes!.activities.join(", ")}` : ""}
${seedThemes!.intentModifiers.length > 0 ? `INTENT MODIFIERS: ${seedThemes!.intentModifiers.join(", ")}` : ""}
${seedThemes!.locations.length > 0 ? `LOCATION TERMS: ${seedThemes!.locations.join(", ")}` : ""}
${seedThemes!.patterns.length > 0 ? `RECURRING SEARCH PATTERNS: ${seedThemes!.patterns.join(", ")}` : ""}`;

    if (rawSample && rawSample.length > 0) {
      user += `

EXAMPLE REAL KEYWORDS (sample of ${rawSample.length} from seed data — use these to understand search style):
${rawSample.join("\n")}`;
    }

    user += `

Using these building blocks, generate a massive keyword universe. Create 12-20 categories with 15-30 terms each.
COMBINE the building blocks systematically:
- "[activity] + [demographic]" → e.g., "hiking groups for over 50s"
- "[core topic] + [intent]" → e.g., "best social apps for seniors"
- "[core topic] + [location]" → e.g., "meetup groups near me"
- "[demographic] + [activity] + [location]" → e.g., "over 40 tennis clubs berlin"
- Question formats → "how to meet people over 50", "what are the best apps for making friends"

Categories MUST include: demographic-specific, activity-based, intent-based (informational, commercial, transactional), location-based, comparison/alternative, question-format, and problem-aware queries.`;
  } else {
    user += `

Generate a massive, highly specific keyword universe. Create 12-18 categories with 15-30 terms each.
Categories MUST include problem-aware, solution-aware, comparison, activity-specific, demographic-specific, "best of", local-intent, how-to, and question-format queries.
Every term must be a plausible Google search query. Be extremely specific.`;
  }

  return { system, user };
}

async function callAI(system: string, user: string, apiKey: string, maxTokens: number) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, context, brandAnalysis, seedThemes, rawSample } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log(`Generating keywords for "${topic}" with themes:`, seedThemes ? "yes" : "no");

    const { system, user } = buildPrompt(topic, context, brandAnalysis, seedThemes, rawSample);
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
    if (!toolCall) throw new Error("No structured output returned from AI");

    let results = JSON.parse(toolCall.function.arguments);
    let totalTerms = results.categories.reduce((sum: number, cat: any) => sum + cat.terms.length, 0);
    console.log(`Generated ${results.categories.length} categories with ${totalTerms} total terms`);

    // Retry once if under 150 terms
    if (totalTerms < 150) {
      console.log(`Only ${totalTerms} terms, retrying...`);
      const retryResponse = await callAI(
        system,
        user + `\n\nIMPORTANT: Your previous attempt only produced ${totalTerms} terms. You MUST produce at least 200 unique, specific search queries.`,
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
