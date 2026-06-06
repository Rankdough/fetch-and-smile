// ─────────────────────────────────────────────────────────────────────────────
// Q&A Microdata — AEO markup for question-based sections
//
// Marks every question H2 section as a schema.org Question with its atomic
// answer paragraph as the acceptedAnswer. Uses microdata ATTRIBUTES (not
// JSON-LD <script> tags) because Shopify strips <script> from Body HTML but
// preserves attributes like id / itemprop / itemscope (verified on live pages).
//
// Each answer paragraph also receives id="answer-N" so the theme-level
// speakable schema can reference them as extra cssSelectors alongside
// #direct-answer and #tldr.
//
// Only H2 headings whose visible text ends with "?" are treated as questions,
// so TL;DR, Quick Tips, Frequently Asked Questions, Final Thoughts and other
// framing sections are untouched.
// ─────────────────────────────────────────────────────────────────────────────

export function addQnaMicrodata(html: string): string {
  if (!html || !html.includes("<h2")) return html;

  // Split keeping each <h2 ...> at the start of its segment.
  const parts = html.split(/(?=<h2\b)/i);
  if (parts.length < 2) return html;

  let answerIdx = 0;

  const out = parts.map((seg, i) => {
    if (i === 0) return seg; // content before the first H2 (H1 + opening)

    const h2Match = seg.match(/^<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (!h2Match) return seg;

    // Idempotency: already marked → keep numbering stable and skip
    if (/^<h2\b[^>]*itemprop="name"/i.test(seg)) {
      answerIdx++;
      return seg;
    }

    const questionText = h2Match[1].replace(/<[^>]+>/g, "").trim();
    if (!questionText.endsWith("?")) return seg; // not a question section

    answerIdx++;

    // 1. Mark the question heading
    let s = seg.replace(/^<h2\b/i, '<h2 itemprop="name"');

    // 2. Wrap the first paragraph after the heading as the accepted answer.
    //    The atomic answer paragraph is the AI-retrieval target for this section.
    s = s.replace(
      /(<\/h2>\s*)<p\b([^>]*)>([\s\S]*?)<\/p>/i,
      (_m, pre: string, attrs: string, inner: string) =>
        `${pre}<div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer"><p id="answer-${answerIdx}" itemprop="text"${attrs}>${inner}</p></div>`
    );

    // 3. Scope the whole section as a Question entity
    return `<section itemscope itemtype="https://schema.org/Question">${s}</section>`;
  });

  return out.join("");
}
