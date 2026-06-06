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

const MODIFIER_TOKENS = new Set([
  "dental", "front", "back", "tooth", "teeth", "emax", "zirconia",
  "porcelain", "composite", "ceramic", "gold", "metal", "resin",
  "acrylic", "diy", "temporary", "permanent", "nhs",
  // Sport/measurement modifiers — these qualify the same concept, not different ones
  "regulation", "official", "standard", "professional", "collegiate",
  "nba", "wnba", "ncaa", "nfl", "mlb", "nhl",
]);

function tokenizeKeyword(kw: string): string[] {
  return kw
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Lightweight English stemmer to collapse singular/plural and common verb forms.
// Examples: innings→inning, games→game, teams→team, played→play, running→run.
function stem(w: string): string {
  if (w.length <= 3) return w;
  // irregulars / common short forms
  const irregular: Record<string, string> = {
    "does": "do", "did": "do", "doing": "do",
    "is": "be", "are": "be", "was": "be", "were": "be", "been": "be", "being": "be",
    "has": "have", "had": "have", "having": "have",
    "men": "man", "women": "woman", "children": "child", "people": "person",
    "teeth": "tooth", "feet": "foot",
  };
  if (irregular[w]) return irregular[w];
  // -ies → -y (e.g., countries → country)
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  // -ing (running → run, playing → play)
  if (w.endsWith("ing") && w.length > 5) {
    const base = w.slice(0, -3);
    // doubled consonant (running → runn → run)
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) return base.slice(0, -1);
    return base;
  }
  // -ed (played → play, watched → watch)
  if (w.endsWith("ed") && w.length > 4) {
    const base = w.slice(0, -2);
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) return base.slice(0, -1);
    return base;
  }
  // -es (boxes → box, watches → watch) — only when stripping 'es' leaves a valid stem
  if (w.endsWith("es") && w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  // -s plural (innings → inning, games → game)
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && w.length > 3) return w.slice(0, -1);
  return w;
}

function normalizeKeyword(kw: string): string {
  return tokenizeKeyword(kw)
    .filter(w => !STOPWORDS.has(w))
    .map(stem)
    .sort()
    .join(" ");
}

function normalizeCoreKeyword(kw: string): string {
  return tokenizeKeyword(kw)
    .filter(w => !STOPWORDS.has(w))
    .filter(w => !MODIFIER_TOKENS.has(w))
    .map(stem)
    .join(" ");
}

function semanticToken(w: string): string {
  const s = stem(w);
  const synonyms: Record<string, string> = {
    painful: "pain", pain: "pain", hurt: "pain", hurts: "pain", sore: "pain", ache: "pain",
    fast: "speed", faster: "speed", fastest: "speed", speed: "speed", velocity: "speed", mph: "speed",
    big: "size", bigger: "size", biggest: "size", large: "size", size: "size", sized: "size",
    old: "age", age: "age", aged: "age", youth: "age", kid: "age", kids: "age", child: "age",
    price: "cost", prices: "cost", pricing: "cost", cost: "cost", costs: "cost", expensive: "cost", cheap: "cost",
    mean: "definition", meaning: "definition", definition: "definition", define: "definition", stand: "definition", stands: "definition",
    cleat: "shoe", cleats: "shoe", shoes: "shoe", shoe: "shoe",
    // Measurement / dimension synonyms — "how tall", "how high", "height" all mean the same
    tall: "height", high: "height", height: "height", heights: "height",
    deep: "depth", depth: "depth", wide: "width", width: "width",
    long: "length", length: "length", dimension: "height", measure: "height",
    // Modifier synonyms — "regulation", "standard", "official" don't change the core meaning
    regulation: "standard", official: "standard", standard: "standard",
    nba: "nba", wnba: "nba",
    // Weight synonyms
    weigh: "weight", weighs: "weight", weight: "weight", heavy: "weight", light: "weight",
    // Count synonyms
    many: "count", number: "count", count: "count", total: "count", much: "count",
  };
  return synonyms[s] || s;
}

