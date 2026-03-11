import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ColorPalette {
  id: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

interface SkipOptions {
  skipNavigation?: boolean;
  skipQuickTips?: boolean;
  skipFaqs?: boolean;
  skipSources?: boolean;
}

/**
 * Post-process HTML: extract all inline style="" attributes into a <style> block with CSS classes.
 * This is needed because Shopify strips inline styles from blog post HTML.
 */
function convertInlineStylesToClasses(html: string): string {
  const styleMap = new Map<string, string>(); // style value -> class name
  let classCounter = 0;

  // Replace all style="..." with class="sN" and collect unique styles
  // Also handles cases where element already has other attributes
  const converted = html.replace(/\sstyle="([^"]*)"/g, (_match, styleValue: string) => {
    const trimmed = styleValue.trim();
    if (!trimmed) return '';
    
    let className = styleMap.get(trimmed);
    if (!className) {
      className = `s${classCounter++}`;
      styleMap.set(trimmed, className);
    }
    return ` class="${className}"`;
  });
  
  // Handle single-quoted style attributes too: style='...'
  const converted2 = converted.replace(/\sstyle='([^']*)'/g, (_match, styleValue: string) => {
    const trimmed = styleValue.trim();
    if (!trimmed) return '';
    
    let className = styleMap.get(trimmed);
    if (!className) {
      className = `s${classCounter++}`;
      styleMap.set(trimmed, className);
    }
    return ` class="${className}"`;
  });

  if (styleMap.size === 0) return html;

  // Build the <style> block
  const rules: string[] = [];
  for (const [styleValue, className] of styleMap) {
    rules.push(`.${className}{${styleValue}}`);
  }
  
  // Add details marker hiding
  rules.push('details summary::-webkit-details-marker{display:none}');
  rules.push('details[open] summary svg{transform:rotate(180deg)}');

  const styleBlock = `<style>\n${rules.join('\n')}\n</style>\n\n`;
  
  // Remove any existing <style> tags from the content
  const cleanedContent = converted.replace(/<style>[\s\S]*?<\/style>/gi, '').trim();
  
  return styleBlock + cleanedContent;
}

