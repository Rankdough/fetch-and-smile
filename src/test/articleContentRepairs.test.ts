import { describe, expect, it } from "vitest";
import { enforceUnder45SnippetBlocks, normalizeBrokenImageMarkdown } from "@/utils/articleContentRepairs";

describe("articleContentRepairs", () => {
  it("splits only the first H2/H3 snippet block when it exceeds 45 words", () => {
    const input = `## TL;DR

one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty thirty-one thirty-two thirty-three thirty-four thirty-five thirty-six thirty-seven thirty-eight thirty-nine forty forty-one forty-two forty-three forty-four forty-five forty-six forty-seven forty-eight

## Next Section

Short answer.`;

    const output = enforceUnder45SnippetBlocks(input);
    const firstBlock = output.split(/\n{2,}/)[1];

    expect(firstBlock.split(/\s+/)).toHaveLength(45);
    expect(output).toContain("forty-six forty-seven forty-eight");
  });

  it("does not split tables, lists, blockquotes, links, or image-only blocks", () => {
    const input = `## Image Section

![Alt](https://example.com/image.jpg)

## Table Section

| A | B |
| - | - |
| 1 | 2 |`;

    expect(enforceUnder45SnippetBlocks(input)).toBe(input);
  });

  it("recovers article-image markdown when the bang is missing", () => {
    const input = `[dreamstimemedium_130102241](https://lipkcsgbotjzmzuwsdeu.supabase.co/storage/v1/object/public/article-images/1775310246511-dreamstimemedium_130102241.jpg)`;

    expect(normalizeBrokenImageMarkdown(input)).toBe(
      `![dreamstimemedium_130102241](https://lipkcsgbotjzmzuwsdeu.supabase.co/storage/v1/object/public/article-images/1775310246511-dreamstimemedium_130102241.jpg)`,
    );
  });

  it("recovers article-image markdown when the URL is split onto later lines", () => {
    const input = `[dreamstimemedium_130102241]
(https://lipkcsgbotjzmzuwsdeu.supabase.
co/storage/v1/object/public/article-images/1775310246511-
dreamstimemedium_130102241.jpg)`;

    expect(normalizeBrokenImageMarkdown(input)).toBe(
      `![dreamstimemedium_130102241](https://lipkcsgbotjzmzuwsdeu.supabase.co/storage/v1/object/public/article-images/1775310246511-dreamstimemedium_130102241.jpg)`,
    );
  });
});