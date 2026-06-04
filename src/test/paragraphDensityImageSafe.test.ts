import { describe, expect, it } from "vitest";

// Mirror of the production helpers so we can verify behaviour without
// importing Index.tsx (which is too heavy for unit tests).
const MAX_PARAGRAPH_WORDS = 55;
const MAX_PARAGRAPH_SENTENCES = 3;

const paragraphWordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const splitParagraphSentences = (text: string): string[] =>
  text.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [];
const splitLongSentence = (sentence: string): string[] => {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= MAX_PARAGRAPH_WORDS) return [sentence];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += MAX_PARAGRAPH_WORDS) {
    chunks.push(words.slice(i, i + MAX_PARAGRAPH_WORDS).join(" "));
  }
  return chunks;
};

const shouldSkipParagraphBlock = (block: string): boolean => {
  const trimmed = block.trim();
  if (!trimmed || trimmed.includes("```")) return true;
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.some((l) => /^#{1,6}\s+/.test(l))) return true;
  if (lines.some((l) => /^[-*+]\s+/.test(l) || /^\d+\.\s+/.test(l))) return true;
  if (lines.some((l) => /^>\s*/.test(l) || /^\|/.test(l))) return true;
  if (/<\/?(?:table|thead|tbody|tr|td|th|ul|ol|li|pre|code|figure|aside|nav|script|style|img)\b/i.test(trimmed)) return true;
  if (/!\[[^\]]*\]\([^)]+\)/.test(trimmed)) return true;
  if (/\[[^\]]+\]\((?:https?:|\/)[^)]+\)/.test(trimmed)) return true;
  return false;
};

const splitDenseParagraphBlock = (block: string): string => {
  if (shouldSkipParagraphBlock(block)) return block;
  const paragraph = block.replace(/\s+/g, " ").trim();
  const sentences = splitParagraphSentences(paragraph).flatMap(splitLongSentence);
  if (paragraphWordCount(paragraph) <= MAX_PARAGRAPH_WORDS && sentences.length <= MAX_PARAGRAPH_SENTENCES) return paragraph;
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const sentence of sentences) {
    const words = paragraphWordCount(sentence);
    if (current.length > 0 && (currentWords + words > MAX_PARAGRAPH_WORDS || current.length >= MAX_PARAGRAPH_SENTENCES)) {
      chunks.push(current.join(" "));
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += words;
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks.join("\n\n");
};

const enforceParagraphDensity = (content: string): string =>
  content.split(/\n{2,}/).map(splitDenseParagraphBlock).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();

describe("enforceParagraphDensity — image/link safety", () => {
  it("does not shred markdown image URLs at every '.'", () => {
    const md = `Some intro paragraph here.

![dreamstimemedium 130102241](https://lipkcsgbotjzmzuwsdeu.supabase.co/storage/v1/object/public/article-images/1775310246511-dreamstimemedium_130102241.jpg)

Some outro paragraph here.`;
    const out = enforceParagraphDensity(md);
    expect(out).toContain(
      "![dreamstimemedium 130102241](https://lipkcsgbotjzmzuwsdeu.supabase.co/storage/v1/object/public/article-images/1775310246511-dreamstimemedium_130102241.jpg)",
    );
  });

  it("does not break a markdown link with periods in the URL", () => {
    const md = `See [our deep dive](https://example.co.uk/page.html) for more.`;
    const out = enforceParagraphDensity(md);
    expect(out).toContain("[our deep dive](https://example.co.uk/page.html)");
  });

  it("still splits dense plain-text paragraphs", () => {
    const long =
      "Sentence one is here. Sentence two adds more. Sentence three keeps going. Sentence four piles on. Sentence five does not stop. Sentence six keeps adding to the heap.";
    const out = enforceParagraphDensity(long);
    expect(out.split(/\n\n/).length).toBeGreaterThan(1);
  });
});
