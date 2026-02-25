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
    const { url, title, collection, productInfo, wordCount = 200, customInstructions = "" } = await req.json();

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

${customInstructions ? `MANDATORY CUSTOM INSTRUCTIONS (YOU MUST incorporate ALL of these points into the description — these are non-negotiable requirements from the client):
${customInstructions}

You MUST weave every point from the custom instructions above into the description. If the instructions mention guarantees, team orders, unique selling points, or any specific details — they MUST appear prominently in the output.` : ""}

YOUR TASK:
Extract every factual detail from the page and product data. Shoppers need to know:
- What the product IS (type, sport/activity context based on "${collection || ""}" collection)
- MATERIALS and fabric composition (reference the product info data provided above)
- SIZES available (find this on the scraped page)
- Construction quality, fit type, weight
- Care/washing instructions if available
- Any other specs a buyer would want before purchasing

OUTPUT FORMAT (follow this EXACTLY):
1. Write a factual opening paragraph of approximately ${Math.max(wordCount - 80, 30)} words. Be direct - no waffle, no fluff. State what the product is, what it's made of, how it fits, and who it's for. Reference the product info data directly.

2. Then add exactly 3 bullet points starting with "• " that highlight the most important FACTUAL details a shopper needs. Each bullet should be one concise line.

3. Then write a SHORT closing paragraph (2-3 sentences) that paints a picture of how this product LOOKS and FEELS in the actual setting where the sport is played. For "${collection || "the sport"}" — describe the visual impact at the bowling alley, on the pitch, on the court, on the field, etc. How does the design turn heads? What impression does the wearer make? Keep it grounded and vivid.

CRITICAL - UNIQUENESS:
Every description you write MUST be distinctly different from others. Vary your:
- Opening sentence structure (don't always start the same way)
- Word choices and vocabulary
- Sentence rhythm and length
- The angle you lead with (sometimes lead with material, sometimes with the design, sometimes with the sport context)
- Bullet point phrasing
The product title "${title}" has a unique name and theme — let that guide a fresh angle each time.

RULES:
- Be FACTUAL in paragraphs 1 and bullets. Every claim must come from the product data or scraped page.
- Include materials, sizes, and care info from the provided product data
- Keep it relevant to the "${collection || ""}" category
- Do NOT use markdown formatting except "• " for the 3 bullets
- Do NOT include the product title as a heading
- Do NOT repeat the same generic phrases across products
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
