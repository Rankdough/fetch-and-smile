import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Default banned phrases that indicate AI-generated content
const DEFAULT_BANNED_PHRASES = [
  "In today's world",
  "In today's fast-paced",
  "In the modern age",
  "It's important to note",
  "It is worth noting",
  "It goes without saying",
  "At the end of the day",
  "In conclusion",
  "To summarize",
  "To sum up",
  "All in all",
  "Moreover",
  "Furthermore",
  "Additionally",
  "In addition",
  "Consequently",
  "Thus",
  "Hence",
  "Therefore",
  "various",
  "numerous",
  "plethora",
  "myriad",
  "utilize",
  "leverage",
  "delve",
  "embark",
  "journey",
  "landscape",
  "robust",
  "streamline",
  "synergy",
  "paradigm",
  "holistic",
  "cutting-edge",
  "game-changer",
  "best-in-class",
  "world-class",
  "state-of-the-art"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      draft,
      knowledgeRules,
      bannedPhrases,
      issues,
      toneProfile,
      useFirstPerson
    } = await req.json();

    if (!draft) {
      return new Response(
        JSON.stringify({ error: "Draft content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Combine default and custom banned phrases
    const allBannedPhrases = [...DEFAULT_BANNED_PHRASES, ...(bannedPhrases || [])];

    let systemPrompt = `You are an expert editor specialising in making AI-generated content sound more human. Your task is to rewrite the provided draft to remove AI patterns while preserving the meaning and SEO value.

TRANSFORMATION RULES:

1. SENTENCE RHYTHM - Vary sentence lengths deliberately:
   - Mix short punchy sentences (5-8 words)
   - Medium flowing sentences (10-15 words)  
   - Occasional longer explanatory sentences (18-25 words)
   - Never have 3+ sentences of similar length in a row

2. KILL GENERIC OPENERS - Replace these patterns:
   - "In today's world..." → Start with a specific fact or question
   - "It's important to note..." → Just state the thing directly
   - "When it comes to..." → Name the specific thing
   - "The reality is..." → Just state the reality

3. ADD SPECIFICITY - Replace vague language:
   - "many people" → specific numbers or "most UK adults"
   - "significant impact" → measurable impact with numbers
   - "various options" → name 2-3 specific options
   - "can help" → describe exactly how it helps

4. ADD CONSTRAINTS AND CAVEATS:
   - Every recommendation should have a "works best when..." or "avoid if..."
   - Include realistic limitations, not just benefits

5. REMOVE OVER-SIGNPOSTING:
   - Delete: "Moreover", "Furthermore", "Additionally", "In addition"
   - Replace with: direct statements, or logical connection via content
   - If transition needed, use: "But", "And", "Yet", "Still", "Though"

6. BRITISH ENGLISH:
   - Use: optimise, colour, organisation, behaviour, centre, programme
   - Not: optimize, color, organization, behavior, center, program

7. NO EM DASHES:
   - Replace "—" with commas, colons, or restructured sentences
   - Replace "–" with hyphens "-" or commas

8. BANNED PHRASES TO REMOVE OR REPLACE:
${allBannedPhrases.map(p => `- "${p}"`).join("\n")}

OUTPUT FORMAT:
Return the rewritten draft followed by a brief "### Changes Made" section listing 3-5 key transformations you applied.`;

    // Add tone profile guidance if available
    if (toneProfile) {
      systemPrompt += `\n\nMAINTAIN THIS TONE:
${toneProfile.summary || "Professional and helpful"}
${toneProfile.example_phrases?.length > 0 ? `Emulate phrases like: ${toneProfile.example_phrases.slice(0, 3).join("; ")}` : ""}
CRITICAL: Always write in first person ("we", "our", "I"). NEVER refer to the tone profile owner by name or write in third person about them. The tone defines HOW to write, not WHO is speaking.`;
    }

    // Add specific issues to fix if provided (from quality gate)
    let userPrompt = `Rewrite this draft to sound more human:\n\n${draft}`;
    
    if (issues && Array.isArray(issues) && issues.length > 0) {
      userPrompt += `\n\nSPECIFIC ISSUES TO FIX:\n${issues.map((i: { type: string; fix: string; sections?: string[] }) => 
        `- ${i.type}: ${i.fix}${i.sections ? ` (in sections: ${i.sections.join(", ")})` : ""}`
      ).join("\n")}`;
    }

    console.log("Humanising draft:", draft.length, "chars");

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
      throw new Error("No rewritten content generated");
    }

    // Post-process: Remove em dashes and en dashes
    content = content.replace(/—/g, "-").replace(/–/g, "-");
    // Remove horizontal rules
    content = content.replace(/^\s*[-*_]{3,}\s*$/gm, "");

    // Extract the changes log if present
    let changesLog = "";
    const changesMatch = content.match(/### Changes Made[\s\S]*$/i);
    if (changesMatch) {
      changesLog = changesMatch[0];
      content = content.replace(/### Changes Made[\s\S]*$/i, "").trim();
    }

    console.log("Draft humanised:", content.length, "chars");

    return new Response(
      JSON.stringify({ 
        content,
        changesLog 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Humanise rewrite error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to humanise content";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
