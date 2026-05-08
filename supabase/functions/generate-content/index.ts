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
    const { topic, length, outline, instructions, gapAnalysis, valuePromiseClaims, formatReference, contextFiles, keywords, generateCTAs, ctaUrl, useKnowledgeBase, toneProfileId, articleImages, expandExistingContent, existingContent, wordsToAdd, wordCount, useFirstPerson, skipFaqs, skipQuickTips, skipSources, migrationMode, useBrainInsights } = await req.json();

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

    // Fetch brain insights if enabled
    let brainInsightsContext = "";
    if (useBrainInsights && topic) {
      const topicWords = topic.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      const { data: brainData } = await supabase
        .from("brain_insights")
        .select("title, insight_type, summary, full_text");

      if (brainData && brainData.length > 0) {
        // Score by keyword overlap with topic
        const scored = brainData.map((insight: any) => {
          const text = `${insight.title} ${insight.summary || ""} ${insight.full_text || ""}`.toLowerCase();
          const score = topicWords.reduce((acc: number, w: string) => acc + (text.includes(w) ? 1 : 0), 0);
          return { ...insight, score };
        }).filter((i: any) => i.score > 0).sort((a: any, b: any) => b.score - a.score).slice(0, 5);

        if (scored.length > 0) {
          brainInsightsContext = scored.map((i: any) =>
            `[${i.insight_type.toUpperCase()}] ${i.title}: ${i.summary || ""}\n${i.full_text || ""}`
          ).join("\n---\n");
          console.log(`Loaded ${scored.length} brain insights for topic: ${topic}`);
        }
      }
    }

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
    const requiredTables = migrationMode ? 1 : Math.max(1, Math.floor(targetWords / 600));

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

    // Pre-compute dynamic section budget strings to avoid nested template literals
    const fixedSectionBudgetList = sectionBudgets.fixedSections.map(s => "- " + s.name + ": ~" + s.words + " words").join("\n");
    const quickTipsWords = sectionBudgets.fixedSections.find(s => s.name === "Quick Tips")?.words || 50;
    const inThisArticleWords = sectionBudgets.fixedSections.find(s => s.name === "In This Article")?.words || 80;
    const faqWords = sectionBudgets.fixedSections.find(s => s.name === "FAQ")?.words || 120;
    const referencesWords = sectionBudgets.fixedSections.find(s => s.name === "References")?.words || 30;
    const openingWords = sectionBudgets.fixedSections.find(s => s.name.includes("Opening"))?.words || 40;
    const tldrWords = sectionBudgets.fixedSections.find(s => s.name === "TL;DR")?.words || 60;
    const howToChooseWords = sectionBudgets.fixedSections.find(s => s.name === "How to Choose")?.words || 80;
    const finalThoughtsWords = sectionBudgets.fixedSections.find(s => s.name === "Final Thoughts")?.words || 50;
    
    const quickTipsSection = skipQuickTips ? '' : "3. ## Quick Tips (~" + quickTipsWords + " words) — exactly 3 tips:\n   > **Tip 1:** [One short sentence - max 15 words]\n   > **Tip 2:** [One short sentence - max 15 words]\n   > **Tip 3:** [One short sentence - max 15 words]\n";
    const inThisArticleSection = migrationMode
      ? "4. DO NOT include an \"In This Article\" section - this is generated automatically by the client."
      : "4. ## In This Article (~" + inThisArticleWords + " words) — navigation guide:\n   - Format as a BULLETED LIST: - **1. Section Title** - DETAILED description (MINIMUM 150 characters)\n   - List ALL main H2 sections from the article (not TL;DR or References)\n   - DO NOT SKIP THIS SECTION";
    const faqSection = skipFaqs ? '' : `7. ## Frequently Asked Questions (~${faqWords} words) — MANDATORY SECTION, MUST BE INCLUDED.
   - Use the EXACT H2 heading: "## Frequently Asked Questions" (do not rename, do not skip)
   - Include 4-6 Q&A pairs in this EXACT markdown format (the parser depends on it):

\`\`\`
**What is the typical cost?**

The typical cost ranges from X to Y depending on Z.

**How long does it take?**

Most people complete the process in 2-4 weeks.
\`\`\`

   - Each question wrapped in **bold** asterisks, ending with a question mark
   - Blank line after the bolded question
   - Answer as a plain paragraph (1-3 sentences), NOT bolded, NOT prefixed with "A:" or "Answer:"
   - Blank line between Q&A pairs
   - Do NOT use ### headings, > blockquotes, or "Q:" / "A:" prefixes
   - Questions must be SPECIFIC to the article topic (not generic placeholders)`;
    const referencesSection = skipSources ? '' : "9. \"## References:\" (~" + referencesWords + " words) — list ALL sources as markdown links";
    
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
- Major sections: Use ## for H2 headings${!formatReference ? ' - ALL H2 headings MUST be phrased as QUESTIONS (see rule below)' : ''}
- Subsections: Use ### for H3 headings
- DO NOT use numbered headings like "1. Section Name" - use proper markdown ## syntax
- Use **bold** for emphasis on key terms and important points
- Use bullet points (-) for lists - write the text directly after the dash, NO additional dashes or punctuation
- WRONG: "- - Text here" or "- — Text here" 
- CORRECT: "- Text here"
- Use numbered lists (1.) for easy scanning
- Use markdown tables with | for comparisons (e.g., Feature | Option A | Option B)
- DO NOT use blockquotes (>) for TL;DR - use H2 heading instead

