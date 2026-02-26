/**
 * Extracts semantic building blocks (themes) from raw seed keywords.
 * Instead of passing raw long-tail phrases to the AI, we decompose them
 * into core concepts the AI can combinatorially expand.
 */

// Brand terms to strip (case-insensitive)
const DEFAULT_BRAND_STOPWORDS = [
  "meet5", "meet 5", "meet5.com", "meet5.de", "meetfive", "meet five",
  "meet5us", "meet5usa", "meet5 gmbh", "meet5 app",
];

// Generic stopwords that don't carry semantic value
const GENERIC_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
  "neither", "each", "every", "all", "any", "few", "more", "most", "other",
  "some", "such", "no", "only", "own", "same", "than", "too", "very",
  "just", "because", "until", "while", "about", "against", "up", "down",
  "it", "its", "this", "that", "these", "those", "i", "me", "my", "we",
  "our", "you", "your", "he", "him", "his", "she", "her", "they", "them",
  "their", "what", "which", "who", "whom", "when", "where", "why", "how",
  // German stopwords
  "der", "die", "das", "ein", "eine", "und", "oder", "aber", "ist", "sind",
  "war", "für", "mit", "auf", "von", "zu", "bei", "nach", "über", "unter",
  "zwischen", "vor", "hinter", "neben", "ohne", "um", "durch", "gegen",
  "wie", "was", "wer", "wo", "wann", "warum", "ich", "du", "er", "sie",
  "es", "wir", "ihr", "sich", "dem", "den", "des", "im", "am", "vom",
  "zum", "zur", "ins", "ans", "beim", "aufs", "auch", "noch", "schon",
  "dann", "denn", "doch", "mal", "nur", "wenn", "als", "ob", "dass",
  "nicht", "kein", "keine", "keinen", "keiner", "mein", "dein", "sein",
  "unser", "euer", "mehr", "kann", "will", "soll", "muss", "hat", "haben",
]);

export interface SeedThemes {
  /** Core topic words (nouns/concepts) with frequency */
  coreTopics: { term: string; count: number }[];
  /** Age/demographic modifiers */
  demographics: { term: string; count: number }[];
  /** Activity/interest words */
  activities: { term: string; count: number }[];
  /** Intent modifiers (best, how to, near me, etc.) */
  intentModifiers: { term: string; count: number }[];
  /** Location-related terms */
  locations: { term: string; count: number }[];
  /** Recurring multi-word patterns (bigrams/trigrams) */
  patterns: { term: string; count: number }[];
  /** Total keywords analyzed */
  totalAnalyzed: number;
  /** Keywords after brand filtering */
  nonBrandedCount: number;
}

// Patterns for categorization
const AGE_PATTERN = /\b(über|over|ab|ü)\s*\d+\b|\b\d+\s*(\+|plus)\b|\b(senioren?|ältere?|junge?|jung|jugend|teenager|teens?|millennials?|gen\s*z|boomer|rentner|middle.?age|young|old|elderly|senior|adult|50\+|40\+|30\+|60\+)\b/i;
const LOCATION_PATTERN = /\b(near\s*me|in\s*der\s*nähe|in\s*meiner\s*nähe|nearby|local|stadt|city|berlin|münchen|munich|hamburg|köln|cologne|frankfurt|düsseldorf|stuttgart|dortmund|essen|bremen|dresden|leipzig|hannover|nürnberg|nuremberg|amsterdam|wien|vienna|zürich|zurich)\b/i;
const INTENT_PATTERN = /\b(best|beste|top|how\s*to|wie|was\s*ist|what\s*is|tipps?|tips?|guide|anleitung|vergleich|comparison|vs|versus|alternative|review|erfahrung|test|kostenlos|free|gratis|app|apps?|online|download|anmelden|sign\s*up|join|finden|find)\b/i;
const ACTIVITY_PATTERN = /\b(wandern|hiking|walking|spazieren|radfahren|cycling|biking|kayaking|klettern|climbing|yoga|fitness|sport|tanzen|dancing|kochen|cooking|reisen|travel|lesen|reading|gaming|spielen|fotografieren|photography|musik|music|kunst|art|theater|kino|cinema|camping|schwimmen|swimming|joggen|jogging|running|laufen|golf|tennis|segeln|sailing|meditation|gärtnern|gardening|crafts|basteln|wine\s*tasting|weinprobe|brunch|dinner|lunch|café|coffee|board\s*games|brettspiele|quiz|trivia|karaoke|bowling|escape\s*room|picknick|picnic|museum|ausflug|excursion|outdoor|indoor)\b/i;

