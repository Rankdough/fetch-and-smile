const IMAGE_URL_RE = /(?:article-images|storage\/v1\/object|\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$)/i;

const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

// Protect single-letter abbreviations (F.U.S.E., U.S.A., e.g., i.e.) so their
// internal periods are not treated as sentence boundaries by downstream regex.
const ABBR_RE = /\b(?:[A-Za-z]\.){2,}/g;
const protectAbbrev = (text: string): { text: string; restore: (s: string) => string } => {
  const stash: string[] = [];
  const out = text.replace(ABBR_RE, (m) => {
    stash.push(m);
    return `\x00ABBR${stash.length - 1}\x00`;
  });
  return { text: out, restore: (s) => s.replace(/\x00ABBR(\d+)\x00/g, (_x, i) => stash[Number(i)] ?? "") };
};

const splitSnippet = (text: string, maxWords: number): [string, string] => {
  const { text: protectedText, restore } = protectAbbrev(text);
  const sentences = protectedText.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)?.map((s) => restore(s).trim()).filter(Boolean) || [];
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

const FORBIDDEN_IMAGE_SECTION_RE = /^(tl;?dr|tldr|quick\s*tips|in\s+this\s+article|faq|frequently\s+asked\s+questions|references|sources|final\s+thoughts|conclusion|summary|introduction)\b/i;
const imageLineRe = /^!\[[^\]]*\]\(https?:\/\/[^)]+\)\s*$/;

const isForbiddenImageHeading = (line: string): boolean => {
  const match = line.trim().match(/^##\s+(.+)$/);
  return !!match && FORBIDDEN_IMAGE_SECTION_RE.test(match[1].trim());
};

const isValidImageHeading = (line: string): boolean =>
  /^##\s+/.test(line.trim()) && !isForbiddenImageHeading(line);

export function normalizeBrokenImageMarkdown(content: string): string {
  return content.replace(
    /(^|[^!])\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (match, prefix: string, alt: string, url: string) => {
      if (!IMAGE_URL_RE.test(url)) return match;
      return `${prefix}![${alt.trim()}](${url})`;
    },
  ).replace(
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

export function relocateImagesOutOfForbiddenSections(content: string): string {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];
  const pendingImages: string[] = [];
  let inForbiddenSection = false;

  for (const line of lines) {
    if (/^##\s+/.test(line.trim())) {
      if (isValidImageHeading(line) && pendingImages.length > 0) {
        output.push(line, "", ...pendingImages.splice(0), "");
        inForbiddenSection = false;
        continue;
      }
      inForbiddenSection = isForbiddenImageHeading(line);
    }

    if (inForbiddenSection && imageLineRe.test(line.trim())) {
      pendingImages.push(line.trim());
      continue;
    }

    output.push(line);
  }

  if (pendingImages.length > 0) {
    const firstValidH2 = output.findIndex(isValidImageHeading);
    if (firstValidH2 >= 0) {
      let insertAt = firstValidH2 + 1;
      while (insertAt < output.length && !output[insertAt].trim()) insertAt++;
      while (insertAt < output.length && output[insertAt].trim() && !/^##\s+/.test(output[insertAt].trim())) insertAt++;
      output.splice(insertAt, 0, "", ...pendingImages);
    }
    else output.push("", ...pendingImages);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}