${formatReference ? `FORMAT REFERENCE MODE: A format reference has been provided. You MUST replicate the STRUCTURE and LAYOUT PATTERN of the reference article instead of using the standard article template. The reference structure takes priority over default section rules. Keep the same types of sections, headings, and content patterns as the reference. Target word count: ~${targetWords} words.` : `CRITICAL: QUESTION-BASED HEADINGS RULE:
- EVERY H2 section heading (except TL;DR, Quick Tips, In This Article, FAQ, Final Thoughts, References) MUST be phrased as a QUESTION
- Examples of CORRECT question headings:
  - ## What Is Composite Bonding?
  - ## How Much Does It Cost?
  - ## How to Choose the Right Treatment?
  - ## How Long Do Veneers Last?
  - ## What Are the Risks and Side Effects?
- Examples of WRONG statement headings (DO NOT USE):
  - ## The Benefits of Bonding ❌
  - ## Cost Breakdown ❌
  - ## Longevity and Care ❌
- The very first paragraph after the H1 title MUST be an AI-QUOTABLE opening statement: a standalone, factual sentence (30-50 words) that an AI assistant could quote verbatim as its entire answer. It MUST directly answer the title question with a clear factual claim and a practical verdict. Do NOT force prices, brand names, product models, or "best for X" recommendations unless the user's instructions explicitly allow them.
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

${fixedSectionBudgetList}
- Body H2 sections: ${sectionBudgets.bodyH2Count} sections × ~${sectionBudgets.wordsPerBodyH2} words each = ~${sectionBudgets.remainingWords} words total

SECTION DETAILS:
1. Title (# H1) + Opening paragraph (~${openingWords} words) — AI-quotable factual statement
2. ## TL;DR (~${tldrWords} words) — exactly 1 dense paragraph, NOT bullet points. Self-contained statement an AI could quote. Include specific names, numbers, clear verdict.

${quickTipsSection}
${inThisArticleSection}
5. ${sectionBudgets.bodyH2Count} Main content sections with ## QUESTION headings (~${sectionBudgets.wordsPerBodyH2} words EACH, no more)
   - Each answered with text + bullets + tables${skipSources ? '' : ' + **Sources:** at the end'}
   - Include comparison table(s) where relevant
6. Decision Guide H2 (~${howToChooseWords} words) — practical checklist of 4-6 criteria as bullet points.
   - The H2 MUST be a topic-specific decision question, NOT the generic "## How to Choose".
   - Build the heading from the article's actual subject. Examples by topic type:
     • Comparing products/services (e.g. dental treatments): "## How to Choose the Right Treatment for You"
     • Picking a place/destination: "## How to Pick the Right Trail" or "## How to Choose Where to Hike"
     • Skill-building / lifestyle (e.g. making friends): "## How to Decide Which Approach Works for You" or "## How to Find the Right Friendship Style"
     • Health / decision-making: "## How to Decide What's Right for Your Situation"
   - The heading must reference the article's actual topic noun (treatment, trail, approach, plan, etc.). NEVER output the bare phrase "## How to Choose" or "## How to Choose?" with no topic noun.
   - Keep the section's purpose identical: a short intro line followed by a 4-6 item bulleted checklist of decision criteria.
${faqSection}
8. "## Final Thoughts" (~${finalThoughtsWords} words) — with call-to-action
${referencesSection}

⚠️ WORD BUDGET ENFORCEMENT: Each body H2 section MUST be ~${sectionBudgets.wordsPerBodyH2} words. If you write ${sectionBudgets.bodyH2Count} body sections at ${sectionBudgets.wordsPerBodyH2} words each plus fixed sections, the total will be ~${targetWords} words. Going over budget on ANY section means the total will overshoot. Be disciplined.`}

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

