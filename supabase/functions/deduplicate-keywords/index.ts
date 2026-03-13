import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Normalize a keyword for fuzzy matching:
 * - lowercase
 * - strip common stopwords
 * - sort remaining words alphabetically
 * Returns a canonical form for grouping near-identical phrases.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "do", "does", "did",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "it",
  "its", "you", "your", "i", "my", "we", "our", "they", "their",
  "that", "this", "these", "those", "and", "or", "but", "not",
  "be", "been", "being", "have", "has", "had", "can", "could",
  "will", "would", "should", "may", "might", "shall",
  // German
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

interface KeywordEntry {
  keyword: string;
  volume: number;
}

interface DedupGroup {
  canonical: string;
  canonicalVolume: number;
  totalVolume: number;
  variants: { keyword: string; volume: number }[];
}

/**
 * Pass 1: Client-side fuzzy grouping by normalized form.
 * Groups keywords that are essentially the same phrase with different stopwords/ordering.
 */
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
    // Sort by volume descending — highest volume becomes canonical
    entries.sort((a, b) => b.volume - a.volume);
    const canonical = entries[0];
    const totalVolume = entries.reduce((sum, e) => sum + e.volume, 0);

    const group: DedupGroup = {
      canonical: canonical.keyword,
      canonicalVolume: canonical.volume,
      totalVolume,
      variants: entries.slice(1),
    };

    if (entries.length > 1) {
      groups.push(group);
    } else {
      ungrouped.push(group);
    }
  }

  return { groups, ungrouped };
}

/**
 * Pass 2: AI semantic grouping for remaining ungrouped keywords.
 * Batches them and asks AI to find semantically equivalent phrases.
 */
async function semanticGroupBatch(
  keywords: DedupGroup[],
  apiKey: string,
  batchIndex: number,
  totalBatches: number,
  existingGroups?: string[]
): Promise<{ merged: DedupGroup[]; stillUngrouped: DedupGroup[] }> {
  // Build keyword list with volumes for the AI
  const kwList = keywords.map(g => `"${g.canonical}" (${g.totalVolume})`).join("\n");

  const existingContext = existingGroups && existingGroups.length > 0
    ? `\n\nPREVIOUSLY IDENTIFIED CANONICAL KEYWORDS (from earlier batches — reuse these as group anchors when applicable):\n${existingGroups.map(g => `- "${g}"`).join("\n")}`
    : "";

  const systemPrompt = `You are a keyword deduplication expert. Your job is to identify keywords that are semantically identical — they ask the same question or describe the same thing, just phrased differently.

EXAMPLES of semantically identical groups:
- "does a root canal hurt" = "is root canal painful" = "how painful is a root canal" = "does root canal hurt"
- "how long does a root canal take" = "how long is a root canal" = "root canal how long"
- "cost of dental implants" = "how much do dental implants cost" = "dental implant price"

RULES:
- Only group keywords that are TRUE semantic duplicates — same intent, same answer
- Do NOT group keywords that are related but different (e.g., "root canal pain" vs "root canal recovery")
- Each keyword appears in exactly ONE group
- The "canonical" keyword in each group should be the one with highest search volume
- Keywords that have no semantic duplicates should NOT appear in your output
- Output ONLY groups with 2+ members${existingContext}

OUTPUT FORMAT (valid JSON only, no markdown):
{"groups":[{"canonical":"highest volume keyword","members":["variant 1","variant 2"]}]}

If no semantic duplicates are found, return: {"groups":[]}`;

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

  // Build a lookup from keyword → DedupGroup
  const kwLookup = new Map<string, DedupGroup>();
  for (const g of keywords) {
    kwLookup.set(g.canonical.toLowerCase(), g);
  }

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

    // Sort by volume, pick canonical
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { keywords } = body; // Array of { keyword: string, volume: number }

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return new Response(JSON.stringify({ error: "Please provide keywords to deduplicate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    console.log(`Deduplicating ${keywords.length} keywords...`);

    // Pass 1: Fuzzy grouping (instant, no AI)
    const { groups: fuzzyGroups, ungrouped } = fuzzyGroup(keywords);
    console.log(`Pass 1 (fuzzy): ${fuzzyGroups.length} groups merged, ${ungrouped.length} remaining unique keywords`);

    // Pass 2: AI semantic grouping on ungrouped keywords
    const BATCH_SIZE = 800;
    let remaining = [...ungrouped];
    const aiMerged: DedupGroup[] = [];
    const totalBatches = Math.ceil(remaining.length / BATCH_SIZE);
    const discoveredCanonicals: string[] = [];

    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
      const batch = remaining.slice(i, i + BATCH_SIZE);
      const batchIdx = Math.floor(i / BATCH_SIZE);
      console.log(`AI batch ${batchIdx + 1}/${totalBatches} (${batch.length} keywords)...`);

      const { merged, stillUngrouped } = await semanticGroupBatch(
        batch, LOVABLE_API_KEY, batchIdx, totalBatches, discoveredCanonicals
      );

      aiMerged.push(...merged);
      // Track discovered canonicals for cross-batch consistency
      for (const m of merged) {
        discoveredCanonicals.push(m.canonical);
      }

      // Replace the batch portion with stillUngrouped
      remaining = [
        ...remaining.slice(0, i),
        ...stillUngrouped,
        ...remaining.slice(i + BATCH_SIZE),
      ];
    }

    console.log(`Pass 2 (AI): ${aiMerged.length} additional groups merged`);

    // Combine all results
    const allGroups = [...fuzzyGroups, ...aiMerged];
    // Remaining ungrouped become single-keyword entries
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

    const result = {
      originalCount: keywords.length,
      deduplicatedCount: mergedResults.length + singles.length,
      removedCount: keywords.length - (mergedResults.length + singles.length),
      fuzzyMergedGroups: fuzzyGroups.length,
      aiMergedGroups: aiMerged.length,
      keywords: [...mergedResults, ...singles].sort((a, b) => b.volume - a.volume),
    };

    console.log(`Deduplication complete: ${result.originalCount} → ${result.deduplicatedCount} keywords (${result.removedCount} duplicates removed)`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("deduplicate-keywords error:", e);
    const status = e.status || 500;
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
