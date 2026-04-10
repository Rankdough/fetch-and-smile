import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, gapAnalysis, competitorContent, toneProfile } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build tone instruction block
    let toneBlock = "";
    if (toneProfile) {
      const chars = toneProfile.characteristics || {};
      const phrases = toneProfile.example_phrases || [];
      toneBlock = `\n\nTONE OF VOICE (CRITICAL - angles MUST match this voice):
Summary: ${toneProfile.summary || "N/A"}
Personality: ${chars.personality || "N/A"}
Formality: ${chars.formality || "N/A"}
Energy: ${chars.energy || "N/A"}
Vocabulary style: ${chars.vocabulary || "N/A"}
${phrases.length > 0 ? `Example phrases from this voice: "${phrases.slice(0, 3).join('", "')}"` : ""}

The angle titles, descriptions, and example hooks MUST sound like they were written by someone with this voice. Match the energy, vocabulary, and personality exactly. Do NOT default to formal/academic/consultant tone.`;
    }

    const systemPrompt = `You are a content strategist who identifies unique angles that make articles stand out from competitors.

Your job is to analyze what competitors are covering and suggest 3 FRESH PERSPECTIVES they're ALL missing.${toneBlock}

Focus on:
1. ANGLE gaps - a different way to frame the same information that feels fresh and human
2. Reader-first perspectives - what would genuinely help someone making this decision?
3. Real-world practical angles - going deeper on the "how" when others stay surface level
4. Honest/transparent takes - challenging marketing fluff with real talk
5. Actionable tools - checklists, decision frameworks, things readers can actually use

IMPORTANT STYLE RULES:
- Write titles that sound like a real person talking, NOT like a marketing agency
- Avoid overly clever wordplay, colons in titles, or buzzword-heavy phrasing
- Keep descriptions conversational and specific
- Example hooks should feel natural and engaging, not like a TED talk opening
${!toneProfile ? "- Default to a warm, helpful, conversational tone" : ""}

Return ONLY valid JSON with no markdown formatting.

Response format:
{
  "angles": [
    {
      "title": "Short natural title (5-8 words)",
      "description": "One sentence explaining the unique angle in plain language",
      "whyItWorks": "Why this will resonate with real readers",
      "exampleHook": "A compelling, natural-sounding opening line"
    }
  ]
}`;

    const userPrompt = `Topic: ${topic}

${gapAnalysis ? `Gap Analysis Results:\n${gapAnalysis}\n\n` : ""}
${competitorContent ? `Competitor Content Summary:\n${competitorContent.substring(0, 3000)}\n\n` : ""}

Generate 3 unique angles that will make this article STAND OUT from competitors. These should feel fresh, human, and practical - NOT like they came from a content strategy textbook.`;

    console.log("Generating unique angles for topic:", topic, "with tone:", toneProfile ? "yes" : "no");

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds in Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content generated");
    }

    const cleanedText = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const angles = JSON.parse(cleanedText);

    console.log("Generated", angles.angles?.length || 0, "unique angles");

    return new Response(
      JSON.stringify(angles),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unique angles generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate unique angles";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
