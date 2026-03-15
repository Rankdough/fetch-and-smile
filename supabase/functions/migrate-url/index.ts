import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SkipOptions {
  skipNavigation?: boolean;
  skipQuickTips?: boolean;
  skipFaqs?: boolean;
  skipSources?: boolean;
}

/**
 * Build a prompt that tells the AI to generate MARKDOWN (not HTML).
 * The client-side will convert Markdown → styled HTML deterministically.
 */
function buildMarkdownPrompt(skip: SkipOptions = {}) {
  const sections: string[] = [];
  let sectionNum = 1;

  sections.push(`${sectionNum}. H1 TITLE
   # [Title from content]
   [Opening paragraph that introduces the article topic. CRITICAL: This paragraph MUST be COMPLETELY DIFFERENT from the subtitle. Do NOT repeat or rephrase the subtitle here. Instead, write a fresh introductory paragraph that sets up the article's scope, explains why the topic matters, or provides context — while still relating to the title question. Use different facts, angles, or framing than the subtitle.]`);
  sectionNum++;

  sections.push(`${sectionNum}. TL;DR SECTION
   ## TL;DR
   - Key takeaway 1
   - Key takeaway 2
   - Key takeaway 3
   - Key takeaway 4 (optional)`);
  sectionNum++;

  if (!skip.skipQuickTips) {
    sections.push(`${sectionNum}. QUICK TIPS (exactly 3 tips, each as its OWN SEPARATE blockquote with a blank line between them)
   
   > **Tip 1:** Actionable tip text (max 15 words)
   
   > **Tip 2:** Actionable tip text (max 15 words)
   
   > **Tip 3:** Actionable tip text (max 15 words)
   
   CRITICAL: Each tip MUST be a separate blockquote paragraph. Put a BLANK LINE between each > line so they render as 3 individual blocks, NOT one merged block.`);
    sectionNum++;
  }

  sections.push(`${sectionNum}. MAIN CONTENT SECTIONS
   Each H2 must be phrased as a question SPECIFIC TO THE ARTICLE TOPIC. Do NOT use generic placeholders like "What Does This Topic Mean?" — instead use the actual subject, e.g. "What Are Gluten-Free Advent Calendars?" or "How Much Does Composite Bonding Cost?"
   ## [Topic-specific question heading]
   Paragraph with direct answer...
   - Supporting point 1
   - Supporting point 2
   
   Include comparison tables where relevant using markdown table syntax:
   | Column 1 | Column 2 | Column 3 |
   |----------|----------|----------|
   | Data     | Data     | Data     |`);
  sectionNum++;

  if (!skip.skipFaqs) {
    sections.push(`${sectionNum}. FAQ SECTION (4-5 Q&A pairs)
   ## Frequently Asked Questions
   **Where can I find more information?**
   Answer text here in one paragraph.
   
   **What should I watch out for?**
   Answer text here in one paragraph.`);
    sectionNum++;
  }

  sections.push(`${sectionNum}. FINAL THOUGHTS
   ## Final Thoughts
   Concluding paragraph summarizing key advice.`);
  sectionNum++;

  if (!skip.skipSources) {
    sections.push(`${sectionNum}. REFERENCES
   ## References
   - [Source Name](https://url)
   - [Source Name](https://url)`);
  }

  const skipInstructions: string[] = [];
  if (skip.skipQuickTips) skipInstructions.push("- Do NOT include Quick Tips");
  if (skip.skipNavigation) skipInstructions.push('- Do NOT include "In This Article" navigation (the client will add it)');
  if (skip.skipFaqs) skipInstructions.push("- Do NOT include FAQ section");
  if (skip.skipSources) skipInstructions.push("- Do NOT include References section");

  return `You are an expert SEO content writer. Convert scraped content into well-structured MARKDOWN following this exact article structure.

ARTICLE STRUCTURE (in this exact order):

${sections.join("\n\n")}

${skipInstructions.length > 0 ? `\nSECTIONS TO SKIP:\n${skipInstructions.join("\n")}\n` : ""}
CRITICAL RULES:
- Output ONLY Markdown - no HTML tags, no inline styles, no CSS
- Every H2 must be phrased as a question
- Preserve ALL factual content from the source - do not invent information
- Preserve ALL hyperlinks from the source content using markdown link syntax [text](url)
- Do NOT include expert quotes or blockquote citations - no fabricated or real quotes from named individuals
- CRITICAL TABLE RULE: When listing products, brands, options, or items with descriptions/details, ALWAYS use a markdown table (| Name | Details |) instead of nested bullet lists. Any list of items that have a name + description/attribute pair MUST be formatted as a table. Minimum 2 columns and 4+ rows where possible. Do NOT add a "Link" or "Product Link" column - only include columns with actual content data.
- Use markdown tables for ALL comparison data, product lists, feature lists, and pros/cons
- Quick Tips MUST use the format: > **Tip N:** text (each tip as a SEPARATE blockquote with blank lines between)
- FAQ answers MUST be a single paragraph (no bullets)
- Do NOT add "In This Article" navigation - it will be generated automatically`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, type, colorPalette, skipNavigation, skipQuickTips, skipFaqs, skipSources } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Step 1: Scrape URL
    console.log("Step 1: Scraping", url);
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ["markdown", "html"],
        onlyMainContent: true,
      }),
    });

    const scrapeData = await scrapeResponse.json();
    if (!scrapeResponse.ok) {
      throw new Error(`Scrape failed: ${JSON.stringify(scrapeData.error || scrapeData)}`);
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
    const sourceHtml = scrapeData.data?.html || scrapeData.html || "";
    const pageTitle = scrapeData.data?.metadata?.title || scrapeData.metadata?.title || "";

    if (!markdown.trim() && !sourceHtml.trim()) {
      throw new Error("No content could be extracted from the URL");
    }

    console.log("Scraped", markdown.length, "chars markdown, title:", pageTitle);

    // Step 2: Generate MARKDOWN content + metadata (NOT HTML)
    console.log("Step 2: Generating Markdown content + metadata");

    const articlePrompt = buildMarkdownPrompt({ skipNavigation, skipQuickTips, skipFaqs, skipSources });

    const contentPrompt = `${articlePrompt}

Now convert this scraped content into the Markdown article format described above.

Return your response in this EXACT format (use these exact delimiters):

===TITLE===
[The page title - extract from H1 or generate from content]
===SUBTITLE===
[A 1-2 sentence factual subtitle that directly answers the title question, include a credible source reference in parentheses. IMPORTANT: The article's opening paragraph (first paragraph after H1 in CONTENT) must be COMPLETELY DIFFERENT text from this subtitle — different wording, different angle, different facts. Never duplicate the subtitle as the intro.]
===SEO_TITLE===
[SEO-optimized title under 60 characters]
===SEO_DESCRIPTION===
[SEO meta description under 160 characters, compelling and keyword-rich]
===CONTENT===
[The full Markdown content following the structure above. Remember: the first paragraph after the H1 must NOT repeat the subtitle text.]

Here is the scraped content:

${markdown.substring(0, 12000)}

Here is the original HTML (use to extract hyperlinks):

${sourceHtml.substring(0, 8000)}`;

    const contentResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You produce well-structured Markdown articles. Follow the structure exactly. Output ONLY Markdown, never HTML." },
          { role: "user", content: contentPrompt },
        ],
      }),
    });

    if (!contentResponse.ok) {
      if (contentResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (contentResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI content generation failed: ${contentResponse.status}`);
    }

    const contentData = await contentResponse.json();
    const fullResponse = contentData.choices?.[0]?.message?.content || "";

    // Parse the delimited response
    const parseField = (response: string, field: string, nextField?: string): string => {
      const startMarker = `===${field}===`;
      const startIdx = response.indexOf(startMarker);
      if (startIdx === -1) return "";
      const afterMarker = startIdx + startMarker.length;
      let endIdx = response.length;
      if (nextField) {
        const nextMarker = `===${nextField}===`;
        const nextIdx = response.indexOf(nextMarker, afterMarker);
        if (nextIdx !== -1) endIdx = nextIdx;
      }
      return response.substring(afterMarker, endIdx).trim();
    };

    const title = parseField(fullResponse, "TITLE", "SUBTITLE") || pageTitle;
    const subtitle = parseField(fullResponse, "SUBTITLE", "SEO_TITLE");
    const seoTitle = parseField(fullResponse, "SEO_TITLE", "SEO_DESCRIPTION");
    const seoDescription = parseField(fullResponse, "SEO_DESCRIPTION", "CONTENT");
    let content = parseField(fullResponse, "CONTENT");

    // Strip markdown code fences if present
    content = content.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    console.log("Generated markdown length:", content.length, "title:", title);

    // Step 3+4: Translate Markdown to NL and DE in parallel
    // Translating Markdown is simpler and more reliable than translating HTML
    console.log("Step 3+4: Translating Markdown to NL and DE in parallel");
    const [nlResult, deResult] = await Promise.all([
      translateContent(LOVABLE_API_KEY, { title, subtitle, seoTitle, seoDescription, content }, "Dutch (NL)"),
      translateContent(LOVABLE_API_KEY, { title, subtitle, seoTitle, seoDescription, content }, "German (DE)"),
    ]);

    console.log("All steps complete for", url);

    return new Response(
      JSON.stringify({
        url: formattedUrl,
        type: type || "",
        title,
        subtitle,
        seoTitle,
        seoDescription,
        content,
        titleNL: nlResult.title,
        subtitleNL: nlResult.subtitle,
        seoTitleNL: nlResult.seoTitle,
        seoDescriptionNL: nlResult.seoDescription,
        contentNL: nlResult.content,
        titleDE: deResult.title,
        subtitleDE: deResult.subtitle,
        seoTitleDE: deResult.seoTitle,
        seoDescriptionDE: deResult.seoDescription,
        contentDE: deResult.content,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Migration error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process URL";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function translateContent(
  apiKey: string,
  fields: { title: string; subtitle: string; seoTitle: string; seoDescription: string; content: string },
  language: string
): Promise<{ title: string; subtitle: string; seoTitle: string; seoDescription: string; content: string }> {
  const prompt = `Translate ALL of the following fields into ${language}. 
For the CONTENT field, this is Markdown. Translate ONLY the visible text. Keep all Markdown formatting (##, **, >, -, |, [text](url)) exactly as is. Do NOT change URLs.

Return your response using these EXACT delimiters:

===TITLE===
${fields.title}
===SUBTITLE===
${fields.subtitle}
===SEO_TITLE===
${fields.seoTitle}
===SEO_DESCRIPTION===
${fields.seoDescription}
===CONTENT===
${fields.content}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: `You are a professional translator. Translate to ${language}. For Markdown content, translate ONLY visible text while preserving all Markdown formatting, links, and structure exactly.` },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    console.error(`Translation to ${language} failed:`, response.status);
    return { title: "", subtitle: "", seoTitle: "", seoDescription: "", content: "" };
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";

  const parseField = (resp: string, field: string, nextField?: string): string => {
    const startMarker = `===${field}===`;
    const startIdx = resp.indexOf(startMarker);
    if (startIdx === -1) return "";
    const afterMarker = startIdx + startMarker.length;
    let endIdx = resp.length;
    if (nextField) {
      const nextMarker = `===${nextField}===`;
      const nextIdx = resp.indexOf(nextMarker, afterMarker);
      if (nextIdx !== -1) endIdx = nextIdx;
    }
    return resp.substring(afterMarker, endIdx).trim();
  };

  let translatedContent = parseField(text, "CONTENT");
  translatedContent = translatedContent.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  return {
    title: parseField(text, "TITLE", "SUBTITLE"),
    subtitle: parseField(text, "SUBTITLE", "SEO_TITLE"),
    seoTitle: parseField(text, "SEO_TITLE", "SEO_DESCRIPTION"),
    seoDescription: parseField(text, "SEO_DESCRIPTION", "CONTENT"),
    content: translatedContent,
  };
}
