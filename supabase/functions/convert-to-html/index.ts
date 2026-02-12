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
    const { sourceContent, sampleLayout } = await req.json();

    if (!sourceContent) {
      return new Response(
        JSON.stringify({ error: "Source content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let systemPrompt = `You are an expert HTML page builder. Your job is to take source content and produce a visually rich, well-structured, standalone HTML page that replicates the LAYOUT and FORMAT of the original page as closely as possible.

CRITICAL RULES:
1. STRIP navigation menus, footers, cookie banners, sidebars, and site-wide UI elements. Focus ONLY on the article/page BODY content.
2. Reproduce the body content EXACTLY - same text, same structure, same headings, same order. Do NOT add, remove, or rewrite any content.
3. Do NOT add SEO elements like TL;DR, Quick Tips, or structural elements that are NOT in the source content.
4. BUILD THE PAGE IN VISUAL SECTIONS AND BLOCKS — replicate how a real web page looks:
   - Use distinct visual sections with backgrounds, padding, and spacing
   - Hero/intro sections with large headings and descriptive text
   - Card-style blocks for grouped content (benefits, features, alternatives)
   - Colored/shaded background sections to break up content visually
   - CTA (Call-to-Action) banners with styled buttons where the content implies them
   - Bullet lists styled as feature cards or info blocks, not plain <ul> lists
   - Expert/author bio sections with placeholder avatar
   - FAQ sections with expandable-style formatting
   - Testimonial/review sections with quote styling
5. For ANY images referenced or implied in the content, insert a placeholder:
   <div style="width:100%;height:300px;background:#e8e8e8;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#999;font-size:14px;margin:20px 0;">[Image Placeholder]</div>
6. Use inline CSS on ALL elements. The HTML must look professional when pasted into WordPress, Shopify, or any CMS.
7. Use modern styling: clean typography (system fonts), generous padding (40-60px sections), rounded corners, subtle shadows, and a cohesive color palette.
8. Style tables with borders, alternating row colors, and proper padding. Wrap tables in overflow-x:auto containers.
9. Return ONLY the styled content — no <html>, <head>, or <body> wrapper tags.
10. Make the layout RESPONSIVE — use max-width containers, percentage widths, and mobile-friendly sizing.`;

    if (sampleLayout) {
      systemPrompt += `\n\n9. LAYOUT REFERENCE: The user has provided a sample page whose layout they want to replicate. Match the visual structure, heading styles, spacing, and overall look of this sample page. Apply the sample's layout patterns to the source content.\n\nSAMPLE PAGE LAYOUT:\n${sampleLayout.substring(0, 5000)}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Convert this content into styled HTML:\n\n${sourceContent.substring(0, 15000)}` },
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
