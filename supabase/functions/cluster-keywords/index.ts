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

    // Cap keywords to avoid output truncation — deduplicate too
    const maxKeywords = 800;
    const uniqueKeywords = [...new Set(keywords.map((k: string) => k.toLowerCase().trim()))];
    const keywordsToAnalyze = uniqueKeywords.length > maxKeywords
      ? uniqueKeywords.slice(0, maxKeywords)
      : uniqueKeywords;

    const hasVolume = volumeMap && Object.keys(volumeMap).length > 0;

    // Compact prompt: do NOT ask LLM to return keyword_volumes (we inject from CSV)
    const systemPrompt = `You are an expert SEO strategist. Group the given keywords into topical silos.

RULES:
- 10-30 clusters sorted by estimated_monthly_volume desc
- Each cluster: clear topic name, 1-sentence description
- Every keyword in exactly one cluster
- Group by user intent & semantic similarity
- 5 blog ideas per cluster
- Output ONLY valid JSON, no markdown fences

JSON FORMAT:
{"clusters":[{"topic":"Name","description":"...","estimated_monthly_volume":12000,"keywords":["kw1","kw2"],"content_type":"blog_post|landing_page|guide|comparison|listicle|how_to","difficulty":"low|medium|high","priority":"high|medium|low","blog_ideas":[{"title":"...","description":"...","reason":"..."}]}],"total_keywords_clustered":0,"unclustered":[]}`;

    // Build user prompt — include volume hints but don't ask LLM to echo them back
    let userPrompt: string;
    if (hasVolume) {
      // Only include top-volume keywords with their volumes to save tokens
      const kwLines = keywordsToAnalyze.map(kw => {
        const vol = volumeMap[kw];
        return vol !== undefined && vol > 0 ? `${kw} [${vol}]` : kw;
      }).join("\n");
      userPrompt = `Cluster these ${keywordsToAnalyze.length} keywords into topical silos:\n\n${kwLines}`;
    } else {
      userPrompt = `Cluster these ${keywordsToAnalyze.length} keywords into topical silos:\n\n${keywordsToAnalyze.join("\n")}`;
    }

    console.log(`Clustering ${keywordsToAnalyze.length} keywords (from ${keywords.length} provided)`);

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
