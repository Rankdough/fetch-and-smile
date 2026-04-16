import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const {
      topic,
      valuePromise,
      valuePromiseClaims,
      gapAnalysis,
      selectedAngles,
      selectedGapInsights,
      formatReference,
      contextFiles,
      toneProfileId,
      useKnowledgeBase,
      keywords,
      length,
    } = await req.json();

    if (!topic || !topic.trim()) {
      return new Response(
        JSON.stringify({ error: "Topic is required to generate an outline" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const wordCounts: Record<string, number> = {
      short: 500,
      medium: 1000,
      "medium-long": 1500,
      long: 2000,
      extended: 3000,
      comprehensive: 3500,
    };
    const targetWords = wordCounts[length] || 1000;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch knowledge base rules if enabled
    let knowledgeRules: string[] = [];
    if (useKnowledgeBase) {
      const { data: knowledgeData } = await supabase
        .from("seo_knowledge")
        .select("key_rules")
        .not("key_rules", "is", null);

      if (knowledgeData) {
        knowledgeRules = knowledgeData.flatMap((item) => item.key_rules || []);
      }
    }

    // Fetch tone profile if provided
    let toneProfile: { summary: string | null; characteristics: Record<string, string> } | null = null;
    if (toneProfileId) {
      const { data: profileData } = await supabase
        .from("tone_profiles")
        .select("summary, characteristics")
        .eq("id", toneProfileId)
        .maybeSingle();

      if (profileData) {
        toneProfile = profileData;
      }
    }

    // Build the prompt
    let userPrompt = `Generate a detailed blog post outline for the topic: "${topic}"

Target length: approximately ${targetWords} words (the final article must stay within 15% of this target — do NOT plan for significantly more content)

IMPORTANT RULES FOR THE OUTLINE:
- The outline must follow this structure: Title (H1), TL;DR, Quick Tips, In This Article, then main H2 sections (each as a QUESTION), FAQ, Final Thoughts, References
- Every H2 section heading (except TL;DR, Quick Tips, In This Article, FAQ, Final Thoughts, References) MUST be phrased as a QUESTION
- Include 2-4 bullet points under each section describing what to cover
- Suggest where comparison tables should go
- Use simple markdown formatting with ## for sections and - for bullet points
- CRITICAL: Budget section word counts so ALL sections together total approximately ${targetWords} words. For a ${targetWords}-word article, plan ${Math.max(3, Math.min(6, Math.floor(targetWords / 350)))} main H2 sections (not counting structural sections like TL;DR, FAQ, etc.)`;


    // Inject value promise claims as mandatory per-claim requirements
    const claimsArray: string[] = Array.isArray(valuePromiseClaims)
      ? valuePromiseClaims.filter((c: string) => c && c.trim())
      : valuePromise && valuePromise.trim() ? [valuePromise] : [];

    if (claimsArray.length > 0) {
      userPrompt += `\n\n🚨 MANDATORY VALUE PROMISE CLAIMS - EACH MUST HAVE A DEDICATED SECTION:
The article MUST substantively cover ALL of the following claims. For each claim, create or designate a specific H2 or H3 section in the outline that will cover it with at least 2-3 paragraphs of detail. A passing mention does NOT count.
${claimsArray.map((c: string, i: number) => `Claim ${i + 1}: ${c}`).join("\n")}

For each claim above, add a note in the outline like: [MUST COVER: Claim ${1}] next to the section that addresses it.`;
    }


    if (gapAnalysis && gapAnalysis.trim()) {
      userPrompt += `\n\n⚠️ HIGH PRIORITY - CONTENT GAPS FROM COMPETITOR ANALYSIS:\nThe following gaps were identified by analyzing competitor articles. The outline MUST include dedicated sections or sub-sections that explicitly address each of these gaps. Do NOT skip any.\n${gapAnalysis}`;
    }

    if (selectedGapInsights && selectedGapInsights.length > 0) {
      userPrompt += `\n\n⚠️ HIGH PRIORITY - SELECTED GAP INSIGHTS TO ADDRESS:\nThe user specifically selected these insights from the gap analysis. Each one MUST have a clear place in the outline where it will be covered. Map each insight to a specific section:\n${selectedGapInsights.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}`;
    }

    if (selectedAngles && selectedAngles.length > 0) {
      userPrompt += `\n\n⚠️ HIGH PRIORITY - UNIQUE ANGLES TO INCORPORATE:\nThese unique angles MUST be woven into the outline. Each angle should map to at least one section or sub-section. Add sections if needed to ensure full coverage:\n${selectedAngles.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}`;
    }

    if (formatReference && formatReference.trim()) {
      userPrompt += `\n\nMATCH THIS FORMAT STRUCTURE:\n${formatReference.substring(0, 1500)}`;
    }

    if (contextFiles && contextFiles.length > 0) {
      const contextContent = contextFiles
        .map((f: { name: string; content: string }) => `--- ${f.name} ---\n${f.content.substring(0, 500)}`)
        .join("\n\n");
      userPrompt += `\n\nREFERENCE MATERIALS:\n${contextContent}`;
    }

    if (keywords && keywords.length > 0) {
      userPrompt += `\n\nSEO KEYWORDS TO INCORPORATE:\n${keywords.map((k: string, i: number) => `${i + 1}. ${k}`).join("\n")}`;
    }

    if (knowledgeRules.length > 0) {
      const rulesToUse = knowledgeRules.slice(0, 20);
      userPrompt += `\n\nSEO RULES TO FOLLOW:\n${rulesToUse.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
    }

    if (toneProfile) {
      userPrompt += `\n\nTONE OF VOICE: ${toneProfile.summary || "Not specified"}`;
    }

    const systemPrompt = `You are an expert SEO content strategist. Generate a detailed, structured blog post outline that is easy to read, copy, and share with copywriters.

OUTPUT FORMAT:
- Return ONLY the outline in clean, well-formatted markdown
- Use # for the article title
- Use ## for main section headings
- Use ### for sub-section headings where appropriate
- Use bullet points (-) for key points to cover under each section
- Use indented bullet points (  -) for sub-points or specific details
- Add brief 1-line notes in [brackets] for guidance (e.g., [Include comparison table here])
- Leave a blank line between each section for readability
- Use **bold** for emphasis on key instructions

STRUCTURE:
- # [Article Title]
- ## TL;DR
  - 1-2 dense factual paragraphs (NOT bullets) with specific names, numbers, and a "best for X" recommendation
- ## Quick Tips
  - 3 actionable tips the reader can use immediately
- ## In This Article
  - Numbered navigation list of all main sections
- Main ## sections (each phrased as a QUESTION, e.g., "## What Is X?")
  - Key points to cover
  - Specific data/stats to include
  - [TABLE] markers where comparison tables should appear
  - ### Sub-sections where needed
- ## How Do They Compare Side by Side?
  - [Include comparison table with columns: Feature, Option A, Option B]
- ## How to Choose [the right X for you]?  ← REPLACE [the right X for you] with a topic-specific noun phrase from the article (e.g. "the Right Treatment for You", "the Best Trail", "the Right Approach to Making Friends"). NEVER output the bare "## How to Choose?" with no topic noun. If "Choose" doesn't fit (skill/lifestyle topics), use "How to Decide..." or "How to Find the Right..." instead.
  - 4-6 decision criteria as a practical checklist (e.g., "Choose X if you need…")
- ## Frequently Asked Questions
  - 4-6 Q&As listed as **Q: ...** followed by brief answer guidance
- ## Final Thoughts
- ## References
  - [List authoritative sources to cite]

IMPORTANT RULES:
- All main H2 headings (except TL;DR, Quick Tips, In This Article, FAQ, Final Thoughts, References) MUST be phrased as questions
- Be specific and actionable in your guidance notes, not generic
- Include word count targets per section in [brackets] (e.g., [~200 words])
- The outline should be detailed enough that a copywriter can write the full article from it alone`;

    console.log("Generating outline for topic:", topic);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
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
    const outline = data.choices?.[0]?.message?.content;

    if (!outline) {
      throw new Error("No outline generated");
    }

    console.log("Outline generated successfully");

    return new Response(
      JSON.stringify({ outline }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Outline generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate outline";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
