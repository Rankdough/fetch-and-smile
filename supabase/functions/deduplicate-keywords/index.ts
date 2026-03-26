import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "do", "does", "did",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "it",
  "its", "you", "your", "i", "my", "we", "our", "they", "their",
  "that", "this", "these", "those", "and", "or", "but", "not",
  "be", "been", "being", "have", "has", "had", "can", "could",
  "will", "would", "should", "may", "might", "shall",
  "ein", "eine", "der", "die", "das", "ist", "sind", "und", "oder",
  "zu", "von", "mit", "auf", "für", "bei", "nach", "es", "sich",
]);

function normalizeKeyword(kw: string): string {
  return kw
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0 && !STOPWORDS.has(w))
    .sort()
    .join(" ");
}

interface KeywordEntry { keyword: string; volume: number }

interface DedupGroup {
  canonical: string;
  canonicalVolume: number;
  totalVolume: number;
  variants: { keyword: string; volume: number }[];
}

function fuzzyGroup(keywords: KeywordEntry[]): { groups: DedupGroup[]; ungrouped: DedupGroup[] } {
  const normMap = new Map<string, KeywordEntry[]>();
  for (const entry of keywords) {
    const norm = normalizeKeyword(entry.keyword);
    if (!norm) continue;
    if (!normMap.has(norm)) normMap.set(norm, []);
    normMap.get(norm)!.push(entry);
  }

  const groups: DedupGroup[] = [];
  const ungrouped: DedupGroup[] = [];

  for (const [, entries] of normMap) {
    entries.sort((a, b) => b.volume - a.volume);
    const canonical = entries[0];
    const totalVolume = entries.reduce((sum, e) => sum + e.volume, 0);
    const group: DedupGroup = {
      canonical: canonical.keyword,
      canonicalVolume: canonical.volume,
      totalVolume,
      variants: entries.slice(1),
    };
    if (entries.length > 1) groups.push(group);
    else ungrouped.push(group);
  }

  return { groups, ungrouped };
}

async function semanticGroupBatch(
  keywords: DedupGroup[],
  apiKey: string,
  batchIndex: number,
  totalBatches: number,
  existingGroups?: string[]
): Promise<{ merged: DedupGroup[]; stillUngrouped: DedupGroup[] }> {
  const kwList = keywords.map(g => `"${g.canonical}" (${g.totalVolume})`).join("\n");

  const existingContext = existingGroups && existingGroups.length > 0
    ? `\n\nPREVIOUSLY IDENTIFIED CANONICAL KEYWORDS (reuse as group anchors when applicable):\n${existingGroups.map(g => `- "${g}"`).join("\n")}`
    : "";

  const systemPrompt = `You are a keyword deduplication expert. Identify keywords that are semantically identical — same question/thing, just phrased differently.

EXAMPLES of semantically identical groups:
- "does a root canal hurt" = "is root canal painful" = "how painful is a root canal"
- "how long does a root canal take" = "how long is a root canal" = "root canal how long"
- "cost of dental implants" = "how much do dental implants cost" = "dental implant price"

RULES:
- Only group TRUE semantic duplicates — same intent, same answer
- Do NOT group related but different keywords (e.g., "root canal pain" vs "root canal recovery")
- Each keyword in exactly ONE group
- Canonical = highest search volume keyword
- Only output groups with 2+ members${existingContext}

OUTPUT FORMAT (valid JSON only, no markdown):
{"groups":[{"canonical":"highest volume keyword","members":["variant 1","variant 2"]}]}

If no duplicates found: {"groups":[]}`;

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
        { role: "user", content: `Batch ${batchIndex + 1}/${totalBatches}. Find semantic duplicates among these ${keywords.length} keywords:\n\n${kwList}` },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const t = await response.text();
    console.error(`AI error batch ${batchIndex + 1}:`, response.status, t);
    if (response.status === 429 || response.status === 402) {
      throw { status: response.status, message: response.status === 429 ? "Rate limit exceeded" : "AI credits exhausted" };
    }
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || "";
  content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: { groups: { canonical: string; members: string[] }[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error(`Batch ${batchIndex + 1} parse failed:`, content.slice(0, 500));
      return { merged: [], stillUngrouped: keywords };
    }
    parsed = JSON.parse(match[0]);
  }

  const kwLookup = new Map<string, DedupGroup>();
  for (const g of keywords) kwLookup.set(g.canonical.toLowerCase(), g);

  const consumed = new Set<string>();
  const merged: DedupGroup[] = [];

  for (const aiGroup of (parsed.groups || [])) {
    const allMembers = [aiGroup.canonical, ...(aiGroup.members || [])];
    const matchedGroups: DedupGroup[] = [];

    for (const member of allMembers) {
      const lower = member.toLowerCase().trim();
      const found = kwLookup.get(lower);
      if (found && !consumed.has(lower)) {
        matchedGroups.push(found);
        consumed.add(lower);
      }
    }

    if (matchedGroups.length < 2) continue;

    matchedGroups.sort((a, b) => b.totalVolume - a.totalVolume);
    const canonical = matchedGroups[0];
    const totalVolume = matchedGroups.reduce((sum, g) => sum + g.totalVolume, 0);

    merged.push({
      canonical: canonical.canonical,
      canonicalVolume: canonical.canonicalVolume,
      totalVolume,
      variants: [
        ...canonical.variants,
        ...matchedGroups.slice(1).flatMap(g => [
          { keyword: g.canonical, volume: g.canonicalVolume },
          ...g.variants,
        ]),
      ],
    });
  }

  const stillUngrouped = keywords.filter(g => !consumed.has(g.canonical.toLowerCase()));
  return { merged, stillUngrouped };
}

