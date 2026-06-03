import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { NON_COMMODITY_TITLE_RULES } from "../_shared/nonCommodityTitleRules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    // NOTE: `experiencePack` is accepted (back-compat) but intentionally ignored.
    // The non-commodity gate now applies to article generation only — blog ideas
    // are outline-level and have no slot for first-hand experience signals.
    const { clusters, singleIdea, focusKeyword, customTitle, customHint } = body;
    const expPackBlock = "";


    if (!clusters || !Array.isArray(clusters) || clusters.length === 0) {
      return new Response(JSON.stringify({ error: "Please provide clusters to enrich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Single idea generation mode
    if (singleIdea && focusKeyword) {
      const isCustom = !!customTitle;
      console.log(isCustom ? `Generating custom blog idea: "${customTitle}" in cluster "${clusters[0].topic}"` : `Generating single blog idea for keyword: "${focusKeyword}" in cluster "${clusters[0].topic}"`);
      
      const titleInstruction = isCustom
        ? `TITLE: Use exactly "${customTitle}" as the blog idea title. Do NOT change it.`
        : `TITLE RULES for keyword "${focusKeyword}":
${NON_COMMODITY_TITLE_RULES}`;

      const singlePrompt = `You are an expert SEO content strategist. Generate exactly ONE blog idea ${isCustom ? `titled "${customTitle}"` : `for the keyword "${focusKeyword}"`} within the topic cluster "${clusters[0].topic}".

OUTPUT ONLY valid JSON, no markdown fences.

JSON FORMAT:
{"enrichments":[{"topic":"${clusters[0].topic}","blog_ideas":[{"title":"...","description":"...","reason":"...","target_keywords":["keyword1","keyword2",...],"value_promises":["Promise 1","Promise 2","Promise 3","Promise 4","Promise 5"]}]}]}

VALUE PROMISE RULES:
Value promises state what the reader will UNDERSTAND or be able to EVALUATE after reading — NOT what they will do.
They must be tightly aligned with the target_keywords, naturally incorporating their search intent.
1. Each promise describes a tangible OUTCOME the reader walks away with, tied to the keywords.
2. Focus on: exact factors/criteria/components, clear comparisons between options, specific risks/mistakes/failure points, cost/performance/outcome differences, and what "good"/"safe"/"high-quality" looks like in real terms.
3. Include structured thinking where relevant (comparison tables, breakdowns, checklists, benchmarks).
4. Reflect the search intent behind the keywords (informational, commercial, or decision-making).
5. Keep each value promise to ONE concise sentence.
- Example: "The real per-square-metre construction costs for villas in Bali — broken down by material quality, location, and finish level."
- Example: "How leasehold and freehold ownership structures compare — including legal risk, resale value, and long-term cost differences for foreign buyers."
- BANNED: "Learn", "Understand", "Explore", "Discover", "Use", "Follow", "Check", "tips", "guide", action verbs directed at the reader, generic filler, revealing actual answers.

${titleInstruction}

KEYWORD SELECTION (CRITICAL):
${isCustom ? `- You are given the FULL list of keywords in this silo. Your job is to find ONLY keywords that are DIRECTLY relevant to the article titled "${customTitle}".
- A keyword is relevant ONLY if a reader searching for that keyword would genuinely expect to find this specific article.
- Do NOT select keywords just because they share a word (e.g. "dental tourism bulgaria" is NOT relevant to "how to choose a dental clinic abroad" — the first is about a specific country, the second is about evaluation criteria).
- If fewer than 3 keywords from the list are truly relevant, that's OK — include only the genuinely matching ones.
- If ZERO keywords from the list are relevant, generate 3-8 SUGGESTED keywords that someone would actually search to find this article (e.g. "how to choose dental clinic abroad", "dental clinic abroad checklist", "what to look for dental tourism"). Mark these as suggested by prefixing with "suggested: ".` : `- target_keywords: include the most relevant keywords from the provided list (3-8 keywords that best match the article topic)`}
- value_promises: exactly 5 sharp, specific promises (see VALUE PROMISE RULES above)
- description: 1-2 sentences describing the article's angle and coverage
- reason: 1 sentence explaining the strategic value of this article${expPackBlock}`;

      const c = clusters[0];
      const kwWithVols = c.keyword_volumes
        ? c.keywords.map((kw: string) => `${kw} (${c.keyword_volumes[kw] ?? c.keyword_volumes[kw.toLowerCase()] ?? "?"})`)
        : c.keywords;
      const kwList = kwWithVols.join(", ");
      const hintBlock = isCustom && typeof customHint === "string" && customHint.trim()
        ? `\n\nADDITIONAL CONTEXT FROM AUTHOR (use this to shape the angle, description, value promises, and keyword selection — DO NOT change the title):\n"""\n${customHint.trim()}\n"""`
        : "";
      const userMsg = `Cluster: "${c.topic}" (~${c.estimated_monthly_volume} monthly volume)\nAll keywords in silo (with search volume): ${kwList}\n\n${isCustom ? `Custom article title: "${customTitle}"\nFrom the keywords above, select ONLY those that are directly and specifically relevant to this exact article topic. Be very strict — topical mismatch is worse than having few keywords.` : `Focus keyword: "${focusKeyword}"`}${hintBlock}`;

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
      console.log("Single idea raw response:", content.slice(0, 500));
      content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        // Try to extract JSON from the response
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) {
          console.error("Failed to parse single idea response:", content.slice(0, 500));
          throw new Error("Failed to parse AI response");
        }
        parsed = JSON.parse(match[0]);
      }
      
      const result = parsed.enrichments?.[0] || parsed;
      // Clean volume suffixes from target_keywords
      if (result.blog_ideas) {
        for (const idea of result.blog_ideas) {
          if (idea.target_keywords) {
            idea.target_keywords = idea.target_keywords.map((kw: string) => kw.replace(/\s*\(\d+\)\s*$/, "").replace(/\s*\(\?\)\s*$/, "").trim());
          }
        }
      }
      console.log("Single idea result:", JSON.stringify(result).slice(0, 300));
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Pass 2: Enriching ${clusters.length} clusters with metadata & blog ideas...`);

    const systemPrompt = `You are an expert SEO content strategist. For each topic cluster, provide enrichment metadata.

OUTPUT ONLY valid JSON, no markdown fences.

JSON FORMAT:
{"enrichments":[{"topic":"Exact Topic Name","description":"1-sentence description of this cluster","content_type":"blog_post|landing_page|guide|comparison|listicle|how_to","difficulty":"low|medium|high","priority":"high|medium|low","blog_ideas":[{"title":"...","description":"...","reason":"...","target_keywords":["keyword1","keyword2","keyword3"],"value_promises":["Promise 1","Promise 2","Promise 3","Promise 4","Promise 5"]}]}]}

VALUE PROMISE RULES (apply to every blog idea):
Value promises state what the reader will UNDERSTAND or be able to EVALUATE after reading — NOT what they will do.
They must be tightly aligned with the target_keywords, naturally incorporating their search intent.
1. Each promise describes a tangible OUTCOME the reader walks away with, tied to the keywords.
2. Focus on: exact factors/criteria/components, clear comparisons between options, specific risks/mistakes/failure points, cost/performance/outcome differences, and what "good"/"safe"/"high-quality" looks like in real terms.
3. Include structured thinking where relevant (comparison tables, breakdowns, checklists, benchmarks).
4. Reflect the search intent behind the keywords (informational, commercial, or decision-making).
5. Keep each value promise to ONE concise sentence.
- Example: "The real per-square-metre construction costs for villas in Bali — broken down by material quality, location, and finish level."
- Example: "How leasehold and freehold ownership structures compare — including legal risk, resale value, and long-term cost differences for foreign buyers."
- BANNED: "Learn", "Understand", "Explore", "Discover", "Use", "Follow", "Check", "tips", "guide", action verbs directed at the reader, generic filler, revealing actual answers.

BLOG IDEA TITLE RULES:
${NON_COMMODITY_TITLE_RULES}

CRITICAL — STEP-BY-STEP PROCESS (follow this order):

STEP 1: IDENTIFY HIGH-VOLUME KEYWORDS FIRST
- Before grouping, sort ALL keywords by their search volume (provided in parentheses).
- The highest-volume keywords are the ANCHORS — each blog idea should be built around one or more high-volume keywords.
- A blog idea's title and angle MUST be driven by its highest-volume keyword, NOT by low-volume ones.
- Example: if "make new friends but keep the old" has 1,000 volume and other keywords have 10-20 each, the article title must be about "make new friends but keep the old", not about a minor keyword.

STEP 2: GROUP KEYWORDS BY SUB-TOPIC AROUND VOLUME ANCHORS
- Group keywords into logical sub-topics, anchoring each group around its highest-volume keyword(s).
- Keywords that ask about the same thing belong together: "what are track pants", "what are track pants made of", "what material are track pants made of" → all belong to ONE article.
- Keywords about different activities/entities MUST be in separate groups: "cross-country skiing" vs "cross-country running" vs "cross-country moving" are THREE separate topics.
- Look at the CORE SUBJECT of each keyword, not just shared words.
- Only assign low-volume keywords to a group if they are DIRECTLY relevant to that group's high-volume anchor keyword.

STEP 3: CREATE ONE BLOG IDEA PER LOGICAL GROUP
- Each blog idea should cover one coherent sub-topic.
- The title MUST be based on the highest-volume keyword in the group — never on a minor keyword.
- Merge closely related questions into a single article.
- Generate FEWER but more comprehensive blog ideas rather than many thin ones. Aim for 3-7 ideas depending on keyword diversity.
- Do NOT create separate articles for questions that would naturally be answered in the same article.

STEP 4: ASSIGN KEYWORDS — EACH KEYWORD TO EXACTLY ONE IDEA
- Every keyword must be assigned to exactly ONE blog idea. No duplicates across ideas.
- A keyword belongs to the idea where it would NATURALLY appear as a section or be answered.
- Do NOT assign a keyword to an idea just because they share surface words — the intent must match.
- After assigning, verify: scan every keyword in every idea and confirm zero duplicates.

RULES:
- Generate 3-7 blog ideas per cluster (NOT always 5 — fewer is better if keywords are closely related)
- Each blog idea MUST include "target_keywords": an array of keywords from the cluster that this article should target
- Each blog idea MUST include "value_promises": an array of exactly 5 sharp, specific value promises (see VALUE PROMISE RULES above)

CRITICAL TOPICAL COHERENCE RULES:
- Every target_keyword assigned to a blog idea MUST be directly relevant to that idea's specific title and angle.
- Keywords sharing surface words but different intents MUST go to different ideas (e.g. "cross country skiing" vs "cross country moving" vs "cross country running").
- Ask yourself: "Would a reader searching this keyword expect to land on THIS article?" If not, don't assign it.

CRITICAL KEYWORD DEDUPLICATION RULES:
- ZERO tolerance for duplicate keywords across blog ideas. Each keyword appears in exactly ONE idea.
- After generating all ideas, do a final deduplication pass: list every keyword used, check for repeats, remove duplicates.

- Match topic names exactly as provided
- Priority based on volume and business value
- Content type based on search intent${expPackBlock}`;

    // Process clusters in batches to avoid response truncation
    const BATCH_SIZE = 5;
    const allEnrichments: Record<string, any> = {};

    for (let i = 0; i < clusters.length; i += BATCH_SIZE) {
      const batch = clusters.slice(i, i + BATCH_SIZE);
      console.log(`Enriching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(clusters.length / BATCH_SIZE)} (${batch.length} clusters)...`);

      const clusterDescriptions = batch.map((c: any) => {
        // Send keywords WITH volumes so the model can prioritize by search volume
        const kwWithVols = c.keyword_volumes
          ? c.keywords.map((kw: string) => `${kw} (${c.keyword_volumes[kw] ?? c.keyword_volumes[kw.toLowerCase()] ?? "?"})`)
          : c.keywords;
        const allKws = kwWithVols.join(", ");
        return `Topic: "${c.topic}" (${c.keywords.length} keywords, ~${c.estimated_monthly_volume} monthly volume)\nALL Keywords (with search volume): ${allKws}`;
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

    // Helper to strip "(volume)" suffixes the AI may have included in target_keywords
    const stripVolSuffix = (kw: string) => kw.replace(/\s*\(\d+\)\s*$/, "").replace(/\s*\(\?\)\s*$/, "").trim();

    const enrichedClusters = clusters.map((c: any) => {
      const e = allEnrichments[c.topic] || {};
      const cleanedIdeas = (e.blog_ideas || []).map((idea: any) => ({
        ...idea,
        target_keywords: (idea.target_keywords || []).map(stripVolSuffix),
      }));
      return {
        ...c,
        description: e.description || `Keywords related to ${c.topic}`,
        content_type: e.content_type || "blog_post",
        difficulty: e.difficulty || "medium",
        priority: e.priority || "medium",
        blog_ideas: cleanedIdeas,
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
