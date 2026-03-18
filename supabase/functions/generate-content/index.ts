import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, length, outline, instructions, gapAnalysis, valuePromiseClaims, formatReference, contextFiles, keywords, generateCTAs, ctaUrl, useKnowledgeBase, toneProfileId, articleImages, expandExistingContent, existingContent, wordsToAdd, wordCount, useFirstPerson, skipFaqs, skipQuickTips, skipSources, migrationMode } = await req.json();

    // Handle expand mode - different validation
    if (expandExistingContent) {
      if (!existingContent) {
        return new Response(
          JSON.stringify({ error: "Existing content is required for expansion" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (!topic) {
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
      "medium-long": 1500,
      long: 2000,
      extended: 3000,
      comprehensive: 3500,
    };
    const targetWords = wordCount || wordCounts[length] || 1000;
    const tolerance = migrationMode ? 0.20 : 0.15;
    const wordFloor = Math.round(targetWords * (1 - tolerance));
    const wordCeiling = Math.round(targetWords * (1 + tolerance));

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

    // Calculate required tables based on word count (relaxed for migration)
    const requiredTables = migrationMode ? 1 : (targetWords >= 3000 ? 4 : targetWords >= 2000 ? 3 : 1);

    // Calculate per-section word budgets so the AI knows exactly how much to write per section
    const sectionBudgets = (() => {
      const fixedSections: { name: string; words: number; included: boolean }[] = [
        { name: "Opening paragraph (after H1)", words: 40, included: true },
        { name: "TL;DR", words: 60, included: true },
        { name: "Quick Tips", words: skipQuickTips ? 0 : 50, included: !skipQuickTips },
        { name: "In This Article", words: migrationMode ? 0 : 80, included: !migrationMode },
        { name: "How to Choose", words: Math.round(targetWords * 0.08), included: true },
        { name: "FAQ", words: skipFaqs ? 0 : Math.round(targetWords * 0.12), included: !skipFaqs },
        { name: "Final Thoughts", words: Math.round(targetWords * 0.05), included: true },
        { name: "References", words: skipSources ? 0 : 30, included: !skipSources },
      ];
      const fixedTotal = fixedSections.filter(s => s.included).reduce((sum, s) => sum + s.words, 0);
      const remainingWords = targetWords - fixedTotal;
      // Estimate number of body H2 sections based on target length
      const bodyH2Count = targetWords <= 500 ? 2 : targetWords <= 1000 ? 3 : targetWords <= 1500 ? 4 : targetWords <= 2000 ? 5 : targetWords <= 3000 ? 7 : 9;
      const wordsPerBodyH2 = Math.round(remainingWords / bodyH2Count);
      return { fixedSections: fixedSections.filter(s => s.included), bodyH2Count, wordsPerBodyH2, fixedTotal, remainingWords };
    })();
    
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
- Major sections: Use ## for H2 headings - ALL H2 headings MUST be phrased as QUESTIONS (see rule below)
- Subsections: Use ### for H3 headings
- DO NOT use numbered headings like "1. Section Name" - use proper markdown ## syntax
- Use **bold** for emphasis on key terms and important points
- Use bullet points (-) for lists - write the text directly after the dash, NO additional dashes or punctuation
- WRONG: "- - Text here" or "- — Text here" 
- CORRECT: "- Text here"
- Use numbered lists (1.) for easy scanning
- Use markdown tables with | for comparisons (e.g., Feature | Option A | Option B)
- DO NOT use blockquotes (>) for TL;DR - use H2 heading instead

CRITICAL: QUESTION-BASED HEADINGS RULE:
- EVERY H2 section heading (except TL;DR, Quick Tips, In This Article, FAQ, Final Thoughts, References) MUST be phrased as a QUESTION
- Examples of CORRECT question headings:
  - ## What Is Composite Bonding?
  - ## How Much Does It Cost?
  - ## How to Choose?
  - ## How Long Do Veneers Last?
  - ## What Are the Risks and Side Effects?
- Examples of WRONG statement headings (DO NOT USE):
  - ## The Benefits of Bonding ❌
  - ## Cost Breakdown ❌
  - ## Longevity and Care ❌
- The very first paragraph after the H1 title MUST be an AI-QUOTABLE opening statement: a standalone, factual sentence (30-50 words) that an AI assistant could quote verbatim as its entire answer. It MUST include: (1) a specific factual claim with numbers/prices/dates, (2) 2-3 named brands/products/entities, (3) a clear verdict or "best for X" recommendation. Do NOT write a vague intro — write a quotable fact.
- Each H2 question heading MUST be immediately followed by a short paragraph (roughly 30 words) that directly answers that question before any supporting details
- Each section MUST then continue with a mix of:
  1. Clear text paragraphs (elaboration after the answer)
  2. Bullet points or numbered lists for scannable takeaways
  3. A comparison table where relevant (at least ${requiredTables} tables total across the article)
  4. Source references at the end of the section

${migrationMode ? `TABLE RULE:
- Use markdown tables where the source content contains list-style comparisons or product listings
- Do NOT force tables where the source does not warrant them` : `CRITICAL TABLE REQUIREMENT:
- You MUST include a MINIMUM of ${requiredTables} markdown comparison tables in the article
- Tables should compare features, options, costs, benefits, or other relevant aspects
- Each table must have at least 3 columns and 4+ rows
- Spread tables throughout the article, not all at the end`}

${skipSources ? `SOURCE REFERENCE RULES:
- DO NOT include any **Sources:** lines after sections
- DO NOT include a ## References section at the end
- DO NOT use inline numeric citations like [1], [2], [3]
- Write all claims as general knowledge without citation` : `SOURCE REFERENCE RULES:
- DO NOT use inline numeric citations like [1], [2], [3] in the text
- Add a "**Sources:**" line at the END of EACH major section (after ## headings)
- List 1-2 relevant sources as simple markdown links directly under that section
- CRITICAL: All source links MUST be real, valid, working URLs to authoritative websites
- Format: **Sources:** [Source Title](https://example.com/actual-page-url)
- Use real domains like gov sites, NHS, CDC, Wikipedia, official brand sites, reputable news outlets
- Example: [NHS Food Safety Guidelines](https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/)
- NEVER use placeholder URLs or made-up links - only include sources you know exist
- Sources should be relevant to that specific section's content`}

ARTICLE STRUCTURE (in this order) — WORD BUDGET PER SECTION:
Total target: ${targetWords} words. Each section has a strict word budget. Do NOT exceed individual section budgets.

${sectionBudgets.fixedSections.map(s => `- ${s.name}: ~${s.words} words`).join("\n")}
- Body H2 sections: ${sectionBudgets.bodyH2Count} sections × ~${sectionBudgets.wordsPerBodyH2} words each = ~${sectionBudgets.remainingWords} words total

SECTION DETAILS:
1. Title (# H1) + Opening paragraph (~${sectionBudgets.fixedSections.find(s => s.name.includes("Opening"))?.words || 40} words) — AI-quotable factual statement
2. ## TL;DR (~${sectionBudgets.fixedSections.find(s => s.name === "TL;DR")?.words || 60} words) — exactly 1 dense paragraph, NOT bullet points. Self-contained statement an AI could quote. Include specific names, numbers, clear verdict.

${skipQuickTips ? '' : `3. ## Quick Tips (~${sectionBudgets.fixedSections.find(s => s.name === "Quick Tips")?.words || 50} words) — exactly 3 tips:
   > **Tip 1:** [One short sentence - max 15 words]
   > **Tip 2:** [One short sentence - max 15 words]
   > **Tip 3:** [One short sentence - max 15 words]
`}
${migrationMode ? `4. DO NOT include an "In This Article" section - this is generated automatically by the client.` : `4. ## In This Article (~${sectionBudgets.fixedSections.find(s => s.name === "In This Article")?.words || 80} words) — navigation guide:
   - Format as a BULLETED LIST: - **1. Section Title** - DETAILED description (MINIMUM 150 characters)
   - List ALL main H2 sections from the article (not TL;DR or References)
   - DO NOT SKIP THIS SECTION`}
5. ${sectionBudgets.bodyH2Count} Main content sections with ## QUESTION headings (~${sectionBudgets.wordsPerBodyH2} words EACH, no more)
   - Each answered with text + bullets + tables${skipSources ? '' : ' + **Sources:** at the end'}
   - Include comparison table(s) where relevant
6. "## How to Choose" (~${sectionBudgets.fixedSections.find(s => s.name === "How to Choose")?.words || 80} words) — practical checklist, 4-6 criteria as bullet points
${skipFaqs ? '' : `7. "## Frequently Asked Questions" (~${sectionBudgets.fixedSections.find(s => s.name === "FAQ")?.words || 120} words) — 4-6 Q&As in bold question format`}
8. "## Final Thoughts" (~${sectionBudgets.fixedSections.find(s => s.name === "Final Thoughts")?.words || 50} words) — with call-to-action
${skipSources ? '' : `9. "## References:" (~${sectionBudgets.fixedSections.find(s => s.name === "References")?.words || 30} words) — list ALL sources as markdown links`}

⚠️ WORD BUDGET ENFORCEMENT: Each body H2 section MUST be ~${sectionBudgets.wordsPerBodyH2} words. If you write ${sectionBudgets.bodyH2Count} body sections at ${sectionBudgets.wordsPerBodyH2} words each plus fixed sections, the total will be ~${targetWords} words. Going over budget on ANY section means the total will overshoot. Be disciplined.

Content Guidelines:
- Start with a compelling hook that addresses the reader's pain point
- Each section answers its heading question directly in the first 1-2 sentences
- Include comparison tables when comparing options
- Use short paragraphs (2-3 sentences max)
- Add a strong conclusion with a clear call-to-action
- Write naturally, avoiding keyword stuffing

PERSPECTIVE RULE (NON-NEGOTIABLE):
${useFirstPerson
  ? `- Write in FIRST PERSON. Use "we", "our", "I" naturally throughout the article.`
  : `- Write in THIRD PERSON only. Do NOT use first-person pronouns: "I", "we", "our", "my", "us"\n- Write as an objective, authoritative narrator: "Hikers will find...", "Visitors can expect...", "The data shows..."\n- NEVER personalise the article as if the author is speaking from experience`
}

HUMAN WRITING STYLE (apply to ALL content):

1. SENTENCE RHYTHM:
   - Mix short punchy sentences (5-8 words), medium sentences (10-15 words), and occasional longer explanations (18-25 words)
   - Never have 3 or more sentences of similar length in a row

2. BANNED AI PHRASES - NEVER use any of these:
   - Transitions: "Moreover", "Furthermore", "Additionally", "In addition", "Consequently", "Thus", "Hence", "Therefore"
   - Openers: "In today's world", "It's important to note", "It goes without saying", "At the end of the day", "In conclusion", "To summarize", "When it comes to", "The reality is"
   - Vague descriptors: "various", "numerous", "significant", "substantial", "considerable", "plethora", "myriad"
   - AI buzzwords: "utilize", "leverage", "delve", "embark", "journey", "landscape", "robust", "streamline", "synergy", "paradigm", "holistic", "cutting-edge", "game-changer"

3. SPECIFICITY OVER VAGUENESS:
   - Replace "many people" with specific numbers or groups
   - Replace "significant impact" with measurable outcomes
   - Replace "can help" with exactly how it helps
   - Every claim should have a number, example, or caveat

4. CONVERSATIONAL VOICE:
   - Use contractions naturally (it's, don't, won't, you'll)
   - Include rhetorical questions to engage the reader
   - Add occasional personal observations or asides
   - Write as if explaining to a knowledgeable colleague, not lecturing a student

5. ANTI-PATTERN STRUCTURE:
   - Do NOT follow the predictable "intro-point-point-point-conclusion" essay structure
   - Vary paragraph lengths (some 1 sentence, some 2-3)
   - Start some sections with a question, others with a bold claim, others with a specific example
   - Include realistic limitations and caveats alongside benefits

6. BRITISH ENGLISH:
   - Use: optimise, colour, organisation, behaviour, centre, programme
   - Not: optimize, color, organization, behavior, center, program

${migrationMode ? '' : `7. EXPERT QUOTE:
   - Include at least one quote from a real, named expert or professional relevant to the topic
   - Format as a blockquote with attribution: > "Quote text" - Name, Title/Role
   - The person and quote should be real and verifiable, not fabricated
   - Place the quote where it adds credibility or a human perspective to the discussion`}`;

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

IMPORTANT: Maintain this tone consistently throughout the entire article.
CRITICAL: The tone profile defines HOW to write (style, vocabulary, rhythm), NOT who is speaking. NEVER refer to the tone profile owner by name. Do not say things like "Hi, it's [Name]" or "[Name] recommends..." - just adopt the style naturally.`;
    }

    if (formatReference) {
      systemPrompt += `

IMPORTANT: Match the formatting style and structure of this reference article:
${formatReference.substring(0, 2000)}`;
    }

    let userPrompt = "";
    
    // Handle expansion mode
    if (expandExistingContent && existingContent) {
      userPrompt = `EXPAND AND ENHANCE this existing article to reach approximately ${targetWords} words total (stay within 15% of this target).

CURRENT ARTICLE (keep all existing content, expand each section):
${existingContent}

EXPANSION REQUIREMENTS:
- Current word count is approximately ${targetWords - (wordsToAdd || 500)} words
- Target word count: ${targetWords} words (need to add ~${wordsToAdd || 500} more words)
- Keep ALL existing content intact - do not remove or shorten anything
- Expand each major section with additional details, examples, and explanations
- Add more subsections under existing H2s where it makes sense
- Include additional practical examples, case studies, or scenarios
- Add more comparison content or tables if helpful
- Ensure new content is substantive and valuable, not filler
- Maintain the same tone, style, and formatting as the original
- The final output MUST be at least ${targetWords} words

OUTPUT THE COMPLETE EXPANDED ARTICLE with all original content plus expansions.`;

      if (instructions && instructions.trim()) {
        userPrompt += `

Additional expansion instructions:
${instructions}`;
      }
    } else {
      // Normal generation mode
      userPrompt = `Write a blog post about: ${topic}

WORD COUNT REQUIREMENT (NON-NEGOTIABLE): The article MUST be between ${wordFloor} and ${wordCeiling} words (target: ${targetWords}). HARD CEILING: ${wordCeiling} words - going over this limit is a failure. If you are approaching ${wordCeiling} words and still have sections left, be more concise or drop lower-priority detail. If you finish all planned sections before reaching ${wordFloor} words, expand sections with more detail. Count your words as you write.`;

      // Add keywords if provided
      if (keywords && Array.isArray(keywords) && keywords.length > 0) {
        userPrompt += `

IMPORTANT SEO KEYWORDS TO USE:
The following keywords MUST be naturally incorporated throughout the article, especially in headings, the first paragraph, and key sections:
${keywords.map((k: string, i: number) => `${i + 1}. ${k}`).join("\n")}

Use each keyword at least 2-3 times throughout the article where it fits naturally.`;
      }

      // Inject value promise claims as mandatory per-claim requirements
      const claimsArray: string[] = Array.isArray(valuePromiseClaims)
        ? valuePromiseClaims.filter((c: string) => c && c.trim())
        : [];

      if (claimsArray.length > 0) {
        userPrompt += `

🚨 MANDATORY VALUE PROMISE CLAIMS - NON-NEGOTIABLE:
The article MUST substantively cover EVERY one of the following ${claimsArray.length} claims. Each claim requires its own dedicated section or clearly identifiable coverage with at least 2-3 paragraphs of specific, detailed content. A single sentence or passing mention is NOT acceptable and will count as a failure.

${claimsArray.map((c: string, i: number) => `CLAIM ${i + 1}: ${c}`).join("\n")}

ENFORCEMENT RULES:
- If a claim mentions a specific comparison (e.g., "Albanian food vs British food"), include a dedicated section with a comparison table and detailed paragraphs on BOTH sides.
- If a claim mentions specific populations or conditions (e.g., "gluten-free", "food sensitivities"), dedicate a full section to it with named conditions, practical advice, and examples.
- If a claim mentions "context files" or specific data sources, explicitly reference and use that material.
- Before finishing the article, mentally check each claim: is it addressed in a dedicated, substantive way? If not, add a section for it.
- Do NOT sacrifice any claim for length — but stay within the word count target. Be concise and substantive rather than padding with filler.`;
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

      // Add article images for AI placement
      if (articleImages && Array.isArray(articleImages) && articleImages.length > 0) {
        userPrompt += `

ARTICLE IMAGES TO USE:
You have ${articleImages.length} image(s) available to place in the article. Insert them at relevant points using markdown image syntax.
${articleImages.map((img: { alt: string; url: string }, i: number) => `${i + 1}. ![${img.alt}](${img.url})`).join("\n")}

Place these images throughout the article at logical locations, typically after relevant paragraphs. Distribute them evenly across different sections.`;
      }
    }


    console.log(expandExistingContent ? "Expanding existing content" : "Generating content for topic:", topic);

    // Use stronger model for long articles, default flash for shorter ones
    const model = targetWords >= 2000 ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview";
    // Token budget: structural sections (FAQ, References, tables, CTAs) need significant overhead beyond raw word count
    const maxTokens = Math.min(Math.max(8192, Math.ceil(wordCeiling * 5)), 32768);

    console.log(`Using model: ${model}, max_tokens: ${maxTokens}, target words: ${targetWords}`);
    console.log(`Word budgets: ${sectionBudgets.bodyH2Count} body H2s × ${sectionBudgets.wordsPerBodyH2} words = ${sectionBudgets.remainingWords} + ${sectionBudgets.fixedTotal} fixed = ${targetWords}`);

    const callModel = async (promptSuffix = ""): Promise<{ content: string; finishReason: string | undefined }> => {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt + promptSuffix },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return Promise.reject({ status: 429, message: "Rate limit exceeded. Please try again in a moment." });
        }
        if (response.status === 402) {
          return Promise.reject({ status: 402, message: "AI usage limit reached. Please add credits to continue." });
        }
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const firstChoice = data.choices?.[0];
      const generatedContent = firstChoice?.message?.content;

      if (!generatedContent) {
        throw new Error("No content generated");
      }

      return {
        content: generatedContent,
        finishReason: firstChoice?.finish_reason,
      };
    };

    const rebalanceToRange = async (content: string): Promise<string> => {
      let current = content;

      for (let i = 0; i < 4; i++) {
        const words = countWords(current);
        if (words >= wordFloor && words <= wordCeiling) return current;

        const needsCondense = words > wordCeiling;
        const operation = needsCondense ? "condense" : "expand";

        console.warn(`Word count out of range (${words}). Running ${operation} pass ${i + 1}/4.`);

        const rebalancePrompt = `${needsCondense
          ? `Rewrite this complete article to ${targetWords} words target (strict range ${wordFloor}-${wordCeiling}). Keep all sections and meaning, but condense wording in EVERY section so the final output lands in range.`
          : `Rewrite this complete article to ${targetWords} words target (strict range ${wordFloor}-${wordCeiling}). Keep all sections and add concise, concrete depth where needed so the final output lands in range.`}

CRITICAL RULES:
- Return the FULL article from # title through the ending section
- Do NOT output partial content
- Keep headings and structure intact
- PRESERVE ALL MARKDOWN TABLES exactly as they are - do NOT remove or simplify any table
- End with a complete sentence
- Return markdown only

ARTICLE:
${current}`;

        const rebalanceResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            max_tokens: Math.min(Math.max(8192, Math.ceil(wordCeiling * 5)), 32768),
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: rebalancePrompt },
            ],
          }),
        });

        if (!rebalanceResponse.ok) {
          const errorText = await rebalanceResponse.text();
          console.error("Rebalance failed:", rebalanceResponse.status, errorText);
          break;
        }

        const rebalanceData = await rebalanceResponse.json();
        const rewritten = rebalanceData.choices?.[0]?.message?.content;
        if (!rewritten) break;

        current = rewritten;
      }

      const finalWords = countWords(current);
      if (finalWords < wordFloor || finalWords > wordCeiling) {
        console.warn(`Final strict rebalance pass: ${finalWords} words still outside ${wordFloor}-${wordCeiling}`);

        const strictPrompt = `Rewrite this FULL article to land between ${wordFloor} and ${wordCeiling} words (target ${targetWords}).

STRICT:
- Keep ALL existing sections/headings
- PRESERVE ALL MARKDOWN TABLES - do NOT remove any table
- Preserve meaning and key facts
- Do not remove Final Thoughts / CTA context
- Return complete markdown only

ARTICLE:
${current}`;

        const strictResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            max_tokens: Math.min(Math.max(8192, Math.ceil(wordCeiling * 5)), 32768),
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: strictPrompt },
            ],
          }),
        });

        if (strictResponse.ok) {
          const strictData = await strictResponse.json();
          const strictContent = strictData.choices?.[0]?.message?.content;
          if (strictContent) current = strictContent;
        }
      }

      // DETERMINISTIC TRIMMER: If AI rebalance failed, programmatically trim sections from bottom up
      const finalWordCount = countWords(current);
      if (finalWordCount > wordCeiling) {
        console.warn(`Deterministic trimmer: ${finalWordCount} words > ceiling ${wordCeiling}. Trimming body sections from bottom up.`);
        
        // Split into sections by H2 headings
        const sectionRegex = /^## /m;
        const parts = current.split(sectionRegex);
        if (parts.length > 1) {
          // Reconstruct sections with their headings
          const sections: { heading: string; content: string; priority: number }[] = [];
          const intro = parts[0]; // Content before first H2
          
          for (let i = 1; i < parts.length; i++) {
            const newlineIdx = parts[i].indexOf("\n");
            const heading = newlineIdx >= 0 ? parts[i].substring(0, newlineIdx).trim() : parts[i].trim();
            const body = newlineIdx >= 0 ? parts[i].substring(newlineIdx) : "";
            
            // Assign priority (higher = more expendable)
            const headingLower = heading.toLowerCase();
            let priority = 5; // default body section - expendable
            if (headingLower.includes("tl;dr") || headingLower.includes("tldr")) priority = 1;
            else if (headingLower.includes("quick tips")) priority = 1;
            else if (headingLower.includes("in this article")) priority = 1;
            else if (headingLower.includes("final thoughts")) priority = 2;
            else if (headingLower.includes("how to choose")) priority = 2;
            else if (headingLower.includes("faq") || headingLower.includes("frequently asked")) priority = 3;
            else if (headingLower.includes("references")) priority = 4;
            
            sections.push({ heading, content: body, priority });
          }
          
          // Sort body sections (priority 5) and trim from the last one upward
          let rebuilt = intro;
          const sortedSections = [...sections];
          
          // Remove expendable body sections from the end until we're in range
          while (countWords(rebuilt + sortedSections.map(s => `## ${s.heading}${s.content}`).join("")) > wordCeiling) {
            // Find the last body section (priority 5) and trim its content by ~30%
            const lastBodyIdx = sortedSections.map((s, i) => ({ ...s, idx: i })).filter(s => s.priority === 5).pop();
            if (!lastBodyIdx) break; // No more body sections to trim
            
            const sectionWords = countWords(sortedSections[lastBodyIdx.idx].content);
            if (sectionWords < 30) {
              // Section already minimal, remove it entirely
              sortedSections.splice(lastBodyIdx.idx, 1);
            } else {
              // Trim the section: keep only first ~60% of paragraphs
              const paragraphs = sortedSections[lastBodyIdx.idx].content.split(/\n\n+/);
              const keepCount = Math.max(1, Math.floor(paragraphs.length * 0.6));
              sortedSections[lastBodyIdx.idx].content = paragraphs.slice(0, keepCount).join("\n\n");
            }
          }
          
          current = rebuilt + sortedSections.map(s => `## ${s.heading}${s.content}`).join("");
          console.log(`Deterministic trimmer result: ${countWords(current)} words`);
        }
      }

      return current;
    };

    const generateWithRetry = async (): Promise<string> => {
      let generated = "";
      let finishReason: string | undefined;

      for (let attempt = 1; attempt <= 2; attempt++) {
        const retryPrompt = attempt > 1
          ? `\n\n⚠️ Your previous output was incomplete or off-target. Rewrite the FULL article from scratch and ensure it is complete (no cut-off ending) and within ${wordFloor}-${wordCeiling} words.`
          : "";

        const result = await callModel(retryPrompt);
        generated = result.content;
        finishReason = result.finishReason;

        const words = countWords(generated);
        console.log(`Attempt ${attempt}: Generated ${words} words (target ${targetWords}, range ${wordFloor}-${wordCeiling}, finish_reason ${finishReason || "unknown"})`);

        // If response hit token limit, regenerate once from scratch with stricter completion instruction
        if (finishReason === "length" && attempt < 2) {
          console.warn("Output hit token limit; retrying with strict full-completion instruction.");
          continue;
        }

        break;
      }

      if (!generated) {
        throw new Error("No content generated");
      }

      return rebalanceToRange(generated);
    };

    let content: string;
    try {
      content = await generateWithRetry();
    } catch (e: any) {
      if (e?.status === 429 || e?.status === 402) {
        return new Response(
          JSON.stringify({ error: e.message }),
          { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw e;
    }

    // Post-process: Remove any em dashes, en dashes, and horizontal rules
    content = content.replace(/—/g, "-").replace(/–/g, "-");
    // Remove horizontal rules (---, ***, ___ on their own line)
    content = content.replace(/^\s*[-*_]{3,}\s*$/gm, "");

    // Log word count overshoot for monitoring but do NOT truncate —
    // truncation causes mid-sentence/mid-section cuts. Rely on prompt + max_tokens instead.
    if (!expandExistingContent) {
      const wordCeiling = Math.round(targetWords * 1.15);
      const currentWordCount = content.split(/\s+/).filter(Boolean).length;
      if (currentWordCount > wordCeiling) {
        console.warn(`Word count overshoot: ${currentWordCount} words vs ${targetWords} target (ceiling ${wordCeiling}). Not truncating to avoid content damage.`);
      }
    }

    console.log("Content generated successfully");

    // ═══════════════════════════════════════════════════════════════════════
    // COMPLETENESS GUARD: Deterministic check for all required sections.
    // If any are missing, auto-generate them and append/insert.
    // ═══════════════════════════════════════════════════════════════════════
    let missingSections: string[] = [];
    if (!expandExistingContent && !migrationMode) {
      const contentLower = content.toLowerCase();

      // Check each required structural element
      const hasTLDR = /^#{1,3}\s.*tl;?\s?dr/im.test(content);
      const hasQuickTips = skipQuickTips || /^#{1,3}\s.*quick\s*tips/im.test(content);
      const hasInThisArticle = /in\s*this\s*article/i.test(content);
      const hasFAQ = skipFaqs || /^#{1,3}\s.*frequently\s*asked|^#{1,3}\s.*faq/im.test(content);
      const hasFinalThoughts = /^#{1,3}\s.*final\s*thoughts|^#{1,3}\s.*conclusion/im.test(content);
      const hasReferences = skipSources || /^#{1,3}\s.*references/im.test(content);

      // Count H2 body sections (excluding structural ones)
      const h2Matches = content.match(/^##\s+.+$/gm) || [];
      const structuralH2s = ["tl;dr", "tldr", "quick tips", "frequently asked", "faq", "final thoughts", "conclusion", "references", "in this article"];
      const bodyH2s = h2Matches.filter(h => !structuralH2s.some(s => h.toLowerCase().includes(s)));
      const hasEnoughBodySections = bodyH2s.length >= 3;

      if (!hasTLDR) missingSections.push("TL;DR");
      if (!hasQuickTips) missingSections.push("Quick Tips");
      if (!hasFAQ) missingSections.push("FAQ");
      if (!hasFinalThoughts) missingSections.push("Final Thoughts");
      if (!hasReferences) missingSections.push("References");

      if (missingSections.length > 0) {
        console.warn(`COMPLETENESS GUARD: Missing sections detected: ${missingSections.join(", ")}. Auto-generating...`);

        const completionPrompt = `You are completing an existing article. The following sections are MISSING and must be generated:

${missingSections.map(s => `- ${s}`).join("\n")}

EXISTING ARTICLE TOPIC: ${topic}

EXISTING ARTICLE (last 2000 chars for context):
${content.slice(-2000)}

INSTRUCTIONS:
- Generate ONLY the missing sections listed above, nothing else
- Use ## headings for each section
- Match the tone and style of the existing article
- For TL;DR: 1 dense, factual paragraph (NOT bullet points, NOT multiple paragraphs) that an AI could quote verbatim
- For Quick Tips: exactly 3 actionable tips as blockquotes
- For FAQ: 4-6 Q&As in bold question format with detailed answers
- For Final Thoughts: concluding paragraph with call-to-action
- For References: list all sources mentioned in the article as markdown links, plus 2-3 additional authoritative sources
- Return ONLY the missing section markdown, no explanations`;

        try {
          const completionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              max_tokens: 4096,
              messages: [
                { role: "system", content: "You complete articles by generating only the specific missing sections requested. Return markdown only." },
                { role: "user", content: completionPrompt },
              ],
            }),
          });

          if (completionResponse.ok) {
            const completionData = await completionResponse.json();
            let appendContent = completionData.choices?.[0]?.message?.content;
            if (appendContent) {
              // Clean
              appendContent = appendContent.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
              appendContent = appendContent.replace(/—/g, "-").replace(/–/g, "-");

              // Insert TL;DR and Quick Tips after H1 if missing at top, rest at end
              const topSections = ["TL;DR", "Quick Tips"];
              const bottomSections = ["FAQ", "Final Thoughts", "References"];
              
              // For simplicity, append all missing sections at the end
              // The "In This Article" nav and TL;DR should already be at the top from the main generation
              content = content.trimEnd() + "\n\n" + appendContent.trim();
              
              console.log(`COMPLETENESS GUARD: Successfully appended ${missingSections.length} missing section(s)`);
            }
          } else {
            console.error("COMPLETENESS GUARD: Failed to generate missing sections:", completionResponse.status);
          }
        } catch (guardError) {
          console.error("COMPLETENESS GUARD error:", guardError);
          // Non-fatal - return content as-is
        }
      } else {
        console.log("COMPLETENESS GUARD: All required sections present ✓");
      }
    }

    // Generate CTAs if requested
    let ctas = null;
    if (generateCTAs) {
      console.log("Generating CTAs for topic:", topic);
      
      // Build CTA prompt with custom instructions if provided
      let ctaUserPrompt = `Generate two CTAs for an article about: ${topic}`;
      if (ctaUrl) {
        ctaUserPrompt += `\n\nThe CTAs MUST promote this specific URL: ${ctaUrl}\nAnalyse the URL to determine the product/service/brand being promoted and tailor all CTA copy to drive clicks to this destination.`;
      }
      if (instructions && instructions.trim()) {
        ctaUserPrompt += `\n\nIMPORTANT CUSTOM INSTRUCTIONS FOR THE CTAs:\n${instructions}`;
      }
      
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
    "headline": "EMOJI + SHORT CATCHY HEADLINE IN ALL CAPS",
    "description": "Two sentences max. Describe what the reader gets and why it matters. Use bold (<strong>) on 1-2 key product phrases.",
    "buttonText": "SHOP [SPECIFIC PRODUCT] →",
    "tagline": "Benefit 1 · Benefit 2 · Benefit 3"
  },
  "end": {
    "headline": "EMOJI + SHORT CATCHY HEADLINE IN ALL CAPS",
    "description": "Two sentences max with slightly more urgency. Use bold (<strong>) on 1-2 key product phrases.",
    "buttonText": "SHOP [SPECIFIC PRODUCT] →",
    "tagline": "Benefit 1 · Benefit 2 · Benefit 3"
  }
}