function semanticSortKey(kw: string): string {
  const raw = tokenizeKeyword(kw);
  const tokens = raw
    .filter(w => !STOPWORDS.has(w))
    .map(semanticToken)
    .filter(Boolean);

  const tokenSet = new Set(tokens);
  let intent = "general";
  if (tokenSet.has("definition") || /\bwhat\s+(is|are|does)|\bmeaning\b|\bstand(s)?\s+for\b/i.test(kw)) intent = "definition";
  else if (tokenSet.has("cost") || /\bhow\s+much\b/i.test(kw)) intent = "cost";
  else if (tokenSet.has("pain")) intent = "pain";
  else if (tokenSet.has("speed")) intent = "speed";
  else if (tokenSet.has("size")) intent = "size";
  else if (tokenSet.has("age")) intent = "age";
  else if (/\bhow\s+long\b|\btake(s)?\b|\bduration\b/i.test(kw)) intent = "duration";
  else if (/\bhow\s+many\b|\bnumber\s+of\b/i.test(kw)) intent = "quantity";
  else if (tokenSet.has("height") || /\bhow\s+(tall|high)\b|\bheight\b|\bdimension\b/i.test(kw)) intent = "measurement";
  else if (tokenSet.has("weight") || /\bhow\s+(much|heavy)\b|\bweigh(s)?\b/i.test(kw)) intent = "weight";

  return `${intent}:${Array.from(new Set(tokens)).sort().join(" ")}`;
}

function sortForSemanticPass(groups: DedupGroup[]): DedupGroup[] {
  return [...groups].sort((a, b) => {
    const keyA = semanticSortKey(a.canonical);
    const keyB = semanticSortKey(b.canonical);
    if (keyA !== keyB) return keyA.localeCompare(keyB);
    return b.totalVolume - a.totalVolume;
  });
}

function splitMergedAndRemaining(groups: DedupGroup[]): { merged: DedupGroup[]; remaining: DedupGroup[] } {
  return {
    merged: groups.filter(g => g.variants.length > 0),
    remaining: groups.filter(g => g.variants.length === 0),
  };
}

interface KeywordEntry { keyword: string; volume: number }

interface DedupGroup {
  canonical: string;
  canonicalVolume: number;
  totalVolume: number;
  variants: { keyword: string; volume: number }[];
}

function buildDedupGroup(entries: KeywordEntry[]): DedupGroup {
  entries.sort((a, b) => b.volume - a.volume);
  const canonical = entries[0];
  return {
    canonical: canonical.keyword,
    canonicalVolume: canonical.volume,
    totalVolume: entries.reduce((sum, e) => sum + e.volume, 0),
    variants: entries.slice(1),
  };
}

