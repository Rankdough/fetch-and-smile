export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function trimToWordCount(text: string, maxWords: number): string {
  if (!text.trim() || maxWords <= 0) return "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();

  // Protect decimal numbers before sentence splitting so "7.36%" does not get
  // split into "7." and "36%", producing truncated table cells and prose fragments.
  const DECIMAL_PLACEHOLDER = "\x00DEC\x00";
  const protectedText = text.replace(/(\d)\.(?=\d)/g, `$1${DECIMAL_PLACEHOLDER}`);
  const sentences = protectedText.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g)
    ?.map((s) => s.replace(new RegExp(DECIMAL_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), ".").trim())
    .filter(Boolean) ?? [];
  const completeSentences: string[] = [];
  let usedWords = 0;
  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    if (usedWords + sentenceWords > maxWords) break;
    completeSentences.push(sentence);
    usedWords += sentenceWords;
  }
  if (completeSentences.length > 0) return completeSentences.join(" ").trim();

  const unsafeEndWords = new Set([
    "a", "an", "the", "and", "or", "but", "for", "to", "of", "in", "on", "at", "by", "with", "without",
    "from", "into", "onto", "over", "under", "between", "through", "because", "while", "where", "when", "which",
    "that", "this", "these", "those", "is", "are", "was", "were", "be", "being", "been", "require", "requires",
    "required", "necessitate", "necessitates", "orthognathic", "combined", "mild", "moderate", "severe",
  ]);
  let cut = words.slice(0, maxWords);
  while (cut.length > 8) {
    const last = cut[cut.length - 1].toLowerCase().replace(/[^a-z0-9]+$/g, "");
    if (!unsafeEndWords.has(last)) break;
    cut = cut.slice(0, -1);
  }
  const trimmed = cut.join(" ").replace(/[,:;\-]$/, "").trim();
  return trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?") ? trimmed : `${trimmed}.`;
}

export function extractSourcesBlock(body: string): { body: string; sources: string } {
  const lines = body.split("\n");
  const idx = lines.findIndex((line) => /^\s*\*\*Sources?:\*\*/i.test(line) || /^\s*Sources?:\s/i.test(line));
  if (idx < 0) return { body, sources: "" };
  const before = lines.slice(0, idx).join("\n").trim();
  const sources = lines.slice(idx).join("\n").trim();
  return { body: before, sources };
}

export function trimMarkdownTableForBudget(
  tableLines: string[],
  remainingWords: number,
  minimumDataRows = 2,
): string {
  if (tableLines.length < 2 + minimumDataRows) return "";

  const fullTable = tableLines.join("\n");
  if (countWords(fullTable) <= remainingWords) return fullTable;

  const minimumViableTable = tableLines.slice(0, 2 + minimumDataRows).join("\n");
  if (countWords(minimumViableTable) <= remainingWords) return minimumViableTable;

  return "";
}

export function trimSectionToBudget(body: string, budget: number): string {
  const cleaned = body.trim();
  if (!cleaned) return "";
  if (budget <= 0) return "";

  const { body: bodyWithoutSources, sources } = extractSourcesBlock(cleaned);
  const sourceWords = sources ? countWords(sources) : 0;
  const effectiveBudget = Math.max(0, budget - sourceWords);

  const appendSources = (trimmed: string): string => {
    if (!sources) return trimmed;
    return trimmed ? `${trimmed}\n\n${sources}` : sources;
  };

  if (countWords(bodyWithoutSources) <= effectiveBudget) {
    return appendSources(bodyWithoutSources.trim());
  }

  const paragraphs = bodyWithoutSources.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const kept: string[] = [];
  let remaining = effectiveBudget;

  for (const paragraph of paragraphs) {
    if (remaining <= 0) break;
    const paragraphWords = countWords(paragraph);

    if (paragraphWords <= remaining) {
      kept.push(paragraph);
      remaining -= paragraphWords;
      continue;
    }

    if (remaining < 10) break;

    const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
    const isTable = lines.some((line) => line.includes("|"));
    if (isTable) {
      const tableLines = lines.filter((line) => line.includes("|"));
      const trimmedTable = trimMarkdownTableForBudget(tableLines, remaining);
      if (trimmedTable) {
        kept.push(trimmedTable);
        remaining -= countWords(trimmedTable);
      }
      continue;
    }

    // Only accept fully terminated sentences — never keep a dangling fragment.
    const sentences = paragraph.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
    const sentenceBuffer: string[] = [];

    for (const sentence of sentences) {
      if (remaining <= 0) break;
      const sentenceWords = countWords(sentence);
      if (sentenceWords <= remaining) {
        sentenceBuffer.push(sentence);
        remaining -= sentenceWords;
        continue;
      }

      if (sentenceBuffer.length === 0 && remaining >= 12) {
        sentenceBuffer.push(trimToWordCount(sentence, remaining));
        remaining = 0;
      }
      break;
    }

    if (sentenceBuffer.length > 0) kept.push(sentenceBuffer.join(" "));
    break;
  }

  if (!kept.length) return appendSources(trimToWordCount(bodyWithoutSources, Math.max(12, effectiveBudget)));
  return appendSources(kept.join("\n\n").trim());
}