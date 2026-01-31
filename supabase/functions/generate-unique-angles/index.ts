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
    const { topic, gapAnalysis, competitorContent } = await req.json();

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

    const systemPrompt = `You are a content strategist who identifies unique angles and perspectives that will make an article stand out from competitors.

Your job is to analyze what competitors are covering and suggest 5 FRESH PERSPECTIVES that they're ALL missing. 

Focus on:
1. ANGLE gaps (not just topic gaps) - a different way to frame the same information
2. Emotional/narrative angles - personal stories, journeys, transformations
3. Contrarian takes - challenging common assumptions with evidence
4. Practical depth - going deeper on the "how" when others stay surface level
5. Unique frameworks - decision tools, checklists, matrices that help readers act

Return ONLY valid JSON with no markdown formatting.

Response format:
{
  "angles": [
    {
      "title": "Short punchy title (5-8 words)",
      "description": "One sentence explaining the unique angle",
      "whyItWorks": "Why this will resonate and differentiate",
      "exampleHook": "A compelling opening line using this angle"
    }
  ]
}`;

    const userPrompt = `Topic: ${topic}

${gapAnalysis ? `Gap Analysis Results:\n${gapAnalysis}\n\n` : ""}
${competitorContent ? `Competitor Content Summary:\n${competitorContent.substring(0, 3000)}\n\n` : ""}

Generate 5 unique angles that will make this article STAND OUT from competitors. These should be perspectives and framings that no one else is using.`;

    console.log("Generating unique angles for topic:", topic);

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
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content generated");
    }

    // Parse the JSON response
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
