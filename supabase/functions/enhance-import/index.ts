import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EnhanceRequest {
  content: string;
  toneProfile?: {
    name: string;
    summary?: string;
    characteristics?: Record<string, unknown>;
    example_phrases?: string[];
  };
  ctaConfig?: {
    headline: string;
    description: string;
    buttonText: string;
    buttonUrl: string;
  };
  addCtas: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, toneProfile, ctaConfig, addCtas } = await req.json() as EnhanceRequest;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Enhancing imported content", {
      hasTone: !!toneProfile,
      addCtas,
      contentLength: content.length
    });

    // Build system prompt
    let systemPrompt = `You are an expert content editor. Your task is to enhance imported article content.

CRITICAL RULES:
- NEVER use em dashes (—) or en dashes (–) - use regular hyphens (-) only
- NEVER add horizontal rules (---, ***, ___)
- Preserve all existing content structure, headings, tables, and lists
- Maintain all source citations and references
- Keep all links intact
- Return ONLY the enhanced content in markdown format, no explanations`;

    // Add tone instructions if provided
    if (toneProfile) {
      systemPrompt += `

TONE OF VOICE:
Apply this writing style throughout the content:
- Profile Name: ${toneProfile.name}
${toneProfile.summary ? `- Summary: ${toneProfile.summary}` : ""}
${toneProfile.example_phrases?.length ? `- Example phrases to emulate: ${toneProfile.example_phrases.join(", ")}` : ""}

Rewrite sentences to match this tone while preserving the meaning.`;
    }

    // Add CTA instructions if needed
    if (addCtas && ctaConfig) {
      systemPrompt += `

CALL-TO-ACTION BANNERS:
Insert 2-3 CTA banners at natural break points in the article (after major sections).
Use this format for each CTA:

<div class="cta-banner">
  <div class="cta-headline">${ctaConfig.headline}</div>
  <div class="cta-description">${ctaConfig.description}</div>
  <a href="${ctaConfig.buttonUrl}" class="cta-button">${ctaConfig.buttonText}</a>
</div>

Place CTAs strategically - not at the very beginning or end, but after compelling sections.`;
    } else if (addCtas) {
      systemPrompt += `

CALL-TO-ACTION BANNERS:
Insert 2-3 generic CTA banners at natural break points in the article.
Use this format:

<div class="cta-banner">
  <div class="cta-headline">Want to Learn More?</div>
  <div class="cta-description">Get expert insights delivered to your inbox.</div>
  <a href="#signup" class="cta-button">Subscribe Now</a>
</div>

Place CTAs strategically after compelling sections.`;
    }

    const userPrompt = `Here is the imported article content to enhance:

${content}

${toneProfile ? "Apply the tone profile to make the writing more consistent." : ""}
${addCtas ? "Add CTA banners at appropriate locations." : ""}

Return the enhanced article.`;

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
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let enhancedContent = data.choices?.[0]?.message?.content;

    if (!enhancedContent) {
      throw new Error("No content returned from AI");
    }

    // Post-process: Remove any em dashes and horizontal rules
    enhancedContent = enhancedContent.replace(/—/g, "-").replace(/–/g, "-");
    enhancedContent = enhancedContent.replace(/^\s*[-*_]{3,}\s*$/gm, "");

    console.log("Content enhanced successfully");

    return new Response(
      JSON.stringify({ 
        content: enhancedContent,
        toneApplied: !!toneProfile,
        ctasAdded: addCtas
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Enhance import error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to enhance content";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
