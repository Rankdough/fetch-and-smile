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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, audience, country, language, websiteTerms, model } = await req.json();

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

CRITICAL — LATERAL SEMANTIC EXPANSION:
You MUST think beyond the obvious and consider ADJACENT CONTEXTS, MOTIVATIONS, and USE CASES that connect to the topic even if they don't literally contain the topic keyword. Ask yourself:
- WHY do people engage with this topic? What underlying needs, goals, or desires drive them?
- WHAT ACTIVITIES or ACTIONS are associated with this topic? What do people DO in relation to it?
- WHAT OUTCOMES or PURPOSES does this topic serve? (e.g., toys → child development, STEM learning, motor skills, sensory play, Montessori)
- WHERE and HOW does this topic intersect with daily life, hobbies, professions, or other domains?
- What would someone ALSO search for when researching this topic?

Examples of lateral thinking:
- "meeting people" → yoga classes, book clubs, volunteering, co-working spaces, local events, sports leagues, cooking workshops (things people DO to meet people)
- "toys" → child development, educational toys, STEM learning, sensory development, motor skills, Montessori, gifting occasions
- "dental tourism" → travel insurance, medical travel, recovery accommodation, visa requirements, flight booking
- "home security" → smart home, neighbourhood watch, insurance discounts, package theft prevention

You must include at least 2-3 clusters that represent these LATERAL/ADJACENT territories — topics that a person interested in the main topic would ALSO care about.

Rules:
- Do NOT return a simple list of synonyms.
- Prefer concrete entities and common phrases people actually search.
- Cover breadth first, then depth.
- Avoid duplicates.
- Keep items short (2–6 words for seed keywords).
- NEVER add country or region suffixes (like "uk", "us", "australia") to keywords UNLESS the user explicitly provides a country. If no country is given, keep all keywords location-neutral.
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
${websiteTerms && websiteTerms.length > 0 ? `\nWEBSITE-EXTRACTED TERMS (use these as additional seeds — these were scraped from a real website related to this topic, incorporate them into your clusters):\n${websiteTerms.join(", ")}` : ""}
Language: ${lang}`;

    const semanticMapSchema = {
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
              };

    let routed;
    try {
      routed = await runStructured({
        apiKey: LOVABLE_API_KEY, model, geminiModel: "google/gemini-2.5-pro", geminiMaxTokens: 16000,
        system, user, toolName: "return_semantic_map",
        toolDescription: "Return the structured semantic keyword universe", schema: semanticMapSchema,
      });
    } catch (err) {
      const r = aiErrorResponse(err);
      if (r) return r;
      throw err;
    }
    const results = routed.result;
    results.model_used = routed.model_used;
    console.log(`Model used: ${routed.model_used}${routed.fallback ? " (fallback after Claude failure)" : ""}`);

    const totalSeeds = results.clusters.reduce((sum: number, c: any) => sum + (c.seed_keywords?.length || 0), 0);
    const totalQuestions = results.clusters.reduce((sum: number, c: any) => sum + (c.questions?.length || 0), 0);
    console.log(`Generated ${results.clusters.length} clusters, ${totalSeeds} seed keywords, ${totalQuestions} questions`);

    return new Response(
      JSON.stringify({ results, model_used: routed.model_used, fallback: routed.fallback }),
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
