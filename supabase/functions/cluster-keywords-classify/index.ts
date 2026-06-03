import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 500;
const MAX_PARALLEL_BATCHES = 6; // still used by re-classification of stragglers
const MIN_RETRY_BATCH_SIZE = 25;

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  });

  await Promise.all(workers);
  return results;
}

// Parse JSON — strip markdown fences, inline comments, trailing commas
const cleanJson = (raw: string): string => {
  let s = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  const m = s.match(/\{[\s\S]*\}/);
  if (m) s = m[0];
  s = s.replace(/\/\/[^\n]*/g, "");
  s = s.replace(/,\s*([}\]])/g, "$1");
  return s;
};

const salvageAssignments = (raw: string, batchKeywords: string[]): Record<string, string> => {
  const validKeywords = new Set(batchKeywords.map(kw => kw.toLowerCase().trim()));
  const assignments: Record<string, string> = {};
  const body = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```[\s\S]*$/i, "");
  const pairRegex = /"((?:\\.|[^"\\])+)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;

  while ((match = pairRegex.exec(body)) !== null) {
    try {
      const keyword = JSON.parse(`"${match[1]}"`).toLowerCase().trim();
      const topic = JSON.parse(`"${match[2]}"`).trim();
      if (validKeywords.has(keyword) && topic) assignments[keyword] = topic;
    } catch {
      // Ignore malformed pairs; complete missing keywords are handled by the re-classification pass.
    }
  }

  return assignments;
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
  const isAppendMode = hasSuggested; // suggestedTopics means we're adding to an existing project
  if (allKnownSilos.length > 0) {
    siloBlock = "\n\nEXISTING SILOS — you MUST assign keywords to these when relevant:";
    siloBlock += `\n${allKnownSilos.map(t => `- ${t}`).join("\n")}`;
    
    if (isAppendMode) {
      siloBlock += `\n\nSTRICT APPEND RULES (YOU MUST FOLLOW THESE — NO EXCEPTIONS):
- These keywords are being ADDED to an existing project. The silos above already exist.
- STEP 1: For EACH keyword, check if it fits ANY existing silo. If yes, assign it there. Be generous — even loose thematic overlap counts.
- STEP 2: Only keywords with ZERO connection to ANY existing silo can go into new silos.
- STEP 3: Group ALL remaining keywords into AT MOST 3 new silos. If there are fewer than 10 unmatched keywords, use only 1 new silo.
- HARD LIMIT: Maximum 3 new silo names in your output. If your output contains more than 3 silo names that are NOT in the existing list above, your response is INVALID.
- Keywords that are variations of the same query (e.g. "X vs Y", "Y vs X", "X or Y") MUST go into the SAME silo.
- Prefer assigning to existing silos even if the fit isn't perfect — creating new silos is a LAST RESORT.`;
    } else {
      siloBlock += `\n\nYou may create new silos for keywords that don't fit any existing silo, but group related new keywords together — never one silo per keyword.`;
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
- ${allKnownSilos.length > 0 
    ? (isAppendMode 
      ? "You are in APPEND mode. Assign keywords to existing silos whenever possible. You may create AT MOST 3 new silos — fewer is better. If all keywords share a theme, put them in ONE silo." 
      : "Prefer assigning keywords to existing silos. Only create new silos if keywords genuinely don't fit any existing silo.")
    : "Create at most 20 topic silos. HARD LIMIT: 20 silos maximum. If you have more than 20 potential groups, merge the smallest/most-similar ones until you have exactly 20 or fewer."}
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
      temperature: 0,
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
    const salvaged = salvageAssignments(content, batchKeywords);
    if (Object.keys(salvaged).length > 0) {
      console.warn(`Batch ${batchIndex + 1}: salvaged ${Object.keys(salvaged).length}/${batchKeywords.length} assignments from malformed JSON.`);
      parsed = { assignments: salvaged };
    } else {
      throw new Error(`Failed to parse batch ${batchIndex + 1} results`);
    }
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

async function classifyBatchResilient(
  batchKeywords: string[],
  volumeMap: Record<string, number> | null,
  hasVolume: boolean,
  suggestedTopics: string[] | null,
  existingSilos: string[],
  apiKey: string,
  batchIndex: number,
  totalBatches: number
): Promise<{ assignments: Record<string, string>; newTopics: string[] }> {
  try {
    return await classifyBatch(batchKeywords, volumeMap, hasVolume, suggestedTopics, existingSilos, apiKey, batchIndex, totalBatches);
  } catch (err: any) {
    if (err?.status === 429 || err?.status === 402) throw err;

    if (batchKeywords.length <= MIN_RETRY_BATCH_SIZE) {
      console.error(`Batch ${batchIndex + 1} failed at minimum retry size; sending ${batchKeywords.length} keywords to Other instead of aborting.`);
      return { assignments: {}, newTopics: [] };
    }

    const midpoint = Math.ceil(batchKeywords.length / 2);
    console.warn(`Batch ${batchIndex + 1} failed; retrying as two smaller batches (${midpoint} + ${batchKeywords.length - midpoint}).`);
    const [left, right] = await Promise.all([
      classifyBatchResilient(batchKeywords.slice(0, midpoint), volumeMap, hasVolume, suggestedTopics, existingSilos, apiKey, batchIndex, totalBatches),
      classifyBatchResilient(batchKeywords.slice(midpoint), volumeMap, hasVolume, suggestedTopics, existingSilos, apiKey, batchIndex, totalBatches),
    ]);

    return {
      assignments: { ...left.assignments, ...right.assignments },
      newTopics: [...new Set([...left.newTopics, ...right.newTopics])],
    };
  }
}

// ═══════════════════════════════════════════════
// Stand-alone consolidation runner for the client-orchestrated "consolidate" phase.
// Mirrors the logic of the default pipeline's post-classification section
// (re-classify Other + 3 merge passes + cluster build) without touching it.
// ═══════════════════════════════════════════════
async function runConsolidation(
  incomingTopicKeywords: Record<string, string[]>,
  volumeMap: Record<string, number> | null,
  LOVABLE_API_KEY: string
): Promise<Response> {
  const hasVolume = volumeMap && Object.keys(volumeMap).length > 0;
  const topicKeywords: Record<string, string[]> = {};
  for (const [t, kws] of Object.entries(incomingTopicKeywords)) {
    if (!Array.isArray(kws)) continue;
    topicKeywords[t] = [...new Set(kws.map((k) => String(k).toLowerCase().trim()))];
  }

  let otherKeywords = topicKeywords["Other"] ? [...topicKeywords["Other"]] : [];
  delete topicKeywords["Other"];
  const existingTopics = Object.keys(topicKeywords);

  console.log(`Consolidate phase: ${existingTopics.length} silos in, ${otherKeywords.length} unassigned`);

  // Re-classify "Other" against existing silos
  if (otherKeywords.length > 3 && existingTopics.length > 0) {
    const reclassBatches = Math.ceil(otherKeywords.length / BATCH_SIZE);
    const stillOther: string[] = [];
    let totalRescued = 0;
    const currentTopics = Object.keys(topicKeywords);
    const allowNewSilos = otherKeywords.length >= 10;
    const reclassifySystem = `You are an expert SEO strategist. These keywords were not properly classified in a first pass. Classify each one into the MOST RELEVANT existing silo.

EXISTING SILOS:
${currentTopics.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}

RULES:
- Assign EVERY keyword to one of the existing silos above. Be generous — even loose thematic overlap counts.
${allowNewSilos
  ? "- You may create AT MOST 1 new silo, ONLY if at least 5 keywords share a clearly distinct theme that no existing silo covers."
  : "- DO NOT create new silos. Force every keyword into the closest existing silo."}
- Never put a single keyword into its own silo.
- Only use "Other" as an absolute last resort.
- Numbers in brackets are search volumes — don't output them.
- Output ONLY valid JSON, no markdown fences.

JSON FORMAT:
{"assignments":{"keyword1":"Existing Silo Name",...}}`;

    const reclassTasks: (() => Promise<{ batchKws: string[]; assignments: Record<string, string>; failed: boolean }>)[] = [];
    for (let i = 0; i < reclassBatches; i++) {
      const batchStart = i * BATCH_SIZE;
      const batchKws = otherKeywords.slice(batchStart, batchStart + BATCH_SIZE);
      const otherKwLines = batchKws.map((kw) => {
        if (hasVolume && volumeMap![kw] > 0) return `${kw} [${volumeMap![kw]}]`;
        return kw;
      }).join("\n");
      const reclassifyUser = `Classify these ${batchKws.length} keywords:\n\n${otherKwLines}`;

      reclassTasks.push(async () => {
        try {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              temperature: 0,
              messages: [
                { role: "system", content: reclassifySystem },
                { role: "user", content: reclassifyUser },
              ],
            }),
          });
          if (!resp.ok) return { batchKws, assignments: {}, failed: true };
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content || "";
          try {
            const parsed = JSON.parse(cleanJson(content));
            return { batchKws, assignments: parsed.assignments || {}, failed: false };
          } catch {
            return { batchKws, assignments: {}, failed: false };
          }
        } catch {
          return { batchKws, assignments: {}, failed: true };
        }
      });
    }

    const reclassResults = await runWithConcurrency(reclassTasks, MAX_PARALLEL_BATCHES);
    for (const { batchKws, assignments: reAssignments, failed } of reclassResults) {
      if (failed) { stillOther.push(...batchKws); continue; }
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
    }
    otherKeywords = stillOther;
    console.log(`Consolidate re-classify: ${totalRescued} rescued, ${otherKeywords.length} still Other`);
  }

  if (otherKeywords.length > 0) {
    if (!topicKeywords["Other"]) topicKeywords["Other"] = [];
    topicKeywords["Other"].push(...otherKeywords);
  }

  // Merge passes (mirrors default pipeline)
  const MAX_SILOS = 20;
  const TINY_KEYWORD_THRESHOLD = 2;
  const TINY_VOLUME_THRESHOLD = 50;

  const siloVolume = (name: string) => {
    const kws = topicKeywords[name] || [];
    if (!hasVolume) return 0;
    let v = 0;
    for (const kw of kws) if (volumeMap![kw]) v += volumeMap![kw];
    return v;
  };

  const runMergePass = async (label: string) => {
    const siloNames = Object.keys(topicKeywords).filter((t) => t !== "Other");
    if (siloNames.length === 0) return;
    const siloSummaries = siloNames.map((name) => ({
      name,
      count: (topicKeywords[name] || []).length,
      volume: siloVolume(name),
      sampleKws: (topicKeywords[name] || []).slice(0, 6),
    })).sort((a, b) => b.volume - a.volume || b.count - a.count);

    const siloList = siloSummaries
      .map((s) => `- "${s.name}" (${s.count} kws, ~${s.volume} vol) e.g. ${s.sampleKws.join(", ")}`)
      .join("\n");
    const tinyList = siloSummaries.filter((s) => s.count <= TINY_KEYWORD_THRESHOLD || s.volume < TINY_VOLUME_THRESHOLD);

    const mergeSystem = `You are a senior SEO strategist consolidating a fragmented topic silo list. The same theme has likely been split across multiple silos by parallel batches.

CURRENT SILOS (${siloNames.length} total — must end with at most ${MAX_SILOS}):
${siloList}

YOUR JOB:
1. Identify silos describing the SAME or OVERLAPPING theme and merge them into ONE.
2. Absorb every TINY silo (≤${TINY_KEYWORD_THRESHOLD} keywords OR <${TINY_VOLUME_THRESHOLD} volume) into the closest larger silo.
3. Prefer the largest/highest-volume silo of each theme as the target name.
4. Final silo count MUST be ≤ ${MAX_SILOS}.

Tiny silos that MUST be merged:
${tinyList.length > 0 ? tinyList.map((s) => `- "${s.name}" (${s.count} kws, ~${s.volume} vol)`).join("\n") : "(none)"}

OUTPUT RULES:
- Output a merge map. For every silo to be merged, give source → target (both EXACT existing names).
- Output ONLY valid JSON, no markdown fences.

JSON FORMAT:
{"merges":{"Source Silo":"Target Silo", ...}}`;

    console.log(`${label}: ${siloNames.length} silos, ${tinyList.length} tiny — merging...`);
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0,
          messages: [
            { role: "system", content: mergeSystem },
            { role: "user", content: `Consolidate these ${siloNames.length} silos down to at most ${MAX_SILOS}.` },
          ],
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || "";
      let parsed: { merges: Record<string, string> };
      try { parsed = JSON.parse(cleanJson(content)); } catch { return; }
      const merges = parsed.merges || {};
      const resolveTarget = (name: string, depth = 0): string => {
        if (depth > 10) return name;
        const next = merges[name];
        if (!next || next === name) return name;
        return resolveTarget(next, depth + 1);
      };
      let mergeCount = 0;
      for (const source of Object.keys(merges)) {
        const target = resolveTarget(source);
        if (source === target) continue;
        if (!topicKeywords[source]) continue;
        if (!topicKeywords[target]) topicKeywords[target] = [];
        topicKeywords[target].push(...topicKeywords[source]);
        delete topicKeywords[source];
        mergeCount++;
      }
      console.log(`${label}: merged ${mergeCount}, now ${Object.keys(topicKeywords).filter((t) => t !== "Other").length} silos`);
    } catch (e) {
      console.error(`${label} error (non-fatal):`, e);
    }
  };

  const initialSilos = Object.keys(topicKeywords).filter((t) => t !== "Other");
  const hasTiny = initialSilos.some((n) => (topicKeywords[n] || []).length <= TINY_KEYWORD_THRESHOLD || siloVolume(n) < TINY_VOLUME_THRESHOLD);
  if (initialSilos.length > MAX_SILOS || hasTiny) await runMergePass("Consolidation pass 1");
  if (Object.keys(topicKeywords).filter((t) => t !== "Other").length > MAX_SILOS) await runMergePass("Consolidation pass 2");
  if (Object.keys(topicKeywords).filter((t) => t !== "Other").length > MAX_SILOS) await runMergePass("Consolidation pass 3");

  const clusters = Object.entries(topicKeywords)
    .map(([topic, kws]) => {
      const dedupedKws = [...new Set(kws.map((k) => k.toLowerCase().trim()))];
      let vol = 0;
      const kwVols: Record<string, number> = {};
      if (hasVolume) {
        for (const kw of dedupedKws) {
          if (volumeMap![kw] !== undefined) {
            kwVols[kw] = volumeMap![kw];
            vol += volumeMap![kw];
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
  const finalOther = topicKeywords["Other"] || [];
  console.log(`Consolidate done: ${clusters.length} topics, ${totalClustered} keywords, ${finalOther.length} in Other`);

  return new Response(JSON.stringify({ clusters, total_keywords_clustered: totalClustered, unclustered: finalOther }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { keywords, volumeMap, suggestedTopics, phase, batchKeywords, existingSilos, batchIndex, totalBatches: incomingTotalBatches, topicKeywords: incomingTopicKeywords } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ═══════════════════════════════════════════════
    // PHASE: classify-batch — process ONE batch only, no consolidation.
    // Used by the client when orchestrating large datasets (>1500 kws) to avoid
    // edge-function timeouts. Default behavior (no phase) is unchanged.
    // ═══════════════════════════════════════════════
    if (phase === "classify-batch") {
      if (!Array.isArray(batchKeywords) || batchKeywords.length === 0) {
        return new Response(JSON.stringify({ error: "batchKeywords required for classify-batch phase" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const hasVol = volumeMap && Object.keys(volumeMap).length > 0;
      const suggested = Array.isArray(suggestedTopics) && suggestedTopics.length > 0 ? suggestedTopics : null;
      const existing = Array.isArray(existingSilos) ? existingSilos : [];
      const result = await classifyBatchResilient(
        batchKeywords.map((k: string) => k.toLowerCase().trim()),
        volumeMap || null,
        hasVol,
        suggested,
        existing,
        LOVABLE_API_KEY,
        batchIndex || 0,
        incomingTotalBatches || 1
      );
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════
    // PHASE: consolidate — accept accumulated topicKeywords, run merge + reclassify, return clusters.
    // ═══════════════════════════════════════════════
    if (phase === "consolidate") {
      if (!incomingTopicKeywords || typeof incomingTopicKeywords !== "object") {
        return new Response(JSON.stringify({ error: "topicKeywords required for consolidate phase" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await runConsolidation(incomingTopicKeywords, volumeMap || null, LOVABLE_API_KEY);
    }

    // ═══════════════════════════════════════════════
    // DEFAULT PHASE: original single-call full pipeline (unchanged behavior).
    // ═══════════════════════════════════════════════
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "Please provide an array of keywords" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uniqueKeywords = [...new Set(keywords.map((k: string) => k.toLowerCase().trim()))];
    const hasVolume = volumeMap && Object.keys(volumeMap).length > 0;

    const hasSuggested = suggestedTopics && Array.isArray(suggestedTopics) && suggestedTopics.length > 0;
    const suggestedList: string[] = hasSuggested ? suggestedTopics : [];

    // ═══════════════════════════════════════════════
    // SEQUENTIAL BATCHED CLASSIFICATION
    // Each batch sees the silos discovered by previous batches so it reuses
    // existing names instead of inventing parallel duplicates.
    // ═══════════════════════════════════════════════
    const totalBatches = Math.ceil(uniqueKeywords.length / BATCH_SIZE);
    console.log(`Starting sequential classification: ${uniqueKeywords.length} keywords in ${totalBatches} batch(es) of up to ${BATCH_SIZE}`);

    const topicKeywords: Record<string, string[]> = {};
    const allAssignedSet = new Set<string>();
    const discoveredSilos: string[] = []; // accumulated across batches

    for (let i = 0; i < totalBatches; i++) {
      const batchStart = i * BATCH_SIZE;
      const batchKws = uniqueKeywords.slice(batchStart, batchStart + BATCH_SIZE);

      const { assignments } = await classifyBatchResilient(
        batchKws,
        volumeMap,
        hasVolume,
        suggestedList.length > 0 ? suggestedList : null,
        discoveredSilos, // pass forward what's already been built
        LOVABLE_API_KEY,
        i,
        totalBatches
      );

      for (const [kw, topic] of Object.entries(assignments)) {
        const t = topic.trim();
        const kwLower = kw.toLowerCase();
        if (otherAliases.includes(t.toLowerCase().trim())) continue;
        if (!topicKeywords[t]) {
          topicKeywords[t] = [];
          if (!discoveredSilos.includes(t)) discoveredSilos.push(t);
        }
        topicKeywords[t].push(kwLower);
        allAssignedSet.add(kwLower);
      }
      console.log(`After batch ${i + 1}: ${discoveredSilos.length} silos accumulated, ${allAssignedSet.size} keywords assigned`);
    }

    // Find all unassigned keywords across all batches
    let otherKeywords = uniqueKeywords.filter(kw => !allAssignedSet.has(kw));
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
      const currentTopics = Object.keys(topicKeywords);

      // If only a handful of stragglers remain, force them into existing silos — never create new ones.
      const allowNewSilos = otherKeywords.length >= 10;
      const reclassifySystem = `You are an expert SEO strategist. These keywords were not properly classified in a first pass. Classify each one into the MOST RELEVANT existing silo.

EXISTING SILOS:
${currentTopics.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}

RULES:
- Assign EVERY keyword to one of the existing silos above. Be generous — even loose thematic overlap counts.
${allowNewSilos
  ? "- You may create AT MOST 1 new silo, ONLY if at least 5 keywords share a clearly distinct theme that no existing silo covers."
  : "- DO NOT create new silos. There are too few stragglers to justify any new silo. Force every keyword into the closest existing silo."}
- Never put a single keyword into its own silo.
- Only use "Other" as an absolute last resort.
- Numbers in brackets are search volumes — don't output them.
- Output ONLY valid JSON, no markdown fences.

JSON FORMAT:
{"assignments":{"keyword1":"Existing Silo Name","keyword2":"Existing Silo Name",...}}`;

      // Run re-classification with the same bounded concurrency to avoid gateway overload.
      const reclassTasks = [];
      for (let i = 0; i < reclassBatches; i++) {
        const batchStart = i * BATCH_SIZE;
        const batchKws = otherKeywords.slice(batchStart, batchStart + BATCH_SIZE);

        const otherKwLines = batchKws.map(kw => {
          if (hasVolume && volumeMap[kw] > 0) return `${kw} [${volumeMap[kw]}]`;
          return kw;
        }).join("\n");

        const reclassifyUser = `Classify these ${batchKws.length} keywords:\n\n${otherKwLines}`;

        reclassTasks.push(
          async () => {
            try {
              const reclassifyResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash",
                  temperature: 0,
                  messages: [
                    { role: "system", content: reclassifySystem },
                    { role: "user", content: reclassifyUser },
                  ],
                }),
              });

              if (!reclassifyResponse.ok) {
                console.error(`Re-classify batch ${i + 1} failed:`, reclassifyResponse.status);
                return { batchKws, assignments: {} as Record<string, string>, failed: true };
              }
              const reclassifyData = await reclassifyResponse.json();
              const reclassifyContent = reclassifyData.choices?.[0]?.message?.content || "";
              try {
                const parsed = JSON.parse(cleanJson(reclassifyContent));
                return { batchKws, assignments: parsed.assignments || {}, failed: false };
              } catch {
                console.error(`Re-classify batch ${i + 1} parse failed:`, reclassifyContent.slice(0, 300));
                return { batchKws, assignments: {} as Record<string, string>, failed: false };
              }
            } catch (reclassifyErr) {
              console.error(`Re-classify batch ${i + 1} error (non-fatal):`, reclassifyErr);
              return { batchKws, assignments: {} as Record<string, string>, failed: true };
            }
          }
        );
      }

      const reclassResults = await runWithConcurrency(reclassTasks, MAX_PARALLEL_BATCHES);
      for (const { batchKws, assignments: reAssignments, failed } of reclassResults) {
        if (failed) {
          stillOther.push(...batchKws);
          continue;
        }
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
    // FINAL CROSS-BATCH CONSOLIDATION
    // Merges thematically overlapping silos created across batches AND
    // absorbs tiny silos (≤2 keywords or <50 vol) into the closest larger silo.
    // Loops up to 3 passes until silo count ≤ MAX_SILOS.
    // ═══════════════════════════════════════════════
    const MAX_SILOS = 20;
    const TINY_KEYWORD_THRESHOLD = 2; // silos with ≤2 keywords are forced to merge
    const TINY_VOLUME_THRESHOLD = 50; // or <50 total volume

    const siloVolume = (name: string) => {
      const kws = topicKeywords[name] || [];
      if (!hasVolume) return 0;
      let v = 0;
      for (const kw of kws) if (volumeMap[kw]) v += volumeMap[kw];
      return v;
    };

    const runMergePass = async (passLabel: string, forceMergeTiny: boolean) => {
      const siloNames = Object.keys(topicKeywords).filter(t => t !== "Other");
      if (siloNames.length <= MAX_SILOS && !forceMergeTiny) return;

      const siloSummaries = siloNames.map(name => ({
        name,
        count: (topicKeywords[name] || []).length,
        volume: siloVolume(name),
        sampleKws: (topicKeywords[name] || []).slice(0, 6),
      })).sort((a, b) => b.volume - a.volume || b.count - a.count);

      const siloList = siloSummaries
        .map(s => `- "${s.name}" (${s.count} kws, ~${s.volume} vol) e.g. ${s.sampleKws.join(", ")}`)
        .join("\n");

      const tinyList = siloSummaries.filter(s => s.count <= TINY_KEYWORD_THRESHOLD || s.volume < TINY_VOLUME_THRESHOLD);

      const mergeSystem = `You are a senior SEO strategist consolidating a fragmented topic silo list. The same theme has likely been split across multiple silos by parallel batches (e.g. "what is archery", "archery basics", "introduction to archery" all describing the same beginner-intent theme).

CURRENT SILOS (${siloNames.length} total — must end with at most ${MAX_SILOS}):
${siloList}

YOUR JOB:
1. Identify silos that describe the SAME or OVERLAPPING theme — even if the names are worded differently — and merge them into ONE.
2. Absorb every TINY silo (≤${TINY_KEYWORD_THRESHOLD} keywords OR <${TINY_VOLUME_THRESHOLD} volume) into the closest larger silo. NEVER leave a silo with only 1-2 keywords.
3. Prefer the largest/highest-volume silo of each theme as the target name.
4. Final silo count MUST be ≤ ${MAX_SILOS}.

Tiny silos that MUST be merged into something larger:
${tinyList.length > 0 ? tinyList.map(s => `- "${s.name}" (${s.count} kws, ~${s.volume} vol)`).join("\n") : "(none)"}

OUTPUT RULES:
- Output a merge map. For every silo to be merged, give source → target.
- Use EXACT silo names from the list above for sources. Targets MUST also be exact existing names (no inventing new names).
- Silos NOT mentioned in "merges" will be kept as-is, so make sure your map reduces the total to ≤ ${MAX_SILOS}.
- Output ONLY valid JSON, no markdown fences.

JSON FORMAT:
{"merges":{"Source Silo":"Target Silo", ...}}`;

      console.log(`${passLabel}: ${siloNames.length} silos, ${tinyList.length} tiny — running merge pass...`);

      try {
        const mergeResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            temperature: 0,
            messages: [
              { role: "system", content: mergeSystem },
              { role: "user", content: `Consolidate these ${siloNames.length} silos down to at most ${MAX_SILOS}, absorbing every tiny silo.` },
            ],
          }),
        });

        if (!mergeResponse.ok) {
          console.error(`${passLabel}: merge AI call failed`, mergeResponse.status);
          return;
        }
        const mergeData = await mergeResponse.json();
        const mergeContent = mergeData.choices?.[0]?.message?.content || "";
        let mergeParsed: { merges: Record<string, string> };
        try {
          mergeParsed = JSON.parse(cleanJson(mergeContent));
        } catch {
          console.error(`${passLabel}: merge parse failed:`, mergeContent.slice(0, 500));
          return;
        }

        const merges = mergeParsed.merges || {};
        // Resolve transitive merges (A→B, B→C ⇒ A→C)
        const resolveTarget = (name: string, depth = 0): string => {
          if (depth > 10) return name;
          const next = merges[name];
          if (!next || next === name) return name;
          return resolveTarget(next, depth + 1);
        };

        let mergeCount = 0;
        for (const source of Object.keys(merges)) {
          const target = resolveTarget(source);
          if (source === target) continue;
          if (!topicKeywords[source]) continue;
          if (!topicKeywords[target]) topicKeywords[target] = [];
          topicKeywords[target].push(...topicKeywords[source]);
          delete topicKeywords[source];
          mergeCount++;
        }
        console.log(`${passLabel}: merged ${mergeCount} silos, now ${Object.keys(topicKeywords).filter(t => t !== "Other").length} silos`);
      } catch (mergeErr) {
        console.error(`${passLabel}: error (non-fatal):`, mergeErr);
      }
    };

    // Pass 1: always run if we're over the cap OR tiny silos exist
    const initialSilos = Object.keys(topicKeywords).filter(t => t !== "Other");
    const hasTiny = initialSilos.some(n => (topicKeywords[n] || []).length <= TINY_KEYWORD_THRESHOLD || siloVolume(n) < TINY_VOLUME_THRESHOLD);
    if (initialSilos.length > MAX_SILOS || hasTiny) {
      await runMergePass("Consolidation pass 1", true);
    }
    // Pass 2: if still over cap, force another merge round
    if (Object.keys(topicKeywords).filter(t => t !== "Other").length > MAX_SILOS) {
      await runMergePass("Consolidation pass 2", true);
    }
    // Pass 3: last resort
    if (Object.keys(topicKeywords).filter(t => t !== "Other").length > MAX_SILOS) {
      await runMergePass("Consolidation pass 3", true);
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
