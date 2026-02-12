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

    let systemPrompt = `You are an expert HTML page builder. Your job is to take source content (extracted from a PDF, document, or pasted text) and produce a clean, well-styled, standalone HTML page that faithfully reproduces the content.

CRITICAL RULES:
1. Reproduce the source content EXACTLY as provided - same text, same structure, same headings, same order. Do NOT add, remove, or rewrite any content.
2. Do NOT add SEO elements like TL;DR, Quick Tips, FAQ, "In This Article" navigation, or any structural elements that are NOT in the source content.
3. Produce complete, self-contained HTML with inline CSS styles. The HTML should look professional when pasted into WordPress, Shopify, or any CMS.
4. Use clean, modern styling: good typography, readable font sizes, proper spacing, responsive layout.
5. Style tables with borders, alternating row colours, and proper padding.
6. Style headings with appropriate sizes and spacing.
7. Return ONLY the HTML content (the <article> or <div> body) — no <html>, <head>, or <body> wrapper tags. Just the styled content ready to paste into a CMS page.
8. Use inline CSS on elements so styles work when pasted into any platform.`;

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
