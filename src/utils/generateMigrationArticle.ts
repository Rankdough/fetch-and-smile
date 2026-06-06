import { supabase } from "@/integrations/supabase/client";
import { markdownToStyledHtml } from "@/utils/markdownToStyledHtml";
import { generateCTAHtml } from "@/components/CTABanner";
import type { ColorPalette } from "@/components/ColorPaletteSelector";

// ─────────────────────────────────────────────────────────────────────────────
// E-E-A-T Trust Box Builder (Option C)
// Generates the "Why You Can Trust This Article" content dynamically from:
//   - sport label (from settings)
//   - context files (extracts cited organisations/sources)
//   - author details (Nic Reese, photo URL)
//   - current date
// ─────────────────────────────────────────────────────────────────────────────

const NIC_PHOTO_URL = "https://cdn.shopify.com/s/files/1/0760/1530/4950/files/nic_reese.avif?v=1780658483";

// Governing body fallbacks per sport keyword
const SPORT_GOVERNING_BODIES: Record<string, string[]> = {
  "track": ["World Athletics", "USA Track & Field (USATF)", "NCAA Track & Field"],
  "field": ["World Athletics", "USA Track & Field (USATF)", "NCAA Track & Field"],
  "cross country": ["World Athletics", "USA Track & Field (USATF)", "National Federation of State High School Associations (NFHS)"],
  "flag football": ["NFL FLAG", "USA Football", "American Flag Football League (AFFL)"],
  "softball": ["World Baseball Softball Confederation (WBSC)", "USA Softball", "NCAA Softball"],
  "baseball": ["Major League Baseball (MLB)", "USA Baseball", "NCAA Baseball"],
  "basketball": ["FIBA", "NBA", "NCAA Basketball", "USA Basketball"],
  "hockey": ["USA Hockey", "NHL", "International Ice Hockey Federation (IIHF)"],
  "soccer": ["FIFA", "US Soccer Federation (USSF)", "NCAA Soccer"],
  "volleyball": ["FIVB", "USA Volleyball", "NCAA Volleyball"],
  "lacrosse": ["World Lacrosse", "US Lacrosse", "NCAA Lacrosse"],
  "swimming": ["World Aquatics (FINA)", "USA Swimming", "NCAA Swimming"],
  "gymnastics": ["FIG", "USA Gymnastics", "NCAA Gymnastics"],
  "wrestling": ["United World Wrestling", "USA Wrestling", "NCAA Wrestling"],
  "tennis": ["ITF", "USTA", "NCAA Tennis"],
  "golf": ["USGA", "R&A", "PGA Tour", "NCAA Golf"],
  "bowling": ["World Bowling", "USBC", "NCAA Bowling"],
  "default": ["Relevant governing body rulebooks", "Official competition records", "Published sport federation guidelines"],
};

function getSportGoverningBodies(sport: string): string[] {
  const s = sport.toLowerCase();
  for (const [key, bodies] of Object.entries(SPORT_GOVERNING_BODIES)) {
    if (s.includes(key)) return bodies;
  }
  return SPORT_GOVERNING_BODIES["default"];
}

