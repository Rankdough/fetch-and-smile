import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 1000;

// Parse JSON — strip markdown fences, inline comments, trailing commas
const cleanJson = (raw: string): string => {
  let s = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  const m = s.match(/\{[\s\S]*\}/);
  if (m) s = m[0];
  s = s.replace(/\/\/[^\n]*/g, "");
  s = s.replace(/,\s*([}\]])/g, "$1");
  return s;
};

const otherAliases = ["other", "others", "miscellaneous", "uncategorized", "general"];

async function classifyBatch(
  batchKeywords: string[],
  volumeMap: Record<string, number> | null,
  hasVolume: boolean,
  suggestedTopics: string[] | null,
  existingSilos: string[],
  apiKey: string,
  batchIndex: number,
  totalBatches: number
): Promise<{ assignments: Record<string, string>; newTopics: string[] }> {
  const kwLines = batchKeywords.map(kw => {
    if (hasVolume && volumeMap && volumeMap[kw] > 0) return `${kw} [${volumeMap[kw]}]`;
    return kw;
  }).join("\n");

  // Build silo guidance: combine suggested + already-discovered silos
  const allKnownSilos = [...new Set([...(suggestedTopics || []), ...existingSilos])];
  const hasSuggested = suggestedTopics && suggestedTopics.length > 0;
  const hasExisting = existingSilos.length > 0;

  let siloBlock = "";
  if (allKnownSilos.length > 0) {
    if (batchIndex === 0 && hasSuggested && !hasExisting) {
      // First batch with only user-suggested silos
      siloBlock = `\n\nSUGGESTED SILOS (from the user — you MUST include these as silos, using the exact names provided. Assign relevant keywords to them. You may also create additional silos for keywords that don't fit any suggested silo):\n${suggestedTopics!.map(t => `- ${t}`).join("\n")}`;
    } else {
      // Subsequent batches or mix of suggested + discovered
      const suggestedSet = new Set(suggestedTopics || []);
      const suggestedList = allKnownSilos.filter(t => suggestedSet.has(t));
      const discoveredList = allKnownSilos.filter(t => !suggestedSet.has(t));

      siloBlock = "\n\nEXISTING SILOS (you MUST use these silo names for relevant keywords. You may create new silos ONLY if a keyword genuinely doesn't fit any existing silo):";
      if (suggestedList.length > 0) {
        siloBlock += `\nUser-suggested:\n${suggestedList.map(t => `- ${t}`).join("\n")}`;
      }
      if (discoveredList.length > 0) {
        siloBlock += `\nDiscovered from previous batches:\n${discoveredList.map(t => `- ${t}`).join("\n")}`;
      }
    }
  }

  const systemPrompt = `You are an expert SEO strategist. Your task is to classify every keyword into a topic silo the way an experienced human content strategist would.

CRITICAL GROUPING LOGIC:
- Group keywords by their SHARED THEME or DIMENSION, not by individual entities.
- If multiple keywords share the same pattern but differ by a variable (country, city, brand, material, procedure), they belong in ONE silo named after the shared dimension.
  Examples:
  - "dental tourism italy", "dental tourism germany", "dental tourism greece", "dental tourism spain" → silo: "Dental Tourism Destinations in Europe"
  - "dental implants albania", "dental crowns albania", "dental veneers albania" → silo: "Dental Services in Albania"
  - "best dentist istanbul", "best dentist antalya", "best dentist izmir" → silo: "Best Dentists by City in Turkey"
- Do NOT create a separate silo for each country/city/brand/product — instead find the higher-level theme they share.
- Think: "What is the COMMON THREAD across these keywords?" and name the silo after that thread.

RULES:
- ${allKnownSilos.length > 0 ? "Prefer assigning keywords to existing silos. Only create new silos if keywords genuinely don't fit any existing silo." : "Create at most 20 topic silos. HARD LIMIT: 20 silos maximum. If you have more than 20 potential groups, merge the smallest/most-similar ones until you have exactly 20 or fewer."}
- Every keyword must be assigned to exactly one topic
- Topic names MUST be based on the main/highest-volume keywords in that silo — use the actual keyword phrases as silo names (e.g. "dental implants cost" not "Dental Implant Pricing Information")
- Numbers in brackets are search volumes — use them to inform grouping but don't output them
- Output ONLY valid JSON, no markdown fences

JSON FORMAT:
{"assignments":{"keyword1":"Topic Name","keyword2":"Topic Name",...},"topics":["Topic Name 1","Topic Name 2",...]}`;

  const batchLabel = totalBatches > 1 ? ` (batch ${batchIndex + 1}/${totalBatches})` : "";
  const userPrompt = `Classify these ${batchKeywords.length} keywords into topic silos${batchLabel}:${siloBlock}\n\n${kwLines}`;

  console.log(`Batch ${batchIndex + 1}/${totalBatches}: Classifying ${batchKeywords.length} keywords, ${allKnownSilos.length} known silos...`);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    if (response.status === 429) throw Object.assign(new Error("Rate limit exceeded. Please try again in a moment."), { status: 429 });
    if (response.status === 402) throw Object.assign(new Error("AI credits exhausted. Please add credits."), { status: 402 });
    const t = await response.text();
    console.error(`Batch ${batchIndex + 1} AI error:`, response.status, t);
    throw new Error(`AI gateway error on batch ${batchIndex + 1}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  let parsed: { assignments: Record<string, string>; topics?: string[] };
  try {
    parsed = JSON.parse(cleanJson(content));
  } catch {
    console.error(`Batch ${batchIndex + 1} parse failed:`, content.slice(0, 500));
    throw new Error(`Failed to parse batch ${batchIndex + 1} results`);
  }

  const assignments = parsed.assignments || {};
  // Collect new topic names discovered in this batch
  const newTopics = [...new Set(Object.values(assignments).map(t => t.trim()))].filter(
    t => !otherAliases.includes(t.toLowerCase().trim())
  );

  const assignedCount = Object.keys(assignments).length;
  console.log(`Batch ${batchIndex + 1} done: ${assignedCount}/${batchKeywords.length} assigned, ${newTopics.length} topics`);

  return { assignments, newTopics };
}

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

    const hasSuggested = suggestedTopics && Array.isArray(suggestedTopics) && suggestedTopics.length > 0;
    const suggestedList: string[] = hasSuggested ? suggestedTopics : [];

    // ═══════════════════════════════════════════════
    // BATCHED CLASSIFICATION
    // ═══════════════════════════════════════════════
    const totalBatches = Math.ceil(uniqueKeywords.length / BATCH_SIZE);
    console.log(`Starting classification: ${uniqueKeywords.length} keywords in ${totalBatches} batch(es)`);

    const topicKeywords: Record<string, string[]> = {};
    const allAssignedSet = new Set<string>();
    let accumulatedSilos: string[] = [];

    for (let i = 0; i < totalBatches; i++) {
      const batchStart = i * BATCH_SIZE;
      const batchKws = uniqueKeywords.slice(batchStart, batchStart + BATCH_SIZE);

      const { assignments, newTopics } = await classifyBatch(
        batchKws,
        volumeMap,
        hasVolume,
        suggestedList.length > 0 ? suggestedList : null,
        accumulatedSilos,
        LOVABLE_API_KEY,
        i,
        totalBatches
      );

      // Merge assignments into topicKeywords
      for (const [kw, topic] of Object.entries(assignments)) {
        const t = topic.trim();
        const kwLower = kw.toLowerCase();
        if (otherAliases.includes(t.toLowerCase().trim())) continue; // skip "Other" — handle later
        if (!topicKeywords[t]) topicKeywords[t] = [];
        topicKeywords[t].push(kwLower);
        allAssignedSet.add(kwLower);
      }

      // Update accumulated silos for next batch
      accumulatedSilos = [...new Set([...accumulatedSilos, ...newTopics])].filter(
        t => !otherAliases.includes(t.toLowerCase().trim())
      );
    }

    // Find all unassigned keywords across all batches
    let otherKeywords = uniqueKeywords.filter(kw => !allAssignedSet.has(kw));
    // Deduplicate
    otherKeywords = [...new Set(otherKeywords.map(k => k.toLowerCase().trim()))];

    const existingTopics = Object.keys(topicKeywords);

    console.log(`All batches done: ${existingTopics.length} topics, ${allAssignedSet.size} assigned, ${otherKeywords.length} unassigned`);

    // ═══════════════════════════════════════════════
    // RE-CLASSIFICATION PASS: Give "Other" keywords a second chance
    // ═══════════════════════════════════════════════
    if (otherKeywords.length > 3 && existingTopics.length > 0) {
      // Batch the re-classification too if needed
      const reclassBatches = Math.ceil(otherKeywords.length / BATCH_SIZE);
      console.log(`Re-classifying ${otherKeywords.length} "Other" keywords in ${reclassBatches} batch(es) against ${existingTopics.length} silos...`);

      const stillOther: string[] = [];
      let totalRescued = 0;

      for (let i = 0; i < reclassBatches; i++) {
        const batchStart = i * BATCH_SIZE;
        const batchKws = otherKeywords.slice(batchStart, batchStart + BATCH_SIZE);

        const otherKwLines = batchKws.map(kw => {
          if (hasVolume && volumeMap[kw] > 0) return `${kw} [${volumeMap[kw]}]`;
          return kw;
        }).join("\n");

        const currentTopics = Object.keys(topicKeywords);
        const reclassifySystem = `You are an expert SEO strategist. These keywords were not properly classified in a first pass. Classify each one into the MOST RELEVANT existing silo, or into a new silo if none fit.

EXISTING SILOS:
${currentTopics.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}

RULES:
- Assign EVERY keyword to one of the existing silos above, OR create at most 3 new silos for genuinely distinct topics
- Only create a new silo if a keyword truly doesn't fit any existing silo
- Only use "Other" as an absolute last resort for keywords that genuinely have no thematic connection to anything else
- Look at the CORE SUBJECT of each keyword
- Numbers in brackets are search volumes — don't output them
- Output ONLY valid JSON, no markdown fences

JSON FORMAT:
{"assignments":{"keyword1":"Existing or New Silo Name","keyword2":"Existing or New Silo Name",...}}`;

        const reclassifyUser = `Classify these ${batchKws.length} keywords:\n\n${otherKwLines}`;

        try {
          const reclassifyResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: reclassifySystem },
                { role: "user", content: reclassifyUser },
              ],
            }),
          });

          if (reclassifyResponse.ok) {
            const reclassifyData = await reclassifyResponse.json();
            const reclassifyContent = reclassifyData.choices?.[0]?.message?.content || "";
            let reclassified: { assignments: Record<string, string> };
            try {
              reclassified = JSON.parse(cleanJson(reclassifyContent));
            } catch {
              console.error(`Re-classify batch ${i + 1} parse failed:`, reclassifyContent.slice(0, 300));
              reclassified = { assignments: {} };
            }

            const reAssignments = reclassified.assignments || {};

            for (const kw of batchKws) {
              const topic = reAssignments[kw]?.trim() || reAssignments[kw.toLowerCase()]?.trim();
              if (topic && !otherAliases.includes(topic.toLowerCase().trim())) {
                if (!topicKeywords[topic]) topicKeywords[topic] = [];
                topicKeywords[topic].push(kw);
                totalRescued++;
              } else {
                stillOther.push(kw);
              }
            }
          } else {
            console.error(`Re-classify batch ${i + 1} failed:`, reclassifyResponse.status);
            stillOther.push(...batchKws);
          }
        } catch (reclassifyErr) {
          console.error(`Re-classify batch ${i + 1} error (non-fatal):`, reclassifyErr);
          stillOther.push(...batchKws);
        }
      }

      otherKeywords = stillOther;
      console.log(`Re-classification: ${totalRescued} keywords rescued, ${otherKeywords.length} remain in Other`);
    }

    // Put any remaining truly unclassifiable keywords into "Other"
    if (otherKeywords.length > 0) {
      if (!topicKeywords["Other"]) topicKeywords["Other"] = [];
      topicKeywords["Other"].push(...otherKeywords);
    }

    // ═══════════════════════════════════════════════
    // CONSOLIDATION PASS: Merge down to ≤12 silos if AI over-fragmented
    // ═══════════════════════════════════════════════
    const MAX_SILOS = 12;
    const siloNames = Object.keys(topicKeywords).filter(t => t !== "Other");
    if (siloNames.length > MAX_SILOS) {
      console.log(`Too many silos (${siloNames.length}). Consolidating to ≤${MAX_SILOS}...`);

      // Build a summary of all silos with keyword counts and volumes
      const siloSummaries = siloNames.map(name => {
        const kws = topicKeywords[name];
        let vol = 0;
        if (hasVolume) {
          for (const kw of kws) {
            if (volumeMap[kw]) vol += volumeMap[kw];
          }
        }
        return { name, count: kws.length, volume: vol };
      }).sort((a, b) => b.volume - a.volume || b.count - a.count);

      const siloList = siloSummaries.map(s => `- "${s.name}" (${s.count} kws, ~${s.volume} vol)`).join("\n");

      const mergeSystem = `You are an SEO strategist. You have ${siloNames.length} topic silos but need to consolidate them to at most ${MAX_SILOS}.

CURRENT SILOS:
${siloList}

RULES:
- Output a merge map: for each silo that should be merged, specify which target silo it merges INTO
- Keep the largest/highest-volume silos as targets
- Merge small, thematically similar silos together
- The merged result must have at most ${MAX_SILOS} silos (not counting "Other")
- Use EXACT silo names from the list above
- Output ONLY valid JSON, no markdown fences

JSON FORMAT:
{"merges":{"Small Silo Name":"Target Silo Name","Another Small Silo":"Target Silo Name",...}}

Silos NOT mentioned in "merges" will be kept as-is.`;

      try {
        const mergeResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: mergeSystem },
              { role: "user", content: `Consolidate these ${siloNames.length} silos down to at most ${MAX_SILOS}.` },
            ],
          }),
        });

        if (mergeResponse.ok) {
          const mergeData = await mergeResponse.json();
          const mergeContent = mergeData.choices?.[0]?.message?.content || "";
          let mergeParsed: { merges: Record<string, string> };
          try {
            mergeParsed = JSON.parse(cleanJson(mergeContent));
          } catch {
            console.error("Merge parse failed:", mergeContent.slice(0, 500));
            mergeParsed = { merges: {} };
          }

          const merges = mergeParsed.merges || {};
          let mergeCount = 0;
          for (const [source, target] of Object.entries(merges)) {
            if (source === target) continue;
            if (!topicKeywords[source]) continue;
            // Ensure target exists (might be a new name from the merge)
            if (!topicKeywords[target]) topicKeywords[target] = [];
            topicKeywords[target].push(...topicKeywords[source]);
            delete topicKeywords[source];
            mergeCount++;
          }
          console.log(`Consolidation: merged ${mergeCount} silos, now ${Object.keys(topicKeywords).filter(t => t !== "Other").length} silos`);
        } else {
          console.error("Consolidation AI call failed:", mergeResponse.status);
        }
      } catch (mergeErr) {
        console.error("Consolidation error (non-fatal):", mergeErr);
      }
    }

    // Calculate volumes and build cluster summaries
    const clusters = Object.entries(topicKeywords)
      .map(([topic, kws]) => {
        const dedupedKws = [...new Set(kws.map(k => k.toLowerCase().trim()))];
        let vol = 0;
        const kwVols: Record<string, number> = {};
        if (hasVolume) {
          for (const kw of dedupedKws) {
            if (volumeMap[kw] !== undefined) {
              kwVols[kw] = volumeMap[kw];
              vol += volumeMap[kw];
            }
          }
        }
        return {
          topic,
          keywords: dedupedKws,
          estimated_monthly_volume: vol,
          keyword_volumes: hasVolume ? kwVols : undefined,
        };
      })
      .sort((a, b) => b.estimated_monthly_volume - a.estimated_monthly_volume || b.keywords.length - a.keywords.length);

    const totalClustered = clusters.reduce((s, c) => s + c.keywords.length, 0);

    console.log(`Complete: ${clusters.length} topics, ${totalClustered} keywords, ${otherKeywords.length} in Other`);

    return new Response(JSON.stringify({ clusters, total_keywords_clustered: totalClustered, unclustered: otherKeywords }), {
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