1. SENTENCE LENGTH (strict):
   - Target average: 10-12 words per sentence
   - Hard maximum: 20 words. If a sentence runs over 20 words, split it.
   - Mix in punchy 5-8 word sentences for rhythm
   - Allow occasional 16-20 word sentences only for complex technical points
   - Never have 3 or more sentences of similar length in a row
   - Tone profile takes priority: if the tone demands a longer signature sentence, the tone wins

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

    // Add brain insights context to the prompt
    if (brainInsightsContext) {
      systemPrompt += `

SEO BRAIN INSIGHTS (apply these strategic insights where relevant):
${brainInsightsContext}`;
    }

    // Add tone of voice instructions if a profile is selected - placed with HIGH PRIORITY
    if (toneProfile) {
      const chars = Object.entries(toneProfile.characteristics || {})
        .map(([key, value]) => `- ${key.replace(/_/g, " ")}: ${value}`)
        .join("\n");
      const phrases = toneProfile.example_phrases?.length
        ? `\nExample phrases to emulate (match this style closely):\n${toneProfile.example_phrases.map((p: string, i: number) => `${i + 1}. "${p}"`).join("\n")}`
        : "";

      systemPrompt += `

TONE OF VOICE (HIGHEST PRIORITY - THIS OVERRIDES DEFAULT WRITING STYLE):
Your writing style MUST match the following tone profile. Every sentence you write should sound like it was written by this voice. This is NOT optional guidance - it is the PRIMARY constraint on how you write.

Voice summary: ${toneProfile.summary || "Not specified"}

Style characteristics:
${chars}
${phrases}

CRITICAL TONE RULES:
- The tone profile defines HOW to write (vocabulary, rhythm, personality, warmth level) - NOT who is speaking
- NEVER refer to the tone profile owner by name
- NEVER say "Hi, it's [Name]" or "[Name] recommends..." - just adopt the voice naturally
- If the tone is casual/conversational, use casual language, contractions, and a relaxed rhythm
- If the tone is formal/expert, use precise language and authoritative phrasing
- Match the ENERGY and PERSONALITY of the example phrases, not just their words
- Maintain this tone CONSISTENTLY throughout the ENTIRE article - every paragraph, every section
- COMPETITOR RULE: Do NOT mention any competitor apps or platforms by name (e.g. Bumble, Bumble For Friends, Meetup, Hinge, Tinder, Eventbrite, Facebook Groups, or any other social/dating/friendship app). Use generic terms like "friendship apps", "social platforms", or "event platforms" instead. The ONLY app you may mention by name is "Meet5".`;
    }

    if (formatReference) {
      // Extract structural pattern from the reference rather than dumping raw content
      const refLines = formatReference.split('\n');
      const headings: string[] = [];
      const structuralElements: string[] = [];
      let hasNumberedItems = false;
      let hasProductCards = false;
      let hasTables = false;
      let hasRatings = false;
      let hasPricingButtons = false;
      let hasFaq = false;
      let hasComparison = false;
      
      for (const line of refLines) {
        const trimmed = line.trim();
        if (/^#{1,6}\s/.test(trimmed)) {
          headings.push(trimmed);
        }
        if (/^\d+[\.\)]\s/.test(trimmed) || /^#{1,3}\s*\d+[\.\)]\s/.test(trimmed)) {
          hasNumberedItems = true;
        }
        if (/product|review|rating|score|★|⭐|\/10|\/5/i.test(trimmed)) {
          hasProductCards = true;
        }
        if (/^\|/.test(trimmed)) {
          hasTables = true;
        }
        if (/\d+(\.\d+)?\s*\/\s*(10|5)|rating|score/i.test(trimmed)) {
          hasRatings = true;
        }
        if (/check price|buy now|shop now|view deal|add to cart/i.test(trimmed)) {
          hasPricingButtons = true;
        }
        if (/faq|frequently asked/i.test(trimmed)) {
          hasFaq = true;
        }
        if (/vs\.?|versus|compared|comparison/i.test(trimmed)) {
          hasComparison = true;
        }
      }

      // Build a structural description
      let structureDesc = `CRITICAL FORMAT REFERENCE - You MUST replicate the EXACT structure and layout pattern of the reference article. Do NOT fall back to a standard blog format.\n\n`;
      structureDesc += `HEADING STRUCTURE FROM REFERENCE (replicate this pattern with the new topic):\n`;
      for (const h of headings.slice(0, 30)) {
        structureDesc += `${h}\n`;
      }
      
      if (hasProductCards || hasRatings || hasPricingButtons) {
        structureDesc += `\nTHIS IS A PRODUCT REVIEW/COMPARISON FORMAT. You MUST:\n`;
        structureDesc += `- List products/items with numbered rankings\n`;
        if (hasRatings) structureDesc += `- Include ratings/scores for each item\n`;
        if (hasPricingButtons) structureDesc += `- Include call-to-action buttons (e.g. "Check Price")\n`;
        structureDesc += `- Describe each product with pros, cons, key features\n`;
        structureDesc += `- Match the review card structure from the reference\n`;
      }
      if (hasTables) {
        structureDesc += `\nThe reference uses TABLES - include comparison tables in the same style.\n`;
      }
      if (hasComparison) {
        structureDesc += `\nThe reference uses a COMPARISON format - compare items side by side.\n`;
      }
      if (hasFaq) {
        structureDesc += `\nThe reference includes an FAQ section - include one.\n`;
      }
      if (hasNumberedItems) {
        structureDesc += `\nThe reference uses NUMBERED LISTS/RANKINGS - replicate this pattern.\n`;
      }

      // Also include raw content for additional context (increased from 2000 to 6000)
      structureDesc += `\nFULL REFERENCE CONTENT (replicate this structure with the new topic):\n${formatReference.substring(0, 6000)}`;

      systemPrompt += `\n\n${structureDesc}`;
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

