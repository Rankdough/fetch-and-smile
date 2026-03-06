import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { clusters, singleIdea, focusKeyword } = body;

    if (!clusters || !Array.isArray(clusters) || clusters.length === 0) {
      return new Response(JSON.stringify({ error: "Please provide clusters to enrich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Single idea generation mode
    if (singleIdea && focusKeyword) {
      console.log(`Generating single blog idea for keyword: "${focusKeyword}" in cluster "${clusters[0].topic}"`);
      
      const singlePrompt = `You are an expert SEO content strategist. Generate exactly ONE blog idea for the keyword "${focusKeyword}" within the topic cluster "${clusters[0].topic}".

OUTPUT ONLY valid JSON, no markdown fences.

JSON FORMAT:
{"enrichments":[{"topic":"${clusters[0].topic}","blog_ideas":[{"title":"...","description":"...","reason":"...","target_keywords":["${focusKeyword}",...],"value_promises":["Promise 1","Promise 2","Promise 3"]}]}]}

TITLE RULES:
- SHORT, SIMPLE, FACTUAL — max 8-10 words
- Include "${focusKeyword}" naturally in the title
- Prefer "keyword + question" or simple descriptive format
- NEVER use filler phrases like "The Ultimate Guide", "A Beginner's Handbook", "Mastering", etc.

RULES:
- Generate exactly 1 blog idea
- target_keywords: include "${focusKeyword}" plus 1-3 related keywords from the provided list
- value_promises: exactly 3 concise promises of what the reader will learn`;

      const c = clusters[0];
      const kwList = c.keywords.join(", ");
      const userMsg = `Cluster: "${c.topic}" (~${c.estimated_monthly_volume} monthly volume)\nKeywords: ${kwList}\n\nFocus keyword: "${focusKeyword}"`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: singlePrompt },
            { role: "user", content: userMsg },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("AI error:", response.status, t);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const aiData = await response.json();
      let content = aiData.choices?.[0]?.message?.content || "";
      content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(content);
      
      return new Response(JSON.stringify(parsed.enrichments?.[0] || parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Pass 2: Enriching ${clusters.length} clusters with metadata & blog ideas...`);

    const systemPrompt = `You are an expert SEO content strategist. For each topic cluster, provide enrichment metadata.

OUTPUT ONLY valid JSON, no markdown fences.

JSON FORMAT:
{"enrichments":[{"topic":"Exact Topic Name","description":"1-sentence description of this cluster","content_type":"blog_post|landing_page|guide|comparison|listicle|how_to","difficulty":"low|medium|high","priority":"high|medium|low","blog_ideas":[{"title":"...","description":"...","reason":"...","target_keywords":["keyword1","keyword2","keyword3"],"value_promises":["Promise 1: what the reader will learn/gain","Promise 2: what the reader will learn/gain","Promise 3: what the reader will learn/gain"]}]}]}

BLOG IDEA TITLE RULES:
- Titles must be SHORT, SIMPLE, and FACTUAL — max 8-10 words.
- Include the main target keyword naturally in the title.
- Prefer "keyword + question" format (e.g. "Track and Field Events: What Are They?") or simple descriptive format (e.g. "Track and Field Throwing Events Explained").
- NEVER use filler phrases like "The Ultimate Guide", "A Beginner's Handbook", "Unlocking the Secrets", "Everything You Need to Know", "Comprehensive Overview", "Deep Dive", "Mastering", "Unpacking".
- Just describe what the article covers using the target keywords. Be direct and factual.

RULES:
- Exactly 5 blog ideas per cluster
- Each blog idea MUST include "target_keywords": an array of 2-5 keywords from the cluster's keyword list that this article should target
- Each blog idea MUST include "value_promises": an array of exactly 3 concise value promises describing what the reader will gain or learn from this article.

CRITICAL TOPICAL COHERENCE RULES:
- Every target_keyword assigned to a blog idea MUST be directly relevant to that idea's specific title and angle.
- If a silo groups keywords across multiple entities (e.g. countries, cities, brands), design blog ideas that match logically:
  - A comparison/roundup article (e.g. "Best Countries for Dental Tourism in Europe") can target keywords across entities: "dental tourism italy", "dental tourism germany", etc.
  - A single-entity article (e.g. "Dental Tourism in Albania") must ONLY target keywords about that specific entity. Never assign "dental tourism germany" to an article about Albania.
- Ask yourself: "Would this keyword naturally appear in this article?" If not, don't assign it.
- Each blog idea is a standalone article — its target_keywords must match what that article would actually rank for.

CRITICAL KEYWORD DEDUPLICATION RULES:
- Each keyword in the cluster should be assigned to AT MOST ONE blog idea. Do NOT repeat the same keyword across multiple ideas.
- The 5 blog ideas form a content silo: each owns a distinct subset of keywords with no overlap.
- Before finalizing, review all 5 ideas and redistribute any duplicated keywords.

- Match topic names exactly as provided
- Priority based on volume and business value
- Content type based on search intent`;

    // Process clusters in batches to avoid response truncation
    const BATCH_SIZE = 5;
    const allEnrichments: Record<string, any> = {};

    for (let i = 0; i < clusters.length; i += BATCH_SIZE) {
      const batch = clusters.slice(i, i + BATCH_SIZE);
      console.log(`Enriching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(clusters.length / BATCH_SIZE)} (${batch.length} clusters)...`);

      const clusterDescriptions = batch.map((c: any) => {
        const sample = c.keywords.slice(0, 15).join(", ");
        const more = c.keywords.length > 15 ? ` (+${c.keywords.length - 15} more)` : "";
        return `Topic: "${c.topic}" (${c.keywords.length} keywords, ~${c.estimated_monthly_volume} monthly volume)\nSample: ${sample}${more}`;
      }).join("\n\n");

      const userPrompt = `Enrich these ${batch.length} topic clusters:\n\n${clusterDescriptions}`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      let parsed: { enrichments: any[] };
      try {
        let cleaned = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
        parsed = JSON.parse(cleaned);
      } catch {
        try {
          const m = content.match(/\{[\s\S]*\}/);
          if (!m) throw new Error("No JSON");
          parsed = JSON.parse(m[0]);
        } catch {
          console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} parse failed:`, content.slice(0, 500));
          parsed = { enrichments: [] };
        }
      }

      for (const e of (parsed.enrichments || [])) {
        allEnrichments[e.topic] = e;
      }
    }

    const enrichedClusters = clusters.map((c: any) => {
      const e = allEnrichments[c.topic] || {};
      return {
        ...c,
        description: e.description || `Keywords related to ${c.topic}`,
        content_type: e.content_type || "blog_post",
        difficulty: e.difficulty || "medium",
        priority: e.priority || "medium",
        blog_ideas: e.blog_ideas || [],
      };
    });

    console.log(`Pass 2 complete: ${enrichedClusters.length} clusters enriched`);

    return new Response(JSON.stringify({ clusters: enrichedClusters }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("cluster-keywords-enrich error:", e);
    const status = e.status || 500;
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
