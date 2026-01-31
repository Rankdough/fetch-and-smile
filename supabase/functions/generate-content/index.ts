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
    const { topic, length, outline, instructions, gapAnalysis, formatReference, contextFiles, keywords, generateCTAs, useKnowledgeBase, toneProfileId } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Map length to approximate word count
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
        console.log(`Loaded ${knowledgeRules.length} SEO rules from knowledge base`);
      }
    }

    // Fetch tone profile if provided
    let toneProfile: { summary: string | null; characteristics: Record<string, string>; example_phrases: string[] | null } | null = null;
    if (toneProfileId) {
      const { data: profileData } = await supabase
        .from("tone_profiles")
        .select("summary, characteristics, example_phrases")
        .eq("id", toneProfileId)
        .maybeSingle();

      if (profileData) {
        toneProfile = profileData;
        console.log("Loaded tone profile:", toneProfileId);
      }
    }

    // Calculate required tables based on word count
    const requiredTables = targetWords >= 3000 ? 4 : targetWords >= 2000 ? 3 : 1;
    
    // Build the prompt
    let systemPrompt = `You are an expert SEO content writer. Write high-quality, engaging blog posts optimized for search engines while remaining valuable and readable.

ABSOLUTE RULE - NO EM DASHES:
- NEVER use the em dash character "—" (Unicode U+2014) ANYWHERE in the content
- NEVER use "–" (en dash) either
- ONLY use regular hyphens "-" for all dashes
- If you need a pause in a sentence, use a comma, semicolon, or rewrite the sentence
- This rule has NO exceptions

ABSOLUTE RULE - NO HORIZONTAL LINES:
- NEVER use horizontal rules/lines (--- or *** or ___) anywhere in the content
- Do NOT add separators between sections - headings provide enough visual separation
- This rule has NO exceptions

CRITICAL MARKDOWN FORMATTING RULES:
- Title: Use # for the main title (H1) - only one per article
- Major sections: Use ## for H2 headings (e.g., ## What is Composite Bonding?)
- Subsections: Use ### for H3 headings
- DO NOT use numbered headings like "1. Section Name" - use proper markdown ## syntax
- Use **bold** for emphasis on key terms and important points
- Use bullet points (-) and numbered lists (1.) for easy scanning
- Use markdown tables with | for comparisons (e.g., Feature | Option A | Option B)
- DO NOT use blockquotes (>) for TL;DR - use H2 heading instead

CRITICAL TABLE REQUIREMENT:
- You MUST include a MINIMUM of ${requiredTables} markdown comparison tables in the article
- Tables should compare features, options, costs, benefits, or other relevant aspects
- Each table must have at least 3 columns and 4+ rows
- Spread tables throughout the article, not all at the end

SOURCE REFERENCE RULES:
- DO NOT use inline numeric citations like [1], [2], [3] in the text
- Add a "**Sources:**" line at the END of EACH major section (after ## headings)
- List 1-2 relevant sources as simple markdown links directly under that section
- Format: **Sources:** [Source Title](URL)
- Sources should be relevant to that specific section's content

ARTICLE STRUCTURE (in this order):
1. Title (# H1)
2. ## TL;DR - as an H2 heading, followed by bullet points summarizing key takeaways
3. ## In This Article - THIS SECTION IS MANDATORY AND MUST APPEAR IMMEDIATELY AFTER TL;DR
   - This is a navigation guide showing what the reader will learn
   - Format as a BULLETED LIST with each item on its own line
   - Each line format: - **1. Section Title** - Brief description of what reader learns
   - Example:
     
     ## In This Article
     
     - **1. What is Composite Bonding?** - Understand the basics of this minimally invasive cosmetic treatment.
     - **2. Cost Breakdown** - Learn exactly what you'll pay and what affects the price.
     - **3. Longevity & Care** - Discover how long results last and maintenance tips.
   
   - List ALL main H2 sections from the article (not TL;DR or References)
   - DO NOT SKIP THIS SECTION - it must be present in every article
4. Main content sections with ## headings (each with **Sources:** at the end)
5. Comparison table section
6. "Which Option Should You Choose?" section
7. "## Frequently Asked Questions" section - include 4-6 common Q&As in bold question format
8. "## Final Thoughts" section with call-to-action
9. "## References:" section - list ALL sources used throughout the article as simple markdown links

Content Guidelines:
- Start with a compelling hook that addresses the reader's pain point
- Include comparison tables when comparing options
- Use short paragraphs (2-3 sentences max)
- Add a strong conclusion with a clear call-to-action
- Write naturally, avoiding keyword stuffing`;

    // Add knowledge base rules to the prompt
    if (knowledgeRules.length > 0) {
      // Limit to top 50 rules to avoid token limits
      const rulesToUse = knowledgeRules.slice(0, 50);
      systemPrompt += `

CUSTOM SEO RULES FROM KNOWLEDGE BASE:
Apply the following SEO strategies and rules from the uploaded knowledge documents:
${rulesToUse.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}`;
    }

    // Add tone of voice instructions if a profile is selected
    if (toneProfile) {
      systemPrompt += `

TONE OF VOICE INSTRUCTIONS:
You must match the following tone and writing style throughout the article:

Summary: ${toneProfile.summary || "Not specified"}

Characteristics:`;
      
      if (toneProfile.characteristics) {
        for (const [key, value] of Object.entries(toneProfile.characteristics)) {
          systemPrompt += `
- ${key.replace(/_/g, " ")}: ${value}`;
        }
      }

      if (toneProfile.example_phrases && toneProfile.example_phrases.length > 0) {
        systemPrompt += `

Example phrases to emulate:
${toneProfile.example_phrases.map((p, i) => `${i + 1}. "${p}"`).join("\n")}`;
      }

      systemPrompt += `

IMPORTANT: Maintain this tone consistently throughout the entire article.`;
    }

    if (formatReference) {
      systemPrompt += `

IMPORTANT: Match the formatting style and structure of this reference article:
${formatReference.substring(0, 2000)}`;
    }

    let userPrompt = `Write a blog post about: ${topic}

Target length: approximately ${targetWords} words`;

    // Add keywords if provided
    if (keywords && Array.isArray(keywords) && keywords.length > 0) {
      userPrompt += `

IMPORTANT SEO KEYWORDS TO USE:
The following keywords MUST be naturally incorporated throughout the article, especially in headings, the first paragraph, and key sections:
${keywords.map((k: string, i: number) => `${i + 1}. ${k}`).join("\n")}

Use each keyword at least 2-3 times throughout the article where it fits naturally.`;
    }

    if (gapAnalysis) {
      userPrompt += `

IMPORTANT: Address these content gaps that competitors are missing:
${gapAnalysis}`;
    }

    if (outline && outline.trim()) {
      userPrompt += `

Follow this outline structure:
${outline}`;
    }

    if (instructions && instructions.trim()) {
      userPrompt += `

Additional instructions:
${instructions}`;
    }

    if (contextFiles && Array.isArray(contextFiles) && contextFiles.length > 0) {
      const contextContent = contextFiles
        .map((f: { name: string; content: string }) => `--- ${f.name} ---\n${f.content}`)
        .join("\n\n");
      userPrompt += `

Reference materials to incorporate:
${contextContent}`;
    }

    console.log("Generating content for topic:", topic);

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
      throw new Error("No content generated");
    }

    // Post-process: Remove any em dashes, en dashes, and horizontal rules
    content = content.replace(/—/g, "-").replace(/–/g, "-");
    // Remove horizontal rules (---, ***, ___ on their own line)
    content = content.replace(/^\s*[-*_]{3,}\s*$/gm, "");

    console.log("Content generated successfully");

    // Generate CTAs if requested
    let ctas = null;
    if (generateCTAs) {
      console.log("Generating CTAs for topic:", topic);
      const ctaResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `You generate compelling call-to-action banners for articles. Return ONLY valid JSON with no markdown formatting.
              
Response format:
{
  "middle": {
    "headline": "SHORT CATCHY HEADLINE IN CAPS (max 8 words)",
    "description": "One sentence describing the value proposition (max 20 words)",
    "buttonText": "ACTION VERB + NOUN (max 4 words)"
  },
  "end": {
    "headline": "SHORT CATCHY HEADLINE IN CAPS (max 8 words)",
    "description": "One sentence with urgency or benefit (max 20 words)",
    "buttonText": "ACTION VERB + NOUN (max 4 words)"
  }
}

Guidelines:
- Headlines should be attention-grabbing and relevant to the topic
- Descriptions should offer clear value
- Button text should be action-oriented
- Make the end CTA slightly more urgent than the middle one
- NEVER use em dashes (—) or en dashes (–)`
            },
            {
              role: "user",
              content: `Generate two CTAs for an article about: ${topic}`
            }
          ],
        }),
      });

      if (ctaResponse.ok) {
        const ctaData = await ctaResponse.json();
        const ctaText = ctaData.choices?.[0]?.message?.content;
        if (ctaText) {
          try {
            // Clean the response - remove markdown code blocks if present
            const cleanedText = ctaText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            ctas = JSON.parse(cleanedText);
            console.log("CTAs generated:", ctas);
          } catch (e) {
            console.error("Failed to parse CTA JSON:", e, ctaText);
          }
        }
      }
    }

    // Build metadata about what was applied
    const appliedRules = {
      gapAnalysisUsed: !!gapAnalysis && gapAnalysis.trim().length > 0,
      formatReferenceUsed: !!formatReference && formatReference.trim().length > 0,
      contextFilesUsed: contextFiles && Array.isArray(contextFiles) && contextFiles.length > 0,
      contextFileNames: contextFiles?.map((f: { name: string }) => f.name) || [],
      keywordsUsed: keywords && Array.isArray(keywords) && keywords.length > 0,
      keywords: keywords || [],
      targetWordCount: targetWords,
      outlineProvided: !!outline && outline.trim().length > 0,
      customInstructionsProvided: !!instructions && instructions.trim().length > 0,
      knowledgeBaseUsed: useKnowledgeBase && knowledgeRules.length > 0,
      knowledgeRulesCount: knowledgeRules.length,
      toneProfileUsed: !!toneProfile,
    };

    console.log("Applied rules:", appliedRules);

    return new Response(
      JSON.stringify({ content, appliedRules, ctas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate content";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
