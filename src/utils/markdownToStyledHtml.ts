import { marked } from "marked";
import { extractNavigationFromContent, generateNavigationHtml } from "@/components/ArticleNavigationPanel";
import { extractOrDeriveFAQ, removeFAQSection, generateFAQHtml } from "@/components/FAQAccordion";
import { buildTrustSignalHtml } from "@/components/TrustSignalBox";

interface ColorPalette {
  id?: string;
  primary: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

interface ConvertOptions {
  skipNavigation?: boolean;
  skipQuickTips?: boolean;
  skipFaqs?: boolean;
  skipSources?: boolean;
  includeTrustSignal?: boolean;
  trustSignalTitle?: string;
  trustSignalContent?: string;
}

/**
 * Converts Markdown content to styled HTML with inline styles.
 * Uses the same deterministic logic as the SEO Generator's "Copy HTML" button.
 */
export function markdownToStyledHtml(
  markdown: string,
  colorPalette?: ColorPalette | null,
  options: ConvertOptions = {}
): string {
  if (!markdown.trim()) return "";

  const primaryColor = colorPalette?.primary || "#1E40AF";
  const isDark = colorPalette?.id === "dark-transparent";

  // Color tokens
  const panelBg = isDark ? "rgba(255,255,255,0.06)" : "#f8f4ff";
  const panelText = isDark ? "#ffffff" : "#1f2937";
  const bodyText = isDark ? "#e5e7eb" : "#374151";
  const headingColor = isDark ? `color: #e5e7eb;` : "";

  // 1. Extract nav items and FAQ from the raw markdown BEFORE conversion
  const navItems = options.skipNavigation ? [] : extractNavigationFromContent(markdown);
  const faqItems = options.skipFaqs ? [] : extractOrDeriveFAQ(markdown);

  // Remove FAQ section from markdown so it doesn't appear twice
  let cleanMarkdown = faqItems.length > 0 ? removeFAQSection(markdown) : markdown;

  // Remove any raw "In This Article" section the AI may have generated (the styled one is injected later)
  // This is aggressive: removes the heading + all subsequent lines until the next H1/H2 that is NOT part of the nav
  const lines = cleanMarkdown.split('\n');
  const filteredLines: string[] = [];
  let skippingInThisArticle = false;
  for (const line of lines) {
    // Detect "In This Article" as any heading or standalone text
    if (/^#{1,4}\s*In This Article/i.test(line) || /^\*{0,2}In This Article\*{0,2}\s*$/i.test(line)) {
      skippingInThisArticle = true;
      continue;
    }
    // Stop skipping when we hit the next H1 or H2 (but NOT if it's a numbered nav item like "**1. Title**")
    if (skippingInThisArticle) {
      if (/^#{1,2}\s+/.test(line)) {
        skippingInThisArticle = false;
      } else {
        // Skip bullet items, numbered items, blank lines while in nav section
        continue;
      }
    }
    filteredLines.push(line);
  }
  cleanMarkdown = filteredLines.join('\n');

  // Strip any "**Sources:**" line that lives inside the TL;DR section
  // (TL;DR must be a single clean paragraph — no source list).
  {
    const srcLines = cleanMarkdown.split('\n');
    const out: string[] = [];
    let inTldr = false;
    for (const line of srcLines) {
      if (/^##\s+TL;?DR/i.test(line)) { inTldr = true; out.push(line); continue; }
      if (inTldr && /^#{1,3}\s+/.test(line)) { inTldr = false; }
      if (inTldr && /^\s*\*?\*?Sources:\*?\*?/i.test(line.trim())) continue;
      out.push(line);
    }
    cleanMarkdown = out.join('\n');
  }

  // RENDERER SAFETY NET: strip any "Sources:"/"Source:" lines and the bullet
  // block that follows them, anywhere outside the dedicated ## References H2.
  // Keeps consolidated References intact (those bullets sit under a proper H2,
  // not under a "Sources:" label).
  {
    const srcLines = cleanMarkdown.split("\n");
    const out: string[] = [];
    let inSourcesBlock = false;
    for (const line of srcLines) {
      const trimmed = line.trim();
      const isSourcesLabel =
        /^[>*-]?\s*\*?\*?Sources?:\*?\*?\s*$/i.test(trimmed) ||
        /^[>*-]?\s*\*\*Sources?:\*\*/i.test(trimmed) ||
        /^[>*-]?\s*Sources?:\s*\S/i.test(trimmed);
      if (isSourcesLabel) {
        inSourcesBlock = true;
        continue;
      }
      if (inSourcesBlock) {
        if (!trimmed) continue;
        // Drop trailing source bullets (linked, bare URL, or short orphan label).
        if (/^[-*+]\s+\[[^\]]+\]\(https?:\/\/[^)\s]+\)/i.test(trimmed)) continue;
        if (/^[-*+]\s+https?:\/\/\S+/i.test(trimmed)) continue;
        if (/^\[[^\]]+\]\(https?:\/\/[^)\s]+\)$/i.test(trimmed)) continue;
        if (/^[-*+]\s+[A-Z][\w'’\-\s,&]+$/.test(trimmed) && trimmed.length < 80) continue;
        inSourcesBlock = false;
      }
      out.push(line);
    }
    cleanMarkdown = out.join("\n");
  }


  // Fix inline numbered lists and bold-label items merged into single paragraphs
  cleanMarkdown = cleanMarkdown.replace(/(\S)\s+(\d+)\.\s+(\*\*)/g, "$1\n$2. $3");
  cleanMarkdown = cleanMarkdown.replace(/([.!?])\s+-\s+\*\*/g, "$1\n- **");


  // 2. Convert Markdown → basic HTML
  // Strip stray standalone quote/apostrophe lines that the AI sometimes emits
  cleanMarkdown = cleanMarkdown
    .split("\n")
    .filter((line) => !/^\s*["'`’‘”“]+\s*$/.test(line))
    .join("\n");
  const basicHtml = marked.parse(cleanMarkdown, { async: false }) as string;

  // 3. Parse into DOM and apply inline styles
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${basicHtml}</div>`, "text/html");
  const container = doc.body.firstElementChild as HTMLElement;

  // Style H1
  container.querySelectorAll("h1").forEach((h) => {
    h.setAttribute("style", `margin: 0 0 16px 0; ${headingColor}`);
    h.removeAttribute("class");
  });

  // Style H2
  container.querySelectorAll("h2").forEach((h) => {
    const id = h.getAttribute("id") || "";
    const textContent = h.textContent || "";
    const isTldr = id.includes("tldr") || /TL;?DR/i.test(textContent);
    const isQuickTips = /Quick\s*Tips/i.test(textContent);

    if (isTldr) {
      // Find the TL;DR body: prefer the first UL or P after the heading,
      // skipping any stray TABLE the model may have inserted between heading and paragraph.
      let sibling = h.nextElementSibling;
      const skipped: Element[] = [];
      while (sibling && sibling.tagName !== "UL" && sibling.tagName !== "P" && !/^H[1-6]$/.test(sibling.tagName)) {
        skipped.push(sibling);
        sibling = sibling.nextElementSibling;
      }
      const hasBody = sibling && (sibling.tagName === "UL" || sibling.tagName === "P");
      if (hasBody) {
        // Move the body element to be the immediate next sibling of the H2
        if (skipped.length > 0 && sibling) {
          h.parentNode?.insertBefore(sibling, skipped[0]);
        }
        h.setAttribute("style", `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 12px 16px; margin: 24px 0 0 0; border-radius: 0 8px 0 0;`);
        if (sibling.tagName === "UL") {
          sibling.setAttribute("style", `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 16px 24px 16px 40px; margin: 0 0 24px 0; border-radius: 0 0 8px 0; list-style-type: disc;`);
          sibling.querySelectorAll("li").forEach((li) => {
            li.setAttribute("style", `margin: 8px 0; line-height: 1.6; color: ${panelText};`);
          });
        } else {
          let p: Element | null = sibling;
          while (p && p.tagName === "P") {
            const nextAfter = p.nextElementSibling;
            const isLast = !nextAfter || nextAfter.tagName !== "P";
            p.setAttribute("style", `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 16px 24px; margin: 0 0 ${isLast ? "24px" : "0"} 0; border-radius: ${isLast ? "0 0 8px 0" : "0"}; line-height: 1.7;`);
            p = nextAfter;
          }
        }
      } else {
        // Fallback: no body found — give the heading a normal style instead of an orphaned panel.
        h.setAttribute("style", `margin: 32px 0 16px 0; ${headingColor}`);
      }
    } else if (isQuickTips) {
      h.setAttribute("style", `margin: 32px 0 16px 0; ${headingColor}`);
    } else {
      // Generate slug for navigation linking
      const slug = textContent.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
      h.setAttribute("id", slug);
      h.setAttribute("style", `margin: 32px 0 16px 0; ${headingColor}`);
    }
    h.removeAttribute("class");
  });

  // Style H3
  container.querySelectorAll("h3").forEach((h) => {
    h.setAttribute("style", `margin: 24px 0 12px 0; ${headingColor}`);
    h.removeAttribute("class");
  });

  // Style paragraphs
  container.querySelectorAll("p").forEach((p) => {
    // Skip paragraphs already styled as part of TL;DR section
    const existingStyle = p.getAttribute("style") || "";
    if (existingStyle.includes("border-left") && existingStyle.includes(panelBg)) return;
    p.setAttribute("style", `margin: 0 0 16px 0; line-height: 1.7; color: ${bodyText};`);
    p.removeAttribute("class");
  });

  // Style lists (but not TL;DR which is already styled)
  container.querySelectorAll("ul").forEach((ul) => {
    const existingStyle = ul.getAttribute("style") || "";
    if (!existingStyle.includes("border-left")) {
      ul.setAttribute("style", `margin: 0 0 16px 0; padding-left: 24px; list-style-type: disc; ${isDark ? `color: ${bodyText};` : ""}`);
    }
    ul.removeAttribute("class");
  });
  container.querySelectorAll("ol").forEach((ol) => {
    ol.setAttribute("style", "margin: 0 0 16px 0; padding-left: 24px; list-style-type: decimal;");
    ol.removeAttribute("class");
  });
  // Split LIs that contain multiple " - "-joined questions/sentences into separate LIs
  // (the model sometimes emits all bullets on one line, which markdown collapses into one <li>)
  container.querySelectorAll("li").forEach((li) => {
    const html = li.innerHTML;
    // Look for inline " - " or " — " separators between sentences ending in ? or .
    if (/[?.!]\s*[-–—]\s+\S/.test(html) && !li.querySelector("ul,ol,p,strong")) {
      const parts = html
        .split(/(?<=[?.!])\s*[-–—]\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        const ul = li.parentElement;
        if (ul && (ul.tagName === "UL" || ul.tagName === "OL")) {
          li.innerHTML = parts[0];
          let ref: Element = li;
          for (let i = 1; i < parts.length; i++) {
            const n = doc.createElement("li");
            n.innerHTML = parts[i];
            ref.after(n);
            ref = n;
          }
        }
      }
    }
  });
  container.querySelectorAll("li").forEach((li) => {
    if (!li.getAttribute("style")) {
      li.setAttribute("style", `margin: 8px 0; line-height: 1.6; color: ${bodyText};`);
    }
    li.removeAttribute("class");
  });

  // Style blockquotes - detect Quick Tips vs regular
  // First, identify blockquotes that follow a Quick Tips H2
  const quickTipsH2 = container.querySelector('h2');
  let quickTipsSection = false;
  const quickTipBlockquotes = new Set<Element>();
  container.querySelectorAll('h2').forEach((h2) => {
    if (/Quick\s*Tips/i.test(h2.textContent || '')) {
      let sibling = h2.nextElementSibling;
      while (sibling && sibling.tagName === 'BLOCKQUOTE') {
        quickTipBlockquotes.add(sibling);
        sibling = sibling.nextElementSibling;
      }
    }
  });

  let tipIndex = 0;
  container.querySelectorAll("blockquote").forEach((bq) => {
    const firstStrong = bq.querySelector("strong");
    const isQuickTip = (firstStrong && /^Tip \d+:?/i.test(firstStrong.textContent || "")) || quickTipBlockquotes.has(bq);

    if (isQuickTip) {
      tipIndex++;
      // Remove "Tip N:" prefix OR any leading bold label (e.g. "**Always check:**")
      if (firstStrong && /^Tip \d+:?/i.test(firstStrong.textContent || "")) {
        firstStrong.remove();
      }

      const circleSpan = doc.createElement("span");
      circleSpan.setAttribute("style", `display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: ${primaryColor}; border-radius: 50%; color: white; font-weight: 700; font-size: 14px; margin-right: 12px; flex-shrink: 0; vertical-align: middle;`);
      circleSpan.textContent = String(tipIndex);

      bq.setAttribute("style", `display: flex; align-items: center; background: ${isDark ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, ${primaryColor}10 0%, ${primaryColor}20 100%)`}; border: 1px solid ${isDark ? "rgba(255,255,255,0.12)" : `${primaryColor}33`}; border-radius: 12px; padding: 16px 20px; margin: 12px 0; font-style: normal;`);

      const content = bq.innerHTML;
      bq.innerHTML = "";
      bq.appendChild(circleSpan);
      const textSpan = doc.createElement("span");
      textSpan.innerHTML = content.replace(/^[\s]*/, "");
      textSpan.setAttribute("style", `flex: 1; color: ${bodyText};`);
      bq.appendChild(textSpan);
    } else {
      bq.setAttribute("style", `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 16px 24px; margin: 24px 0; border-radius: 0 8px 8px 0; font-style: normal;`);
    }
    bq.removeAttribute("class");
  });

  // Style tables
  const tableBorder = isDark ? "rgba(255,255,255,0.2)" : "#e5e7eb";
  const tableRowOdd = isDark ? "rgba(255,255,255,0.04)" : "#f9fafb";
  const tableRowEven = isDark ? "rgba(255,255,255,0.08)" : "#ffffff";
  const tableHeaderText = isDark ? "#000000" : "#ffffff";
  const sec = colorPalette?.secondary || primaryColor;

  container.querySelectorAll("table").forEach((table) => {
    table.setAttribute("style", `min-width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid ${tableBorder}; table-layout: auto; margin-bottom: 24px;`);
    table.removeAttribute("class");

    table.querySelectorAll("thead").forEach((thead) => {
      thead.setAttribute("style", `background: linear-gradient(135deg, ${primaryColor} 0%, ${sec} 100%);`);
    });
    table.querySelectorAll("th").forEach((th) => {
      th.setAttribute("style", `padding: 12px 16px; text-align: left; color: ${tableHeaderText}; font-weight: 600; font-size: 14px; border: 1px solid ${tableBorder}; white-space: nowrap;`);
    });
    table.querySelectorAll("tbody tr").forEach((tr, i) => {
      (tr as HTMLElement).setAttribute("style", `background: ${i % 2 === 0 ? tableRowOdd : tableRowEven}; color: ${bodyText};`);
    });
    table.querySelectorAll("td").forEach((td) => {
      td.setAttribute("style", `padding: 12px 16px; font-size: 14px; border: 1px solid ${tableBorder}; word-wrap: break-word; color: ${bodyText};`);
    });
  });

  // Style links + sanitize fake/placeholder hrefs
  const PLACEHOLDER_HOST_RE = /(?:^|\.)(example\.(?:com|org|net)|yourdomain\.com|placeholder\.com)$/i;
  container.querySelectorAll("a").forEach((a) => {
    const href = (a.getAttribute("href") || "").trim();
    let invalid = false;
    if (!href || href === "#" || /^javascript:/i.test(href)) {
      invalid = true;
    } else {
      try {
        const u = new URL(href, "https://placeholder.invalid");
        if (!/^https?:$/.test(u.protocol) && !/^mailto:/i.test(href)) invalid = true;
        else if (PLACEHOLDER_HOST_RE.test(u.hostname)) invalid = true;
      } catch {
        invalid = true;
      }
    }
    if (invalid) {
      // unwrap the anchor — keep the visible text only
      const text = a.textContent || "";
      const span = container.ownerDocument!.createTextNode(text);
      a.parentNode?.replaceChild(span, a);
      return;
    }
    a.setAttribute("style", "color: #2563eb; text-decoration: underline;");
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    a.removeAttribute("class");
  });

  // Remove article bolding entirely while preserving text content
  container.querySelectorAll("strong, b").forEach((el) => {
    const text = container.ownerDocument!.createTextNode(el.textContent || "");
    el.parentNode?.replaceChild(text, el);
  });

  // Remove all remaining class attributes
  container.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("class");
  });

  // Remove stray quote-only paragraphs/list items (e.g. a lone " or ')
  const QUOTE_ONLY_RE = /^["'`’‘”“]+$/;
  container.querySelectorAll("p, li").forEach((el) => {
    const txt = (el.textContent || "").replace(/\s+/g, "").trim();
    if (txt && QUOTE_ONLY_RE.test(txt)) el.remove();
  });

  // 4. Get the cleaned HTML content
  let finalHtml = container.innerHTML;

  // AEO/GEO: Mark the first paragraph as the direct answer for LLM retrieval.
  // Adds id="direct-answer" and itemprop="description" to the opening <p> tag.
  // This is the signal LLMs and Google AI Overviews use to identify the citable answer.
  finalHtml = finalHtml.replace(
    /(<p\s)/,
    '<p id="direct-answer" itemprop="description" '
  );

  // 4b. Strip any residual "In This Article" H2 + following UL that survived markdown cleanup
  finalHtml = finalHtml.replace(/<h2[^>]*>[\s\S]*?In This Article[\s\S]*?<\/h2>\s*(<ul[\s\S]*?<\/ul>)?/gi, '');

  // 5. Insert Navigation after Quick Tips (or TL;DR)
  if (navItems.length > 0 && !options.skipNavigation) {
    const navigationHtml = generateNavigationHtml(navItems, colorPalette as any);

    // Try to insert after last Quick Tip blockquote
    const allBlockquotes = [...finalHtml.matchAll(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi)];
    let lastTipEndPos = -1;
    allBlockquotes.forEach((match) => {
      if (/Tip\s*\d|inline-flex.*28px.*28px.*border-radius:\s*50%/i.test(match[0])) {
        lastTipEndPos = (match.index || 0) + match[0].length;
      }
    });

    if (lastTipEndPos > 0) {
      finalHtml = finalHtml.slice(0, lastTipEndPos) + navigationHtml + finalHtml.slice(lastTipEndPos);
    } else {
      // Fallback: after TL;DR
      const tldrMatch = finalHtml.match(/(<h2[^>]*>.*?TL;?DR.*?<\/h2>[\s\S]*?<\/ul>)/i);
      if (tldrMatch) {
        const tldrEnd = finalHtml.indexOf(tldrMatch[0]) + tldrMatch[0].length;
        finalHtml = finalHtml.slice(0, tldrEnd) + navigationHtml + finalHtml.slice(tldrEnd);
      }
    }
  }

  // 6. Insert FAQ before References/Final Thoughts
  if (faqItems.length > 0 && !options.skipFaqs) {
    const faqHtml = generateFAQHtml(faqItems, colorPalette as any);
    const finalThoughtsMatch = finalHtml.match(/<h2[^>]*>.*?Final Thoughts.*?<\/h2>/i);
    const referencesMatch = finalHtml.match(/<h2[^>]*>.*?References.*?<\/h2>/i);

    if (finalThoughtsMatch) {
      const insertPoint = finalHtml.indexOf(finalThoughtsMatch[0]);
      finalHtml = finalHtml.slice(0, insertPoint) + faqHtml + finalHtml.slice(insertPoint);
    } else if (referencesMatch) {
      const insertPoint = finalHtml.indexOf(referencesMatch[0]);
      finalHtml = finalHtml.slice(0, insertPoint) + faqHtml + finalHtml.slice(insertPoint);
    } else {
      finalHtml += faqHtml;
    }
  }

  // 7. Insert Trust Signal box immediately before the TL;DR heading
  if (options.includeTrustSignal && options.trustSignalContent?.trim()) {
    const trustHtml = buildTrustSignalHtml(
      options.trustSignalTitle?.trim() || "Why You Can Trust This Article",
      marked.parse(options.trustSignalContent, { async: false }) as string,
      colorPalette as any,
    );
    const tldrHeadingMatch = finalHtml.match(/<h2[^>]*>[\s\S]*?TL;?DR[\s\S]*?<\/h2>/i);
    if (tldrHeadingMatch) {
      const insertPoint = finalHtml.indexOf(tldrHeadingMatch[0]);
      finalHtml = finalHtml.slice(0, insertPoint) + trustHtml + finalHtml.slice(insertPoint);
    } else {
      // Fallback: prepend at the very top (after H1 if present)
      const h1Match = finalHtml.match(/<h1[^>]*>[\s\S]*?<\/h1>/i);
      if (h1Match) {
        const after = finalHtml.indexOf(h1Match[0]) + h1Match[0].length;
        finalHtml = finalHtml.slice(0, after) + trustHtml + finalHtml.slice(after);
      } else {
        finalHtml = trustHtml + finalHtml;
      }
    }
  }

  return finalHtml;
}
