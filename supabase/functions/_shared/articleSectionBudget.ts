export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function trimToWordCount(text: string, maxWords: number): string {
  if (!text.trim() || maxWords <= 0) return "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  const trimmed = words.slice(0, maxWords).join(" ").replace(/[,:;\-]$/, "").trim();
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

    const sentences = paragraph.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [paragraph];
    const sentenceBuffer: string[] = [];

    for (const sentence of sentences) {
      if (remaining <= 0) break;
      const sentenceWords = countWords(sentence);
      if (sentenceWords <= remaining) {
        sentenceBuffer.push(sentence);
        remaining -= sentenceWords;
        continue;
      }

      if (remaining >= 8) {
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