import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---- Model routing: Claude Sonnet (default) with automatic Gemini fallback ----
const CLAUDE_MODEL = "anthropic/claude-sonnet-5";
const CLAUDE_LABEL = "Claude Sonnet";

class AIHttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function callClaude(apiKey: string, system: string, user: string, toolName: string, toolDescription: string, schema: any): Promise<any> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 32000,
      system,
      messages: [{ role: "user", content: user }],
      tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
      tool_choice: { type: "tool", name: toolName },
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Claude error:", response.status, errorText);
    throw new AIHttpError(response.status, `Claude failed: ${response.status}`);
  }
  const data = await response.json();
  const toolUse = (data.content || []).find((b: any) => b.type === "tool_use" && b.name === toolName);
  if (!toolUse?.input) throw new Error(`No tool_use returned from Claude (stop_reason=${data.stop_reason})`);
  return toolUse.input;
}

async function callGemini(apiKey: string, geminiModel: string, system: string, user: string, toolName: string, toolDescription: string, schema: any, maxTokens?: number): Promise<any> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: geminiModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      tools: [{ type: "function", function: { name: toolName, description: toolDescription, parameters: schema } }],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI error:", response.status, errorText);
    throw new AIHttpError(response.status, `AI failed: ${response.status}`);
  }
  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No structured output returned");
  return JSON.parse(toolCall.function.arguments);
}

// Returns { result, model_used, fallback }. Claude errors of any kind trigger one Gemini retry.
async function runStructured(opts: {
  apiKey: string; model?: string; geminiModel: string; geminiMaxTokens?: number;
  system: string; user: string; toolName: string; toolDescription: string; schema: any;
}): Promise<{ result: any; model_used: string; fallback: boolean }> {
  const geminiLabel = opts.geminiModel === "google/gemini-2.5-pro" ? "Gemini 2.5 Pro" : opts.geminiModel === "google/gemini-2.5-flash" ? "Gemini 2.5 Flash" : opts.geminiModel;
  const wantClaude = opts.model !== "gemini";
  if (wantClaude) {
    try {
      const result = await callClaude(opts.apiKey, opts.system, opts.user, opts.toolName, opts.toolDescription, opts.schema);
      return { result, model_used: CLAUDE_LABEL, fallback: false };
    } catch (err) {
      console.error("Claude call failed, retrying once with Gemini:", err instanceof Error ? err.message : err);
      const result = await callGemini(opts.apiKey, opts.geminiModel, opts.system, opts.user, opts.toolName, opts.toolDescription, opts.schema, opts.geminiMaxTokens);
      return { result, model_used: geminiLabel, fallback: true };
    }
  }
  const result = await callGemini(opts.apiKey, opts.geminiModel, opts.system, opts.user, opts.toolName, opts.toolDescription, opts.schema, opts.geminiMaxTokens);
  return { result, model_used: geminiLabel, fallback: false };
}

