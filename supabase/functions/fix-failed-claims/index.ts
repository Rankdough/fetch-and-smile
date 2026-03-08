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
    const { content, failedClaims } = await req.json();

    if (!content || !failedClaims || failedClaims.length === 0) {
      return new Response(
        JSON.stringify({ error: "Content and at least one failed claim are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const claimsFormatted = failedClaims
      .map((c: { claim: string; explanation: string }, i: number) => 
        `${i + 1}. CLAIM: "${c.claim}"\n   WHY IT FAILED: ${c.explanation}`
      )
      .join("\n\n");

    const systemPrompt = `You are a senior content editor. You will receive an article and a list of claims/promises that the article FAILED to deliver on, along with explanations of why they failed.

Your job is to EDIT the article to substantively fulfill each failed claim. Follow these rules:

1. For each failed claim, either:
   - Add a new dedicated subsection (H3) under the most relevant existing H2, OR
   - Expand an existing section that partially covers it
2. Each fix must include:
   - At least 2-3 paragraphs of substantive, detailed content
   - Specific examples, data, or actionable advice
   - Natural integration with the surrounding content
3. DO NOT remove or significantly alter existing content that is working well
4. DO NOT add meta-commentary about what you changed
5. Maintain the same tone, style, and formatting as the original article
6. Return the COMPLETE updated article in markdown format
7. Keep all existing structural elements (TL;DR, Quick Tips, FAQ, etc.) intact`;

    const userPrompt = `FAILED CLAIMS TO FIX:
${claimsFormatted}

CURRENT ARTICLE:
${content}

Edit the article to substantively address each failed claim. Return the complete updated article.`;

    console.log("Fixing", failedClaims.length, "failed claims");

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
      throw new Error("No content generated");
    }

    // Strip markdown code fences if present
    resultContent = resultContent.replace(/^```(?:markdown|md)?\n?/i, '').replace(/\n?```$/i, '').trim();

    console.log("Successfully fixed failed claims");

    return new Response(
      JSON.stringify({ content: resultContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Fix failed claims error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fix claims";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
