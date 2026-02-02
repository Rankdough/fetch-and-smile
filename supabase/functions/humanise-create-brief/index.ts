import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Section {
  h2: string;
  purpose: string;
  mustInclude: string[];
  estimatedWords: number;
}

interface KeyClaim {
  claim: string;
  source: string;
}

interface Brief {
  audience: string;
  intent: string;
  angle: string;
  keyClaims: KeyClaim[];
  sections: Section[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      topic, 
      valuePromise, 
      gapAnalysis, 
      contextFiles, 
      uniqueAngles,
      targetWords,
      keywords 
    } = await req.json();

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

    // Build context from files
    let contextSummary = "";
    if (contextFiles && Array.isArray(contextFiles) && contextFiles.length > 0) {
      contextSummary = contextFiles
        .map((f: { name: string; content: string }) => `[${f.name}]: ${f.content.substring(0, 1000)}...`)
        .join("\n\n");
    }

    const systemPrompt = `You are a strategic content planner. Your job is to create a detailed brief for an SEO article that will be written section-by-section.

OUTPUT FORMAT: Return ONLY valid JSON matching this exact structure:
{
  "audience": "Specific description of target reader",
  "intent": "What the reader should be able to DO after reading",
  "angle": "What makes this article different from competitors",
  "keyClaims": [
    { "claim": "Specific factual claim", "source": "Where this comes from" }
  ],
  "sections": [
    { 
      "h2": "Section heading", 
      "purpose": "Why this section exists and what it achieves",
      "mustInclude": ["specific point 1", "specific point 2", "specific point 3"],
      "estimatedWords": 200
    }
  ]
}

RULES FOR SECTIONS:
1. Each section MUST have a clear, distinct purpose
2. mustInclude should have 3-5 specific points, facts, or examples to cover
3. Order sections logically (problem → solution → comparison → action)
4. Include these mandatory sections:
   - TL;DR (brief summary with key takeaways)
   - In This Article (navigation)
   - Main content sections (3-6 based on word count)
   - Comparison table section
   - FAQ section (4-6 questions)
   - Final Thoughts (with call-to-action)
5. Distribute word count: TL;DR ~100, In This Article ~150, each main section ~${Math.round((targetWords || 1000) / 6)}, FAQ ~200, Final ~150

RULES FOR KEY CLAIMS:
1. Extract specific, verifiable facts from context files
2. Each claim should be usable as evidence in a section
3. Note the source (file name or "general knowledge")`;

    let userPrompt = `Create a detailed brief for an article about: ${topic}

Target word count: ${targetWords || 1000} words`;

    if (valuePromise) {
      userPrompt += `\n\nVALUE PROMISE (reader must be able to): ${valuePromise}`;
    }

    if (uniqueAngles && Array.isArray(uniqueAngles) && uniqueAngles.length > 0) {
      userPrompt += `\n\nUNIQUE ANGLES to incorporate:\n${uniqueAngles.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}`;
    }

    if (gapAnalysis) {
      userPrompt += `\n\nCOMPETITOR GAP ANALYSIS:\n${gapAnalysis}`;
    }

    if (keywords && Array.isArray(keywords) && keywords.length > 0) {
      userPrompt += `\n\nTARGET KEYWORDS to include naturally: ${keywords.join(", ")}`;
    }

    if (contextSummary) {
      userPrompt += `\n\nCONTEXT FILES (extract key claims from these):\n${contextSummary}`;
    }

    console.log("Creating brief for topic:", topic);

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
    let content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No brief generated");
    }

    // Parse JSON from response (handle markdown code blocks)
    const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let brief: Brief;
    try {
      brief = JSON.parse(cleanedContent);
    } catch (e) {
      console.error("Failed to parse brief JSON:", e, cleanedContent);
      throw new Error("Failed to parse brief structure");
    }

    console.log("Brief created with", brief.sections?.length || 0, "sections");

    return new Response(
      JSON.stringify({ brief }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Brief creation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to create brief";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
