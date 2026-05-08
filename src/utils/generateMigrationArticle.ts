import { supabase } from "@/integrations/supabase/client";
import { markdownToStyledHtml } from "@/utils/markdownToStyledHtml";
import { generateCTAHtml } from "@/components/CTABanner";
import type { ColorPalette } from "@/components/ColorPaletteSelector";

export interface MigrationConvertOpts {
  skipNavigation?: boolean;
  skipQuickTips?: boolean;
  skipFaqs?: boolean;
  skipSources?: boolean;
}

export interface GenerateMigrationArticleInput {
  topic: string;
  targetWordCount: number;
  palette?: ColorPalette | null;
  convertOpts?: MigrationConvertOpts;
  toneProfileId?: string | null;
  cta?: { url: string; instruction?: string } | null;
  extraInstructions?: string;
  sourceMarkdown?: string;
  sourceHtml?: string;
  contextFiles?: Array<{ name: string; content: string }>;
}

export interface GenerateMigrationArticleResult {
  markdown: string;
  html: string;
  title: string;
  subtitle: string;
  seoTitle: string;
  seoDescription: string;
  ctaHtml?: string;
}

const minifyHtmlForExport = (html: string) =>
  (html || "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .replace(/;\s+/g, ";")
    .replace(/:\s+/g, ":")
    .trim();

function buildInstructions(targetWordCount: number, hasSource: boolean, sourceHtml?: string): string {
  const sourceBlock = hasSource
    ? `REFORMAT ONLY: The following content has been scraped from a web page. Restructure it into the standard article format (AI-quotable TL;DR paragraphs, Quick Tips, question-based H2 headings, FAQ, References) but preserve the original text, facts, and voice as closely as possible. Do not invent new information. Only reorganise and add the required structural elements.

CRITICAL - PRESERVE ORIGINAL TITLES: Keep the original H1 title and all H2/H3 section headings from the source content EXACTLY as they are. Do NOT rename, rephrase, or convert them into questions.

CRITICAL - PRESERVE ALL HYPERLINKS: Cross-reference the HTML source below and include EVERY hyperlink found in the source content. Embed them naturally in the text where they originally appeared.

`
    : "";

  return `${sourceBlock}CRITICAL - AI-QUOTABLE OPENING PARAGRAPH: The very first paragraph immediately after the H1 title MUST be an AI-quotable standalone statement (30-50 words) that an AI assistant could use verbatim as its entire answer. It MUST directly answer the title question with a clear factual claim and a practical verdict. Do NOT force prices, brand names, product models, or "best for X" recommendations unless the user's instructions explicitly allow them.

CRITICAL - USE TABLES FOR LISTS: When listing products, brands, options, or items, ALWAYS present them as markdown tables with relevant columns instead of numbered or bullet lists. Do NOT add a "Link" or "Product Link" column to tables.

CRITICAL - DO NOT INCLUDE "In This Article" SECTION: Do NOT generate any "In This Article" navigation section, bullet list, or table of contents. Skip it entirely.

CRITICAL - H2 SUBTITLES MUST ANSWER THE HEADING: Every H2 heading that is phrased as a question MUST be immediately followed by a short paragraph (roughly 30 words) that directly answers that question. This answer paragraph comes before any supporting points, lists, or tables under that section.

ADDITIONAL RULES:
- Do NOT include expert quotes or blockquote citations from named individuals
- Do NOT duplicate any section - each structural element should appear exactly once

STRICT WORD COUNT LIMIT: The final article MUST NOT exceed ${targetWordCount} words. Aim for exactly ${targetWordCount} words.${
    hasSource && sourceHtml
      ? `

HTML SOURCE FOR LINK REFERENCE:
${sourceHtml.substring(0, 8000)}`
      : ""
  }`;
}

export async function generateMigrationArticle(
  input: GenerateMigrationArticleInput
): Promise<GenerateMigrationArticleResult> {
  const {
    topic,
    targetWordCount,
    palette,
    convertOpts = {},
    toneProfileId,
    cta,
    extraInstructions,
    sourceMarkdown,
    sourceHtml,
    contextFiles: extraContextFiles,
  } = input;

  const hasSource = !!(sourceMarkdown && sourceMarkdown.trim());
  const hasCtaUrl = !!(cta?.url && cta.url.trim().length > 0);
  const ctaInstructions =
    hasCtaUrl && cta?.instruction?.trim() ? `\n\nCTA INSTRUCTIONS: ${cta.instruction.trim()}` : "";
  const extras = extraInstructions ? `\n\n${extraInstructions}` : "";

  const length =
    targetWordCount <= 500 ? "short" : targetWordCount <= 1200 ? "medium" : "long";

  const { data: contentData, error: contentError } = await supabase.functions.invoke(
    "generate-content",
    {
      body: {
        topic,
        length,
        wordCount: targetWordCount,
        instructions: buildInstructions(targetWordCount, hasSource, sourceHtml) + ctaInstructions + extras,
        contextFiles: (() => {
          const files: Array<{ name: string; content: string }> = [];
          if (hasSource) files.push({ name: "source-content", content: sourceMarkdown!.substring(0, 12000) });
          if (Array.isArray(extraContextFiles)) {
            for (const f of extraContextFiles) {
              if (f?.content?.trim()) files.push({ name: f.name || "context", content: f.content.substring(0, 12000) });
            }
          }
          return files.length ? files : undefined;
        })(),
        toneProfileId: toneProfileId || undefined,
        skipFaqs: convertOpts.skipFaqs,
        skipQuickTips: convertOpts.skipQuickTips,
        skipSources: convertOpts.skipSources,
        migrationMode: true,
        generateCTAs: hasCtaUrl,
        ctaUrl: hasCtaUrl ? cta!.url.trim() : undefined,
      },
    }
  );
  if (contentError) throw new Error(`Content generation failed: ${contentError.message}`);

  let markdown: string = contentData?.content || contentData?.generatedContent || "";
  if (!markdown.trim()) throw new Error("No content returned from generation");

  // Strip wrapping quotes the model occasionally adds around the whole article
  markdown = markdown.trim();
  if ((markdown.startsWith('"') && markdown.endsWith('"')) || (markdown.startsWith("'") && markdown.endsWith("'"))) {
    markdown = markdown.slice(1, -1).trim();
  }
  markdown = markdown
    .split("\n")
    .filter((l) => l.trim() !== '"' && l.trim() !== "'")
    .join("\n");

  // Extract metadata
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  const title = h1Match ? h1Match[1].trim() : topic;
  const firstParagraphMatch = markdown.match(/^(?!#)(?!>)(?!\|)(?!-)(.{20,})/m);
  const subtitle = firstParagraphMatch ? firstParagraphMatch[1].trim() : "";
  const seoTitle = title.length > 60 ? title.substring(0, 57) + "..." : title;
  const seoDescription =
    subtitle.length > 160 ? subtitle.substring(0, 157) + "..." : subtitle;

  // Rewrite intro so it doesn't duplicate the subtitle (best-effort)
  if (subtitle) {
    try {
      const { data: rewriteData, error: rewriteError } = await supabase.functions.invoke(
        "rewrite-intro",
        { body: { title, subtitle, instructions: extraInstructions || "" } }
      );
      if (!rewriteError && rewriteData?.intro && rewriteData.intro.length > 20) {
        const newIntro = rewriteData.intro.trim();
        const lines = markdown.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const t = lines[i];
          if (
            t.startsWith("#") ||
            t.startsWith(">") ||
            t.startsWith("|") ||
            t.startsWith("-") ||
            t.trim() === ""
          )
            continue;
          if (t.trim().length >= 20) {
            lines[i] = newIntro;
            markdown = lines.join("\n");
            break;
          }
        }
      }
    } catch {
      // non-fatal
    }
  }

  // Convert to styled HTML
  const styled = markdownToStyledHtml(markdown, palette || null, convertOpts);

  // Append CTA if produced
  let endCtaHtml = "";
  const ctas = (contentData as any)?.ctas;
  if (hasCtaUrl && ctas?.end) {
    endCtaHtml = generateCTAHtml(
      ctas.end.headline,
      ctas.end.description,
      ctas.end.buttonText,
      cta!.url.trim(),
      palette || null,
      ctas.end.tagline
    );
  }

  const html = minifyHtmlForExport(styled + endCtaHtml);

  return { markdown, html, title, subtitle, seoTitle, seoDescription };
}