function buildArticlePrompt(palette: ColorPalette | null, skip: SkipOptions = {}) {
  const p = palette?.primary || "#E31837";
  const isDark = palette?.id === "dark-transparent";
  const panelBg = isDark ? "rgba(255,255,255,0.06)" : "#f8f4ff";
  const panelText = isDark ? "#ffffff" : "#1f2937";
  const bodyText = isDark ? "#e5e7eb" : "#374151";
  const containerBg = isDark ? "rgba(255,255,255,0.06)" : "#f9fafb";
  const containerBorder = isDark ? "rgba(255,255,255,0.15)" : "#e5e7eb";
  const itemBg = isDark ? "rgba(255,255,255,0.04)" : "#ffffff";
  const itemBorder = isDark ? "rgba(255,255,255,0.12)" : "#e5e7eb";
  const mutedText = isDark ? "rgba(255,255,255,0.5)" : "#9ca3af";
  const descText = isDark ? "rgba(255,255,255,0.6)" : "#6b7280";
  const tableBorder = isDark ? "rgba(255,255,255,0.2)" : "#e5e7eb";
  const tableRowOdd = isDark ? "rgba(255,255,255,0.04)" : "#f9fafb";
  const tableRowEven = isDark ? "rgba(255,255,255,0.08)" : "#ffffff";
  const tableHeaderText = isDark ? "#000000" : "#ffffff";
  const sec = palette?.secondary || p;

  // Build sections list dynamically based on skip options
  let sectionNum = 1;
  const sections: string[] = [];

  // 1. Always include H1 + intro
  sections.push(`${sectionNum}. H1 TITLE
   <h1 style="margin: 0 0 16px 0;">[Title from content]</h1>
   <p style="margin: 0 0 16px 0; line-height: 1.7; color: ${bodyText};">[Intro paragraph summarizing the article]</p>`);
  sectionNum++;

  // 2. Always include TL;DR
  sections.push(`${sectionNum}. TL;DR SECTION
   <h2 style="background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${p}; padding: 12px 16px; margin: 24px 0 0 0; border-radius: 0 8px 0 0;">TL;DR</h2>
   <ul style="background: ${panelBg}; color: ${panelText}; border-left: 4px solid ${p}; padding: 16px 24px 16px 40px; margin: 0 0 24px 0; border-radius: 0 0 8px 0; list-style-type: disc;">
     <li style="margin: 8px 0; line-height: 1.6; color: ${panelText};">Key takeaway 1</li>
     <li style="margin: 8px 0; line-height: 1.6; color: ${panelText};">Key takeaway 2</li>
     <li style="margin: 8px 0; line-height: 1.6; color: ${panelText};">Key takeaway 3</li>
   </ul>`);
  sectionNum++;

  // Quick Tips
  if (!skip.skipQuickTips) {
    sections.push(`${sectionNum}. QUICK TIPS (3 tips with numbered circular icons)
   For each tip:
   <blockquote style="display: flex; align-items: center; background: ${isDark ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${p}10 0%, ${p}20 100%)`}; border: 1px solid ${isDark ? 'rgba(255,255,255,0.12)' : `${p}33`}; border-radius: 12px; padding: 16px 20px; margin: 12px 0; font-style: normal;">
     <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: ${p}; border-radius: 50%; color: white; font-weight: 700; font-size: 14px; margin-right: 12px; flex-shrink: 0;">1</span>
     <span style="flex: 1; color: ${bodyText};">Tip text here</span>
   </blockquote>`);
    sectionNum++;
  }

  // Navigation
  if (!skip.skipNavigation) {
    sections.push(`${sectionNum}. "IN THIS ARTICLE" NAVIGATION
   Use <details> elements inside a container:
   <div style="border-radius: 8px; border: 1px solid ${containerBorder}; background: ${containerBg}; padding: 16px; margin: 24px 0; color: ${panelText};">
     <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 500;">In This Article</h4>
     <p style="font-size: 12px; color: ${mutedText}; margin: 0 0 12px 0;">Quick navigation to each section:</p>
     For FIRST item (highlighted):
     <details style="margin: 8px 0; border: 1px solid ${p}; border-radius: 8px; background: ${p}; color: white;">
       <summary style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; list-style: none; font-weight: 600; font-size: 14px; color: white;">
         <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.2); color: white; font-size: 12px; font-weight: 700;">1</span>
         <span style="flex: 1;">Section Title ⭐</span>
       </summary>
     </details>
     For OTHER items:
     <details style="margin: 8px 0; border: 1px solid ${itemBorder}; border-radius: 8px; background: ${itemBg};">
       <summary style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; list-style: none; font-weight: 600; font-size: 14px; color: ${panelText};">
         <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: ${p}15; color: ${p}; font-size: 12px; font-weight: 700; border: 1px solid ${p}30;">2</span>
         <span style="flex: 1;">Section Title</span>
       </summary>
     </details>
   </div>`);
    sectionNum++;
  }

  // Main content sections (always)
  sections.push(`${sectionNum}. MAIN CONTENT SECTIONS
   Each H2 should be a question with an id attribute for navigation:
   <h2 id="section-slug" style="margin: 32px 0 16px 0;">Question-based heading?</h2>
   <p style="margin: 0 0 16px 0; line-height: 1.7; color: ${bodyText};">Paragraph text...</p>`);
  sectionNum++;

  // Tables (always)
  sections.push(`${sectionNum}. TABLES (if content has comparisons)
   <div style="width: 100%; overflow-x: auto; margin: 24px 0;">
     <table style="min-width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid ${tableBorder}; table-layout: auto;">
       <thead style="background: linear-gradient(135deg, ${p} 0%, ${sec} 100%);">
         <th style="padding: 12px 16px; text-align: left; color: ${tableHeaderText}; font-weight: 600; font-size: 14px; border: 1px solid ${tableBorder};">Header</th>
       </thead>
       <tbody>
         <tr style="background: ${tableRowOdd}; color: ${bodyText};"><td style="padding: 12px 16px; font-size: 14px; border: 1px solid ${tableBorder}; color: ${bodyText};">Cell</td></tr>
         <tr style="background: ${tableRowEven}; color: ${bodyText};"><td style="padding: 12px 16px; font-size: 14px; border: 1px solid ${tableBorder}; color: ${bodyText};">Cell</td></tr>
       </tbody>
     </table>
   </div>`);
  sectionNum++;

  // FAQ
  if (!skip.skipFaqs) {
    sections.push(`${sectionNum}. FAQ SECTION (4-5 Q&A pairs using <details>)
   <div style="border-radius: 8px; border: 1px solid ${containerBorder}; background: ${containerBg}; padding: 16px; margin: 24px 0;">
     <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px; color: ${panelText};">
       <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: ${p}; color: white; font-size: 12px; font-weight: 700;">?</span>
       Frequently Asked Questions
     </h4>
     <details style="margin: 8px 0; border: 1px solid ${itemBorder}; border-radius: 8px; background: ${itemBg};">
       <summary style="padding: 12px 16px; cursor: pointer; list-style: none; font-weight: 600; font-size: 14px; color: ${panelText};">Question?</summary>
       <div style="padding: 0 16px 12px 16px; color: ${descText}; font-size: 13px; line-height: 1.6;">Answer text.</div>
     </details>
   </div>`);
    sectionNum++;
  }

  // References
  if (!skip.skipSources) {
    sections.push(`${sectionNum}. REFERENCES SECTION
   <h2 style="margin: 32px 0 16px 0;">References</h2>
   <ul><li style="margin: 8px 0; line-height: 1.6; color: ${bodyText};"><a href="..." style="color: #2563eb; text-decoration: underline;" target="_blank" rel="noopener noreferrer">Source name</a></li></ul>`);
  }

  const skipInstructions: string[] = [];
  if (skip.skipQuickTips) skipInstructions.push("- Do NOT include a Quick Tips section");
  if (skip.skipNavigation) skipInstructions.push('- Do NOT include an "In This Article" navigation section');
  if (skip.skipFaqs) skipInstructions.push("- Do NOT include a FAQ / Frequently Asked Questions section");
  if (skip.skipSources) skipInstructions.push("- Do NOT include a References / Sources section");

  return `You are an expert SEO content formatter. Convert scraped content into CMS-ready styled HTML matching this EXACT article structure. ALL styles MUST be inline CSS on every element.

ARTICLE STRUCTURE (in this exact order):

${sections.join("\n\n")}

${skipInstructions.length > 0 ? `\nSECTIONS TO SKIP (do NOT generate these):\n${skipInstructions.join("\n")}\n` : ""}
CRITICAL RULES:
- ALL styles must be inline CSS on every element - no classes, no <style> tags (except for details marker)
- Do NOT add font-size or font-weight to H1/H2/H3 tags (let CMS inherit)
- Preserve ALL factual content from the source - do not invent information
- CRITICAL: Preserve ALL hyperlinks from the source content with original href URLs
- Links: style="color: #2563eb; text-decoration: underline;" with target="_blank"
- Do NOT include <html>, <head>, <body> wrapper tags
- Add this CSS at the very end: <style>details[open] summary svg{transform:rotate(180deg)}details summary::-webkit-details-marker{display:none}</style>`;
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

    console.log("Scraped", markdown.length, "chars markdown,", sourceHtml.length, "chars HTML, title:", pageTitle);

    // Step 2: Generate HTML content + metadata
    console.log("Step 2: Generating content + metadata");

    const articlePrompt = buildArticlePrompt(colorPalette || null, { skipNavigation, skipQuickTips, skipFaqs, skipSources });

    const contentPrompt = `${articlePrompt}

Now convert this scraped content into the article format described above.

Return your response in this EXACT format (use these exact delimiters):

===TITLE===
[The page title - extract from H1 or generate from content]
===SUBTITLE===
[A 1-2 sentence factual subtitle that summarizes the key takeaway, include a credible source reference in parentheses]
===SEO_TITLE===
[SEO-optimized title under 60 characters]
===SEO_DESCRIPTION===
[SEO meta description under 160 characters, compelling and keyword-rich]
===CONTENT===
[The full styled HTML content following the structure above]

Here is the scraped content in markdown:

${markdown.substring(0, 8000)}

Here is the original HTML (use this to extract all hyperlinks and preserve them):

${sourceHtml.substring(0, 15000)}`;

    const contentResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You produce CMS-ready styled HTML with inline CSS. Follow the structure exactly." },
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
    content = content.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    // CRITICAL: Convert inline styles to CSS classes for Shopify compatibility
    // Shopify strips inline style="" attributes, so we must use a <style> block
    content = convertInlineStylesToClasses(content);

    console.log("Generated content length:", content.length, "title:", title);

    // Step 3: Translate to NL (translate AFTER style conversion so classes are preserved)
    console.log("Step 3: Translating to NL");
    const nlResult = await translateContent(LOVABLE_API_KEY, {
      title, subtitle, seoTitle, seoDescription, content
    }, "Dutch (NL)");

    // Step 4: Translate to DE
    console.log("Step 4: Translating to DE");
    const deResult = await translateContent(LOVABLE_API_KEY, {
      title, subtitle, seoTitle, seoDescription, content
    }, "German (DE)");

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
CRITICAL: For the CONTENT field, translate ONLY the visible text inside HTML tags. Keep ALL HTML tags, attributes, CSS class names, IDs, <style> blocks, and structure EXACTLY as they are. Only the human-readable text should be translated. Do NOT modify any class="..." attributes or <style> content.

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
        { role: "system", content: `You are a professional translator. Translate to ${language}. For HTML content, translate ONLY visible text, preserving all HTML markup, CSS classes, <style> blocks, and structure exactly.` },
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
  translatedContent = translatedContent.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  return {
    title: parseField(text, "TITLE", "SUBTITLE"),
    subtitle: parseField(text, "SUBTITLE", "SEO_TITLE"),
    seoTitle: parseField(text, "SEO_TITLE", "SEO_DESCRIPTION"),
    seoDescription: parseField(text, "SEO_DESCRIPTION", "CONTENT"),
    content: translatedContent,
  };
}
