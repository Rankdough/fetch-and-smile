import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, type } = await req.json();

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

    // Step 2: Generate HTML content + metadata in English
    console.log("Step 2: Generating content + metadata");

    const contentPrompt = `You are given scraped content from a webpage. You must do TWO things:

TASK 1 - GENERATE STYLED HTML CONTENT:
Convert the scraped content into styled HTML using this EXACT article format structure:
1. H1 title
2. Intro paragraph
3. TL;DR section (purple background #f8f4ff, red left border #E31837)
4. Quick Tips section (3 tips with numbered circular icons)
5. "In This Article" navigation box with anchor links
6. Main content with question-based H2 headings, each with id attributes for navigation
7. FAQ section (4-5 Q&A pairs)
8. References section

CRITICAL STYLING RULES:
- ALL styles must be inline CSS on every element
- Use the exact TL;DR styling: background: #f8f4ff; border-left: 4px solid #E31837
- H2 headings: background: #f8f4ff; border-left: 4px solid #E31837; padding: 12px 16px
- Quick Tips icons: display:inline-flex; width:28px; height:28px; background:#E31837; color:white; border-radius:50%; align-items:center; justify-content:center
- Tables: border-collapse, alternating row colors, full width
- Links styled with color:#E31837
- Do NOT add font-size or font-weight to H tags
- Preserve ALL factual content from the source - do not invent new information
- max-width container not needed, content will be placed inside a CMS

TASK 2 - GENERATE METADATA:
Also generate these fields based on the content.

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
[The full styled HTML content]

Here is the scraped content:

${markdown.substring(0, 12000)}`;

    const contentResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an expert SEO content formatter. You produce CMS-ready styled HTML." },
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

    console.log("Generated content length:", content.length, "title:", title);

    // Step 3: Translate to NL
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
CRITICAL: For the CONTENT field, translate ONLY the visible text inside HTML tags. Keep ALL HTML tags, attributes, inline styles, IDs, and structure EXACTLY as they are. Only the human-readable text should be translated.

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
        { role: "system", content: `You are a professional translator. Translate to ${language}. For HTML content, translate ONLY visible text, preserving all HTML markup and inline styles exactly.` },
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
