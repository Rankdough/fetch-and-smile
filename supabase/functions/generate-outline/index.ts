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
      gapAnalysis,
      selectedAngles,
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

Target length: ~${targetWords} words

IMPORTANT RULES FOR THE OUTLINE:
- The outline must follow this structure: Title (H1), TL;DR, Quick Tips, In This Article, then main H2 sections (each as a QUESTION), FAQ, Final Thoughts, References
- Every H2 section heading (except TL;DR, Quick Tips, In This Article, FAQ, Final Thoughts, References) MUST be phrased as a QUESTION
- Include 2-4 bullet points under each section describing what to cover
- Suggest where comparison tables should go
- Use simple markdown formatting with ## for sections and - for bullet points`;

    if (valuePromise && valuePromise.trim()) {
      userPrompt += `\n\nVALUE PROMISE: The reader must be able to "${valuePromise}" after reading. Every section should help achieve this outcome.`;
    }

    if (gapAnalysis && gapAnalysis.trim()) {
      userPrompt += `\n\nCONTENT GAPS TO ADDRESS:\n${gapAnalysis}`;
    }

    if (selectedAngles && selectedAngles.length > 0) {
      userPrompt += `\n\nUNIQUE ANGLES TO INCORPORATE:\n${selectedAngles.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}`;
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

    const systemPrompt = `You are an expert SEO content strategist. Generate a detailed, structured blog post outline that follows best practices for SEO content.

OUTPUT FORMAT:
- Return ONLY the outline in plain markdown
- Use ## for section headings
- Use - for bullet points under each section describing what to cover
- Include [TABLE] markers where comparison tables should appear
- Keep it practical and actionable
- Do NOT write the actual content, just the outline structure with brief notes on what each section should cover

STRUCTURE RULES:
- Start with # Title
- ## TL;DR (note: 3-5 key takeaways)
- ## Quick Tips (note: 3 actionable tips)
- ## In This Article (note: navigation list)
- Main ## sections as QUESTIONS (e.g., "## What Is X?", "## How Much Does It Cost?")
- ## How Do They Compare Side by Side? (with [TABLE])
- ## Which Option Should You Choose?
- ## Frequently Asked Questions (4-6 Q&As)
- ## Final Thoughts
- ## References

IMPORTANT: All main H2 headings MUST be phrased as questions.`;

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
