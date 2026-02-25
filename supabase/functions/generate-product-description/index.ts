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
    const prompt = `You are an e-commerce product description writer. You write FACTUAL, no-nonsense descriptions for online shoppers who need to make a buying decision.

PRODUCT DETAILS:
- Product Title: ${title || "Unknown product"}
- Collection/Category: ${collection || "Not specified"}
- Product Data from Spreadsheet: ${productInfo || "None provided"}

${scrapedContent ? `SCRAPED PRODUCT PAGE CONTENT (this is the actual live product page - extract all factual details):
${scrapedContent}` : ""}

YOUR TASK:
Extract every factual detail from the page and product data. Shoppers need to know:
- What the product IS (type, sport/activity context based on "${collection || ""}" collection)
- MATERIALS and fabric composition (reference the product info data provided above)
- SIZES available (find this on the scraped page)
- Construction quality, fit type, weight
- Care/washing instructions if available
- Any other specs a buyer would want before purchasing

OUTPUT FORMAT (follow this EXACTLY):
1. Write a factual paragraph of approximately ${Math.max(wordCount - 40, 30)} words. Be direct - no waffle, no fluff, no marketing hype. State what the product is, what it's made of, how it fits, and who it's for. Reference the product info data directly.

2. Then add exactly 3 bullet points starting with "• " that highlight the most important FACTUAL details a shopper needs. Each bullet should be one concise line.

RULES:
- Be FACTUAL. Every claim must come from the product data or scraped page.
- Include materials, sizes, and care info from the provided product data
- Keep it relevant to the "${collection || ""}" category
- Do NOT use markdown formatting except "• " for the 3 bullets
- Do NOT include the product title as a heading
- Do NOT add flowery language or filler words
- Write for a shopper who wants facts to decide whether to buy`;

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