function aiErrorResponse(err: unknown): Response | null {
  if (err instanceof AIHttpError) {
    if (err.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (err.status === 402) return new Response(JSON.stringify({ error: "Payment required, please add credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, topic, definition, existingClusters, existingModifiers, newModifiers, newSeeds, audience, country, model } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // MODE 1: Suggest modifiers the AI missed
    if (mode === "suggest_modifiers") {
      console.log(`Running gap analysis for modifiers on: "${topic}"`);

      // Send ALL keywords so the AI can see exactly what's covered and what's not
      const allKeywordsByCluster = existingClusters?.map((c: any) =>
        `## ${c.cluster_name}\nKeywords: ${c.seed_keywords?.join(", ")}\nModifiers: ${c.modifiers?.join(", ") || "none"}\nQuestions: ${c.questions?.join(", ")}`
      ).join("\n\n") || "";

      const existingMods = existingModifiers?.join(", ") || "none";

      const system = `You are a senior SEO strategist performing a GAP ANALYSIS on a keyword universe.

Your task: You will receive the COMPLETE list of every keyword, modifier, and question generated for a topic. You must ANALYSE what is already covered and identify what is MISSING.

ANALYSIS METHOD:
1. First, scan ALL provided keywords and extract every modifier/dimension already present (e.g., if you see "wooden toys" then "wooden" is covered under Materials).
2. For each dimension, list what IS covered vs what is NOT covered.
3. Only suggest modifiers that are ACTUALLY MISSING — do not re-suggest things already in the keywords.
4. Think about what a real person searching for this topic would type. Every modifier you suggest must create a viable search query when combined with the topic.

DIMENSIONS TO ANALYSE (adapt to the specific topic):
- Age/life stage (be EXHAUSTIVE — every specific age, age range, developmental stage)
- Price/budget tiers (specific price points, not just "cheap/expensive")
- Materials/composition
- Occasions/gifting moments
- Settings/locations of use
- Brands (major brands in this space)
- Features/attributes
- Certifications/standards (safety, eco, organic)
- Purchase modifiers (buy, deals, sale, subscription, rental)
- Comparison modifiers (vs, alternative, similar to)
- Quality/ranking (best, top, safest, award-winning)
- Time/recency (2024, 2025, new releases)
- Size/quantity
- Gender/demographic
- Any other dimension specific to THIS topic

CRITICAL: For dimensions like age, be granular. Don't just say "toddler" — list "1 year old", "2 year old", "3 year old", "4 year old", "5 year old", "6-8 years", "8-10 years", "10-12 years" etc. if they're missing.

For each dimension, provide:
- dimension_name: clear label
- covered: what's already in the keywords (so user can see the analysis)
- missing: what should be added (the actual gap)`;

      const user = `Topic: ${topic}
Definition: ${definition || ""}
${audience ? `Audience: ${audience}` : ""}
${country ? `Country: ${country}` : ""}

Cross-cutting modifiers already set: ${existingMods}

=== COMPLETE KEYWORD DATA ===
${allKeywordsByCluster}
=== END KEYWORD DATA ===

Perform a thorough gap analysis. For each relevant dimension, show what's COVERED (already in the keywords above) and what's MISSING (gaps to fill). Be exhaustive and granular.`;

      let routed;
      try {
        routed = await runStructured({
          apiKey: LOVABLE_API_KEY, model, geminiModel: "google/gemini-2.5-pro", geminiMaxTokens: 8000,
          system, user, toolName: "return_gap_analysis",
          toolDescription: "Return the gap analysis with covered and missing modifiers per dimension",
          schema: {
                type: "object",
                properties: {
                  dimensions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        dimension_name: { type: "string" },
                        covered: { type: "array", items: { type: "string" } },
                        missing: { type: "array", items: { type: "string" } },
                      },
                      required: ["dimension_name", "covered", "missing"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["dimensions"],
                additionalProperties: false,
              },
        });
      } catch (err) {
        const r = aiErrorResponse(err);
        if (r) return r;
        throw err;
      }
      const results = routed.result;
      console.log(`Model used: ${routed.model_used}${routed.fallback ? " (fallback after Claude failure)" : ""}`);

      // Filter out dimensions with no gaps and map to frontend format
      const dimensionsWithGaps = results.dimensions
        .filter((d: any) => d.missing && d.missing.length > 0)
        .map((d: any) => ({
          dimension_name: d.dimension_name,
          modifiers: d.missing, // frontend expects "modifiers" key
          covered: d.covered || [],
        }));

      const totalMissing = dimensionsWithGaps.reduce((s: number, d: any) => s + d.modifiers.length, 0);
      const totalCovered = results.dimensions.reduce((s: number, d: any) => s + (d.covered?.length || 0), 0);
      console.log(`Gap analysis: ${totalCovered} covered, ${totalMissing} missing across ${dimensionsWithGaps.length} dimensions`);

      return new Response(JSON.stringify({ suggestions: { dimensions: dimensionsWithGaps }, model_used: routed.model_used, fallback: routed.fallback }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MODE 2: Expand existing clusters with new modifiers/seeds
    if (mode === "expand") {
      console.log(`Expanding clusters for "${topic}" with ${newModifiers?.length || 0} modifiers, ${newSeeds?.length || 0} seeds`);

      const clusterNames = existingClusters?.map((c: any) => c.cluster_name) || [];
      const existingSeedsSample = existingClusters?.map((c: any) =>
        `${c.cluster_name}: ${c.seed_keywords?.slice(0, 15).join(", ")}`
      ).join("\n") || "";

      const system = `You are an SEO keyword expansion engine. Given existing topic clusters and NEW modifiers/seeds, generate ADDITIONAL keywords that combine the new modifiers with the existing topic structure.

RULES:
- Generate new seed keywords by combining new modifiers with existing cluster themes
- Generate new questions incorporating the new modifiers
- Assign each new keyword to the most relevant existing cluster
- If new seeds don't fit any existing cluster, create a new cluster (max 1-2 new ones)
- Do NOT repeat any existing keywords — only generate NEW ones
- Keep keywords short (2-6 words), concrete, real search terms
- Each cluster should get 5-30 new keywords depending on relevance`;

      const user = `Topic: ${topic}
${audience ? `Audience: ${audience}` : ""}
${country ? `Country: ${country}` : ""}

Existing clusters:
${existingSeedsSample}

NEW modifiers to incorporate: ${newModifiers?.join(", ") || "none"}
NEW seed keywords to incorporate: ${newSeeds?.join(", ") || "none"}

Generate additional keywords for each relevant cluster. Return ONLY new keywords, not existing ones.`;

      let routed;
      try {
        routed = await runStructured({
          apiKey: LOVABLE_API_KEY, model, geminiModel: "google/gemini-2.5-flash",
          system, user, toolName: "return_expansion",
          toolDescription: "Return new keywords grouped by cluster",
          schema: {
                type: "object",
                properties: {
                  expansions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        cluster_name: { type: "string" },
                        new_seed_keywords: { type: "array", items: { type: "string" } },
                        new_questions: { type: "array", items: { type: "string" } },
                        new_modifiers: { type: "array", items: { type: "string" } },
                      },
                      required: ["cluster_name", "new_seed_keywords", "new_questions", "new_modifiers"],
                      additionalProperties: false,
                    },
                  },
                  new_cross_cutting_modifiers: { type: "array", items: { type: "string" } },
                },
                required: ["expansions", "new_cross_cutting_modifiers"],
                additionalProperties: false,
              },
        });
      } catch (err) {
        const r = aiErrorResponse(err);
        if (r) return r;
        throw err;
      }
      const results = routed.result;
      console.log(`Model used: ${routed.model_used}${routed.fallback ? " (fallback after Claude failure)" : ""}`);

      const totalNew = results.expansions.reduce((s: number, e: any) => s + (e.new_seed_keywords?.length || 0), 0);
      console.log(`Generated ${totalNew} new keywords across ${results.expansions.length} clusters`);

      return new Response(JSON.stringify({ expansion: results, model_used: routed.model_used, fallback: routed.fallback }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid mode. Use 'suggest_modifiers' or 'expand'" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("refine-keyword-universe error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to refine keywords";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