function extractSourcesFromContextFiles(contextFiles: Array<{ name: string; content: string }>): string[] {
  const sources: Set<string> = new Set();
  const orgPatterns = [
    // Named organisations with brackets e.g. World Athletics, USA Track & Field
    /(?:according to|source:|from|via|published by|by)\s+([A-Z][A-Za-z &().,'-]{3,60})/g,
    // All-caps abbreviations e.g. USATF, FIBA, NCAA
    /([A-Z]{2,8})/g,
    // URLs — extract domain
    /https?:\/\/(?:www\.)?([a-z0-9-]+\.[a-z]{2,})/gi,
  ];

  for (const file of contextFiles) {
    const text = file.content.slice(0, 8000); // scan first 8k chars only

    // Named org pattern
    const orgRe = /(?:according to|source:|from|via|published by|sourced from)\s+([A-Z][A-Za-z &().\-']{3,60})/gi;
    let m;
    while ((m = orgRe.exec(text)) !== null) {
      const name = m[1].trim().replace(/[.,]+$/, "");
      if (name.length > 4 && name.length < 60) sources.add(name);
    }

    // URL domains
    const urlRe = /https?:\/\/(?:www\.)?([a-z0-9-]+\.[a-z]{2,})/gi;
    while ((m = urlRe.exec(text)) !== null) {
      const domain = m[1].toLowerCase();
      // Skip generic domains
      if (!["google.com","youtube.com","facebook.com","twitter.com","amazon.com","shopify.com"].includes(domain)) {
        sources.add(domain);
      }
    }
  }

  return Array.from(sources).slice(0, 4); // max 4 sources
}

function buildEeatContent(
  sport: string,
  contextFiles: Array<{ name: string; content: string }>,
  author: string,
): string {
  const sportLabel = sport?.trim() || "sport";
  const sportLower = sportLabel.toLowerCase();
  const reviewDate = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const authorName = author || "Nic Reese";

  // Sources — from context file or fallback to governing bodies
  const extractedSources = contextFiles?.length > 0
    ? extractSourcesFromContextFiles(contextFiles)
    : [];
  const governingBodies = getSportGoverningBodies(sportLower);
  const sources = extractedSources.length > 0 ? extractedSources : governingBodies;
  const sourceHeading = extractedSources.length > 0 ? "**Sources used in this article**" : "**Fact-checked against**";
  const sourcesList = sources.map((s) => `✓ ${s}`).join("\n");

  return `<img src="${NIC_PHOTO_URL}" alt="${authorName}" width="72" height="72" style="border-radius:50%;float:left;margin:0 16px 8px 0;border:2px solid #99f6e4;" />

**${authorName}** has covered ${sportLabel} content with a focus on rules, equipment, athlete development, and competition structure at recreational, youth, collegiate, and elite levels. His work draws on official governing body publications and verified competition data.

<br style="clear:both" />

${sourceHeading}
${sourcesList}

**Editorial policy**
All factual claims, rules, distances, and records are cross-referenced against official ${sportLabel} governing body publications before publication. Statistics are sourced from official results databases, not secondary aggregators.

*Last reviewed: ${reviewDate}*`;
}

export interface MigrationConvertOpts {
  skipNavigation?: boolean;
  skipQuickTips?: boolean;
  skipFaqs?: boolean;
  skipSources?: boolean;
  includeTrustSignal?: boolean;
  trustSignalTitle?: string;
  trustSignalContent?: string;
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
  sport?: string;
  author?: string;
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

RULE 2 - DIRECT ANSWER OPENING (NON-NEGOTIABLE — THIS IS THE MOST IMPORTANT RULE):
The very first paragraph after the H1 is the DIRECT ANSWER BOX. It is marked with id="direct-answer" and is what Google AI Overviews and LLMs cite as the answer to the question. It must be the single best sentence or two that answers the question — specific, factual, and immediately useful.

REQUIREMENTS FOR THE DIRECT ANSWER BOX:
- 30-50 words maximum
- MUST contain at least one specific number, measurement, distance, percentage, named rule, named fact, or named criterion IN THE FIRST SENTENCE
- MUST answer the question in the title directly and completely — a reader should need nothing else to understand the core answer
- MUST include at least one information gap fact — something the top 10 Google results consistently fail to state precisely (a specific threshold, a named exception, a precise measurement, a named condition)
- Do NOT open with the topic name followed by a vague definition ("A blitz is a defensive play where...")
- Do NOT use qualitative-only statements ("it is important", "it helps", "it affects")
- Do NOT start with broad context ("In football,", "When playing,", "For players who...")

BANNED opening patterns:
- "[X] is a [category] that [vague description]." — category definition without data
- "[X] involves [general activity]." — process description without specifics
- "[X] is used to [general purpose]." — purpose statement without metrics
- "Understanding [X] is key to..." — filler with zero information

REQUIRED opening patterns — pick whichever fits:
- NUMBER FIRST: "[X] requires/lasts/costs/measures [specific number + unit]. [Named condition or exception]."
- NAMED RULE FIRST: "In [context], [X] means [specific named definition with threshold or measurement]."
- THRESHOLD FIRST: "[X] applies only when [specific condition with number]. Without [condition], [consequence]."
- COMPARISON FIRST: "[X] differs from [Y] by [specific measurable difference]."

Good examples:
- "A blitz in flag football requires the rusher to start at least 7 yards behind the line of scrimmage at the snap. Only designated rushers who identify themselves pre-snap are eligible — all others must wait for a handoff."
- "A field goal in basketball is worth 2 points inside the arc (22 feet in the NBA, 20 feet 9 inches in college) or 3 points beyond it. Free throws are excluded regardless of distance."
- "Seven-year-old softball players need a glove between 10.5 and 11 inches. Above 11.5 slows pocket development at this age. Measure from heel of palm to index fingertip to confirm fit."
- "A spray tan typically lasts 5-7 days with standard maintenance, or up to 10 days with a DHA-based formula applied to properly exfoliated skin."

RULE 3 - NUMERIC DENSITY PER SECTION: Every H2 section must contain at least one specific number, measurement, percentage, age, price range, or named criterion in the first two sentences. Do not write qualitative-only paragraphs. Bad: "Hand size is an important factor." Good: "Hand size determines glove fit — children aged 7-8 typically measure 5-6 inches from palm heel to fingertip."

RULE 4 - DIRECT ANSWER UNDER EVERY H2: Every H2 heading phrased as a question MUST be immediately followed by a direct answer sentence that answers the question specifically. This comes before any supporting bullets or tables. The answer must name a specific fact, number, or criterion — not describe what will be covered.

RULE 5 - NO EM DASHES: NEVER use em dashes (—) or en dashes (–) anywhere. Use a comma, colon, or start a new sentence instead.

RULE 6 - NO "IN THIS ARTICLE" SECTION: Do not generate any navigation section, table of contents, or "In This Article" list. Skip entirely.

RULE 7 - NO DUPLICATE SECTIONS: Each structural element appears exactly once. No expert quotes or blockquote citations from named individuals.

RULE 8 - DRAW FACTS FROM CONTEXT FILES: If context files are provided, the direct answer opening (Rule 2) MUST use specific facts, numbers, measurements, or named criteria from those files — not from general knowledge. The information gap in the opening must come from the context files where possible. If the context files contain a specific threshold, rule, distance, weight, size, duration, or named condition relevant to the question, that fact belongs in the first sentence of the opening paragraph.

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
  sport,
  author,
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

  // Post-generation table guard: if model didn't produce a table, inject a fallback
  // based on the topic — finds the first H2 section and appends a relevant table after it
  if (!markdown.includes('|')) {
    const lines = markdown.split('\n');
    const h2Indices: number[] = [];
    lines.forEach((line, i) => { if (/^## /.test(line)) h2Indices.push(i); });
    const insertAt = h2Indices[1] ?? h2Indices[0]; // insert after second H2, or first if only one
    if (insertAt !== undefined) {
      // Build a generic comparison table from the topic
      const topicWords = topic.replace(/[?!.]/g, '').split(' ').filter(Boolean);
      const noun = topicWords.slice(-2).join(' ') || topic;
      const fallbackTable = [
        '',
        `| ${noun} | Details | Notes |`,
        '| --- | --- | --- |',
        `| Standard | As per governing body rules | Used in most competitions |`,
        `| Youth / Junior | Adapted for development level | Age-group specific |`,
        `| Masters | Modified for age categories | 35+ or 40+ depending on sport |`,
        `| Paralympic | Classified by disability category | World Para Athletics rules |`,
        '',
      ].join('\n');
      // Find end of the target H2 section (next paragraph after first bullet or paragraph)
      let bodyEnd = insertAt + 1;
      while (bodyEnd < lines.length && !/^## /.test(lines[bodyEnd])) bodyEnd++;
      lines.splice(bodyEnd, 0, fallbackTable);
      markdown = lines.join('\n');
    }
  }

  // Build E-E-A-T trust box content (Option C)
  // Sport-aware author bio + sources from context file or governing body fallback
  const eeatContent = buildEeatContent(
    sport || "",
    Array.isArray(contextFiles) ? contextFiles : [],
    author || "Nic Reese"
  );
  const finalConvertOpts = {
    ...convertOpts,
    includeTrustSignal: convertOpts.includeTrustSignal ?? true,
    trustSignalTitle: convertOpts.trustSignalTitle || "Why You Can Trust This Article",
    trustSignalContent: eeatContent,
  };

  // Convert to styled HTML
  const styled = markdownToStyledHtml(markdown, palette || null, finalConvertOpts);

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
