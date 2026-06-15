// extractFactsFromContextFile.ts
// Converts uploaded context file content into a compact labelled fact list.
// Replaces full-file dumps (~10k tokens each) in the body batch prompt with
// a scored, deduplicated list (~800 tokens total).
// The model cites used facts inline as (Source: F##).
// Pure module — no I/O, no Deno APIs.

export interface ContextFact {
  id: string;       // e.g. "F01"
  file: string;     // display name (no extension)
  text: string;
  score: number;
}

const STOP = new Set([
  "the","a","an","and","or","of","for","to","in","on","with","by","at","is","are","be",
  "this","that","these","those","it","its","was","were","has","have","had","will","would",
  "can","could","should","may","might","about","from","into","through","during","before",
  "after","above","below","between","each","both","all","any","some","such","than","then",
  "when","where","while","how","what","which","who","whom","whose","being","been","not",
  "also","only","just","even","most","more","less","very","well","here","there","now",
]);

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Build the global fact catalog block to inject into the body batch prompt.
 * Returns empty string when no files are supplied.
 */
export function buildContextFactBlock(
  files: Array<{ name: string; content: string }>,
  maxFactsPerFile = 14,
): { block: string; facts: ContextFact[] } {
  if (!files || files.length === 0) return { block: "", facts: [] };

  const all: ContextFact[] = [];
  let idx = 0;

  for (const file of files) {
    const shortName = file.name.replace(/\.(docx?|pdf|txt|md)$/i, "");
    const sentences = splitSentences(file.content);
    const scored = sentences
      .map((text) => ({ id: "", file: shortName, text, score: scoreSentence(text, "") }))
      .filter((f) => f.score >= 2 && wordCount(f.text) >= 6 && wordCount(f.text) <= 80)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxFactsPerFile);

    for (const fact of scored) {
      idx++;
      fact.id = `F${String(idx).padStart(2, "0")}`;
      all.push(fact as ContextFact);
    }
  }

  if (all.length === 0) return { block: "", facts: [] };

  const lines = all.map((f) => `[${f.id}] (${f.file}): ${f.text.trim()}`);

  const block = [
    `VERIFIED FACTS FROM CONTEXT FILES — cite inline as (Source: [ID]).`,
    `Use exact numbers, names, and figures verbatim. Do NOT paraphrase into vague summaries.`,
    `If a required figure is missing, write [NEEDS EXPERT INPUT] inline — never invent it.`,
    ``,
    ...lines,
  ].join("\n");

  return { block, facts: all };
}

/**
 * Return IDs of the top N facts most relevant to a section heading.
 * Used per-section to give the model a hint list.
 */
export function getRelevantFactIds(
  facts: ContextFact[],
  heading: string,
  topN = 5,
): string[] {
  if (!facts.length || !heading) return [];
  const headingTokens = tokenise(heading);
  const rescored = facts.map((f) => {
    let boost = 0;
    const lower = f.text.toLowerCase();
    for (const t of headingTokens) if (lower.includes(t)) boost += 2;
    return { id: f.id, score: f.score + boost };
  });
  return rescored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((f) => f.id);
}

// ─── private helpers ──────────────────────────────────────────────────────────

function splitSentences(text: string): string[] {
  const out: string[] = [];
  const byLine = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 15);
  for (const line of byLine) {
    // Split on ". " before a capital letter — but NOT after a digit (decimal protection)
    // and NOT after a single uppercase letter (abbreviation protection).
    const parts = line.split(/(?<![0-9])(?<!\b[A-Z])\. (?=[A-Z])/);
    for (const part of parts) {
      const t = part.trim().replace(/["""'']/g, "'");
      if (t.length > 15) out.push(t);
    }
  }
  return out;
}

function scoreSentence(text: string, _heading: string): number {
  let score = 0;

  // Number with unit — highest signal for grounding
  if (/\b\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:%|percent|stitches?|spi|inch(?:es)?|\bcm\b|\bmm\b|\bkg\b|\blb\b|\boz\b|\bgsm\b|\byears?\b|\bmonths?\b|\bweeks?\b|\bdays?\b|\bcycles?\b|\bwashes?\b|°[CFf]|\$|USD|€|£|\bcount\b|\blayers?\b|\bthreads?\b|\btimes?\b|\bcoats?\b|\bml\b|\bL\b)/i.test(text)) {
    score += 4;
  }
  // Standalone percentage
  if (/\b\d+(?:\.\d+)?%/.test(text)) score += 4;

  // Named multi-word brand / standard / product
  if (/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+/.test(text)) score += 2;

  // Comparison language
  if (/\b(?:vs\.?|versus|compared to|better than|worse than|unlike|whereas|outperform)\b/i.test(text)) score += 2;

  // Instruction / recommendation
  if (/\b(?:avoid|do not|never|always|ensure|recommend|wash|select|choose|check)\b/i.test(text)) score += 2;

  // Risk / failure / defect signal
  if (/\b(?:risk|fail(?:ure)?|damage|delaminate|crack|peel|shrink|bleed|fade|warp|break|defect|reject|void|deteriorate|separ)\b/i.test(text)) score += 2;

  // Penalty for very long sentences
  if (wordCount(text) > 70) score -= 2;

  return score;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).length;
}

function tokenise(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 3 && !STOP.has(t));
}
