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
    const { urls, topic } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Scraping URLs:", urls);

    // Scrape all URLs in parallel
    const scrapePromises = urls.filter((url: string) => url.trim()).map(async (url: string) => {
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }

      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: formattedUrl,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error(`Failed to scrape ${formattedUrl}:`, data);
        return { url: formattedUrl, content: null, error: data.error || "Failed to scrape" };
      }

      return {
        url: formattedUrl,
        content: data.data?.markdown || data.markdown || "",
        title: data.data?.metadata?.title || data.metadata?.title || formattedUrl,
      };
    });

    const scrapedResults = await Promise.all(scrapePromises);
    const successfulScrapes = scrapedResults.filter((r) => r.content);

    if (successfulScrapes.length === 0) {
      return new Response(
        JSON.stringify({ error: "Could not scrape any of the provided URLs" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze for gaps using AI
    const articlesContext = successfulScrapes
      .map((r, i) => `--- Article ${i + 1}: ${r.title} ---\n${r.content?.substring(0, 3000)}...`)
      .join("\n\n");

    const analysisPrompt = `Analyze these ${successfulScrapes.length} top-ranking articles about "${topic || 'the topic'}":

${articlesContext}

Provide a detailed gap analysis using EXACTLY this format:

## 1. Key Topics Missing or Under-Covered
- **Topic Name:** Brief description of what's missing and why it matters
- **Another Topic:** Description...

## 2. Unique Angles and Perspectives Missing
- **Angle Name:** Brief description of the missing perspective
- **Another Angle:** Description...

## 3. Outdated or Improvable Information
- **Claim or Fact:** What's outdated and how it could be improved
- **Another Claim:** Description...

IMPORTANT: You MUST use the exact format above with numbered section headers (## 1. Title) and bullet points with bold titles (- **Title:** Description). Include 3-5 specific, actionable bullet points per section.`;

    console.log("Running gap analysis...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an SEO content strategist. Analyze competitor articles and identify content gaps." },
          { role: "user", content: analysisPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI analysis error:", aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const gapAnalysis = aiData.choices?.[0]?.message?.content;

    console.log("Gap analysis complete");

    return new Response(
      JSON.stringify({
        articles: successfulScrapes.map((r) => ({ url: r.url, title: r.title })),
        gapAnalysis,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Analysis error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to analyze URLs";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
