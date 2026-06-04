const IMAGE_URL_RE = /(?:article-images|storage\/v1\/object|\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$)/i;

const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

const splitSnippet = (text: string, maxWords: number): [string, string] => {
  const sentences = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [];
  if (sentences.length > 1) {
    const first: string[] = [];
    let firstWords = 0;
    for (const sentence of sentences) {
      const words = countWords(sentence);
      if (first.length > 0 && firstWords + words > maxWords) break;
      if (words > maxWords && first.length === 0) break;
      first.push(sentence);
      firstWords += words;
    }
    if (first.length > 0 && firstWords <= maxWords) {
      const firstText = first.join(" ").trim();
      const restText = text.slice(firstText.length).trim();
      if (restText) return [firstText, restText];
    }
  }

  const words = text.trim().split(/\s+/).filter(Boolean);
  return [words.slice(0, maxWords).join(" "), words.slice(maxWords).join(" ")];
};

const isStructuredSnippetLine = (line: string): boolean => {
  const trimmed = line.trim();
  return (
    !trimmed ||
    /^#{1,6}\s+/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^>\s*/.test(trimmed) ||
    /^\|/.test(trimmed) ||
    /^!?\[[^\]]*\]\([^)]+\)$/.test(trimmed) ||
    /<\/?(?:table|thead|tbody|tr|td|th|ul|ol|li|pre|code|figure|aside|nav|script|style|img|blockquote|div)\b/i.test(trimmed)
  );
};

export function normalizeBrokenImageMarkdown(content: string): string {
  return content.replace(
    /(^|\n)(!?)\[([^\]\n]+)\]\s*\n+\s*\((https?:\/\/[^)\n]+(?:\n[^)\n]+)*)\)/g,
    (match, prefix: string, bang: string, alt: string, rawUrl: string) => {
      const url = rawUrl.replace(/\s+/g, "");
      if (!bang && !IMAGE_URL_RE.test(url)) return match;
      return `${prefix}![${alt.trim()}](${url})`;
    },
  );
}

export function enforceUnder45SnippetBlocks(content: string, maxWords = 45): string {
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    if (!/^#{2,3}\s+/.test(lines[i])) continue;

    let start = i + 1;
    while (start < lines.length && !lines[start].trim()) start++;
    if (start >= lines.length || /^#{1,6}\s+/.test(lines[start])) continue;

    let end = start;
    while (end < lines.length && lines[end].trim() && !/^#{1,6}\s+/.test(lines[end])) end++;
    const block = lines.slice(start, end);
    if (block.length === 0 || block.some(isStructuredSnippetLine)) continue;

    const text = block.join(" ").replace(/\s+/g, " ").trim();
    if (countWords(text) <= maxWords) continue;

    const [first, rest] = splitSnippet(text, maxWords);
    if (!first || !rest || countWords(first) > maxWords) continue;
    lines.splice(start, end - start, first, "", rest);
    i = start + 1;
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}