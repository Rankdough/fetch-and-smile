import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { keywords, volumeMap } = await req.json();

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "Please provide an array of keywords" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // For very large keyword lists, sample + summarize
    const maxKeywords = 2000;
    const keywordsToAnalyze = keywords.length > maxKeywords
      ? keywords.slice(0, maxKeywords)
      : keywords;

    const hasVolume = volumeMap && Object.keys(volumeMap).length > 0;

    const systemPrompt = `You are an expert SEO strategist specializing in keyword clustering and content strategy.

Your task: Given a list of keywords${hasVolume ? " with their actual monthly search volumes" : ""}, group them into topical silos/clusters that represent distinct content opportunities.

RULES:
- Return AT LEAST 10 topic clusters (more if the data supports it, up to 30)
- Each cluster should have a clear, descriptive topic name suitable as a content pillar
${hasVolume 
  ? "- For each keyword in a cluster, include its actual search volume in the keyword_volumes object"
  : "- For each keyword in a cluster, estimate its individual monthly search volume in the keyword_volumes object"}
- Calculate estimated_monthly_volume as the SUM of all keyword volumes in the cluster
- Sort clusters by estimated_monthly_volume (highest first)
- Every keyword must be assigned to exactly one cluster
- Clusters should be actionable content ideas — each could become a blog post, landing page, or content series
- Group by user intent and semantic similarity, not just surface-level word matching
- For each cluster, suggest exactly 5 blog post ideas that would target the keywords in that cluster

OUTPUT FORMAT (strict JSON, no markdown):
{
  "clusters": [
    {
      "topic": "Descriptive Topic Name",
      "description": "One sentence explaining what this content cluster covers and why it matters",
      "estimated_monthly_volume": 12000,
      "keywords": ["keyword 1", "keyword 2"],
      "keyword_volumes": {"keyword 1": 8000, "keyword 2": 4000},
      "content_type": "blog_post | landing_page | guide | comparison | listicle | how_to",
      "difficulty": "low | medium | high",
      "priority": "high | medium | low",
      "blog_ideas": [
        {
          "title": "Blog Post Title",
          "description": "One sentence describing what this post covers",
          "reason": "Why this blog is worth writing from an SEO/business perspective"
        }
      ]
    }
  ],
  "total_keywords_clustered": 150,
  "unclustered": []
}`;

    let userPrompt: string;
    if (hasVolume) {
      const kwLines = keywordsToAnalyze.map(kw => {
        const vol = volumeMap[kw];
        return vol !== undefined ? `${kw} [vol: ${vol}]` : kw;
      }).join("\n");
      userPrompt = `Analyze and cluster these ${keywordsToAnalyze.length} keywords (with search volume data) into topical silos:\n\n${kwLines}`;
    } else {
      userPrompt = `Analyze and cluster these ${keywordsToAnalyze.length} keywords into topical silos:\n\n${keywordsToAnalyze.join("\n")}`;
    }

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
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response - strip markdown fences first
    let parsed;
    try {
      let cleaned = content;
      // Remove markdown code fences
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // Fallback: try to extract JSON object
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e2) {
        console.error("Failed to parse AI response:", content.slice(0, 500));
        throw new Error("Failed to parse clustering results");
      }
    }

    // Inject actual volume data from CSV into clusters (don't rely on LLM to echo it)
    if (hasVolume && parsed.clusters) {
      for (const cluster of parsed.clusters) {
        if (!cluster.keyword_volumes) cluster.keyword_volumes = {};
        let sum = 0;
        for (const kw of cluster.keywords) {
          const vol = volumeMap[kw];
          if (vol !== undefined) {
            cluster.keyword_volumes[kw] = vol;
            sum += vol;
          }
        }
        if (sum > 0) cluster.estimated_monthly_volume = sum;
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cluster-keywords error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
