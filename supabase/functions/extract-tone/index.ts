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
    const { content, fileName, profileName } = await req.json();

    if (!content || !profileName) {
      return new Response(
        JSON.stringify({ error: "Content and profile name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Extracting tone from content for profile:", profileName);

    // Extract tone characteristics using AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert in analyzing writing style and tone of voice. Analyze the provided text and extract detailed tone characteristics.

Return ONLY valid JSON with no markdown formatting, using this exact structure:
{
  "summary": "A 1-2 sentence summary of the overall voice and tone",
  "characteristics": {
    "formality": "formal | semi-formal | casual | conversational",
    "personality": "e.g., friendly, authoritative, playful, professional, empathetic",
    "pace": "fast-paced | moderate | deliberate | varies",
    "vocabulary": "simple | moderate | sophisticated | technical",
    "sentence_structure": "short and punchy | varied | long and flowing | mixed",
    "perspective": "first person | second person | third person | mixed",
    "emotional_tone": "e.g., enthusiastic, calm, urgent, reassuring",
    "humor_level": "none | subtle | moderate | frequent",
    "persuasion_style": "e.g., data-driven, emotional, story-based, direct"
  },
  "example_phrases": [
    "Quote or paraphrase 3-5 representative phrases from the text that exemplify the voice"
  ],
  "writing_patterns": [
    "List 3-5 specific writing patterns observed (e.g., 'Uses rhetorical questions', 'Starts paragraphs with action verbs')"
  ]
}`
          },
          {
            role: "user",
            content: `Analyze the tone and voice from this text:\n\n${content.substring(0, 8000)}`
          }
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
    const resultText = data.choices?.[0]?.message?.content;

    if (!resultText) {
      throw new Error("No analysis generated");
    }

    // Parse the JSON response
    let analysisResult;
    try {
      const cleanedText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysisResult = JSON.parse(cleanedText);
    } catch (e) {
      console.error("Failed to parse analysis JSON:", e, resultText);
      throw new Error("Failed to parse tone analysis");
    }

    // Store in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: insertedProfile, error: insertError } = await supabase
      .from("tone_profiles")
      .insert({
        name: profileName,
        source_file_name: fileName || "pasted-content",
        characteristics: analysisResult.characteristics || {},
        summary: analysisResult.summary || null,
        example_phrases: analysisResult.example_phrases || [],
        is_active: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error("Failed to save tone profile");
    }

    console.log("Tone profile created:", insertedProfile.id);

    return new Response(
      JSON.stringify({
        profile: insertedProfile,
        analysis: analysisResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Tone extraction error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to extract tone";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