🚨 PRIMARY SOURCE OF TRUTH - CONTEXT FILES (NON-NEGOTIABLE):
The following reference materials are your AUTHORITATIVE source. You MUST:
1. Use ONLY facts, data, statistics, names, dates, and claims that appear in these files
2. NEVER fabricate or hallucinate information that is not in these files
3. If the files contain specific numbers, quotes, or details, use them EXACTLY as provided
4. If a topic is covered in the files, base your writing on the file content, NOT your training data
5. If the files do not cover a subtopic, you may use general knowledge BUT clearly keep it factual and verifiable
6. When in doubt, stick to what the files say — accuracy trumps creativity

CONTEXT FILES:
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
    // Keep token budget tighter to reduce latency/timeouts and discourage oversized outputs
    const maxTokens = Math.min(Math.max(2048, Math.ceil(wordCeiling * 2.2)), 8192);

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

    const trimToWordCount = (text: string, maxWords: number): string => {
      if (!text.trim() || maxWords <= 0) return "";
      const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length <= maxWords) return text.trim();
      const trimmed = words.slice(0, maxWords).join(" ").replace(/[,:;\-]$/, "").trim();
      return trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?") ? trimmed : `${trimmed}.`;
    };

    const trimSectionToBudget = (body: string, budget: number): string => {
      const cleaned = body.trim();
      if (!cleaned) return "";
      if (budget <= 0) return "";
      if (countWords(cleaned) <= budget) return cleaned;

      const paragraphs = cleaned.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
      const kept: string[] = [];
      let remaining = budget;

      for (const paragraph of paragraphs) {
        if (remaining <= 0) break;
        const paragraphWords = countWords(paragraph);

        if (paragraphWords <= remaining) {
          kept.push(paragraph);
          remaining -= paragraphWords;
          continue;
        }

        if (remaining < 10) break;

        const lines = paragraph.split("\n").map(line => line.trim()).filter(Boolean);
        const isTable = lines.some(line => line.includes("|"));
        if (isTable) {
          const tableLines = lines.filter(line => line.includes("|"));
          const minimalTable = tableLines.slice(0, Math.min(3, tableLines.length)).join("\n");
          const tableWords = countWords(minimalTable);
          if (tableWords <= remaining) {
            kept.push(minimalTable);
            remaining -= tableWords;
          }
          continue;
        }

        const sentences = paragraph.match(/[^.!?]+[.!?]?/g)?.map(s => s.trim()).filter(Boolean) ?? [paragraph];
        const sentenceBuffer: string[] = [];

        for (const sentence of sentences) {
          if (remaining <= 0) break;
          const sentenceWords = countWords(sentence);
          if (sentenceWords <= remaining) {
            sentenceBuffer.push(sentence);
            remaining -= sentenceWords;
            continue;
          }

          if (remaining >= 8) {
            sentenceBuffer.push(trimToWordCount(sentence, remaining));
            remaining = 0;
          }
          break;
        }

        if (sentenceBuffer.length > 0) kept.push(sentenceBuffer.join(" "));
        break;
      }

      if (!kept.length) return trimToWordCount(cleaned, Math.max(12, budget));
      return kept.join("\n\n").trim();
    };

    const splitByH2Sections = (markdown: string): { intro: string; sections: { heading: string; body: string }[] } => {
      const headingRegex = /^##\s+.+$/gm;
      const matches = [...markdown.matchAll(headingRegex)];

      if (matches.length === 0) {
        return { intro: markdown.trim(), sections: [] };
      }

      const intro = markdown.slice(0, matches[0].index ?? 0).trim();
      const sections = matches.map((match, index) => {
        const start = match.index ?? 0;
        const end = index + 1 < matches.length ? (matches[index + 1].index ?? markdown.length) : markdown.length;
        const block = markdown.slice(start, end).trim();
        const headingLine = match[0];
        const heading = headingLine.replace(/^##\s+/, "").trim();
        const body = block.slice(headingLine.length).trim();
        return { heading, body };
      });

      return { intro, sections };
    };

    const rebalanceToRange = (content: string): string => {
      let current = content
        .replace(/—/g, "-")
        .replace(/–/g, "-")
        .replace(/^\s*[-*_]{3,}\s*$/gm, "")
        .trim();

      if (!current) return current;

      const initialWords = countWords(current);
      if (initialWords >= wordFloor && initialWords <= wordCeiling) return current;

      const { intro, sections } = splitByH2Sections(current);
      if (sections.length === 0) {
        return initialWords > wordCeiling ? trimToWordCount(current, wordCeiling) : current;
      }

      const isDecisionGuideHeading = (headingLower: string): boolean => {
        return headingLower.includes("how to choose")
          || headingLower.includes("how to pick")
          || headingLower.includes("how to decide")
          || headingLower.includes("how to find the right")
          || headingLower.includes("how to select");
      };

      const isStructuralHeading = (heading: string): boolean => {
        const h = heading.toLowerCase();
        return h.includes("tl;dr")
          || h.includes("tldr")
          || h.includes("quick tips")
          || h.includes("in this article")
          || isDecisionGuideHeading(h)
          || h.includes("frequently asked")
          || h === "faq"
          || h.includes("final thoughts")
          || h.includes("conclusion")
          || h.includes("references");
      };

      const getFixedBudget = (name: string, fallback: number): number => {
        return sectionBudgets.fixedSections.find(s => s.name === name)?.words ?? fallback;
      };

      const introBudget = Math.max(35, getFixedBudget("Opening paragraph (after H1)", 40));
      const bodyBudget = Math.max(90, sectionBudgets.wordsPerBodyH2);

      let adjustedSections = sections.map((section) => {
        const headingLower = section.heading.toLowerCase();
        let budget = bodyBudget;

        if (headingLower.includes("tl;dr") || headingLower.includes("tldr")) budget = getFixedBudget("TL;DR", 60);
        else if (headingLower.includes("quick tips")) budget = getFixedBudget("Quick Tips", 50);
        else if (headingLower.includes("in this article")) budget = getFixedBudget("In This Article", 80);
        else if (isDecisionGuideHeading(headingLower)) budget = getFixedBudget("How to Choose", Math.round(targetWords * 0.08));
        else if (headingLower.includes("frequently asked") || headingLower === "faq") budget = getFixedBudget("FAQ", Math.round(targetWords * 0.12));
        else if (headingLower.includes("final thoughts") || headingLower.includes("conclusion")) budget = getFixedBudget("Final Thoughts", Math.round(targetWords * 0.05));
        else if (headingLower.includes("references")) budget = getFixedBudget("References", 30);

        return {
          ...section,
          body: trimSectionToBudget(section.body, budget),
        };
      });

      const trimmedIntro = trimSectionToBudget(intro, introBudget);

      const buildContent = () => [
        trimmedIntro,
        ...adjustedSections.map(section => section.body ? `## ${section.heading}\n${section.body}` : `## ${section.heading}`),
      ].filter(Boolean).join("\n\n").trim();

      current = buildContent();
      let currentWords = countWords(current);

      if (currentWords > wordCeiling) {
        console.warn(`Deterministic trimmer: ${currentWords} words > ceiling ${wordCeiling}. Shrinking body sections.`);

        let guard = 0;
        while (currentWords > wordCeiling && guard < 40) {
          guard += 1;

          const candidate = adjustedSections
            .map((section, index) => ({
              index,
              words: countWords(section.body),
              structural: isStructuralHeading(section.heading),
            }))
            .filter(s => !s.structural && s.words > 60)
            .sort((a, b) => b.words - a.words)[0];

          if (!candidate) break;

          const reducedBudget = Math.max(50, Math.floor(candidate.words * 0.82));
          adjustedSections[candidate.index] = {
            ...adjustedSections[candidate.index],
            body: trimSectionToBudget(adjustedSections[candidate.index].body, reducedBudget),
          };

          current = buildContent();
          currentWords = countWords(current);
        }

        if (currentWords > wordCeiling) {
          console.warn(`Deterministic fallback hard-cap: ${currentWords} -> ${wordCeiling} words`);
          current = trimToWordCount(current, wordCeiling);
          currentWords = countWords(current);
        }

        console.log(`Deterministic trimmer result: ${currentWords} words`);
      }

      if (currentWords < wordFloor) {
        console.warn(`Output below floor after deterministic balancing: ${currentWords} words (floor ${wordFloor})`);
      }

      return current;
    };

    const generateWithRetry = async (): Promise<string> => {
      let generated = "";
      let finishReason: string | undefined;

      for (let attempt = 1; attempt <= 2; attempt++) {
        const retryPrompt = attempt > 1
          ? `\n\n⚠️ Your previous output was cut off. Rewrite the FULL article from scratch and ensure it is complete with a clean ending and within ${wordFloor}-${wordCeiling} words.`
          : "";

        const result = await callModel(retryPrompt);
        generated = result.content;
        finishReason = result.finishReason;

        const rawWords = countWords(generated);
        console.log(`Attempt ${attempt}: Generated ${rawWords} words (target ${targetWords}, range ${wordFloor}-${wordCeiling}, finish_reason ${finishReason || "unknown"})`);

        if (finishReason === "length" && attempt < 2) {
          console.warn("Output hit token limit; retrying once with strict full-completion instruction.");
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
    content = content.replace(/^\s*[-*_]{3,}\s*$/gm, "");

    if (!expandExistingContent) {
      const currentWordCount = countWords(content);
      if (currentWordCount > wordCeiling) {
        console.warn(`Word count overshoot: ${currentWordCount} words vs ${targetWords} target (ceiling ${wordCeiling}). Deterministic cap missed target.`);
      }
    }

    console.log("Content generated successfully");

    // ═══════════════════════════════════════════════════════════════════════
    // COMPLETENESS GUARD: deterministic local fallback (no extra AI call)
    // ═══════════════════════════════════════════════════════════════════════
    let missingSections: string[] = [];
    if (!expandExistingContent && !migrationMode && !formatReference) {
      const hasTLDR = /^#{1,3}\s.*tl;?\s?dr/im.test(content);
      const hasQuickTips = skipQuickTips || /^#{1,3}\s.*quick\s*tips/im.test(content);
      const hasInThisArticle = /in\s*this\s*article/i.test(content);
      const hasFAQ = skipFaqs || /^#{1,3}\s.*frequently\s*asked|^#{1,3}\s.*faq/im.test(content);
      const hasFinalThoughts = /^#{1,3}\s.*final\s*thoughts|^#{1,3}\s.*conclusion/im.test(content);
      const hasReferences = skipSources || /^#{1,3}\s.*references/im.test(content);

      if (!hasTLDR) missingSections.push("TL;DR");
      if (!hasQuickTips) missingSections.push("Quick Tips");
      if (!hasInThisArticle) missingSections.push("In This Article");
      if (!hasFAQ) missingSections.push("FAQ");
      if (!hasFinalThoughts) missingSections.push("Final Thoughts");
      if (!hasReferences) missingSections.push("References");

      if (missingSections.length > 0) {
        console.warn(`COMPLETENESS GUARD: Missing sections detected: ${missingSections.join(", ")}. Injecting deterministic fallback sections.`);

        const fallbackFor = (section: string): string => {
          switch (section) {
            case "TL;DR":
              return `## TL;DR\nThis article covers everything you need to know about ${topic}, including key considerations, practical comparisons, and actionable recommendations to help you make an informed decision.`;
            case "Quick Tips":
              return `## Quick Tips\n> **Tip 1:** Start with verified figures, not generic claims.\n> **Tip 2:** Compare at least two realistic options before deciding.\n> **Tip 3:** Match every recommendation to your exact use case.`;
            case "In This Article":
              return `## In This Article\n- **1. Core topic questions** - direct answers and key context\n- **2. Side-by-side comparison** - practical differences that affect outcomes\n- **3. Decision framework** - how to choose based on constraints\n- **4. FAQ and references** - quick clarifications and credible sources`;
            case "FAQ":
              return `## Frequently Asked Questions\n**What is the safest way to act on this advice?**\n\nPrioritise evidence-backed options, then validate against your budget, timeline, and constraints.\n\n**How should readers compare alternatives?**\n\nUse consistent criteria, including cost, reliability, and expected results.\n\n**What mistakes should be avoided first?**\n\nAvoid vague claims, missing data, and one-size-fits-all recommendations.\n\n**How often should this be reviewed?**\n\nRe-check assumptions whenever pricing, regulations, or market conditions change.`;
            case "Final Thoughts":
              return `## Final Thoughts\nThe strongest results come from clear criteria, grounded comparisons, and deliberate trade-offs. Use the framework above to choose confidently and execute the next step with evidence, not guesswork.`;
            case "References":
              return `## References\n- [OECD](https://www.oecd.org/)\n- [World Bank Data](https://data.worldbank.org/)\n- [Eurostat](https://ec.europa.eu/eurostat)`;
            default:
              return "";
          }
        };

        const topSections = ["TL;DR", "Quick Tips", "In This Article"];
        const topBlocks = missingSections.filter(section => topSections.includes(section)).map(fallbackFor).filter(Boolean);
        const bottomBlocks = missingSections.filter(section => !topSections.includes(section)).map(fallbackFor).filter(Boolean);

        if (topBlocks.length > 0) {
          const h1Match = content.match(/^#\s+.+$/m);
          if (h1Match && h1Match.index !== undefined) {
            const insertAt = h1Match.index + h1Match[0].length;
            content = `${content.slice(0, insertAt)}\n\n${topBlocks.join("\n\n")}\n\n${content.slice(insertAt).trimStart()}`.trim();
          } else {
            content = `${topBlocks.join("\n\n")}\n\n${content}`.trim();
          }
        }

        if (bottomBlocks.length > 0) {
          content = `${content.trimEnd()}\n\n${bottomBlocks.join("\n\n")}`;
        }

        content = rebalanceToRange(content);
        console.log(`COMPLETENESS GUARD: Injected ${missingSections.length} deterministic fallback section(s)`);
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
