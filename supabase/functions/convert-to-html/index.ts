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
    const { sourceContent, sampleLayout, screenshotBase64 } = await req.json();

    if (!sourceContent && !screenshotBase64) {
      return new Response(
        JSON.stringify({ error: "Source content or screenshot is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert HTML page builder. Your job is to produce a visually rich, well-structured, standalone HTML page.

STEP 1 - STRIP THESE ELEMENTS (MANDATORY - DO THIS FIRST):
Remove ALL of the following from the source content before building:
- Navigation menus (Home, Blog, About, Contact links)
- Language selectors (English, etc.)
- "Try today" or similar site-wide promotional banners at the top
- "Ordered before 23:59" shipping banners
- Cookie consent banners and disclaimers
- Footer content: copyright notices, site maps, addresses, email, social media, "Follow Us", "MANY LINKS"
- Sidebar widgets, heatmap overlays, recording overlays
- Any "© 20XX" copyright lines
- Repeated menu items appearing at the end of content
- Any "[product_page id=...]" shortcodes — replace with a styled CTA button placeholder

STEP 2 - BUILD THE PAGE from the remaining article body content:
1. Reproduce the body content EXACTLY - same text, headings, order. Do NOT add or rewrite.
2. Do NOT add SEO elements (TL;DR, Quick Tips, "In This Article") unless they exist in the source.
3. BUILD IN VISUAL SECTIONS AND BLOCKS like a real web page:
   - Hero/intro section with large H1 heading and intro paragraph
   - Card-style blocks for grouped content (benefits, features, alternatives)
   - Colored/shaded background sections to visually separate content areas
   - CTA banners with styled buttons where the content implies them
   - Bullet/numbered lists styled as feature cards or info blocks
   - Expert/author bio sections with a circular placeholder avatar
   - FAQ sections styled with bold questions and indented answers
   - Testimonial/review quotes with styled quote blocks
   - Product sections with placeholder images and descriptions
4. For ANY images referenced or implied, insert:
   <div style="width:100%;height:300px;background:linear-gradient(135deg,#e8e8e8,#f5f5f5);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#999;font-size:14px;margin:20px 0;">[Image Placeholder]</div>
5. Use inline CSS on ALL elements. Must work in WordPress/Shopify/any CMS.
6. Modern styling: system fonts, generous padding (40-60px per section), rounded corners, subtle shadows, cohesive color palette.
7. Tables: borders, alternating row colors, padding, wrapped in overflow-x:auto.
8. Return ONLY styled content — no <html>, <head>, <body> tags.
9. RESPONSIVE: max-width:800px centered container, percentage widths, mobile-friendly.`;

    // Build the user message with optional image
    const userContent: any[] = [];

    if (screenshotBase64) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${screenshotBase64}` },
      });
      if (sourceContent) {
        userContent.push({
          type: "text",
          text: `Replicate the EXACT layout, visual structure, and styling shown in this screenshot. Use the following text as the article content:\n\n${sourceContent.substring(0, 15000)}`,
        });
      } else {
        userContent.push({
          type: "text",
          text: "Replicate the EXACT layout, visual structure, styling, and content shown in this screenshot as HTML. Match the sections, cards, spacing, colors, and typography as closely as possible. Use image placeholders where images appear.",
        });
      }
    } else {
      let text = `Convert this content into styled HTML:\n\n${sourceContent.substring(0, 15000)}`;
      if (sampleLayout) {
        text += `\n\nLAYOUT REFERENCE - match the visual structure of this page:\n${sampleLayout.substring(0, 5000)}`;
      }
      userContent.push({ type: "text", text });
    }

    // Use vision-capable model when screenshot is provided
    const model = screenshotBase64 ? "google/gemini-2.5-flash" : "google/gemini-2.5-flash";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let html = data.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if the model wrapped the HTML
    html = html.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    console.log("HTML generated, length:", html.length);

    return new Response(
      JSON.stringify({ html }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Convert error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to convert content";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