function fuzzyGroup(keywords: KeywordEntry[]): { groups: DedupGroup[]; ungrouped: DedupGroup[] } {
  const exactMap = new Map<string, KeywordEntry[]>();
  for (const entry of keywords) {
    const norm = normalizeKeyword(entry.keyword);
    if (!norm) continue;
    if (!exactMap.has(norm)) exactMap.set(norm, []);
    exactMap.get(norm)!.push(entry);
  }

  const groups: DedupGroup[] = [];
  const exactSingles: KeywordEntry[] = [];

  for (const [, entries] of exactMap) {
    if (entries.length > 1) groups.push(buildDedupGroup(entries));
    else exactSingles.push(entries[0]);
  }

  const coreMap = new Map<string, KeywordEntry[]>();
  const ungrouped: DedupGroup[] = [];

  for (const entry of exactSingles) {
    const core = normalizeCoreKeyword(entry.keyword);
    const coreTokenCount = core ? core.split(/\s+/).filter(Boolean).length : 0;

    if (!core || coreTokenCount < 2) {
      ungrouped.push(buildDedupGroup([entry]));
      continue;
    }

    if (!coreMap.has(core)) coreMap.set(core, []);
    coreMap.get(core)!.push(entry);
  }

  for (const [, entries] of coreMap) {
    const group = buildDedupGroup(entries);
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

  const systemPrompt = `You are a keyword deduplication expert. Your PRIMARY task is to identify keywords that would be answered by the SAME article or the SAME piece of content.

THE CORE TEST (apply this first, before any other rule):
Ask yourself: "Could a single article titled [canonical question] serve as the definitive answer to ALL of these keywords?"
If YES → they are duplicates and belong in the same group.
If NO → they are different questions.

This test catches cases where different question words (what age / when / how old / at what age / should) and different subjects (kids / you / children / players) all point to the same factual answer.

SAME-ANSWER RULE (the most important rule — apply globally to any topic):
Keywords are duplicates when they all resolve to the same factual answer, regardless of how differently they are phrased.

PATTERN A — AGE/ELIGIBILITY (applies to any topic involving minimum age, access, or permission):
"what age can [subject] do [X]" = "when can [subject] do [X]" = "what age do [subject] start [X]" = "when do [subject] start [X]" = "when should [subject] do [X]" = "how old do you have to be to do [X]" = "at what age can you do [X]" = "what age is [X]"
→ All ask: what is the minimum age/eligibility threshold for [X]?

PATTERN B — COST (applies to any topic involving price, fees, or expenditure):
"how much does [X] cost" = "[X] price" = "cost of [X]" = "how expensive is [X]" = "[X] fees" = "what does [X] cost" = "average cost of [X]" = "[X] cost [location]"
→ All ask: what is the price of [X]?

PATTERN C — SAFETY (applies to any topic involving risk, danger, or harm):
"is [X] safe" = "is [X] dangerous" = "is [X] harmful" = "can [subject] do [X]" = "should [subject] do [X]" = "why should [subject] not do [X]" = "is [X] bad for [subject]" = "is [X] safe for [subject]"
→ All ask: is [X] safe or not?

PATTERN D — DURATION (applies to any topic involving time, longevity, or lifespan):
"how long does [X] last" = "[X] duration" = "how many days does [X] last" = "how long will [X] last" = "when does [X] fade/expire/end" = "[X] how long" = "how long is [X]"
→ All ask: what is the duration/lifespan of [X]?

PATTERN E — REQUIREMENTS (applies to any topic involving rules, prerequisites, or permissions):
"do you need [X] to do [Y]" = "[X] requirements for [Y]" = "do i need [X] for [Y]" = "is [X] required for [Y]" = "can you do [Y] without [X]" = "[Y] entry requirements [X]"
→ All ask: is [X] required for [Y]?

PATTERN F — PROCESS (applies to any topic involving steps, instructions, or procedures):
"how to [do X]" = "how do i [do X]" = "steps to [do X]" = "what do you need to [do X]" = "how do you [do X]" = "[doing X] process" = "guide to [doing X]"
→ All ask: what are the steps to accomplish [X]?

PATTERN G — COMPARISON (applies to any topic involving choice between two options):
"[X] vs [Y] which is better" = "should i get [X] or [Y]" = "is [X] better than [Y]" = "[X] or [Y] which should i choose" = "[X] vs [Y] comparison" = "difference between [X] and [Y]"
→ All ask: which is better, [X] or [Y]?

PATTERN H — TIMING (applies to any topic involving when something should happen):
"when to [do X]" = "what time of year to [do X]" = "best time to [do X]" = "when should i [do X]" = "what month do you [do X]" = "when do you [do X]"
→ All ask: what is the optimal time to do [X]?

PATTERN I — SYMPTOMS/SIGNS (applies to any topic involving identification, diagnosis, or recognition):
"signs of [X]" = "symptoms of [X]" = "how do you know if you have [X]" = "what are the symptoms of [X]" = "early signs of [X]" = "how to tell if you have [X]" = "[X] warning signs" = "am i [adjective for X] signs"
→ All ask: how do you recognise [X]?

PATTERN J — QUANTITY/AMOUNT (applies to any topic involving ratios, measurements, or quantities):
"how much [X] per [unit]" = "how many [X] per [unit]" = "[X] to [Y] ratio" = "how much [X] for [purpose]" = "correct amount of [X]" = "[X] measurement"
→ All ask: what is the correct quantity of [X]?

These patterns apply universally. When you see keywords that fit the same pattern with the same [X], they are duplicates regardless of topic.

QUESTION-WORD EQUIVALENCE (apply to any topic):
These question starters all ask the same thing when paired with the same subject:
- "what age" = "at what age" = "how old" = "when can" = "when do" = "when should" = "what age do you have to be"
- "is X safe" = "should you do X" = "is X dangerous" = "is X harmful" = "is X bad for you"
- "how much does X cost" = "X price" = "how expensive is X" = "what does X cost" = "X fees"
- "how long does X take" = "X duration" = "X time" = "how long is X"
- "can you X" = "is it possible to X" = "are you able to X" = "is X possible"
- "what is X" = "X meaning" = "X definition" = "X explained" = "what does X mean"

SUBJECT EQUIVALENCE (apply to any topic):
These subject words refer to the same group and do NOT create different questions:
- "kids" = "children" = "youth" = "young players" = "young people" = "minors"
- "you" = "i" = "someone" = "a person" = "players" = "adults"
- "the" = "a" = "an" (articles never change intent)

EXAMPLES of semantically identical groups:
- "does a root canal hurt" = "is root canal painful" = "how painful is a root canal"
- "how long does a root canal take" = "how long is a root canal" = "root canal how long"
- "cost of dental implants" = "how much do dental implants cost" = "dental implant price"
- "how long do veneers last" = "how long do composite veneers last" = "how long do porcelain veneers last" = "how long do emax veneers last" (same core question, type modifier doesn't change the intent)
- "can you get veneers with missing teeth" = "can you have veneers with missing teeth" (same question rephrased)
- "how long do veneers take" = "how long does it take to get veneers" (same question)

DEFINITION-EQUIVALENCE RULE (very common — group these aggressively):
"what is X", "what does X mean", "what does X stand for", "X meaning", "X definition", "X explained" — all answer the SAME definitional question and MUST be grouped.
Examples:
- "what is war in baseball" = "what does war mean in baseball" = "what does war stand for in baseball" = "what is war in baseball stats" (trailing "stats"/"explained" doesn't change intent)
- "what is ops in baseball" = "what does ops mean in baseball" = "ops baseball meaning"
- "what is era" = "what does era stand for" = "era meaning baseball"

TRAILING MODIFIER RULE:
A trailing context word that doesn't change the question ("stats", "explained", "definition", "meaning", "term") should NOT prevent grouping. "what is war in baseball" and "what is war in baseball stats" are the same question.

MEASUREMENT-EQUIVALENCE RULE (apply to any topic):
These phrasings all ask the SAME question about a dimension or measurement — group them aggressively:
"how tall is X" = "how high is X" = "what is the height of X" = "what height is X" = "what is regulation height for X" = "what is standard height for X" = "X height" = "X dimensions"
Similarly: "how heavy is X" = "how much does X weigh" = "X weight" = "X mass"
Similarly: "how long is X" = "X length" = "X size" = "how big is X"
Similarly: "how wide is X" = "X width" = "X diameter"
The lead question word (how tall / how high / what is the height) does NOT create a different question — they all have the same answer.
Examples:
- "how tall is a basketball hoop" = "how high is a basketball hoop" = "what is the height of a basketball hoop" = "regulation height basketball hoop" (ALL same group)
- "how heavy is a bowling ball" = "how much does a bowling ball weigh" = "bowling ball weight" (ALL same group)
- "how long is a football field" = "football field length" = "football field dimensions" (ALL same group)

QUALIFIER-EQUIVALENCE RULE (apply to any topic):
Qualifying words that specify the same standard version do NOT create separate questions:
"regulation", "official", "standard", "professional", "competition", "NBA", "WNBA", "NCAA", "FIFA", "Olympic" — when these modify the same object, group them with the generic version.
- "regulation basketball hoop height" = "NBA basketball hoop height" = "official basketball hoop height" = "basketball hoop height" (ALL same group)
- "official soccer field size" = "regulation soccer field dimensions" = "FIFA soccer field size" (ALL same group)

CRITICAL GROUPING RULE:
When keywords share the SAME core question structure and differ ONLY by a type/material/brand modifier (e.g., "composite", "porcelain", "emax"), they ARE duplicates. The generic version and all type-specific versions belong in ONE group.

DO NOT GROUP (different intents — keep separate):
- Different metrics/abbreviations: "war" ≠ "fwar" ≠ "bwar" (these are distinct stats)
- "what is X" ≠ "how to calculate X" (definition vs method)
- "what is X" ≠ "what is a good X" (definition vs benchmark/evaluation)
- "veneers cost" ≠ "veneers pain" (different topics)

RULES:
- Group TRUE semantic duplicates — same intent, same answer
- Group definition-equivalents (what is / what does X mean / stand for / meaning)
- Group modifier variants (generic + type-specific versions of the same question)
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
    const { keywords, mode = "fuzzy", ungroupedKeywords, topic, evergreen = false } = body;

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

      const BATCH_SIZE = 120;
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

              const indexedKwList = batch
                .map((k: any, idx: number) => `${idx}. ${k.keyword}`)
                .join("\n");

              const evergreenBlock = evergreen ? `

EVERGREEN FILTER (ACTIVE): Also remove any keyword that is time-sensitive by nature — meaning the answer changes day to day, week to week, or season to season. This applies to ANY topic.

REMOVE a keyword if it contains or implies any of the following signals:

TIME WORDS (remove any keyword containing):
tonight, today, this week, this weekend, last night, yesterday, right now, currently, this year, this season, this month, now, 2024, 2025, 2026, anymore

BROADCAST/VIEWING INTENT (remove):
watch live, stream, where to watch, how to watch, on tv, channel, broadcast, televised, what channel

SCORES/RESULTS (remove):
score, result, who won, winner, standings, leaderboard, rankings today, latest results, who lost, final score

SCHEDULES/FIXTURES (remove):
next game, fixture, schedule today, when does X play, upcoming match, when is the [X] game, when is [person] playing

NAMED EVENTS TIED TO SPECIFIC DATES (remove):
Any keyword naming a specific recurring event tied to a calendar date or season:
- pro bowl (annual event, answer changes each year)
- super bowl (annual)
- olympics [current year] (changes every 4 years)
- [celebrity name] playing/game/team — e.g. "tom brady flag football", "flag football game with tom brady"
- fanatics flag football classic/game/tournament (specific recurring event)
- celebrity flag football game

NAMED PEOPLE IN TIME-SENSITIVE CONTEXT (remove):
Keywords naming a celebrity/athlete in a "when is / who won / what team" context — the answer changes constantly.
- "what team is [person] on"
- "when is [person] playing"
- "who won [person's] game"

BREAKING/TRENDING (remove):
breaking news, transfer news, latest news, just released, just launched, new today

REMOVE examples (topic-agnostic):
- "where to watch [topic] tonight" — broadcast, stale daily
- "who won [topic] last night" — result, stale tomorrow
- "when is the pro bowl flag football game" — specific annual event
- "what flag football team is tom brady on" — celebrity roster, changes
- "who won the fanatics flag football tournament" — specific event result
- "when is the celebrity flag football game" — scheduled event
- "[topic] score today" — live score
- "is [topic] on tonight" — broadcast query
- "when does flag football season start 2025" — year-specific

KEEP examples (topic-agnostic):
- "how does [topic] work" — evergreen explanation
- "what is [topic]" — evergreen definition
- "how to get better at [topic]" — evergreen skill
- "how much does [topic] cost" — general pricing
- "best [topic] for beginners" — evergreen buying guide
- "[topic] rules explained" — evergreen reference
- "why did [topic] change to [format]" — historical fact, answer is permanent
- "how long has [topic] been [X]" — historical, stable answer

THE TEST: Would this keyword still return a useful, accurate answer in 2 years without any changes? If yes, KEEP. If no, REMOVE.` : "";

              const systemPrompt = `You are an INCLUSIVE keyword relevance filter. Given a TOPIC and a numbered list of keywords, mark a keyword OFF-TOPIC ONLY when it is clearly about a completely different subject.

TOPIC: "${topic}"

CORE PRINCIPLE — KEEP, DON'T CUT:
- DEFAULT to ON-TOPIC. When in doubt, KEEP the keyword.
- A keyword is ON-TOPIC if it relates to "${topic}" directly OR to any ADJACENT / RELATED context that someone interested in "${topic}" would also care about (sub-topics, equipment, training, physiology, injuries, events, athletes, techniques, related sports/activities, motivations, outcomes, measurements, etc.).
- Mark OFF-TOPIC ONLY when the keyword is unambiguously about something unrelated (a different industry, a homonym used in a clearly different sense, spam, etc.).

EXAMPLES for topic "track and field":
- ON-TOPIC (KEEP): "what is vo2 max", "how to improve vo2 max", "shin splints", "marathon training"
- OFF-TOPIC (REMOVE): "how to make pie filling", "best laptop 2024", "iphone repair near me"

EXAMPLES for topic "dental fillings":
- ON-TOPIC: "how long does a filling last", "cavity pain", "amalgam vs composite"
- OFF-TOPIC: "how to make pie filling", "toilet not filling with water", "filling out tax forms"

EXAMPLES for topic "flag football" (the sport):
- ON-TOPIC (KEEP): "how to play flag football", "flag football rules", "how many players on a flag football team", "flag football drills", "flag football equipment", "flag football positions"
- OFF-TOPIC (REMOVE): "what does a flag mean in football" — this is about NFL penalty flags, not the sport
- OFF-TOPIC (REMOVE): "what does a yellow flag mean in football" — NFL penalty flag, different topic entirely
- OFF-TOPIC (REMOVE): "what does a black flag mean in football" — same, penalty flag not flag football sport

CRITICAL HOMONYM RULE: When a word from the topic appears in a keyword but means something COMPLETELY DIFFERENT, mark it OFF-TOPIC.
This is the most important rule for avoiding false positives.

HOW TO APPLY IT:
Ask: "Is the keyword about the same THING as the topic, or does it just happen to share a word?"
If the keyword shares a word but is about a different real-world subject → OFF-TOPIC.

ABSTRACT EXAMPLES (apply the pattern to any topic):
- Topic "track and field" (the athletic sport) → "which country awards the victoria cross" uses "cross" as a military medal → OFF-TOPIC
- Topic "track and field" → "what country flag is blue with yellow cross" uses "cross" as a flag design → OFF-TOPIC  
- Topic "track and field" → "how long is cross country sprint" uses "cross country" as the athletic discipline → ON-TOPIC
- Topic "flag football" → "what does a yellow flag mean in football" uses "flag" as a penalty marker → OFF-TOPIC
- Topic "flag football" → "how long is a flag football game" uses "flag football" as the sport → ON-TOPIC
- Topic "bowling" → "bowling green council" uses "bowling" as a place name → OFF-TOPIC
- Topic "archery" → "archery tag" = a sport variant → ON-TOPIC; "archery lane apartments" → OFF-TOPIC
- Topic "softball" → "softball glove for 8 year old" → ON-TOPIC; "softball lighting requirements building code" → OFF-TOPIC

THE DISAMBIGUATION TEST:
If you replaced the topic word with a synonym specific to the sport/activity and the keyword stopped making sense → the keyword was using a different meaning → OFF-TOPIC.
Example: "victoria cross" — replace "cross" with "hurdle" → "victoria hurdle" makes no sense as a military medal → the word was used differently → OFF-TOPIC.${evergreenBlock}

OUTPUT FORMAT (valid JSON only, no markdown):
{"off_topic_indices":[0,3,7]}

Return ONLY the indices (0-based) of OFF-TOPIC keywords. If unsure, do NOT include it. If all are on-topic: {"off_topic_indices":[]}`;

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
                    { role: "user", content: `Filter these ${batch.length} numbered keywords for topic "${topic}". Use the number before each keyword as the index:\n\n${indexedKwList}` },
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

            // NOTE: strict verification second-pass removed — it was over-aggressive and
            // removed legitimate adjacent/related keywords (e.g., "vo2 max", "shin splints"
            // when topic was "track and field"). The inclusive first pass is sufficient.

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
      const groups: DedupGroup[] = sortForSemanticPass(ungroupedKeywords.map((g: any) => ({
        canonical: g.canonical,
        canonicalVolume: g.totalVolume,
        totalVolume: g.totalVolume,
        variants: [],
      })));

      const BATCH_SIZE = 400;
      const CONCURRENCY = 4;
      const totalBatches = Math.ceil(groups.length / BATCH_SIZE);

      // Pre-split into batches
      const batches: DedupGroup[][] = [];
      for (let i = 0; i < groups.length; i += BATCH_SIZE) {
        batches.push(groups.slice(i, i + BATCH_SIZE));
      }

      console.log(`AI semantic pass: ${groups.length} keywords in ${totalBatches} batches (size ${BATCH_SIZE}, concurrency ${CONCURRENCY})...`);

      // SSE streaming response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          try {
            const aiMerged: DedupGroup[] = [];
            const stillUngroupedAll: DedupGroup[] = [];
            const discoveredCanonicals: string[] = [];
            let completed = 0;

            // Process batches in parallel waves
            for (let waveStart = 0; waveStart < batches.length; waveStart += CONCURRENCY) {
              const wave = batches.slice(waveStart, waveStart + CONCURRENCY);

              send({
                type: "progress",
                batch: Math.min(waveStart + CONCURRENCY, batches.length),
                totalBatches,
                message: `Processing batches ${waveStart + 1}-${Math.min(waveStart + CONCURRENCY, batches.length)} of ${totalBatches}...`,
              });

              const results = await Promise.all(
                wave.map((batch, idx) => {
                  const batchIdx = waveStart + idx;
                  console.log(`AI batch ${batchIdx + 1}/${totalBatches} (${batch.length} keywords)...`);
                  return semanticGroupBatch(batch, LOVABLE_API_KEY, batchIdx, totalBatches, discoveredCanonicals)
                    .catch((e) => {
                      console.error(`Batch ${batchIdx + 1} failed:`, e.message);
                      return { merged: [], stillUngrouped: batch };
                    });
                })
              );

              for (let idx = 0; idx < results.length; idx++) {
                const { merged, stillUngrouped } = results[idx];
                aiMerged.push(...merged);
                stillUngroupedAll.push(...stillUngrouped);
                for (const m of merged) discoveredCanonicals.push(m.canonical);
                completed++;
                send({
                  type: "batch_complete",
                  batch: completed,
                  mergedInBatch: merged.length,
                  totalMergedSoFar: aiMerged.length,
                });
              }
            }

            // ── CONSOLIDATION PASS: re-dedupe across batches ──
            // Combine all canonicals (merged + still-ungrouped) and run another
            // semantic pass so duplicates that landed in different batches get merged.
            let finalMerged = [...aiMerged];
            let finalRemaining = [...stillUngroupedAll];

            const allCanonicals: DedupGroup[] = sortForSemanticPass([...aiMerged, ...stillUngroupedAll]);
            if (allCanonicals.length > 1 && allCanonicals.length <= 2000) {
              send({
                type: "progress",
                batch: totalBatches,
                totalBatches,
                message: `Consolidation pass: re-checking ${allCanonicals.length} canonicals across all batches...`,
              });
              console.log(`Consolidation pass on ${allCanonicals.length} canonicals...`);

              try {
                const { merged: consolidatedMerged, stillUngrouped: consolidatedRemaining } =
                  await semanticGroupBatch(allCanonicals, LOVABLE_API_KEY, 0, 1, []);

                finalMerged = [...consolidatedMerged, ...consolidatedRemaining.filter(g => g.variants.length > 0)];
                finalRemaining = consolidatedRemaining.filter(g => g.variants.length === 0);

                send({
                  type: "batch_complete",
                  batch: completed + 1,
                  mergedInBatch: consolidatedMerged.length,
                  totalMergedSoFar: consolidatedMerged.length,
                });
                console.log(`Consolidation merged ${consolidatedMerged.length} cross-batch groups`);
              } catch (e: any) {
                console.error("Consolidation pass failed, keeping per-batch results:", e.message);
              }
            } else if (allCanonicals.length > 2000) {
              // Too many canonicals for a single pass — chunk it
              send({
                type: "progress",
                batch: totalBatches,
                totalBatches,
                message: `Consolidation pass: re-checking ${allCanonicals.length} canonicals in chunks...`,
              });
              console.log(`Consolidation pass (chunked) on ${allCanonicals.length} canonicals...`);

              const CHUNK = 800;
              const newMerged: DedupGroup[] = [];
              const newRemaining: DedupGroup[] = [];
              const consolidatedDiscovered: string[] = [];

              for (let i = 0; i < allCanonicals.length; i += CHUNK) {
                const chunk = allCanonicals.slice(i, i + CHUNK);
                try {
                  const { merged, stillUngrouped } = await semanticGroupBatch(
                    chunk, LOVABLE_API_KEY, i / CHUNK, Math.ceil(allCanonicals.length / CHUNK), consolidatedDiscovered
                  );
                  newMerged.push(...merged);
                  newRemaining.push(...stillUngrouped);
                  for (const m of merged) consolidatedDiscovered.push(m.canonical);
                } catch (e: any) {
                  console.error(`Consolidation chunk failed:`, e.message);
                  newRemaining.push(...chunk);
                }
              }

              const needsSecondConsolidation = newRemaining.length > 1 && newRemaining.length !== allCanonicals.length;
              if (needsSecondConsolidation) {
                const secondPassInput = sortForSemanticPass([...newMerged, ...newRemaining]);
                const secondMerged: DedupGroup[] = [];
                const secondRemaining: DedupGroup[] = [];

                for (let i = 0; i < secondPassInput.length; i += CHUNK) {
                  const chunk = secondPassInput.slice(i, i + CHUNK);
                  try {
                    const { merged, stillUngrouped } = await semanticGroupBatch(
                      chunk, LOVABLE_API_KEY, i / CHUNK, Math.ceil(secondPassInput.length / CHUNK), []
                    );
                    secondMerged.push(...merged);
                    secondRemaining.push(...stillUngrouped);
                  } catch (e: any) {
                    console.error(`Second consolidation chunk failed:`, e.message);
                    secondRemaining.push(...chunk);
                  }
                }

                const split = splitMergedAndRemaining([...secondMerged, ...secondRemaining]);
                finalMerged = split.merged;
                finalRemaining = split.remaining;
              } else {
                const split = splitMergedAndRemaining([...newMerged, ...newRemaining]);
                finalMerged = split.merged;
                finalRemaining = split.remaining;
              }
              console.log(`Consolidation merged ${finalMerged.length} total semantic groups`);
            }

            const aiMergedFinal = finalMerged;
            const remaining = finalRemaining;

            // Send final result
            const mergedResults = aiMergedFinal.map(g => ({
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
              aiMergedGroups: aiMergedFinal.length,
              aiMergedKeywords: mergedResults,
              aiSingles: singles,
            });

            console.log(`AI pass complete: ${aiMergedFinal.length} groups merged (after consolidation)`);
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