function buildResult(fuzzyGroups: DedupGroup[], aiMerged: DedupGroup[], remaining: DedupGroup[], originalCount: number) {
  const allGroups = [...fuzzyGroups, ...aiMerged];
  const singles = remaining.map(g => ({
    keyword: g.canonical,
    volume: g.totalVolume,
    merged: false,
    variantCount: 0,
  }));
  const mergedResults = allGroups.map(g => ({
    keyword: g.canonical,
    volume: g.totalVolume,
    merged: true,
    variantCount: g.variants.length,
    variants: g.variants.map(v => ({ keyword: v.keyword, volume: v.volume })),
  }));

  return {
    originalCount,
    deduplicatedCount: mergedResults.length + singles.length,
    removedCount: originalCount - (mergedResults.length + singles.length),
    fuzzyMergedGroups: fuzzyGroups.length,
    aiMergedGroups: aiMerged.length,
    keywords: [...mergedResults, ...singles].sort((a, b) => b.volume - a.volume),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { keywords, mode = "fuzzy", ungroupedKeywords, topic } = body;

    if (mode === "topic-filter") {
      // ── TOPIC FILTER: Remove off-topic keywords via AI ──
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return new Response(JSON.stringify({ error: "Please provide keywords" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!topic || typeof topic !== "string") {
        return new Response(JSON.stringify({ error: "Please provide a topic" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

      const BATCH_SIZE = 500;
      const totalBatches = Math.ceil(keywords.length / BATCH_SIZE);
      console.log(`Topic filter: ${keywords.length} keywords, topic="${topic}", ${totalBatches} batches`);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          try {
            const onTopic: { keyword: string; volume: number }[] = [];
            const offTopic: { keyword: string; volume: number }[] = [];

            for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
              const batch = keywords.slice(i, i + BATCH_SIZE);
              const batchIdx = Math.floor(i / BATCH_SIZE);

              send({ type: "progress", progress: (batchIdx + 0.5) / totalBatches, message: `Filtering batch ${batchIdx + 1} of ${totalBatches}...` });

              const kwList = batch.map((k: any) => k.keyword).join("\n");

              const systemPrompt = `You are a keyword relevance filter. Given a TOPIC and a list of keywords, determine which keywords are RELEVANT to the topic and which are NOT.

TOPIC: "${topic}"

RULES:
- A keyword is ON-TOPIC if it's about "${topic}" or closely related to "${topic}" in context
- A keyword is OFF-TOPIC if it uses similar words but refers to a completely different subject
- Examples for topic "dental fillings":
  - ON-TOPIC: "how long does a filling last", "cavity filling pain", "amalgam filling dangerous"
  - OFF-TOPIC: "how to make pie filling", "toilet not filling with water", "filling out tax forms", "cream cheese filling recipe"

OUTPUT FORMAT (valid JSON only, no markdown):
{"off_topic_indices":[0,3,7]}

Return ONLY the indices (0-based) of OFF-TOPIC keywords. If all are on-topic: {"off_topic_indices":[]}`;

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
                    { role: "user", content: `Filter these ${batch.length} keywords for topic "${topic}":\n\n${kwList}` },
                  ],
                  temperature: 0.1,
                }),
              });

              if (!response.ok) {
                const t = await response.text();
                console.error(`Topic filter AI error batch ${batchIdx + 1}:`, response.status, t);
                if (response.status === 429 || response.status === 402) {
                  throw { status: response.status, message: response.status === 429 ? "Rate limit exceeded" : "AI credits exhausted" };
                }
                // On error, keep all keywords from this batch
                onTopic.push(...batch);
                continue;
              }

              const data = await response.json();
              let content = data.choices?.[0]?.message?.content || "";
              content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

              let parsed: { off_topic_indices: number[] };
              try {
                parsed = JSON.parse(content);
              } catch {
                const match = content.match(/\{[\s\S]*\}/);
                if (!match) {
                  console.error(`Topic filter batch ${batchIdx + 1} parse failed, keeping all`);
                  onTopic.push(...batch);
                  continue;
                }
                parsed = JSON.parse(match[0]);
              }

              const offTopicSet = new Set(parsed.off_topic_indices || []);
              for (let j = 0; j < batch.length; j++) {
                if (offTopicSet.has(j)) {
                  offTopic.push(batch[j]);
                } else {
                  onTopic.push(batch[j]);
                }
              }

              send({ type: "progress", progress: (batchIdx + 1) / totalBatches, message: `Batch ${batchIdx + 1}/${totalBatches} done — ${offTopic.length} off-topic so far` });
            }

            send({
              type: "complete",
              onTopicKeywords: onTopic,
              offTopicKeywords: offTopic,
            });

            console.log(`Topic filter complete: ${onTopic.length} on-topic, ${offTopic.length} off-topic`);
          } catch (e: any) {
            send({ type: "error", message: e.message || "Unknown error" });
            console.error("Topic filter SSE error:", e);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    if (mode === "fuzzy") {
      // ── STEP 1: Instant fuzzy grouping (no AI) ──
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return new Response(JSON.stringify({ error: "Please provide keywords" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Fuzzy deduplicating ${keywords.length} keywords...`);
      const { groups: fuzzyGroups, ungrouped } = fuzzyGroup(keywords);
      console.log(`Fuzzy: ${fuzzyGroups.length} groups merged, ${ungrouped.length} remaining`);

      const result = buildResult(fuzzyGroups, [], ungrouped, keywords.length);
      // Also send ungrouped for potential AI pass
      return new Response(JSON.stringify({
        ...result,
        ungroupedForAI: ungrouped.map(g => ({ canonical: g.canonical, totalVolume: g.totalVolume })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "semantic") {
      // ── STEP 2: AI semantic pass with SSE streaming ──
      if (!ungroupedKeywords || !Array.isArray(ungroupedKeywords) || ungroupedKeywords.length === 0) {
        return new Response(JSON.stringify({ error: "No ungrouped keywords to process" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

      // Convert to DedupGroup format
      const groups: DedupGroup[] = ungroupedKeywords.map((g: any) => ({
        canonical: g.canonical,
        canonicalVolume: g.totalVolume,
        totalVolume: g.totalVolume,
        variants: [],
      }));

      const BATCH_SIZE = 1500;
      const totalBatches = Math.ceil(groups.length / BATCH_SIZE);

      console.log(`AI semantic pass: ${groups.length} keywords in ${totalBatches} batches...`);

      // SSE streaming response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          try {
            let remaining = [...groups];
            const aiMerged: DedupGroup[] = [];
            const discoveredCanonicals: string[] = [];

            for (let i = 0; i < groups.length; i += BATCH_SIZE) {
              const batch = remaining.slice(0, Math.min(BATCH_SIZE, remaining.length));
              const batchIdx = Math.floor(i / BATCH_SIZE);

              send({ type: "progress", batch: batchIdx + 1, totalBatches, message: `Processing batch ${batchIdx + 1} of ${totalBatches}...` });

              console.log(`AI batch ${batchIdx + 1}/${totalBatches} (${batch.length} keywords)...`);

              const { merged, stillUngrouped } = await semanticGroupBatch(
                batch, LOVABLE_API_KEY, batchIdx, totalBatches, discoveredCanonicals
              );

              aiMerged.push(...merged);
              for (const m of merged) discoveredCanonicals.push(m.canonical);

              remaining = [...stillUngrouped, ...remaining.slice(BATCH_SIZE)];

              send({ type: "batch_complete", batch: batchIdx + 1, mergedInBatch: merged.length, totalMergedSoFar: aiMerged.length });
            }

            // Send final result
            const mergedResults = aiMerged.map(g => ({
              keyword: g.canonical,
              volume: g.totalVolume,
              merged: true,
              variantCount: g.variants.length,
              variants: g.variants.map(v => ({ keyword: v.keyword, volume: v.volume })),
            }));

            const singles = remaining.map(g => ({
              keyword: g.canonical,
              volume: g.totalVolume,
              merged: false,
              variantCount: 0,
            }));

            send({
              type: "complete",
              aiMergedGroups: aiMerged.length,
              aiMergedKeywords: mergedResults,
              aiSingles: singles,
            });

            console.log(`AI pass complete: ${aiMerged.length} groups merged`);
          } catch (e: any) {
            send({ type: "error", message: e.message || "Unknown error" });
            console.error("SSE error:", e);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid mode. Use 'fuzzy' or 'semantic'." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("deduplicate-keywords error:", e);
    const status = e.status || 500;
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
