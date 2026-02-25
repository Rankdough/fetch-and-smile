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
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a world-class SEO keyword researcher AND a genuine domain expert in whatever topic you are given. You have deep insider knowledge — you know the real product names, brand names, model numbers, popular titles, slang, jargon, community terminology, and the exact phrases real people type into Google.

Your job is to produce an EXHAUSTIVE semantic keyword universe that a content strategist could use to dominate search results for an entire niche. You must go far beyond generic terms.`;

    const userPrompt = `Generate a massive, highly specific semantic keyword universe for: "${topic}"

${context ? `Additional context/guidance: ${context}` : ""}

CRITICAL REQUIREMENTS — READ CAREFULLY:

1. SPECIFICITY IS EVERYTHING. Do NOT give generic terms. Give REAL, SPECIFIC examples:
   - BAD: "popular games", "gaming accessories", "game titles"
   - GOOD: "PlayStation 5", "Xbox Series X", "Nintendo Switch OLED", "Elden Ring", "Fortnite Battle Royale", "DualSense controller", "Razer BlackShark V2"

2. You MUST include ALL of the following category types (create 12-18 categories total):
   - Specific product/brand names (real names like "Sony", "Microsoft", "Nintendo", "Steam Deck")
   - Specific model names and versions (e.g. "PS5 Slim", "Xbox Elite Controller Series 2")
   - Specific titles/works/items in the field (e.g. actual game names, book titles, song names, etc.)
   - Technical specifications and jargon insiders use
   - Community slang and abbreviations (e.g. "GG", "nerf", "meta", "AFK", "FPS", "RPG")
   - Price-related and buying-intent search queries (e.g. "best gaming laptop under $1000")
   - Comparison queries people search (e.g. "PS5 vs Xbox Series X", "mechanical vs membrane keyboard")
   - Problem/troubleshooting queries (e.g. "PS5 won't connect to WiFi", "controller drift fix")
   - "Best of" and recommendation queries (e.g. "best co-op games 2025", "best gaming monitor for FPS")
   - Accessories, peripherals, and related equipment with real product names
   - Beginner/getting-started terms
   - Advanced/competitive/professional terms
   - Trending and seasonal terms
   - Long-tail conversational search phrases (4-8 words, natural language)
   - Question-format queries starting with what/how/why/where/which/is/can/does

3. Each category MUST have 15-30 specific terms. You MUST produce AT LEAST 100 total terms across all categories — aim for 250-400+. If you return fewer than 100 terms total, you have failed the task.

4. DO NOT use special characters like bullets (•), em-dashes (—), or non-ASCII characters. Use only plain ASCII text.

5. Every term should be something a real person would actually search for on Google or discuss in an online community.

6. When the topic involves products, entertainment, or any field with named entities — you MUST list actual names, not generic placeholders.

Use the generate_keyword_universe function to return your results.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 8000,
        tools: [
          {
            type: "function",
            function: {
              name: "generate_keyword_universe",
              description: "Return a structured keyword universe organized by categories with highly specific real-world terms",
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
                          description: "List of specific keyword terms — use real brand names, product names, titles, and phrases people actually search",
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

    // Retry once if under 100 terms
    if (totalTerms < 100) {
      console.log(`Only ${totalTerms} terms, retrying with stronger prompt...`);
      const retryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt + "\n\nIMPORTANT: Your previous attempt only produced " + totalTerms + " terms. You MUST produce at least 100 unique, specific terms this time. Add more categories and more terms per category." },
          ],
          max_tokens: 10000,
          tools: [
            {
              type: "function",
              function: {
                name: "generate_keyword_universe",
                description: "Return a structured keyword universe organized by categories with highly specific real-world terms",
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
                            description: "List of specific keyword terms",
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
