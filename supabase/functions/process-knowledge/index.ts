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
    const { fileName, filePath, content } = await req.json();

    if (!fileName || !content) {
      return new Response(
        JSON.stringify({ error: "fileName and content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Processing knowledge document:", fileName);

    // Use AI to extract key SEO rules and create a summary
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an SEO knowledge extraction expert. Analyze the provided document and extract:
1. A concise summary (2-3 sentences) of what this document covers
2. A list of key actionable rules, strategies, or tactics for SEO and content creation

Return your response as valid JSON with this exact structure:
{
  "summary": "Brief summary of the document",
  "keyRules": ["Rule 1", "Rule 2", "Rule 3", ...]
}

Focus on extracting concrete, actionable guidance that can be applied to content creation. Include specific recommendations about:
- Content structure and formatting
- Keyword usage and placement
- Heading hierarchy
- Meta descriptions and titles
- Internal/external linking
- Readability and engagement
- Any other SEO best practices mentioned

Return ONLY the JSON, no markdown formatting.`
          },
          {
            role: "user",
            content: `Extract SEO knowledge from this document:\n\n${content.substring(0, 50000)}`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI extraction error:", response.status, errorText);
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content;

    if (!extractedText) {
      throw new Error("No extraction result");
    }

    // Parse the AI response
    let extracted;
    try {
      const cleanedText = extractedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extracted = JSON.parse(cleanedText);
    } catch (e) {
      console.error("Failed to parse extraction:", e, extractedText);
      extracted = {
        summary: "Document processed but extraction failed. Raw content stored.",
        keyRules: []
      };
    }

    // Store in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: insertedData, error: insertError } = await supabase
      .from("seo_knowledge")
      .insert({
        file_name: fileName,
        file_path: filePath || fileName,
        content: content,
        summary: extracted.summary,
        key_rules: extracted.keyRules || [],
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error(`Failed to store knowledge: ${insertError.message}`);
    }

    console.log("Knowledge processed and stored:", insertedData.id);

    return new Response(
      JSON.stringify({
        success: true,
        id: insertedData.id,
        summary: extracted.summary,
        keyRulesCount: extracted.keyRules?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process knowledge error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process knowledge";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
