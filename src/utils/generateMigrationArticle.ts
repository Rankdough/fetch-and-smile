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

  return `${sourceBlock}RULE 1 - MANDATORY DATA TABLE (NON-NEGOTIABLE): Every article MUST contain at least one markdown table with a minimum of 4 data rows (not counting the header row). The table must contain real, specific data relevant to the topic — numbers, sizes, ages, measurements, comparisons, or named options. Generic placeholder rows like "Entry-level / Lower cost / Basic use" are banned. Count your rows before finishing — 3 rows fails, 4 rows passes. If the topic involves age ranges, sizes, or options, the table must show those specific values. Example for glove sizing: columns Age | Glove Size | Position | Key Feature with real values in every cell.

RULE 2 - DIRECT ANSWER OPENING (NON-NEGOTIABLE): The very first paragraph after the H1 MUST directly answer the title question in 30-50 words. It MUST contain at least one specific number, measurement, distance, percentage, or named fact IN THE FIRST SENTENCE. Do NOT use qualitative-only statements in the opening. Do NOT start with broad context or general statements about importance. The opening must be citable as a standalone answer.
Bad examples (BANNED):
- "A field goal in basketball is a shot made during regular play. It counts for two or three points." — no specific data in first sentence
- "Understanding field goals is key to following basketball strategy." — filler, zero information
- "Choosing the right glove depends on several factors." — qualitative deflection
Good examples:
- "A field goal in basketball is any basket scored during live play, worth 2 points inside the arc (22 feet in the NBA) or 3 points beyond it. Free throws are excluded regardless of distance."
- "Seven-year-old softball players need a glove between 10.5 and 11 inches. Above 11.5 slows pocket development. Measure from heel of palm to index fingertip to confirm fit."

RULE 3 - NUMERIC DENSITY PER SECTION: Every H2 section must contain at least one specific number, measurement, percentage, age, price range, or named criterion in the first two sentences. Do not write qualitative-only paragraphs. Bad: "Hand size is an important factor." Good: "Hand size determines glove fit — children aged 7-8 typically measure 5-6 inches from palm heel to fingertip."

RULE 4 - DIRECT ANSWER UNDER EVERY H2: Every H2 heading phrased as a question MUST be immediately followed by a direct answer sentence that answers the question specifically. This comes before any supporting bullets or tables. The answer must name a specific fact, number, or criterion — not describe what will be covered.

RULE 5 - NO EM DASHES: NEVER use em dashes (—) or en dashes (–) anywhere. Use a comma, colon, or start a new sentence instead.

RULE 6 - NO "IN THIS ARTICLE" SECTION: Do not generate any navigation section, table of contents, or "In This Article" list. Skip entirely.

RULE 7 - NO DUPLICATE SECTIONS: Each structural element appears exactly once. No expert quotes or blockquote citations from named individuals.

STRICT WORD COUNT RANGE (NON-NEGOTIABLE): The final article body MUST be between ${Math.round(targetWordCount * 0.8)} and ${Math.round(targetWordCount * 1.2)} words, targeting ${targetWordCount} words. Going BELOW ${Math.round(targetWordCount * 0.8)} words is just as much a failure as going over the upper limit. If you finish all planned sections before reaching ${Math.round(targetWordCount * 0.8)} words, expand existing sections with concrete detail, examples, and direct answers — do NOT stop short. Count your words as you write.${
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

  // Strip em dashes — model sometimes ignores the no-em-dash instruction
  markdown = markdown.replace(/—/g, ",").replace(/ – /g, ", ");

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
  if (hasCtaUrl) {
    if (ctas?.end) {
      // Use AI-generated CTA copy when available
      endCtaHtml = generateCTAHtml(
        ctas.end.headline,
        ctas.end.description,
        ctas.end.buttonText,
        cta!.url.trim(),
        palette || null,
        ctas.end.tagline
      );
    } else {
      // Fallback: build CTA directly from URL and instruction — no AI dependency
      // Derive button text from the URL slug
      const urlSlug = cta!.url.trim().split("/").filter(Boolean).pop() || "products";
      const buttonText = "SHOP " + urlSlug.replace(/-/g, " ").toUpperCase() + " →";
      const headline = (cta?.instruction?.trim() || urlSlug.replace(/-/g, " ")).toUpperCase();
      endCtaHtml = generateCTAHtml(
        headline,
        cta?.instruction?.trim() || "",
        buttonText,
        cta!.url.trim(),
        palette || null,
        undefined
      );
    }
  }

  const html = minifyHtmlForExport(styled + endCtaHtml);

  return { markdown, html, title, subtitle, seoTitle, seoDescription, ctaHtml: endCtaHtml ? minifyHtmlForExport(endCtaHtml) : "" };
}
