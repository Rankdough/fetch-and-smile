import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ApplyFormatRequest {
  content: string;
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
    const { content, ctaConfig, customInstructions } = await req.json() as ApplyFormatRequest;

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
      hasCta: !!ctaConfig,
      hasCustomInstructions: !!customInstructions
    });

    // Check what structural elements are missing
    const hasTldr = /##\s*TL;?DR/i.test(content) || /###\s*TL;?DR/i.test(content);
    const hasQuickTips = /##\s*Quick\s*Tips/i.test(content) || />\s*\*\*Tip\s*1/i.test(content);
    const hasInThisArticle = /##\s*In\s*This\s*Article/i.test(content);
    const hasFaq = /##\s*(FAQ|Frequently\s*Asked\s*Questions)/i.test(content);

    // Check for existing CTAs
    const existingCtaPattern = />\s*\*\*[^*]+\*\*[\s\S]*?\[.+\]\(.+\)/;
    const hasExistingCtas = existingCtaPattern.test(content);
    const hasCtaMarkers = /<!--CTA_BANNER_\d+-->/.test(content);

    console.log("Content analysis:", { hasTldr, hasQuickTips, hasInThisArticle, hasFaq, hasExistingCtas, hasCtaMarkers });

    let systemPrompt = `You are an expert content editor. Your task is to add structural formatting elements to an existing article WITHOUT changing any original content.

CRITICAL RULES:
- DO NOT rewrite, rephrase, or modify ANY existing paragraphs
- DO NOT remove any existing sections or text
- ONLY ADD new structural elements where missing
- Return the FULL article with additions

STRUCTURAL ELEMENTS TO ADD (if missing):

${!hasTldr ? `1. TL;DR SECTION - MANDATORY FORMAT:
Add IMMEDIATELY after the H1 title. Use this EXACT format:

## TL;DR

- First key takeaway in one sentence
- Second key takeaway in one sentence
- Third key takeaway (optional)

CRITICAL: Must use ## (H2 level), not ### (H3).
` : "1. TL;DR: Already present - keep as is"}

${!hasQuickTips ? `2. QUICK TIPS SECTION - MANDATORY FORMAT:
Add after TL;DR. Use this EXACT format with BLANK LINES between tips:

## Quick Tips

> **Tip 1:** One actionable sentence, max 15 words.

> **Tip 2:** One actionable sentence, max 15 words.

> **Tip 3:** One actionable sentence, max 15 words.

CRITICAL: Each tip is a SEPARATE blockquote with a blank line between them.
` : "2. Quick Tips: Already present - keep as is"}

${!hasInThisArticle ? `3. IN THIS ARTICLE - MANDATORY:
Add after Quick Tips. Use this EXACT format:

## In This Article

1. **[First H2 Title]** - Brief description
2. **[Second H2 Title]** - Brief description
3. **[Third H2 Title]** - Brief description

List ALL main H2 sections EXCEPT: TL;DR, Quick Tips, FAQ, References, Final Thoughts, Conclusion.
` : "3. In This Article: Already present - keep as is"}

${!hasFaq ? `4. FAQ SECTION - MANDATORY FORMAT:
Add BEFORE Final Thoughts/Conclusion/References. Use this EXACT format:

## Frequently Asked Questions

**What is the first common question about this topic?**
Answer in 1-2 clear sentences with specific information.

**What is another question readers commonly ask?**
Answer in 1-2 clear sentences with specific information.

**How does this relate to [key topic aspect]?**
Answer in 1-2 clear sentences with specific information.

**What should readers know about [another aspect]?**
Answer in 1-2 clear sentences with specific information.

