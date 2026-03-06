import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { keywords, volumeMap, suggestedTopics } = await req.json();

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "Please provide an array of keywords" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const uniqueKeywords = [...new Set(keywords.map((k: string) => k.toLowerCase().trim()))];
    const hasVolume = volumeMap && Object.keys(volumeMap).length > 0;

    console.log(`Pass 1: Classifying ${uniqueKeywords.length} keywords into topics...`);

    // Build keyword list with optional volume hints
    const kwLines = uniqueKeywords.map(kw => {
      if (hasVolume && volumeMap[kw] > 0) return `${kw} [${volumeMap[kw]}]`;
      return kw;
    }).join("\n");

    const systemPrompt = `You are an expert SEO strategist. Your task is to classify every keyword into a topic silo the way an experienced human content strategist would.

CRITICAL GROUPING LOGIC:
- Group keywords by their SHARED THEME or DIMENSION, not by individual entities.
- If multiple keywords share the same pattern but differ by a variable (country, city, brand, material, procedure), they belong in ONE silo named after the shared dimension.
  Examples:
  - "dental tourism italy", "dental tourism germany", "dental tourism greece", "dental tourism spain" → silo: "Dental Tourism Destinations in Europe" (grouped by the shared concept: dental tourism + European country)
  - "dental implants albania", "dental crowns albania", "dental veneers albania" → silo: "Dental Services in Albania" (grouped by the shared location: Albania + different procedures)
  - "best dentist istanbul", "best dentist antalya", "best dentist izmir" → silo: "Best Dentists by City in Turkey" (grouped by the shared concept: best dentist + Turkish city)
- Do NOT create a separate silo for each country/city/brand/product — instead find the higher-level theme they share.
- Think: "What is the COMMON THREAD across these keywords?" and name the silo after that thread.

RULES:
- Create at most 12 topic silos (never more than 12)
- Every keyword must be assigned to exactly one topic
- Topic names MUST be based on the main/highest-volume keywords in that silo — use the actual keyword phrases as silo names (e.g. "dental implants cost" not "Dental Implant Pricing Information")
- Numbers in brackets are search volumes — use them to inform grouping but don't output them
- Output ONLY valid JSON, no markdown fences

JSON FORMAT:
{"assignments":{"keyword1":"Topic Name","keyword2":"Topic Name",...},"topics":["Topic Name 1","Topic Name 2",...]}`;

    const hasSuggested = suggestedTopics && Array.isArray(suggestedTopics) && suggestedTopics.length > 0;
    const suggestedBlock = hasSuggested
      ? `\n\nSUGGESTED SILOS (from the user — you MUST include these as silos, using the exact names provided. Assign relevant keywords to them. You may also create additional silos for keywords that don't fit any suggested silo):\n${suggestedTopics.map((t: string) => `- ${t}`).join("\n")}`
      : "";

    const userPrompt = `Classify these ${uniqueKeywords.length} keywords into 10-20 topic silos (maximum 20):${suggestedBlock}\n\n${kwLines}`;

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

    // Parse JSON — strip markdown fences, inline comments, trailing commas
    const cleanJson = (raw: string): string => {
      let s = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
      // Extract outermost JSON object
      const m = s.match(/\{[\s\S]*\}/);
      if (m) s = m[0];
      // Remove single-line JS comments (// ...)
      s = s.replace(/\/\/[^\n]*/g, "");
      // Remove trailing commas before } or ]
      s = s.replace(/,\s*([}\]])/g, "$1");
      return s;
    };

    let parsed: { assignments: Record<string, string>; topics: string[] };
    try {
      parsed = JSON.parse(cleanJson(content));
    } catch {
      console.error("Parse failed:", content.slice(0, 500));
      throw new Error("Failed to parse classification results");
    }

    // Build clusters from assignments
    const topicKeywords: Record<string, string[]> = {};
    const assignments = parsed.assignments || {};
    for (const [kw, topic] of Object.entries(assignments)) {
      const t = topic.trim();
      if (!topicKeywords[t]) topicKeywords[t] = [];
      topicKeywords[t].push(kw.toLowerCase());
    }

    // Find unassigned keywords
    const assignedSet = new Set(Object.keys(assignments).map(k => k.toLowerCase()));
    const unassigned = uniqueKeywords.filter(kw => !assignedSet.has(kw));
    if (unassigned.length > 0) {
      if (!topicKeywords["Other"]) topicKeywords["Other"] = [];
      topicKeywords["Other"].push(...unassigned);
    }

    // Calculate volumes and build cluster summaries
    const clusters = Object.entries(topicKeywords)
      .map(([topic, kws]) => {
        let vol = 0;
        const kwVols: Record<string, number> = {};
        if (hasVolume) {
          for (const kw of kws) {
            if (volumeMap[kw] !== undefined) {
              kwVols[kw] = volumeMap[kw];
              vol += volumeMap[kw];
            }
          }
        }
        return {
          topic,
          keywords: kws,
          estimated_monthly_volume: vol,
          keyword_volumes: hasVolume ? kwVols : undefined,
        };
      })
      .sort((a, b) => b.estimated_monthly_volume - a.estimated_monthly_volume || b.keywords.length - a.keywords.length);

    const totalClustered = clusters.reduce((s, c) => s + c.keywords.length, 0);

    console.log(`Pass 1 complete: ${clusters.length} topics, ${totalClustered} assigned, ${unassigned.length} unassigned`);

    return new Response(JSON.stringify({ clusters, total_keywords_clustered: totalClustered, unclustered: unassigned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("cluster-keywords-classify error:", e);
    const status = e.status || 500;
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
