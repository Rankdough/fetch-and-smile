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
    const { title, subtitle } = await req.json();

    if (!title || !subtitle) {
      return new Response(
        JSON.stringify({ error: "title and subtitle are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You write single opening paragraphs for articles. Output ONLY the paragraph text — no headings, no markdown, no quotes, no labels. Just the raw paragraph.",
          },
          {
            role: "user",
            content: `Article title: "${title}"

Subtitle (shown separately above the article): "${subtitle}"

The article body needs an opening paragraph that is COMPLETELY DIFFERENT from the subtitle above. Write a fresh 30-50 word opening paragraph that:
- Sets up why this topic matters or provides broader context
- Uses ENTIRELY DIFFERENT wording, facts, and angle from the subtitle
- Does NOT repeat any brand names, product names, or specific examples from the subtitle
- Still relates to the title question
- Reads naturally as the first paragraph of the article

Output ONLY the paragraph. No heading. No title. No markdown. No "Here is..." preamble.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI call failed: ${response.status}`);
    }

    const data = await response.json();
    let intro = (data.choices?.[0]?.message?.content || "").trim();
    
    // Strip any markdown formatting the model might add despite instructions
    intro = intro.replace(/^#+\s+.+\n*/gm, ""); // headings
    intro = intro.replace(/^\*\*.*?\*\*\s*/gm, ""); // bold-only lines
    intro = intro.replace(/^>\s*/gm, ""); // blockquotes
    intro = intro.replace(/^```[\s\S]*?```/gm, ""); // code blocks
    intro = intro.trim();

    return new Response(
      JSON.stringify({ intro }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Rewrite intro error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to rewrite intro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
