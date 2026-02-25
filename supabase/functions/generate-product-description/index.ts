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
    const { url, title, collection, productInfo, wordCount = 200 } = await req.json();

    if (!url && !title) {
      return new Response(
        JSON.stringify({ error: "At least a URL or title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Step 1: Scrape the product URL if provided
    let scrapedContent = "";
    if (url && FIRECRAWL_API_KEY) {
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }

      console.log("Scraping product URL:", formattedUrl);

      try {
        const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
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

        const scrapeData = await scrapeResponse.json();
        if (scrapeResponse.ok) {
          scrapedContent = (scrapeData.data?.markdown || scrapeData.markdown || "").substring(0, 4000);
          console.log("Product page scraped, content length:", scrapedContent.length);
        } else {
          console.warn("Failed to scrape product URL:", scrapeData.error);
        }
      } catch (e) {
        console.warn("Scrape error (non-fatal):", e);
      }
    }

    // Step 2: Generate description using AI
    const prompt = `You are an expert e-commerce product copywriter specialising in niche sporting goods and apparel.

PRODUCT DETAILS:
- Product Title: ${title || "Unknown product"}
- Collection/Category: ${collection || "Not specified"}
- Product Data from Spreadsheet: ${productInfo || "None provided"}

${scrapedContent ? `SCRAPED PRODUCT PAGE CONTENT (this is the actual live product page - study it carefully):
${scrapedContent}` : ""}

YOUR TASK:
Analyse the product page thoroughly. Pay close attention to:
1. What SPORT or ACTIVITY this product belongs to (e.g. bowling, softball, baseball) based on the collection "${collection || ""}" and page context
2. The DESIGN and THEME of this specific product - what makes "${title}" unique vs other products in the same collection
3. Any RELATED PRODUCTS, cross-sells, or collection references visible on the page - use these to understand the brand's niche and audience
4. The MATERIALS, FEATURES, and CONSTRUCTION details from both the page and the provided product data
5. The TARGET AUDIENCE - who buys this? League players, casual bowlers, teams, gift buyers?

WRITING REQUIREMENTS:
- Write EXACTLY ${wordCount} words (hard limit, count carefully)
- Write in a professional, engaging e-commerce tone that speaks to the sport's culture
- Weave in sport-specific terminology naturally (e.g. for bowling: lanes, strikes, frames, league night, tournament)
- Highlight what makes THIS specific design/product stand out
- Connect the product to the lifestyle and community around the sport
- Structure: Opening hook → What makes this product special → Features/benefits → Who it's for → Closing call-to-action
- Do NOT include the product title as a heading
- Do NOT use markdown formatting - output plain text only
- Do NOT include any headings, bullet points, or lists
- Write as flowing paragraphs only`;

    console.log("Generating product description, target words:", wordCount);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a product copywriter. Output only the description text, no titles or formatting." },
          { role: "user", content: prompt },
        ],
        max_tokens: Math.ceil(wordCount * 3),
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errorText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const description = aiData.choices?.[0]?.message?.content?.trim() || "";

    console.log("Description generated, word count:", description.split(/\s+/).length);

    return new Response(
      JSON.stringify({ description }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate product description error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate description";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
