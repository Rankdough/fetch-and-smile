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
    const { content, topic, valuePromise } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a content quality analyst. Your job is to objectively score content on 4 dimensions.

Be HARSH but fair. Most AI-generated content scores 40-60. Only truly exceptional content scores 80+.

Scoring criteria:

1. ACTIONABILITY (0-100): Does the reader know EXACTLY what to do next?
   - 0-30: Vague advice like "consider your options"
   - 40-60: Some practical tips but missing specifics
   - 70-85: Clear steps with details
   - 86-100: Step-by-step guide with tools, resources, timelines

2. SPECIFICITY (0-100): Real data vs vague claims?
   - 0-30: "Many people believe..." "Studies show..."
   - 40-60: Some numbers but unattributed
   - 70-85: Specific stats with sources
   - 86-100: Original data, named experts, precise figures

3. UNIQUENESS (0-100): How different from typical SEO content?
   - 0-30: Generic, could be any blog
   - 40-60: Competent but predictable
   - 70-85: Fresh angle or perspective
   - 86-100: Genuinely novel insight or framing

4. ENGAGEMENT (0-100): Would someone share this?
   - 0-30: Dry, textbook style
   - 40-60: Readable but forgettable
   - 70-85: Has hooks, questions, surprises
   - 86-100: Compelling narrative, memorable moments

Return ONLY valid JSON:
{
  "scores": {
    "actionability": {
      "score": 65,
      "reasoning": "One sentence explanation",
      "improvement": "Specific suggestion to improve"
    },
    "specificity": {
      "score": 45,
      "reasoning": "One sentence explanation",
      "improvement": "Specific suggestion to improve"
    },
    "uniqueness": {
      "score": 55,
      "reasoning": "One sentence explanation",
      "improvement": "Specific suggestion to improve"
    },
    "engagement": {
      "score": 50,
      "reasoning": "One sentence explanation",
      "improvement": "Specific suggestion to improve"
    }
  },
  "overallScore": 54,
  "valuePromiseDelivered": true,
  "valuePromiseAnalysis": "How well the content delivers on the stated value promise",
  "topStrength": "The best thing about this content",
  "criticalWeakness": "The one thing that would most improve this content"
}`;

    const userPrompt = `Score this content:

Topic: ${topic || "Not specified"}
Value Promise (what reader should be able to DO after reading): ${valuePromise || "Not specified"}

CONTENT:
${content.substring(0, 8000)}`;

    console.log("Scoring content quality for topic:", topic);

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
    const responseContent = data.choices?.[0]?.message?.content;

    if (!responseContent) {
      throw new Error("No content generated");
    }

    // Parse the JSON response
    const cleanedText = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const scores = JSON.parse(cleanedText);

    console.log("Quality scores generated, overall:", scores.overallScore);

    return new Response(
      JSON.stringify(scores),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Quality scoring error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to score content quality";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
