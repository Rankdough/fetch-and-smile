import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SectionEvidence {
  heading: string;
  excerpt: string;
  relevance: "strong" | "partial" | "weak";
  explanation: string;
}

interface VerificationResult {
  fulfilled: boolean;
  overallScore: number;
  summary: string;
  sections: SectionEvidence[];
  missingElements: string[];
  suggestions: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, valuePromise } = await req.json();

    if (!content || !valuePromise) {
      return new Response(
        JSON.stringify({ error: "Content and value promise are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a content quality analyst. Your job is to verify whether an article fulfills its stated value promise.

Analyze the article against the value promise and identify:
1. Which sections directly address the promise
2. How strongly each section supports the promise (strong/partial/weak)
3. What elements might be missing
4. Concrete suggestions for improvement

OUTPUT FORMAT: Return ONLY valid JSON matching this exact structure:
{
  "fulfilled": true/false,
  "overallScore": 0-100,
  "summary": "One sentence summary of how well the promise is fulfilled",
  "sections": [
    {
      "heading": "The exact H2 heading from the article",
      "excerpt": "A 1-2 sentence quote that proves this section addresses the promise",
      "relevance": "strong" | "partial" | "weak",
      "explanation": "Why this section does/doesn't fulfill the promise"
    }
  ],
  "missingElements": ["specific thing that should be added"],
  "suggestions": ["actionable improvement suggestion"]
}

RULES:
1. Only include sections that are relevant to the value promise (don't list every section)
2. Extract actual excerpts from the content as evidence
3. Be specific about what's missing - don't be vague
4. Score 70+ means the promise is reasonably fulfilled
5. Score 90+ means exceptional fulfillment`;

    const userPrompt = `VALUE PROMISE:
${valuePromise}

ARTICLE CONTENT:
${content}

Analyze this article and verify whether it fulfills the value promise. Find specific sections and excerpts that address the promise.`;

    console.log("Verifying value promise:", valuePromise.substring(0, 100));

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
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let resultContent = data.choices?.[0]?.message?.content;

    if (!resultContent) {
      throw new Error("No verification result generated");
    }

    // Parse JSON from response (handle markdown code blocks)
    const cleanedContent = resultContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let result: VerificationResult;
    try {
      result = JSON.parse(cleanedContent);
    } catch (e) {
      console.error("Failed to parse verification JSON:", e, cleanedContent);
      throw new Error("Failed to parse verification result");
    }

    console.log("Value promise verification complete:", {
      fulfilled: result.fulfilled,
      score: result.overallScore,
      sectionsFound: result.sections?.length || 0
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Value promise verification error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to verify value promise";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
