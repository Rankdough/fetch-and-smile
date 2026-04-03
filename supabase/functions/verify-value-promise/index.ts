import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ClaimResult {
  claim: string;
  fulfilled: boolean;
  evidence: string;
  explanation: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, claims, valuePromise } = await req.json();

    if (!content || (!claims && !valuePromise)) {
      return new Response(
        JSON.stringify({ error: "Content and claims are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Support both new claims array and legacy single string
    const claimsList: string[] = claims && Array.isArray(claims) && claims.length > 0
      ? claims
      : valuePromise ? [valuePromise] : [];

    if (claimsList.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one claim is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a strict content auditor. You will be given an article and a list of specific claims/promises the article MUST deliver on.

Each claim is a COMMITMENT TO THE READER about what the article will deliver (e.g. "Learn exactly how batting average is calculated"). For EACH claim, determine with a BINARY pass/fail whether the article substantively delivers on that commitment. 
- "Substantively" means there is a dedicated section, paragraph, or detailed treatment — NOT just a passing mention or single sentence.
- A claim about "comparing X vs Y" requires an actual side-by-side comparison, not just mentioning both.
- A claim about "covering [specific topic]" requires multiple sentences with actionable detail.

OUTPUT FORMAT: Return ONLY valid JSON:
{
  "claims": [
    {
      "claim": "The exact claim text",
      "fulfilled": true/false,
      "evidence": "A direct 1-2 sentence quote from the article that proves fulfillment, or empty string if not fulfilled",
      "explanation": "Why this passes or fails — be specific about what's missing if it fails"
    }
  ],
  "summary": "One sentence overall assessment"
}

RULES:
1. Be STRICT. A passing mention does NOT count as fulfillment.
2. If the claim says "compare A vs B" and the article only mentions A, it FAILS.
3. If the claim says "cover gluten-free options" and there's one vague sentence, it FAILS.
4. Extract actual quotes as evidence — do not paraphrase.
5. Every claim in the input must appear in the output.`;

    const claimsFormatted = claimsList.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n");

    const userPrompt = `CLAIMS TO VERIFY (each must be independently checked):
${claimsFormatted}

ARTICLE CONTENT:
${content}

Check each claim strictly. A claim is only fulfilled if the article has substantive, detailed coverage — not just a passing mention.`;

    console.log("Verifying", claimsList.length, "claims");

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

    const cleanedContent = resultContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let parsed: { claims: ClaimResult[]; summary: string };
    try {
      parsed = JSON.parse(cleanedContent);
    } catch (e) {
      console.error("Failed to parse verification JSON:", e, cleanedContent);
      throw new Error("Failed to parse verification result");
    }

    const fulfilledCount = parsed.claims.filter(c => c.fulfilled).length;

    const result = {
      claims: parsed.claims,
      fulfilledCount,
      totalClaims: parsed.claims.length,
      summary: parsed.summary,
    };

    console.log("Verification complete:", fulfilledCount, "/", parsed.claims.length, "claims fulfilled");

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