STRICT RULES — follow this exact pattern from a proven high-performing example:
- HEADLINE: Start with a relevant emoji, then ALL CAPS text, max 6 words. Example: "🎳 LEVEL UP YOUR LEAGUE LOOK!"
- DESCRIPTION: 1-2 short sentences about the product benefit. Bold the core product with <strong>. Example: "Stand out on the lanes with <strong>custom bowling jerseys</strong> designed for your team. Unlimited designs, premium quality."
- BUTTON TEXT: Must follow pattern "SHOP [SPECIFIC PRODUCT] →" — always ALL CAPS, always end with →, always start with SHOP. Example: "SHOP CUSTOM JERSEYS →"
- TAGLINE: Three short benefits separated by · (middle dot). Example: "Free design assistance · Fast turnaround · Team discounts"
- NEVER use em dashes (—) or en dashes (–)
- The headline emoji should match the article topic
- If custom instructions mention a specific product/brand, use that product name in the button text
- Keep descriptions conversational and benefit-focused, not salesy`
            },
            {
              role: "user",
              content: ctaUserPrompt
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
      articleImagesUsed: articleImages && Array.isArray(articleImages) && articleImages.length > 0,
      articleImagesCount: articleImages?.length || 0,
    };

    console.log("Applied rules:", appliedRules);

    return new Response(
      JSON.stringify({ content, appliedRules, ctas, completenessGuard: missingSections.length > 0 ? { fixed: missingSections, status: "auto-completed" } : { fixed: [], status: "complete" } }),
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
