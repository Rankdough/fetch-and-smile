import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
- Create 10-20 topic silos (never more than 20)
- Every keyword must be assigned to exactly one topic
- Topic names should be clear, descriptive, and reflect the shared theme
- Numbers in brackets are search volumes — use them to inform grouping but don't output them
- Output ONLY valid JSON, no markdown fences

JSON FORMAT:
{"assignments":{"keyword1":"Topic Name","keyword2":"Topic Name",...},"topics":["Topic Name 1","Topic Name 2",...]}`;

    const pass1User = `Classify these ${uniqueKeywords.length} keywords into 10-20 topic silos (maximum 20):\n\n${kwLines}`;

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
{"enrichments":[{"topic":"Exact Topic Name","description":"1-sentence description of this cluster","content_type":"blog_post|landing_page|guide|comparison|listicle|how_to","difficulty":"low|medium|high","priority":"high|medium|low","blog_ideas":[{"title":"...","description":"...","reason":"...","target_keywords":["keyword1","keyword2","keyword3"]},{"title":"...","description":"...","reason":"...","target_keywords":["keyword1","keyword2"]},{"title":"...","description":"...","reason":"...","target_keywords":["keyword1","keyword2","keyword3"]},{"title":"...","description":"...","reason":"...","target_keywords":["keyword1","keyword2"]},{"title":"...","description":"...","reason":"...","target_keywords":["keyword1","keyword2","keyword3"]}]}]}

RULES:
- Exactly 5 blog ideas per cluster
- Each blog idea MUST include "target_keywords": an array of 2-5 keywords from the cluster's keyword list that this article should target
- Each blog idea MUST include "value_promises": an array of exactly 3 concise value promises

CRITICAL TOPICAL COHERENCE RULES:
- Every target_keyword assigned to a blog idea MUST be directly relevant to that idea's specific title and angle.
- Do NOT assign keywords about other countries/brands/entities to an article focused on a specific one. For example, an article about "Albania Dental Tourism" must NOT target keywords like "dental tourism germany" — those belong in a separate article.
- If a cluster contains keywords spanning multiple sub-entities (countries, brands, products), create separate blog ideas for each OR a comparison/roundup article.

CRITICAL KEYWORD DEDUPLICATION RULES:
- Each keyword should be assigned to AT MOST ONE blog idea with no overlap across ideas.

- Match topic names exactly as provided
- Priority based on volume and business value
- Content type based on search intent`;

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