CRITICAL: Create 4-5 relevant Q&As based on the article content. Each question in bold, answer as plain text paragraph.
` : "4. FAQ: Already present - keep as is"}`;

    // Add CTA instructions if provided
    if (ctaConfig && !hasExistingCtas) {
      // Check if custom instructions contain CTA-specific guidance
      const hasCtaCustomInstructions = customInstructions && 
        (customInstructions.toLowerCase().includes('cta') || 
         customInstructions.toLowerCase().includes('button') ||
         customInstructions.toLowerCase().includes('call to action'));

      if (hasCtaCustomInstructions) {
        // Use custom instructions to guide CTA content
        systemPrompt += `

CTA BANNERS - CRITICAL RULES:
- Insert EXACTLY 2 CTA banners - NO MORE, NO LESS
- CTAs must be CONTEXTUALLY RELEVANT to the article topic
- Do NOT add more than 2 CTAs under any circumstances
- ALL 4 LINES of each CTA MUST start with > (blockquote marker)

CUSTOM CTA INSTRUCTIONS TO FOLLOW:
${customInstructions}

CTA STRUCTURE - USE THIS EXACT 4-LINE FORMAT:

> **🎳 LEVEL UP YOUR LEAGUE LOOK!**
> Stand out on the lanes with **custom bowling jerseys** designed for your team. Unlimited designs, premium quality.
> [SHOP CUSTOM JERSEYS →](${ctaConfig.buttonUrl})
> Free design assistance • Fast turnaround • Team discounts

CRITICAL FORMAT RULES - EVERY LINE MUST START WITH ">":
1. Line 1: > **emoji + HEADLINE IN ALL CAPS** (bold, with relevant emoji)
2. Line 2: > Description paragraph - NO "Description:" prefix! Just the text with **bold** product name
3. Line 3: > [PRODUCT-SPECIFIC BUTTON TEXT →](URL) - include product name in button, end with →
4. Line 4: > Tagline with bullet separators (•)

WRONG FORMAT - DO NOT USE:
- "Description: Look like the pros..." ❌ (has "Description:" prefix)
- "[SHOP NOW →]" ❌ (too generic)

CORRECT FORMAT:
- "Stand out on the lanes with **custom bowling jerseys**..." ✓ (no prefix)
- "[SHOP CUSTOM JERSEYS →]" ✓ (product-specific)

MAKE IT CONTEXTUAL:
- Adapt headline emoji and text to article topic
- Include product name with **bold** in description
- Button text should mention specific product

PLACEMENT:
- First CTA: About 40% into the article (after a major section)
- Second CTA: Near the end, before Final Thoughts or References`;
      } else {
        // Use default CTA config - still make it contextual to article
        systemPrompt += `

CTA BANNERS - CRITICAL RULES:
- Insert EXACTLY 2 CTA banners - NO MORE, NO LESS
- CTAs must be CONTEXTUALLY RELEVANT to the article topic
- Do NOT add more than 2 CTAs under any circumstances
- ALL 4 LINES of each CTA MUST start with > (blockquote marker)

CTA STRUCTURE - USE THIS EXACT 4-LINE FORMAT:

> **🎳 LEVEL UP YOUR LEAGUE LOOK!**
> Stand out on the lanes with **custom bowling jerseys** designed for your team. Unlimited designs, premium quality.
> [SHOP CUSTOM JERSEYS →](${ctaConfig.buttonUrl})
> Free design assistance • Fast turnaround • Team discounts

CRITICAL FORMAT RULES - EVERY LINE MUST START WITH ">":
1. Line 1: > **emoji + HEADLINE IN ALL CAPS** (bold, with relevant emoji)
2. Line 2: > Description paragraph - NO "Description:" prefix! Just the text with **bold** product name
3. Line 3: > [PRODUCT-SPECIFIC BUTTON TEXT →](URL) - include product name in button, end with →
4. Line 4: > Tagline with bullet separators (•)

WRONG FORMAT - DO NOT USE:
- "Description: Look like the pros..." ❌ (has "Description:" prefix)
- "[SHOP NOW →]" ❌ (too generic)

CORRECT FORMAT:
- "Stand out on the lanes with **custom bowling jerseys**..." ✓ (no prefix)
- "[SHOP CUSTOM JERSEYS →]" ✓ (product-specific)

Default inspiration:
- Headline: ${ctaConfig.headline.toUpperCase()}
- Product focus: ${ctaConfig.description}

PLACEMENT:
- First CTA: About 40% into the article (after a major section)
- Second CTA: Near the end, before Final Thoughts or References`;
      }
    } else if (hasExistingCtas) {
      systemPrompt += `

CTAs: Article already has CTA banners - keep them as they are.`;
    }

    // NOTE: Images are NOT handled by apply-format.
    // Users should use "Insert Image" button or "Allocate Logically" for image placement.

    // Add custom instructions if provided (and not already used for CTAs)
    const hasCtaCustomInstructions = customInstructions && 
      (customInstructions.toLowerCase().includes('cta') || 
       customInstructions.toLowerCase().includes('button') ||
       customInstructions.toLowerCase().includes('call to action'));
    
    if (customInstructions && customInstructions.trim() && !hasCtaCustomInstructions) {
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
        model: "google/gemini-3-flash-preview",
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

    // Post-process: Fix TL;DR heading level - convert ### TL;DR to ## TL;DR
    formattedContent = formattedContent.replace(/^###\s*(TL;?DR:?)\s*$/gim, "## $1");
    
    // Post-process: Ensure Quick Tips has proper ## heading
    formattedContent = formattedContent.replace(/^###\s*(Quick\s*Tips:?)\s*$/gim, "## $1");
    
    // Post-process: Ensure In This Article has proper ## heading
    formattedContent = formattedContent.replace(/^###\s*(In\s*This\s*Article:?)\s*$/gim, "## $1");
    
    // Post-process: Ensure FAQ has proper ## heading
    formattedContent = formattedContent.replace(/^###\s*(FAQ|Frequently\s*Asked\s*Questions:?)\s*$/gim, "## $1");

    // Post-process: Enforce exactly 2 CTAs maximum
    // CTA pattern: blockquote with bold headline AND a markdown link (not Quick Tips which don't have links)
    // Pattern looks for: > **...** followed by > [...](http...)
    const ctaBlockPattern = />\s*\*\*[^*]+\*\*[^>]*\n(?:>\s*[^\n]+\n)*>\s*\[[^\]]+\]\(https?:\/\/[^)]+\)[^\n]*(?:\n>\s*[^\n]+)*/g;
    const ctaMatches = formattedContent.match(ctaBlockPattern) || [];
    
    console.log(`Found ${ctaMatches.length} CTA blocks in content`);
    
    // If more than 2 CTAs found, remove the extras (keep first 2)
    if (ctaMatches.length > 2) {
      console.log(`Removing ${ctaMatches.length - 2} extra CTAs to keep only 2`);
      // Remove CTAs starting from the 3rd one
      for (let i = 2; i < ctaMatches.length; i++) {
        formattedContent = formattedContent.replace(ctaMatches[i], '');
      }
      // Clean up extra newlines
      formattedContent = formattedContent.replace(/\n{3,}/g, '\n\n');
    }

    // Detect what was added
    const newHasTldr = /##\s*TL;?DR/i.test(formattedContent);
    const newHasQuickTips = /##\s*Quick\s*Tips/i.test(formattedContent) || />\s*\*\*Tip\s*1/i.test(formattedContent);
    const newHasInThisArticle = /##\s*In\s*This\s*Article/i.test(formattedContent);
    const newHasFaq = /##\s*(FAQ|Frequently\s*Asked\s*Questions)/i.test(formattedContent);
    const newHasCtas = existingCtaPattern.test(formattedContent);
    const additions = [];
    if (!hasTldr && newHasTldr) additions.push("TL;DR");
    if (!hasQuickTips && newHasQuickTips) additions.push("Quick Tips");
    if (!hasInThisArticle && newHasInThisArticle) additions.push("In This Article");
    if (!hasFaq && newHasFaq) additions.push("FAQ");
    if (!hasExistingCtas && newHasCtas) additions.push("CTAs");
    if (customInstructions) additions.push("Custom instructions applied");
    
    // Warn if "In This Article" was requested but not added
    if (!hasInThisArticle && !newHasInThisArticle) {
      console.warn("WARNING: 'In This Article' section was requested but AI did not add it");
    }

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
          hasCtas: newHasCtas
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
