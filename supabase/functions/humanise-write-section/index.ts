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

interface ToneProfile {
  summary: string | null;
  characteristics: Record<string, string>;
  example_phrases: string[] | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      section,
      sectionIndex,
      totalSections,
      audience,
      intent,
      angle,
      keyClaims,
      toneProfile,
      knowledgeRules
    } = await req.json();

    if (!section || !section.h2) {
      return new Response(
        JSON.stringify({ error: "Section is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build relevant claims for this section
    const relevantClaims = keyClaims
      ?.filter((c: { claim: string }) => 
        section.mustInclude?.some((m: string) => 
          c.claim.toLowerCase().includes(m.toLowerCase()) || 
          m.toLowerCase().includes(c.claim.toLowerCase().split(" ")[0])
        )
      )
      .map((c: { claim: string; source: string }) => `- ${c.claim} (${c.source})`)
      .join("\n") || "";

    let systemPrompt = `You are an expert content writer. Write a single section of an SEO article.

PERSPECTIVE RULE (NON-NEGOTIABLE):
- Write in THIRD PERSON only. NEVER use "I", "we", "our", "my", "us"
- Write as an objective narrator: "Hikers will find...", "Readers can expect...", "The data shows..."

SECTION RULES:
1. First sentence = DIRECT answer or statement (no "In today's world..." or "It's important to...")
2. Include 2-4 supporting facts or points
3. Include 1 concrete example (scenario, numbers, brand name, or specific tool)
4. Include 1 caveat or constraint ("works best when...", "avoid if...", "note that...")
5. Use short paragraphs (2-3 sentences max)
6. Target approximately ${section.estimatedWords || 200} words

ABSOLUTE RULES:
- NEVER use em dashes (—) or en dashes (–) - use commas or hyphens instead
- NEVER start with generic phrases like "In today's world", "It's important to note", "When it comes to"
- NEVER use "Moreover", "Additionally", "Furthermore" as transitions
- Use British English spelling (optimise, colour, organisation)
- Vary sentence length: mix short (5-8 words), medium (10-15 words), and longer (18-25 words)

OUTPUT FORMAT:
- Start with ## ${section.h2}
- Write the section content
- End with **Sources:** [Source Name](URL) if applicable (use real URLs)`;

    // Add tone profile if available
    if (toneProfile) {
      systemPrompt += `\n\nTONE OF VOICE:
Summary: ${toneProfile.summary || "Professional and helpful"}
Style: ${Object.entries(toneProfile.characteristics || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}
CRITICAL: The tone profile defines HOW to write (style, vocabulary, rhythm) - NOT who is speaking. Write in third person. NEVER use first-person pronouns (I, we, our). NEVER refer to the tone profile owner by name.`;
      
      if (toneProfile.example_phrases?.length > 0) {
        systemPrompt += `\nExample phrases to emulate: ${toneProfile.example_phrases.slice(0, 3).join("; ")}`;
      }
    }

    // Add knowledge rules if available
    if (knowledgeRules && knowledgeRules.length > 0) {
      systemPrompt += `\n\nSEO RULES TO FOLLOW:\n${knowledgeRules.slice(0, 10).map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")}`;
    }

    const userPrompt = `Write section ${sectionIndex + 1} of ${totalSections}:

HEADING: ${section.h2}
PURPOSE: ${section.purpose}
MUST INCLUDE: ${section.mustInclude?.join(", ") || "key points relevant to the heading"}
TARGET WORDS: ${section.estimatedWords || 200}

AUDIENCE: ${audience || "General readers"}
ARTICLE INTENT: ${intent || "Inform and educate"}
UNIQUE ANGLE: ${angle || "Practical, actionable advice"}

${relevantClaims ? `RELEVANT FACTS TO USE:\n${relevantClaims}` : ""}

Write this section now. Remember: direct opening, concrete example, one caveat.`;

    console.log(`Writing section ${sectionIndex + 1}/${totalSections}: ${section.h2}`);

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
      throw new Error("No section content generated");
    }

    // Post-process: Remove em dashes and en dashes
    content = content.replace(/—/g, "-").replace(/–/g, "-");

    console.log(`Section ${sectionIndex + 1} written: ${content.length} chars`);

    return new Response(
      JSON.stringify({ 
        content,
        sectionIndex,
        heading: section.h2
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Section writing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to write section";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
