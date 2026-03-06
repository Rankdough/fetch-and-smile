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
- Format: "[Main Keyword]: [Natural Question]?" — e.g. "Cross-Country Running: How Do You Train for a Race?"
- MUST contain "${focusKeyword}" verbatim, followed by a natural question.
- Simple, short (6-12 words), conversational.
- BANNED: "Ultimate Guide", "Beginner's Guide", "Handbook", "Comprehensive", "Everything You Need to Know", "Deep Dive", "Mastering", "Unpacking", "Unlocking", "Navigate", "Essential", "Your", "Checklist".

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
- Format: "[Main Keyword]: [Natural Question]?" — e.g. "Cross-Country Running: How Do You Train for a Race?", "Track Pants: What Are They Made Of?"
- The title MUST contain the primary target keyword verbatim, followed by a natural question.
- Keep it simple, short (6-12 words), and conversational — like how a real person would ask.
- BANNED phrases (never use these in titles): "Ultimate Guide", "Beginner's Guide", "Beginner's Handbook", "Comprehensive", "Everything You Need to Know", "Deep Dive", "Mastering", "Unpacking", "Unlocking", "Navigate", "Essential", "Your", "Handbook", "Checklist", "Beyond the Basics".
- NO sales language, no hype, no AI-sounding filler. Just keyword + question.

CRITICAL — STEP-BY-STEP PROCESS (follow this order):

STEP 1: GROUP KEYWORDS BY SUB-TOPIC FIRST
- Before creating any blog ideas, read ALL keywords and group them into logical sub-topics.
- Keywords that ask about the same thing belong together: "what are track pants", "what are track pants made of", "what material are track pants made of" → all belong to ONE article about "what are track pants".
- Keywords about different activities/entities MUST be in separate groups: "cross-country skiing" keywords vs "cross-country running" keywords vs "cross-country moving" keywords are THREE separate topics — never mix them.
- Look at the CORE SUBJECT of each keyword, not just shared words. "how to move cross country" is about RELOCATION, not about the sport "cross country".

STEP 2: CREATE ONE BLOG IDEA PER LOGICAL GROUP
- Each blog idea should cover one coherent sub-topic.
- Merge closely related questions into a single article (e.g. "what are track pants" + "what are track pants made of" + "what material are track pants made of" = one article).
- Generate FEWER but more comprehensive blog ideas rather than many thin ones. Aim for 3-7 ideas depending on keyword diversity.
- Do NOT create separate articles for questions that would naturally be answered in the same article.

STEP 3: ASSIGN KEYWORDS — EACH KEYWORD TO EXACTLY ONE IDEA
- Every keyword must be assigned to exactly ONE blog idea. No duplicates across ideas.
- A keyword belongs to the idea where it would NATURALLY appear as a section or be answered.
- After assigning, verify: scan every keyword in every idea and confirm zero duplicates.

RULES:
- Generate 3-7 blog ideas per cluster (NOT always 5 — fewer is better if keywords are closely related)
- Each blog idea MUST include "target_keywords": an array of keywords from the cluster that this article should target
- Each blog idea MUST include "value_promises": an array of exactly 3 concise value promises

CRITICAL TOPICAL COHERENCE RULES:
- Every target_keyword assigned to a blog idea MUST be directly relevant to that idea's specific title and angle.
- Keywords sharing surface words but different intents MUST go to different ideas (e.g. "cross country skiing" vs "cross country moving" vs "cross country running").
- Ask yourself: "Would a reader searching this keyword expect to land on THIS article?" If not, don't assign it.

CRITICAL KEYWORD DEDUPLICATION RULES:
- ZERO tolerance for duplicate keywords across blog ideas. Each keyword appears in exactly ONE idea.
- After generating all ideas, do a final deduplication pass: list every keyword used, check for repeats, remove duplicates.

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
        // Send ALL keywords so the model can properly group and deduplicate
        const allKws = c.keywords.join(", ");
        return `Topic: "${c.topic}" (${c.keywords.length} keywords, ~${c.estimated_monthly_volume} monthly volume)\nALL Keywords: ${allKws}`;
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