function isBrandKeyword(keyword: string, brandTerms: string[]): boolean {
  const lower = keyword.toLowerCase().trim();
  // If the keyword IS a brand term or starts with one
  for (const brand of brandTerms) {
    if (lower === brand || lower.startsWith(brand + " ") || lower.startsWith(brand + ".")) {
      return true;
    }
  }
  return false;
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-zäöüß0-9\s\+]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function getBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (!GENERIC_STOPWORDS.has(tokens[i]) || !GENERIC_STOPWORDS.has(tokens[i + 1])) {
      bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
  }
  return bigrams;
}

export function extractSeedThemes(
  keywords: string[],
  customBrandTerms?: string[]
): SeedThemes {
  const brandTerms = [
    ...DEFAULT_BRAND_STOPWORDS,
    ...(customBrandTerms || []).map(t => t.toLowerCase()),
  ];

  // Filter out purely branded keywords
  const nonBranded = keywords.filter(kw => !isBrandKeyword(kw, brandTerms));

  // Frequency maps
  const wordFreq = new Map<string, number>();
  const bigramFreq = new Map<string, number>();
  const demographics: Map<string, number> = new Map();
  const locations: Map<string, number> = new Map();
  const intents: Map<string, number> = new Map();
  const activities: Map<string, number> = new Map();

  for (const kw of nonBranded) {
    const lower = kw.toLowerCase();

    // Extract categorized terms
    const ageMatch = lower.match(AGE_PATTERN);
    if (ageMatch) {
      const term = ageMatch[0].trim();
      demographics.set(term, (demographics.get(term) || 0) + 1);
    }

    const locMatch = lower.match(LOCATION_PATTERN);
    if (locMatch) {
      const term = locMatch[0].trim();
      locations.set(term, (locations.get(term) || 0) + 1);
    }

    const intentMatch = lower.match(INTENT_PATTERN);
    if (intentMatch) {
      const term = intentMatch[0].trim();
      intents.set(term, (intents.get(term) || 0) + 1);
    }

    const actMatch = lower.match(ACTIVITY_PATTERN);
    if (actMatch) {
      const term = actMatch[0].trim();
      activities.set(term, (activities.get(term) || 0) + 1);
    }

    // Word frequency (excluding stopwords and brand terms)
    const tokens = tokenize(kw);
    for (const token of tokens) {
      if (!GENERIC_STOPWORDS.has(token) && !brandTerms.some(b => b.includes(token) && token.length < 5)) {
        wordFreq.set(token, (wordFreq.get(token) || 0) + 1);
      }
    }

    // Bigram frequency
    const bigrams = getBigrams(tokens);
    for (const bg of bigrams) {
      bigramFreq.set(bg, (bigramFreq.get(bg) || 0) + 1);
    }
  }

  // Sort and take top entries
  const sortMap = (m: Map<string, number>, limit = 30) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term, count]) => ({ term, count }));

  // Core topics: high-frequency words not already categorized
  const categorizedTerms = new Set([
    ...demographics.keys(),
    ...locations.keys(),
    ...intents.keys(),
    ...activities.keys(),
  ]);

  const coreTopics = [...wordFreq.entries()]
    .filter(([term]) => {
      // Exclude if already captured in a category
      for (const cat of categorizedTerms) {
        if (cat.includes(term)) return false;
      }
      return true;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([term, count]) => ({ term, count }));

  // Patterns: recurring bigrams with count > 1
  const patterns = [...bigramFreq.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([term, count]) => ({ term, count }));

  return {
    coreTopics,
    demographics: sortMap(demographics),
    activities: sortMap(activities),
    intentModifiers: sortMap(intents),
    locations: sortMap(locations),
    patterns,
    totalAnalyzed: keywords.length,
    nonBrandedCount: nonBranded.length,
  };
}

/** Format themes into a structured string for the AI prompt */
export function formatThemesForPrompt(themes: SeedThemes): string {
  const sections: string[] = [];

  if (themes.coreTopics.length > 0) {
    sections.push(`CORE TOPIC WORDS: ${themes.coreTopics.map(t => t.term).join(", ")}`);
  }
  if (themes.demographics.length > 0) {
    sections.push(`DEMOGRAPHIC MODIFIERS: ${themes.demographics.map(t => t.term).join(", ")}`);
  }
  if (themes.activities.length > 0) {
    sections.push(`ACTIVITIES & INTERESTS: ${themes.activities.map(t => t.term).join(", ")}`);
  }
  if (themes.intentModifiers.length > 0) {
    sections.push(`INTENT MODIFIERS: ${themes.intentModifiers.map(t => t.term).join(", ")}`);
  }
  if (themes.locations.length > 0) {
    sections.push(`LOCATION TERMS: ${themes.locations.map(t => t.term).join(", ")}`);
  }
  if (themes.patterns.length > 0) {
    sections.push(`RECURRING PATTERNS: ${themes.patterns.map(t => `"${t.term}" (${t.count}x)`).join(", ")}`);
  }

  return sections.join("\n");
}
