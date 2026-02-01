import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ArticleImage {
  alt: string;
  url: string;
}

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
  images?: ArticleImage[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, toneProfile, ctaConfig, addCtas, images } = await req.json() as EnhanceRequest;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if we actually need to call the AI
    const needsAI = toneProfile || addCtas;
    
    // If we only need to insert images, do it locally without AI
    if (!needsAI && images && images.length > 0) {
      const enhancedContent = insertImagesLocally(content, images);
      console.log("Images inserted locally without AI call");
      
      return new Response(
        JSON.stringify({ 
          content: enhancedContent,
          toneApplied: false,
          ctasAdded: false,
          imagesInserted: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If nothing to enhance, return original
    if (!needsAI && (!images || images.length === 0)) {
      return new Response(
        JSON.stringify({ 
          content,
          toneApplied: false,
          ctasAdded: false,
          imagesInserted: false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Enhancing imported content", {
      hasTone: !!toneProfile,
      addCtas,
      hasImages: images && images.length > 0,
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

    // Add image instructions if provided
    if (images && images.length > 0) {
      systemPrompt += `

IMAGES TO INSERT:
Insert these images at appropriate locations in the article, using standard markdown image syntax.
Place images after relevant paragraphs that relate to the image content.

Available images:
${images.map((img, i) => `${i + 1}. ![${img.alt}](${img.url})`).join("\n")}

Insert each image on its own line after a relevant paragraph.`;
    }

    const userPrompt = `Here is the imported article content to enhance:

${content}

${toneProfile ? "Apply the tone profile to make the writing more consistent." : ""}
${addCtas ? "Add CTA banners at appropriate locations." : ""}
${images && images.length > 0 ? `Insert ${images.length} image(s) at appropriate locations.` : ""}

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
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
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
        ctasAdded: addCtas,
        imagesInserted: images && images.length > 0
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

// Helper function to insert images locally without AI
function insertImagesLocally(content: string, images: ArticleImage[]): string {
  // Find all H2 headings and insert images after the first paragraph following each
  const lines = content.split("\n");
  const result: string[] = [];
  let imageIndex = 0;
  let afterH2 = false;
  let paragraphAfterH2Count = 0;
  
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    
    // Check if this is an H2 heading
    if (lines[i].startsWith("## ")) {
      afterH2 = true;
      paragraphAfterH2Count = 0;
      continue;
    }
    
    // If we're after an H2 and this is a non-empty paragraph, count it
    if (afterH2 && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("|") && !lines[i].startsWith("-") && !lines[i].startsWith("*")) {
      paragraphAfterH2Count++;
      
      // After the first full paragraph following an H2, insert an image
      if (paragraphAfterH2Count === 1 && imageIndex < images.length) {
        // Check if next line is empty or another content line
        const nextLine = lines[i + 1];
        if (nextLine === undefined || nextLine.trim() === "" || nextLine.startsWith("#")) {
          result.push("");
          result.push(`![${images[imageIndex].alt}](${images[imageIndex].url})`);
          result.push("");
          imageIndex++;
          afterH2 = false;
        }
      }
    }
    
    // Reset after we've moved past the immediate section
    if (afterH2 && lines[i].startsWith("## ")) {
      afterH2 = false;
    }
  }
  
  // If we still have unused images, append them before the last section
  while (imageIndex < images.length) {
    result.push("");
    result.push(`![${images[imageIndex].alt}](${images[imageIndex].url})`);
    result.push("");
    imageIndex++;
  }
  
  return result.join("\n");
}
