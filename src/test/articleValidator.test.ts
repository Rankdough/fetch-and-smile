import { describe, expect, it } from "vitest";
import { repairAndValidate, validateArticleHtml, repairArticleHtml } from "@/utils/articleValidator";

// Compact reproduction of the failure modes from the broken export the user
// pasted (markdown leftovers, <p> inside <h3>, word-splitting artefacts,
// unbalanced blockquotes, dense paragraphs, no tables).
const brokenHtml = `
<h1>No-Hitter vs Perfect Game</h1>
<h2>TL;DR</h2>
<p>A no-hitter allows baserunners; a perfect game allows none.</p>
<h3><p>Pitcher dominance metrics</p></h3>
<p>Read more at [our deep dive](https://example.com/deep) about pitching.</p>
<p>This is a very long wall of text. It runs on and on without any breaks for the reader. Sentence one continues forever. Sentence two also continues. Sentence three keeps adding more words because the writer never paused. Sentence four piles even more onto the heap until the reader is exhausted and confused about what the actual point of the paragraph might be.</p>
<p>h ome runs are rare in perfect games. t he rarity is the point.</p>
<blockquote>An open quote that never closes
<h2>What is a perfect game?</h2>
<p>Short.</p>
`;

describe("articleValidator — repair", () => {
  it("converts leftover markdown links to anchors", () => {
    const { html, applied } = repairArticleHtml(brokenHtml);
    expect(html).not.toMatch(/\[our deep dive\]\(https:\/\//);
    expect(html).toMatch(/<a href="https:\/\/example\.com\/deep">our deep dive<\/a>/);
    expect(applied).toContain("converted-markdown-links");
  });

  it("unwraps <p> inside headings", () => {
    const { html, applied } = repairArticleHtml(brokenHtml);
    expect(html).not.toMatch(/<h3[^>]*>\s*<p/i);
    expect(applied).toContain("unwrapped-p-in-headings");
  });

  it("joins word-splitting artefacts", () => {
    const { html, applied } = repairArticleHtml(brokenHtml);
    expect(html).toMatch(/home runs/);
    expect(html).toMatch(/the rarity/);
    expect(applied).toContain("joined-split-words");
  });

  it("closes unbalanced blockquotes", () => {
    const { html, applied } = repairArticleHtml(brokenHtml);
    const opens = (html.match(/<blockquote\b/gi) || []).length;
    const closes = (html.match(/<\/blockquote>/gi) || []).length;
    expect(opens).toBe(closes);
    expect(applied).toContain("closed-unbalanced-blockquotes");
  });

  it("splits dense paragraphs (>60 words OR >3 sentences)", () => {
    const { html, applied } = repairArticleHtml(brokenHtml);
    const matches = applied.find((a) => a.startsWith("split-"));
    expect(matches).toBeTruthy();
    const beforeCount = (brokenHtml.match(/<p\b/gi) || []).length;
    const afterCount = (html.match(/<p\b/gi) || []).length;
    expect(afterCount).toBeGreaterThan(beforeCount);
  });
});

describe("articleValidator — validate", () => {
  it("flags every defect from the user's failed export", () => {
    const report = validateArticleHtml(brokenHtml, {
      targetWordCount: 1500,
      requireFAQ: true,
      requireReferences: true,
    });
    const failedIds = report.hardFailures.map((f) => f.id);
    expect(failedIds).toEqual(
      expect.arrayContaining([
        "tables",
        "faq",
        "references",
        "ctas",
        "no-markdown-leftovers",
        "no-p-in-heading",
        "balanced-blockquotes",
        "paragraph-density",
        "word-count",
      ]),
    );
    expect(report.passed).toBe(false);
  });

  it("passes a well-formed article", () => {
    const good = `
      <h1>Title</h1>
      <h2>TL;DR</h2><p>Short summary that is direct and useful for the reader.</p>
      <blockquote><strong>Tip 1:</strong> first</blockquote>
      <blockquote><strong>Tip 2:</strong> second</blockquote>
      <blockquote><strong>Tip 3:</strong> third</blockquote>
      <h2>What is X?</h2>
      <p>X is a thing that does this and that for these reasons and matters because of why it helps the reader understand the topic clearly without confusion at all today.</p>
      <h2>How does X work?</h2>
      <p>It works by following a small set of clear steps that any reader can follow without prior knowledge and still arrive at a useful conclusion in minutes flat today.</p>
      <h2>Why does X matter?</h2>
      <p>It matters because the alternative wastes time and money for teams of every size in every industry that we have ever seen across our long history of doing this work today.</p>
      <table><tr><td>A</td><td>B</td></tr></table>
      <table><tr><td>C</td><td>D</td></tr></table>
      <blockquote>"Expert quote here," said the expert.</blockquote>
      <div data-cta-banner="true">CTA 1</div>
      <div data-cta-banner="true">CTA 2</div>
      <h2>FAQ</h2><p>Q&amp;A here.</p>
      <h2>References</h2><p>Refs here.</p>
    `;
    const report = validateArticleHtml(good, { requireFAQ: true });
    expect(report.hardFailures.map((f) => f.id)).toEqual([]);
    expect(report.passed).toBe(true);
  });
});

describe("articleValidator — repair+validate pipeline", () => {
  it("repair improves the validation report", () => {
    const before = validateArticleHtml(brokenHtml, { targetWordCount: 1500 });
    const { report: after } = repairAndValidate(brokenHtml, { targetWordCount: 1500 });
    expect(after.hardFailures.length).toBeLessThan(before.hardFailures.length);
    // Specifically, these mechanical defects must be gone after repair
    expect(after.hardFailures.map((f) => f.id)).not.toEqual(
      expect.arrayContaining(["no-markdown-leftovers", "no-p-in-heading", "balanced-blockquotes"]),
    );
  });
});
