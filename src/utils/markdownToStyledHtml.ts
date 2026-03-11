import { marked } from "marked";
import { extractNavigationFromContent, generateNavigationHtml } from "@/components/ArticleNavigationPanel";
import { extractFAQFromContent, removeFAQSection, generateFAQHtml } from "@/components/FAQAccordion";

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
  const faqItems = options.skipFaqs ? [] : extractFAQFromContent(markdown);

  // Remove FAQ section from markdown so it doesn't appear twice
  let cleanMarkdown = faqItems.length > 0 ? removeFAQSection(markdown) : markdown;

  // 2. Convert Markdown → basic HTML
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
      h.setAttribute("style", `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 12px 16px; margin: 24px 0 0 0; border-radius: 0 8px 0 0;`);
      const nextSibling = h.nextElementSibling;
      if (nextSibling && nextSibling.tagName === "UL") {
        nextSibling.setAttribute("style", `background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${primaryColor}; padding: 16px 24px 16px 40px; margin: 0 0 24px 0; border-radius: 0 0 8px 0; list-style-type: disc;`);
        nextSibling.querySelectorAll("li").forEach((li) => {
          li.setAttribute("style", `margin: 8px 0; line-height: 1.6; color: ${panelText};`);
        });
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
  container.querySelectorAll("li").forEach((li) => {
    if (!li.getAttribute("style")) {
      li.setAttribute("style", `margin: 8px 0; line-height: 1.6; color: ${bodyText};`);
    }
    li.removeAttribute("class");
  });

  // Style blockquotes - detect Quick Tips vs regular
  let tipIndex = 0;
  container.querySelectorAll("blockquote").forEach((bq) => {
    const firstStrong = bq.querySelector("strong");
    const isQuickTip = firstStrong && /^Tip \d+:?/i.test(firstStrong.textContent || "");

    if (isQuickTip) {
      tipIndex++;
      if (firstStrong) firstStrong.remove();

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
    table.setAttribute("style", `min-width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid ${tableBorder}; table-layout: auto;`);
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

  // Style links
  container.querySelectorAll("a").forEach((a) => {
    a.setAttribute("style", "color: #2563eb; text-decoration: underline;");
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    a.removeAttribute("class");
  });

  // Style strong/bold
  container.querySelectorAll("strong").forEach((s) => {
    s.removeAttribute("class");
  });

  // Remove all remaining class attributes
  container.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("class");
  });

  // 4. Get the cleaned HTML content
  let finalHtml = container.innerHTML;

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

  return finalHtml;
}
