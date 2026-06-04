import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { NON_COMMODITY_TITLE_RULES } from "../_shared/nonCommodityTitleRules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(apiKey: string, model: string, messages: any[], tools?: any[], toolChoice?: any) {
  const body: any = { model, messages };
  if (tools) { body.tools = tools; body.tool_choice = toolChoice; }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 429) throw Object.assign(new Error("Rate limit exceeded. Please try again in a moment."), { status: 429 });
    if (response.status === 402) throw Object.assign(new Error("AI credits exhausted. Please add credits."), { status: 402 });
    const t = await response.text();
    console.error("AI gateway error:", response.status, t);
    throw new Error("AI gateway error");
  }
  return response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { keywords, volumeMap } = await req.json();

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "Please provide an array of keywords" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Deduplicate
    const uniqueKeywords = [...new Set(keywords.map((k: string) => k.toLowerCase().trim()))];
    const hasVolume = volumeMap && Object.keys(volumeMap).length > 0;

    console.log(`Processing ${uniqueKeywords.length} unique keywords (two-pass)`);

    // ═══════════════════════════════════════════════
    // PASS 1: Global classification — assign every keyword to a topic
    // Output is compact: just {assignments: {"keyword": "Topic Name"}}
    // This fits in output tokens even for 5000+ keywords
    // ═══════════════════════════════════════════════

    // Build keyword list with optional volume hints
    const kwLines = uniqueKeywords.map(kw => {
      if (hasVolume && volumeMap[kw] > 0) return `${kw} [${volumeMap[kw]}]`;
      return kw;
    }).join("\n");

    const pass1System = `You are an expert SEO strategist. Your task is to classify every keyword into a topic silo the way an experienced human content strategist would.

CRITICAL GROUPING LOGIC:
- Group keywords by their SHARED THEME or DIMENSION, not by individual entities.
- If multiple keywords share the same pattern but differ by a variable (country, city, brand, material, procedure), they belong in ONE silo named after the shared dimension.
  Examples:
  - "dental tourism italy", "dental tourism germany", "dental tourism greece" → silo: "Dental Tourism Destinations in Europe"
  - "dental implants albania", "dental crowns albania", "dental veneers albania" → silo: "Dental Services in Albania"
- Do NOT create a separate silo for each country/city/brand — find the higher-level theme they share.
- Think: "What is the COMMON THREAD across these keywords?" and name the silo after that thread.

RULES:
- Create at most 12 topic silos (never more than 12)
- Every keyword must be assigned to exactly one topic
- Topic names MUST be based on the main/highest-volume keywords in that silo — use the actual keyword phrases as silo names (e.g. "dental implants cost" not "Dental Implant Pricing Information")
- Numbers in brackets are search volumes — use them to inform grouping but don't output them
- Output ONLY valid JSON, no markdown fences

JSON FORMAT:
{"assignments":{"keyword1":"Topic Name","keyword2":"Topic Name",...},"topics":["Topic Name 1","Topic Name 2",...]}`;

    const pass1User = `Classify these ${uniqueKeywords.length} keywords into topic silos (maximum 12):\n\n${kwLines}`;

    console.log("Pass 1: Classifying all keywords into topics...");
    const pass1Data = await callAI(LOVABLE_API_KEY, "google/gemini-2.5-flash-lite", [
      { role: "system", content: pass1System },
      { role: "user", content: pass1User },
    ]);

    const pass1Content = pass1Data.choices?.[0]?.message?.content || "";
    let pass1Parsed: { assignments: Record<string, string>; topics: string[] };
    try {
      let cleaned = pass1Content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
      pass1Parsed = JSON.parse(cleaned);
    } catch {
      try {
        const m = pass1Content.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("No JSON");
        pass1Parsed = JSON.parse(m[0]);
      } catch {
        console.error("Pass 1 parse failed:", pass1Content.slice(0, 500));
        throw new Error("Failed to parse classification results");
      }
    }

    // Build clusters from assignments
    const topicKeywords: Record<string, string[]> = {};
    const assignments = pass1Parsed.assignments || {};
    for (const [kw, topic] of Object.entries(assignments)) {
      const t = topic.trim();
      if (!topicKeywords[t]) topicKeywords[t] = [];
      topicKeywords[t].push(kw.toLowerCase());
    }

    // Find unassigned keywords and put them in an "Other" bucket
    const assignedSet = new Set(Object.keys(assignments).map(k => k.toLowerCase()));
    const unassigned = uniqueKeywords.filter(kw => !assignedSet.has(kw));
    if (unassigned.length > 0) {
      if (!topicKeywords["Other"]) topicKeywords["Other"] = [];
      topicKeywords["Other"].push(...unassigned);
    }

    console.log(`Pass 1 complete: ${Object.keys(topicKeywords).length} topics, ${Object.keys(assignments).length} assigned, ${unassigned.length} unassigned`);

    // ═══════════════════════════════════════════════
    // PASS 2: Enrich clusters with metadata & blog ideas
    // Process all clusters in a single call with just topic names + keyword counts
    // ═══════════════════════════════════════════════

    // Calculate volumes per cluster
    const clusterSummaries = Object.entries(topicKeywords)
      .map(([topic, kws]) => {
        let vol = 0;
        if (hasVolume) {
          for (const kw of kws) {
            if (volumeMap[kw]) vol += volumeMap[kw];
          }
        }
        return { topic, keywords: kws, volume: vol };
      })
      .sort((a, b) => b.volume - a.volume || b.keywords.length - a.keywords.length);

    // Build pass 2 prompt with sample keywords per cluster
    const clusterDescriptions = clusterSummaries.map(c => {
      const sample = c.keywords.slice(0, 15).join(", ");
      const more = c.keywords.length > 15 ? ` (+${c.keywords.length - 15} more)` : "";
      return `Topic: "${c.topic}" (${c.keywords.length} keywords, ~${c.volume} monthly volume)\nSample: ${sample}${more}`;
    }).join("\n\n");

    const pass2System = `You are an expert SEO content strategist. For each topic cluster, provide enrichment metadata.

OUTPUT ONLY valid JSON, no markdown fences.

JSON FORMAT:
{"enrichments":[{"topic":"Exact Topic Name","description":"1-sentence description of this cluster","content_type":"blog_post|landing_page|guide|comparison|listicle|how_to","difficulty":"low|medium|high","priority":"high|medium|low","blog_ideas":[{"title":"...","description":"...","reason":"...","target_keywords":["keyword1","keyword2","keyword3"],"value_promises":["Promise 1","Promise 2","Promise 3","Promise 4","Promise 5"]},{"title":"...","description":"...","reason":"...","target_keywords":["keyword1","keyword2"],"value_promises":["Promise 1","Promise 2","Promise 3","Promise 4","Promise 5"]}]}]}

VALUE PROMISE RULES (apply to every blog idea):
Value promises state what the reader will specifically UNDERSTAND or be able to EVALUATE after reading.
They must map tightly to the target_keywords and the search intent behind them.

SEARCH INTENT MATCHING — read the keywords first:
- "What is X" / "X meaning" / "X explained" keywords → promises must answer the definitional question with specific criteria, named components, or numbered conditions
- "How to X" / "X tips" keywords → promises must name specific actions, thresholds, or measurable outcomes
- "X vs Y" / "best X" / "X comparison" keywords → promises must name the specific dimensions being compared with real values
- "X cost" / "X price" / "X rate" keywords → promises must include numeric ranges, breakdowns, or cost drivers

NON-COMMODITY REQUIREMENTS (every promise must pass all 3):
1. SPECIFIC — names an exact mechanism, criterion, number, rule, or named entity from the topic (not a vague concept)
2. NUMERIC ANCHOR — contains or implies a specific number, count, threshold, percentage, year, or named condition (e.g. "4 conditions", "before 1895", "15 runs after 5 innings")
3. INFORMATION GAP — addresses something the top 10 Google results consistently fail to cover with precision

HOW TO GENERATE VALUE PROMISES:
1. Read every target keyword — each implies a specific question the reader needs answered
2. For each promise, identify: what specific thing will the reader know that they didn't before?
3. Name the exact entity, number, rule, or mechanism — never describe a category ("the history of X")
4. If keywords are definitional ("what is X"), promises must answer the sub-questions: what exactly qualifies, what specifically disqualifies, when exactly does it apply, what specifically does it prevent
5. Keep each promise to ONE concise sentence with a numeric or named anchor

STRONG EXAMPLES:
- Keywords: "what is infield fly rule", "infield fly rule baseball" → "The 4 simultaneous conditions that must all be true for the infield fly rule to apply — and why a single missing condition means the rule does not trigger."
- Keywords: "infield fly rule explained" → "The 2 specific double-play scenarios the rule was designed to eliminate, and the exact fielder manipulation tactic used before 1895 that made the rule necessary."
- Keywords: "cost of building a villa in bali" → "Per-square-metre construction costs in Bali broken down by 3 finish levels — entry, mid-range, and luxury — with specific USD ranges for each."
- Keywords: "leasehold vs freehold bali" → "How leasehold and freehold title compare across 4 dimensions: legal duration, resale value, foreign buyer eligibility, and inheritance rights."

WEAK EXAMPLES (banned):
- "The historical context and evolution of the infield fly rule" — topic description, no number, no specific gap
- "How the rule shifts responsibility from base runners to the umpire" — too vague, no specific condition named
- "The specific unfair defensive tactics the rule was designed to prevent" — "specific" without being specific

RULES:
- Generate exactly 5 value promises per blog idea
- Each promise MUST map to one or more target_keywords — never invent promises about off-topic concepts
- Every promise must contain a numeric anchor or named entity (a count, year, threshold, named rule, or specific condition)
- Do NOT reveal the actual answer or numbers — describe what the reader will understand, not the answer itself
- BANNED verbs/phrases: "Learn", "Understand", "Explore", "Discover", "Use", "Follow", "Check", "tips", "guide", "context", "evolution", "history of", "overview of"
- BANNED format: Action verbs directed at the reader ("use X to...", "follow these steps...", "check whether...")
- BANNED format: Topic descriptions without a specific gap ("the role of X in Y", "how X works", "what X means")
RULES:
- Exactly 5 blog ideas per cluster
- Each blog idea MUST include "target_keywords": an array of 2-5 keywords from the cluster's keyword list that this article should target
- Each blog idea MUST include "value_promises": an array of exactly 5 keyword-derived value promises (see VALUE PROMISE RULES above)

- Every target_keyword assigned to a blog idea MUST be directly relevant to that idea's specific title and angle.
- Do NOT assign keywords about other countries/brands/entities to an article focused on a specific one. For example, an article about "Albania Dental Tourism" must NOT target keywords like "dental tourism germany" — those belong in a separate article.
- If a cluster contains keywords spanning multiple sub-entities (countries, brands, products), create separate blog ideas for each OR a comparison/roundup article.

CRITICAL KEYWORD DEDUPLICATION RULES:
- Each keyword should be assigned to AT MOST ONE blog idea with no overlap across ideas.

- Match topic names exactly as provided
- Priority based on volume and business value
- Content type based on search intent

${NON_COMMODITY_TITLE_RULES}`;

    const pass2User = `Enrich these ${clusterSummaries.length} topic clusters:\n\n${clusterDescriptions}`;

    console.log("Pass 2: Enriching clusters with metadata & blog ideas...");
    const pass2Data = await callAI(LOVABLE_API_KEY, "google/gemini-2.5-flash", [
      { role: "system", content: pass2System },
      { role: "user", content: pass2User },
    ]);

    const pass2Content = pass2Data.choices?.[0]?.message?.content || "";
    let pass2Parsed: { enrichments: any[] };
    try {
      let cleaned = pass2Content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
      pass2Parsed = JSON.parse(cleaned);
    } catch {
      try {
        const m = pass2Content.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("No JSON");
        pass2Parsed = JSON.parse(m[0]);
      } catch {
        console.error("Pass 2 parse failed:", pass2Content.slice(0, 500));
        // Continue without enrichment — still return clusters
        pass2Parsed = { enrichments: [] };
      }
    }

    // Build enrichment lookup
    const enrichmentMap: Record<string, any> = {};
    for (const e of (pass2Parsed.enrichments || [])) {
      enrichmentMap[e.topic] = e;
    }

    // ═══════════════════════════════════════════════
    // Assemble final result
    // ═══════════════════════════════════════════════

    const clusters = clusterSummaries.map(c => {
      const e = enrichmentMap[c.topic] || {};
      const cluster: any = {
        topic: c.topic,
        description: e.description || `Keywords related to ${c.topic}`,
        estimated_monthly_volume: c.volume,
        keywords: c.keywords,
        content_type: e.content_type || "blog_post",
        difficulty: e.difficulty || "medium",
        priority: e.priority || "medium",
        blog_ideas: e.blog_ideas || [],
      };

      // Inject actual volume data per keyword
      if (hasVolume) {
        cluster.keyword_volumes = {};
        for (const kw of c.keywords) {
          if (volumeMap[kw] !== undefined) cluster.keyword_volumes[kw] = volumeMap[kw];
        }
      }

      return cluster;
    });

    const totalClustered = clusters.reduce((s, c) => s + c.keywords.length, 0);
    const result = {
      clusters,
      total_keywords_clustered: totalClustered,
      unclustered: [],
    };

    console.log(`Done: ${clusters.length} clusters, ${totalClustered} keywords clustered`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("cluster-keywords error:", e);
    const status = e.status || 500;
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
