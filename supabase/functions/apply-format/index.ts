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

interface ApplyFormatRequest {
  content: string;
  images?: ArticleImage[];
  ctaConfig?: {
    headline: string;
    description: string;
    buttonText: string;
    buttonUrl: string;
  };
  customInstructions?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, images, ctaConfig, customInstructions } = await req.json() as ApplyFormatRequest;

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

    console.log("Applying article format structure to content", {
      contentLength: content.length,
      hasImages: images && images.length > 0,
      hasCta: !!ctaConfig,
      hasCustomInstructions: !!customInstructions
    });

    // Check what structural elements are missing
    const hasTldr = /##\s*TL;?DR/i.test(content);
    const hasQuickTips = /##\s*Quick\s*Tips/i.test(content) || />\s*\*\*Tip\s*1/i.test(content);
    const hasInThisArticle = /##\s*In\s*This\s*Article/i.test(content);
    const hasFaq = /##\s*(FAQ|Frequently\s*Asked\s*Questions)/i.test(content);

    // Check for existing CTAs
    const existingCtaPattern = />\s*\*\*[^*]+\*\*[\s\S]*?\[.+\]\(.+\)/;
    const hasExistingCtas = existingCtaPattern.test(content);

    console.log("Content analysis:", { hasTldr, hasQuickTips, hasInThisArticle, hasFaq, hasExistingCtas });

    let systemPrompt = `You are an expert content editor. Your task is to add structural formatting elements and enhancements to an existing article WITHOUT changing any of the original content text.

CRITICAL RULES:
- DO NOT rewrite, rephrase, or modify ANY existing paragraphs or sentences
- DO NOT remove any existing sections, paragraphs, or text
- DO NOT change the meaning or wording of anything that already exists
- ONLY ADD new structural elements where they are missing
- Return the FULL article with additions

STRUCTURAL ELEMENTS TO ADD (if missing):

${!hasTldr ? `1. TL;DR SECTION (add after the H1 title):
Create a "## TL;DR" section with 2-3 bullet points summarizing the main takeaways from the article.
` : "1. TL;DR: Already present - keep as is"}

${!hasQuickTips ? `2. QUICK TIPS SECTION (add after TL;DR):
Create a "## Quick Tips" section with exactly 3 actionable tips using this format:
> **Tip 1:** [One actionable sentence, max 15 words]
> **Tip 2:** [One actionable sentence, max 15 words]  
> **Tip 3:** [One actionable sentence, max 15 words]
` : "2. Quick Tips: Already present - keep as is"}

${!hasInThisArticle ? `3. IN THIS ARTICLE NAVIGATION (add after Quick Tips):
Create a "## In This Article" section listing the main H2 sections with brief descriptions:
1. **Section Title** - Brief one-line description of what this section covers
2. **Section Title** - Brief one-line description
(etc for each main H2 section, excluding TL;DR, Quick Tips, FAQ, References, Final Thoughts)
` : "3. In This Article: Already present - keep as is"}

${!hasFaq ? `4. FAQ SECTION (add before Final Thoughts/Conclusion/References):
Create a "## Frequently Asked Questions" section with 4-5 Q&As based on the article content:
**Question here?**
Answer in 1-2 sentences.
` : "4. FAQ: Already present - keep as is"}`;

    // Add CTA instructions if provided
    if (ctaConfig && !hasExistingCtas) {
      systemPrompt += `

CTA BANNERS TO INSERT:
Insert 2 CTA banners at strategic locations in the article.
Use this EXACT markdown blockquote format for each CTA:

> **${ctaConfig.headline.toUpperCase()}**
> ${ctaConfig.description}
> [${ctaConfig.buttonText}](${ctaConfig.buttonUrl})

IMPORTANT: Each CTA must be a blockquote (lines starting with >) with:
- Bold headline on first line (ALL CAPS)
- Description on second line  
- Link on third line

Place the first CTA about 40% into the article (after a major section).
Place the second CTA near the end, before Final Thoughts or References.`;
    } else if (hasExistingCtas) {
      systemPrompt += `

CTAs: Article already has CTA banners - keep them as they are.`;
    }

    // Add image instructions if provided
    if (images && images.length > 0) {
      systemPrompt += `

IMAGES TO INSERT:
Insert these images at appropriate locations in the article, placing them ABOVE relevant H2 headings.
Skip placing images above: TL;DR, Quick Tips, In This Article, FAQ, Frequently Asked Questions, References, Final Thoughts, Conclusion.

Available images to insert:
${images.map((img, i) => `${i + 1}. ![${img.alt}](${img.url})`).join("\n")}

Distribute images evenly throughout the article content sections.
Place each image on its own line, with a blank line before and after.`;
    }

    // Add custom instructions if provided
    if (customInstructions && customInstructions.trim()) {
      systemPrompt += `

ADDITIONAL CUSTOM INSTRUCTIONS:
${customInstructions}

Apply these instructions while preserving all original content.`;
    }

    systemPrompt += `

FORMATTING RULES:
- NEVER use em dashes (—) or en dashes (–) - use regular hyphens (-) only
- NEVER add horizontal rules (---, ***, ___)
- Keep all existing structure and text intact
- Use proper markdown formatting

Return ONLY the enhanced markdown content, no explanations or commentary.`;

    const userPrompt = `Here is the article content. Add the missing structural elements and enhancements while keeping ALL existing content exactly as is:

${content}`;

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
    let formattedContent = data.choices?.[0]?.message?.content;

    if (!formattedContent) {
      throw new Error("No content returned from AI");
    }

    // Post-process: Remove any em dashes and horizontal rules
    formattedContent = formattedContent.replace(/—/g, "-").replace(/–/g, "-");
    formattedContent = formattedContent.replace(/^\s*[-*_]{3,}\s*$/gm, "");

    // Detect what was added
    const newHasTldr = /##\s*TL;?DR/i.test(formattedContent);
    const newHasQuickTips = /##\s*Quick\s*Tips/i.test(formattedContent) || />\s*\*\*Tip\s*1/i.test(formattedContent);
    const newHasInThisArticle = /##\s*In\s*This\s*Article/i.test(formattedContent);
    const newHasFaq = /##\s*(FAQ|Frequently\s*Asked\s*Questions)/i.test(formattedContent);
    const newHasCtas = existingCtaPattern.test(formattedContent);
    const hasImages = images && images.length > 0 && images.some(img => formattedContent.includes(img.url));

    const additions = [];
    if (!hasTldr && newHasTldr) additions.push("TL;DR");
    if (!hasQuickTips && newHasQuickTips) additions.push("Quick Tips");
    if (!hasInThisArticle && newHasInThisArticle) additions.push("In This Article");
    if (!hasFaq && newHasFaq) additions.push("FAQ");
    if (!hasExistingCtas && newHasCtas) additions.push("CTAs");
    if (hasImages) additions.push("Images");
    if (customInstructions) additions.push("Custom instructions applied");

    console.log("Format applied successfully. Additions:", additions);

    return new Response(
      JSON.stringify({ 
        content: formattedContent,
        additions,
        originalHad: { hasTldr, hasQuickTips, hasInThisArticle, hasFaq, hasExistingCtas },
        nowHas: { 
          hasTldr: newHasTldr, 
          hasQuickTips: newHasQuickTips, 
          hasInThisArticle: newHasInThisArticle, 
          hasFaq: newHasFaq,
          hasCtas: newHasCtas,
          hasImages
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Apply format error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to apply format";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
