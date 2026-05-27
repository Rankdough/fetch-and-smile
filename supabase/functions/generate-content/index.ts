import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { countWords, trimSectionToBudget, trimToWordCount } from "../_shared/articleSectionBudget.ts";
import {
  type SourceCandidate,
  cleanSourceUrl,
  extractMarkdownLinks,
  isHighAuthority,
  isJunkUrl,
  isLowAuthority,
  isLowQualityDomain,
  looksCommercial,
  sourceTitleFromUrl,
} from "../_shared/urlClassifiers.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUILD_MARKER = "BUILD-2026-05-27-C generate-content";
serve(async (req) => {
  console.log(BUILD_MARKER);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, length, outline, instructions, gapAnalysis, valuePromiseClaims, formatReference, contextFiles, keywords, generateCTAs, ctaUrl, useKnowledgeBase, toneProfileId, articleImages, expandExistingContent, existingContent, wordsToAdd, wordCount, useFirstPerson, skipFaqs, skipQuickTips, skipSources, migrationMode, useBrainInsights, firstHandEvidence, experiencePack } = await req.json();

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
    
    const quickTipsSection = skipQuickTips ? '' : "3. ## Quick Tips (~" + quickTipsWords + " words) — exactly 3 tips:\n   > [One short sentence - max 15 words]\n   > [One short sentence - max 15 words]\n   > [One short sentence - max 15 words]\n";
    const inThisArticleSection = migrationMode
      ? "4. DO NOT include an \"In This Article\" section - this is generated automatically by the client."
      : "4. ## In This Article (~" + inThisArticleWords + " words) — navigation guide:\n   - Format as a BULLETED LIST: - 1. Section Title - DETAILED description (MINIMUM 150 characters)\n   - List ALL main H2 sections from the article (not TL;DR or References)\n   - DO NOT SKIP THIS SECTION";
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
    const referencesSection = ""; // References are now built deterministically post-generation from the context allow-list.
    
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

NON-COMMODITY WRITING RULES (apply to body prose only — do NOT change the article structure, section list, word count, table count, FAQ count, or any other format requirement):
- NEVER open a section with generic filler: "In today's world", "When it comes to", "It is important to", "Many people", "In the modern era", "In recent years".
- Avoid stating common knowledge as if it were insight. If a sentence could appear unchanged in any article on any related topic, rewrite it with something specific to THIS topic.
- Prefer specifics over abstractions in every body section: at least ONE concrete element per H2 body — a real number, a named example, a named scenario, a named tool/brand/place (only if the user's instructions, context files, or first-hand evidence permit naming it), or a direct quote from the references.
- Do NOT pad with summarising transitions ("Moreover", "Furthermore", "Additionally", "In conclusion"). Move the argument forward instead.
- Do NOT inflate the article with keyword-variant restatements; each idea is said once, clearly.
- These rules apply to COPY only. The AEO layout (H1, opening, TL;DR, Quick Tips, In This Article, question H2s, How to Choose, FAQ, Final Thoughts, References), exact section list, word count target, table cadence, and CTA placement are UNCHANGED.

CRITICAL MARKDOWN FORMATTING RULES:
- Title: Use # for the main title (H1) - only one per article
- Major sections: Use ## for H2 headings${!formatReference ? ' - ALL H2 headings MUST be phrased as QUESTIONS (see rule below)' : ''}
- Subsections: Use ### for H3 headings
- DO NOT use numbered headings like "1. Section Name" - use proper markdown ## syntax
- Do NOT use bold formatting in article prose, bullets, quick tips, navigation items, or labels
- Use bullet points (-) for lists - write the text directly after the dash, NO additional dashes or punctuation
- WRONG: "- - Text here" or "- — Text here" 
- CORRECT: "- Text here"
- Use numbered lists (1.) for easy scanning
- Use markdown tables with | for comparisons, using topic-specific real categories and decision dimensions only
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
- Each body H2 section MUST then continue with:
  1. Clear text paragraphs (elaboration after the answer)
  2. EXACTLY THREE markdown bullet points using "- " (no more, no fewer; numbered lists do not count)
  3. A comparison table where relevant (at least ${requiredTables} tables total across the article)
  4. No "Sources:" line and no inline external links — citations are added post-generation by the system.

${migrationMode ? `TABLE RULE:
- Use markdown tables where the source content contains list-style comparisons or product listings
- Do NOT force tables where the source does not warrant them
- Every table must use topic-specific categories and dimensions from the source content` : `TABLE RULE (1 table per 600 words of target length):
- Include up to ${requiredTables} markdown comparison table${requiredTables > 1 ? 's' : ''} for ${targetWords} target words only where the topic has real categories to compare
- Use proper pipe syntax with a header separator row, e.g. for a clinical treatment topic:

| Case type | Definition | Treatment suitability | Key risk if misdiagnosed |
| --- | --- | --- | --- |
| Dental pattern | Teeth position drives the bite issue | Usually suitable when movement is tooth-led | Treating the wrong mechanism wastes months |
| Skeletal pattern | Jaw relationship drives the bite issue | Often needs surgical assessment first | Camouflage can worsen facial balance |

- Each table: at least 3 columns and at least 3 data rows when enough real categories exist
- Columns must be real decision dimensions for this topic, not generic labels
- ABSOLUTELY FORBIDDEN table labels: Option A, Option B, Option C, Type 1, Type 2, Type 3, Beginners, Intermediate users, Advanced needs, Choice 1, Choice 2, Choice 3
- If you cannot name real topic categories with confidence, omit the table rather than using a template
- Spread tables evenly across body H2 sections when more than one is warranted
- Markdown only — do NOT use HTML <table> tags`}

SOURCE REFERENCE RULES (ABSOLUTE):
- DO NOT add any "**Sources:**" lines, "Sources:" lines, or "Source:" lines anywhere in the article.
- DO NOT add bullet lists of source links after any section.
- DO NOT add a "## References" or "## Bibliography" section at the end.
- DO NOT add inline numeric citations like [1], [2], [3].
- DO NOT add any inline markdown links to external URLs in the body prose, tables, or bullets.
- Write all claims as clean prose. The system will deterministically attach citations and a References section after generation, drawn ONLY from the article's context files. You must not pre-empt that.


ARTICLE STRUCTURE (in this order) — WORD BUDGET PER SECTION:
Total target: ${targetWords} words. Each section has a strict word budget. Do NOT exceed individual section budgets.

${fixedSectionBudgetList}
- Body H2 sections: ${sectionBudgets.bodyH2Count} sections × ~${sectionBudgets.wordsPerBodyH2} words each = ~${sectionBudgets.remainingWords} words total

SECTION DETAILS:
1. Title (# H1) + Opening paragraph (~${openingWords} words) — AI-quotable factual statement
2. ## TL;DR (~${tldrWords} words) — exactly 1 dense PARAGRAPH of plain prose, on the line directly under the "## TL;DR" heading. NEVER use a table, bullet list, or numbered list for the TL;DR, and never insert a table or list between the "## TL;DR" heading and its paragraph. Self-contained statement an AI could quote. Include specific names, numbers, clear verdict.

${quickTipsSection}
${inThisArticleSection}
5. ${sectionBudgets.bodyH2Count} Main content sections with ## QUESTION headings (~${sectionBudgets.wordsPerBodyH2} words EACH, no more)
   - Each answered with text + EXACTLY THREE "- " bullet points + tables (no "Sources:" line — citations are added post-generation)
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

MUST FOLLOW (in priority order):
1. STRUCTURE — Follow the AEO layout exactly: H1 → AI-quotable opening paragraph (30-50 words) → ## TL;DR (1 dense paragraph, no list) → ## Quick Tips (3 tips, max 15 words each) → ## In This Article (nav list) → question-based H2 sections (each H2 phrased as a question, immediately followed by a ~30-word direct answer paragraph, then EXACTLY THREE markdown bullet points using "- ", then a comparison table where relevant) → ## How to Choose (4-6 criteria as a bullet checklist) → ## Frequently Asked Questions → ## Final Thoughts. Do NOT add a ## References section — the system adds it post-generation.
2. WORD COUNT — Final article between ${wordFloor} and ${wordCeiling} words (target ${targetWords}). Count as you write.
3. TABLES — Include exactly ${requiredTables} markdown comparison table${requiredTables > 1 ? 's' : ''} (1 per 600 words), each ≥3 columns and ≥4 data rows, spread evenly across body H2 sections. Markdown pipe syntax only.
4. SOURCES — Do NOT add any "**Sources:**" lines, "Sources:" lines, "Source:" lines, bullet lists of URLs, inline numeric citations like [1][2], or inline markdown links to external URLs. Write clean prose only. The system attaches citations and the References section deterministically from the article's context files after you finish.
5. FORMATTING — Every body H2 section must contain EXACTLY THREE markdown bullet points using "- ". Do not use numbered lists as the required bullets. Do not use bold formatting in the article body. British English. No em/en dashes. No horizontal rules.
6. ATOMIC SECTION CONTRACT (NON-NEGOTIABLE) — Every body H2 and H3 must be a standalone answer block that works alone if extracted by Google AI Overviews, ChatGPT, Gemini or Perplexity. For EACH body H2/H3 you MUST:
   (a) Open with ONE direct sentence that fully answers the heading question on its own (no preamble, no "Dental implants are popular…" style intros).
   (b) Follow with a supporting explanation (1–2 short paragraphs) AND EXACTLY THREE markdown bullet points using "- ". No section may have 0, 1, 2, 4, or more bullet points.
   (c) Keep the section roughly 75–200 words (100–300 tokens). No one-line sections, no 800-word walls.
   (d) Be self-contained: NEVER use dependency phrases like "as mentioned above", "as we saw", "continuing from earlier", "this is why", "the following point", "in the previous section". Each section must make sense on its own.
   (e) Include at least one concrete specific (number, %, named example, timeframe, or named tool/brand from the context files) — no vague filler.
   (f) Vary sentence length. No robotic cadence, no repeated sentence structures.
   Before finishing each section ask: "If an AI engine extracted ONLY this section, would it fully answer the question?" If no, rewrite it.`;

      // Add keywords if provided
      if (keywords && Array.isArray(keywords) && keywords.length > 0) {
        userPrompt += `

IMPORTANT SEO KEYWORDS TO USE WITHOUT STUFFING:
The following are search-intent signals, not phrases to force into clinical prose:
${keywords.map((k: string, i: number) => `${i + 1}. ${k}`).join("\n")}

Rules:
- Use the top keyword in the H1/title and, if natural, one H2 heading only.
- Do NOT repeat exact long-tail question keywords inside body paragraphs, bullet points, table cells, or FAQ answers.
- In prose, translate search queries into natural clinical language. Example: write "clear aligners can camouflage a dental underbite" instead of repeating "how can Invisalign fix an underbite".
- Never start a sentence with "For cases that can be addressed by [keyword]" or similar SEO phrasing.`;
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
- Each claim MUST become either (a) its own H2 body section, or (b) an H3 subsection placed directly under the most relevant H2. The heading text MUST echo a 4-6 word verbatim fragment of the claim so the section is unmistakably about that claim.
- Under that heading write at least 2-3 substantive paragraphs (or 1 paragraph + a comparison table + a bullet list) that directly deliver the promise. No passing mentions.
- If a claim mentions a specific comparison (e.g., "Albanian food vs British food"), include a comparison table and detailed paragraphs on BOTH sides under that claim's section.
- If a claim mentions specific populations or conditions (e.g., "gluten-free", "food sensitivities"), dedicate the section to it with named conditions, practical advice, and examples.
- If a claim references "context files" or specific data sources, explicitly use that material in the claim's section.
- Before finishing the article, run a self-check: for each numbered claim above, can you point to ONE heading whose text echoes that claim? If no, add it now. If a heading exists but the content is thin, expand it.
- Stay within the word count target — be concise and substantive rather than padding with filler.`;
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

      if (firstHandEvidence && typeof firstHandEvidence === "string" && firstHandEvidence.trim()) {
        userPrompt += `

🟢 FIRST-HAND EVIDENCE TO INCORPORATE (use as a non-commodity differentiator):
The following is first-hand material from the author — an anecdote, case study, internal data point, or expert observation. Weave it naturally into AT LEAST ONE body H2 section as a concrete, citable detail (e.g. "In one case…", "A reader reported…", "Internal data showed…", "One practitioner observed…").
RULES:
- Do NOT invent facts beyond what is stated below.
- Do NOT quote it verbatim if the perspective rules forbid first person; paraphrase into the allowed perspective (third person if first-person is disabled — never introduce "I", "we", "our", "my", "us").
- Do NOT dump it as a wall of text; integrate it as supporting evidence around the relevant argument.
- This evidence ADDS to the article; it does not replace any required section, table, FAQ, or word-count target.

FIRST-HAND EVIDENCE:
${firstHandEvidence.trim()}`;
      }

      if (experiencePack && typeof experiencePack === "string" && experiencePack.trim()) {
        userPrompt += `

🟢 EXPERIENCE SIGNALS (non-commodity gate is enabled):
The following are first-hand signals harvested from project context and the knowledge hub. Each H2 body section should reference at least one signal, OR write a concrete handoff sentence: "Ask the clinical team for current figures on X" (replacing X with the specific thing). Do NOT invent statistics beyond what is listed. Do NOT use generic hedge phrases like "varies significantly", "depends on a number of factors", "it's important to note", "in today's world", "leverage", "delve into".

SIGNALS:
${experiencePack.trim()}`;
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

        // NOTE: URL allow-list is NOT shown to the model. The model writes clean prose with zero
        // citations; the post-processor below attaches sources deterministically from context files.
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

    const model = "google/gemini-2.5-flash";
    // Allow enough completion room for full Markdown articles; downstream trimming is sentence-safe.
    const maxTokens = Math.min(Math.max(4096, Math.ceil(wordCeiling * 3.6)), 12000);

    console.log(`Using model: ${model}, max_tokens: ${maxTokens}, target words: ${targetWords}`);
    console.log(`Word budgets: ${sectionBudgets.bodyH2Count} body H2s × ${sectionBudgets.wordsPerBodyH2} words = ${sectionBudgets.remainingWords} + ${sectionBudgets.fixedTotal} fixed = ${targetWords}`);

    const callModelRaw = async (promptSuffix = "", overrideUserPrompt?: string): Promise<{ content: string; finishReason: string | undefined }> => {
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
            { role: "user", content: (overrideUserPrompt ?? userPrompt) + promptSuffix },
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

    const callModel = async (promptSuffix = ""): Promise<{ content: string; finishReason: string | undefined }> => {
      const first = await callModelRaw(promptSuffix);
      if (first.finishReason !== "length") return first;

      console.warn("AI output hit max_tokens; requesting continuation instead of restarting.");
      try {
        const continuationPrompt = `${userPrompt}${promptSuffix}\n\n--- PARTIAL ARTICLE SO FAR ---\n${first.content}\n\nContinue from the exact next word. Do not restart, do not repeat earlier sections, and finish the remaining article with complete sentences.`;
        const second = await callModelRaw("", continuationPrompt);
        return {
          content: `${first.content.replace(/\s+$/, "")}\n\n${(second.content || "").replace(/^\s+/, "")}`.trim(),
          finishReason: second.finishReason === "length" ? "length" : "stop",
        };
      } catch (e) {
        console.warn("Continuation request failed; returning first partial for retry handling.", e);
        return first;
      }
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

      for (let attempt = 1; attempt <= 3; attempt++) {
        let retryPrompt = "";
        if (attempt === 2) {
          retryPrompt = `\n\n⚠️ Your previous output was cut off or incomplete. Rewrite the FULL article from scratch and ensure it is complete with a clean ending and within ${wordFloor}-${wordCeiling} words.`;
        } else if (attempt === 3) {
          retryPrompt = `\n\n⚠️ Your previous output was TOO SHORT (below ${wordFloor} words). Rewrite the FULL article from scratch. The article MUST be at least ${wordFloor} words and at most ${wordCeiling} words. Expand each section with concrete detail, examples, and direct, substantive answers — do NOT stop short of the floor.`;
        }

        const result = await callModel(retryPrompt);
        generated = result.content;
        finishReason = result.finishReason;

        const rawWords = countWords(generated);
        console.log(`Attempt ${attempt}: Generated ${rawWords} words (target ${targetWords}, range ${wordFloor}-${wordCeiling}, finish_reason ${finishReason || "unknown"})`);

        if (finishReason === "length" && attempt < 3) {
          console.warn("Output hit token limit; retrying with strict full-completion instruction.");
          continue;
        }

        if (rawWords < wordFloor && attempt < 3) {
          console.warn(`Output below floor (${rawWords} < ${wordFloor}); retrying with expansion instruction.`);
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

    const removeDanglingSentenceTails = (markdown: string): string => {
      return markdown
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || /^#{1,6}\s/.test(trimmed) || /^\s*(\||[-*+]|\d+\.)\s?/.test(line) || trimmed.includes("|") || /^>/.test(trimmed)) {
            return line;
          }
          if (/[.!?:)]\s*$/.test(trimmed)) return line;
          const lastTerm = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
          if (lastTerm > 20) return line.slice(0, line.indexOf(trimmed) + lastTerm + 1);
          return line;
        })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    };

    const naturaliseKeywordPhrase = (keyword: string): string => {
      let phrase = keyword
        .toLowerCase()
        .replace(/\b(how|what|why|when|where|which|who|can|does|do|is|are|will|should|could|would)\b/g, " ")
        .replace(/\b(fix|help|work|mean|cost)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!phrase || phrase.split(/\s+/).length < 2) phrase = (topic || keyword).toLowerCase();
      return phrase.replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripMidProseKeywordStuffing = (markdown: string): string => {
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) return markdown;
      const keywordList = keywords.map((k: string) => String(k || "").trim()).filter((k: string) => k.split(/\s+/).length >= 4);
      if (keywordList.length === 0) return markdown;

      let stripped = 0;
      const lines = markdown.split("\n");
      const seenHeadingKeywords = new Set<string>();
      const next = lines.map((line) => {
        const trimmed = line.trim();
        const isHeading = /^#{1,6}\s/.test(trimmed);
        let out = line;
        for (const keyword of keywordList) {
          const re = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "gi");
          const matches = out.match(re);
          if (!matches) continue;
          if (isHeading && !seenHeadingKeywords.has(keyword.toLowerCase())) {
            seenHeadingKeywords.add(keyword.toLowerCase());
            continue;
          }
          stripped += matches.length;
          out = out.replace(re, naturaliseKeywordPhrase(keyword));
        }
        return out;
      });
      if (stripped > 0) console.log(`KEYWORD GUARD: Rewrote ${stripped} exact long-tail keyword injection(s) outside allowed heading usage.`);
      return next.join("\n");
    };

    content = stripMidProseKeywordStuffing(removeDanglingSentenceTails(content));

    if (!expandExistingContent) {
      const currentWordCount = countWords(content);
      if (currentWordCount > wordCeiling) {
        console.warn(`Word count overshoot: ${currentWordCount} words vs ${targetWords} target (ceiling ${wordCeiling}). Deterministic cap missed target.`);
      }
    }

    console.log("Content generated successfully");

    const bodySectionSkipPattern = /tl;?\s?dr|quick\s*tips|in\s*this\s*article|frequently\s*asked|faq|final\s*thoughts|conclusion|references|sources/i;

    // SourceCandidate type, junk/authority classifiers, cleanSourceUrl,
    // sourceTitleFromUrl and extractMarkdownLinks are imported from
    // ../_shared/urlClassifiers.ts (extracted verbatim — no behaviour change).

    const placeholderHosts = ["example.com", "example.org", "example.net", "yourdomain.com", "your-domain.com", "placeholder.com"];
    const urlStatusCache = new Map<string, Promise<boolean>>();
    const firecrawlSourceCache = new Map<string, Promise<SourceCandidate[]>>();

    const isWorkingSourceUrl = (rawUrl: string): Promise<boolean> => {
      const url = cleanSourceUrl(rawUrl);
      if (urlStatusCache.has(url)) return urlStatusCache.get(url)!;
      const promise = (async () => {
        let parsed: URL;
        try { parsed = new URL(url); } catch { return false; }
        if (!/^https?:$/.test(parsed.protocol)) return false;
        if (placeholderHosts.some((host) => parsed.hostname.toLowerCase().endsWith(host))) return false;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 7000);
        try {
          let resp = await fetch(url, {
            method: "HEAD",
            redirect: "follow",
            signal: ctrl.signal,
            headers: { "User-Agent": "Mozilla/5.0 (SourceVerifier)" },
          }).catch(() => null);
          if (!resp || resp.status === 405 || resp.status === 403 || resp.status === 0 || resp.status >= 500) {
            resp = await fetch(url, {
              method: "GET",
              redirect: "follow",
              signal: ctrl.signal,
              headers: { "User-Agent": "Mozilla/5.0 (SourceVerifier)" },
            });
          }
          return resp.ok;
        } catch {
          return false;
        } finally {
          clearTimeout(timer);
        }
      })();
      urlStatusCache.set(url, promise);
      return promise;
    };


    const extractContextSourceCandidates = (): SourceCandidate[] => {
      if (!contextFiles || !Array.isArray(contextFiles)) return [];
      const candidates: SourceCandidate[] = [];
      const rejected: string[] = [];
      const seen = new Set<string>();
      const push = (cand: SourceCandidate) => {
        if (seen.has(cand.url)) return;
        // CONTEXT FILES = TRUTH. The user curated these URLs deliberately.
        // We only reject obvious junk (dead patterns, file extensions, anchors,
        // placeholder hosts) and own-domain links. We do NOT apply the
        // commercial/authority filter here — that filter is for web-search
        // fallback results only. If the user put a dental clinic URL in the
        // context file, it IS the authority for this article.
        if (isJunkUrl(cand.url)) {
          rejected.push(cand.url);
          seen.add(cand.url);
          return;
        }
        if (isOwnDomainUrl(cand.url)) {
          rejected.push(cand.url);
          seen.add(cand.url);
          return;
        }
        seen.add(cand.url);
        candidates.push(cand);
      };
      for (const file of contextFiles as { name: string; content: string }[]) {
        const fileText = file.content || "";
        const fileName = file.name || "";
        // 1) Markdown-style links with anchor text — strongest signal.
        for (const link of extractMarkdownLinks(fileText, "context")) {
          push({ ...link, fileName });
        }
        // 2) Bare URLs — capture surrounding paragraph as snippet.
        const rawUrlRe = /https?:\/\/[^\s)\],;<>"']+/g;
        let raw: RegExpExecArray | null;
        while ((raw = rawUrlRe.exec(fileText)) !== null) {
          const url = cleanSourceUrl(raw[0]);
          if (seen.has(url)) continue;
          const snipStart = Math.max(0, raw.index - 320);
          const snipEnd = Math.min(fileText.length, raw.index + url.length + 320);
          const snippet = fileText.slice(snipStart, snipEnd).replace(/\s+/g, " ").trim();
          push({ title: sourceTitleFromUrl(url), url, origin: "context", snippet, fileName });
        }
      }
      if (rejected.length > 0) {
        console.log(`SOURCE CATALOGUE: dropped ${rejected.length} junk/own-domain context URL(s): ${rejected.slice(0, 8).join(", ")}${rejected.length > 8 ? " …" : ""}`);
      }
      console.log(`SOURCE CATALOGUE: accepted ${candidates.length} context URL(s) — context files are trusted, commercial/authority filter NOT applied`);
      return candidates.slice(0, 80);
    };

    const contextSourceCandidates = extractContextSourceCandidates();
    console.log(`SOURCE CATALOGUE: ${contextSourceCandidates.length} context URL candidate(s) from ${Array.isArray(contextFiles) ? contextFiles.length : 0} context file(s)`);


    const tokenise = (text: string): Set<string> => {
      const stop = new Set(["this","that","with","from","about","what","when","where","which","their","there","they","have","been","will","would","could","should","into","than","then","your","also","more","most","some","such","other","over","under","between","during","while","just","like","make","made","does","doing","because","through","against","both","each","every","very","much","many","only","upon","onto","these","those","being","after","before","still"]);
      const tokens = (text.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((t) => !stop.has(t));
      return new Set(tokens);
    };

    const scoreSource = (source: SourceCandidate, heading: string, body: string): number => {
      const wanted = tokenise(`${topic || ""} ${heading} ${body.slice(0, 900)}`);
      if (wanted.size === 0) return source.origin === "context" ? 2 : 1;
      const haystackUrl = `${source.title} ${source.url} ${source.fileName || ""}`.toLowerCase();
      const snippet = (source.snippet || "").toLowerCase();
      let score = source.origin === "context" ? 3 : 1;
      let snippetHits = 0;
      let urlHits = 0;
      for (const token of wanted) {
        if (snippet.includes(token)) { score += 3; snippetHits += 1; } // snippet match is the real signal
        if (haystackUrl.includes(token)) { score += 1; urlHits += 1; }
      }
      // Bonus when snippet has multiple distinct hits — means URL truly relates to claim.
      if (snippetHits >= 3) score += 4;
      if (snippetHits >= 5) score += 4;
      // Penalty for context URLs with zero snippet overlap (likely footer/nav link).
      if (source.origin === "context" && snippetHits === 0 && urlHits === 0) score -= 5;
      return score;
    };

    const searchWebSources = (heading: string, body: string, tier1Only = false): Promise<SourceCandidate[]> => {
      const cacheKey = `${tier1Only ? "T1:" : ""}${`${topic || ""} ${heading} ${body.replace(/\[[^\]]+\]\([^)]+\)/g, "").replace(/[#*_`|>\n]/g, " ").slice(0, 180)}`.replace(/\s+/g, " ").trim().slice(0, 260)}`;
      const query = cacheKey.replace(/^T1:/, "");
      if (!query) return Promise.resolve([]);
      if (firecrawlSourceCache.has(cacheKey)) return firecrawlSourceCache.get(cacheKey)!;
      const promise = (async () => {
        const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
        if (!apiKey) {
          console.warn("FIRECRAWL_API_KEY not set - cannot fetch online source references");
          return [];
        }
        try {
          const resp = await fetch("https://api.firecrawl.dev/v2/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query, limit: 15 }),
          });
          if (!resp.ok) {
            console.warn(`Firecrawl source search failed: ${resp.status}`);
            return [];
          }
          const data = await resp.json();
          const results: any[] = data?.data?.web || (Array.isArray(data?.data) ? data.data : null) || data?.web || [];

          // Authority tiering uses the hoisted classifiers (isHighAuthority /
          // isLowAuthority / looksCommercial) defined at function top so context-file
          // URLs go through the same filter as web-search results.



          // Bucket by tier + rank.
          type Ranked = { url: string; title: string; rank: number; tier: 1 | 2 | 3 };
          const ranked: Ranked[] = [];
          const seen = new Set<string>();
          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const url = cleanSourceUrl(result?.url || result?.link || "");
            if (!url || seen.has(url)) continue;
            seen.add(url);
            if (isJunkUrl(url)) continue;
            const title = String(result?.title || sourceTitleFromUrl(url)).trim();
            let tier: 1 | 2 | 3;
            if (isHighAuthority(url)) tier = 1;
            else if (isLowAuthority(url) || looksCommercial(url)) tier = 3;
            else tier = 2;
            ranked.push({ url, title, rank: i, tier });
          }

          // Strict ordering: ONLY Tier-1 by default. Tier-2 only if zero Tier-1.
          // Tier-3 is never used here — better to return nothing than cite a
          // dental-tourism / lead-gen / Reddit URL.
          const passes: Ranked[][] = tier1Only
            ? [
                ranked.filter((r) => r.tier === 1 && r.rank < 5),
                ranked.filter((r) => r.tier === 1 && r.rank >= 5),
              ]
            : [
                ranked.filter((r) => r.tier === 1 && r.rank < 5),
                ranked.filter((r) => r.tier === 1 && r.rank >= 5),
                ranked.filter((r) => r.tier === 2 && r.rank < 5),
              ];
          const candidates: SourceCandidate[] = [];
          const picked = new Set<string>();
          for (const pass of passes) {
            for (const r of pass) {
              if (picked.has(r.url)) continue;
              if (await isWorkingSourceUrl(r.url)) {
                candidates.push({ title: r.title, url: r.url, origin: "web" });
                picked.add(r.url);
              }
              if (candidates.length >= 2) break;
            }
            if (candidates.length >= 2) break;
          }
          if (candidates.length) {
            const tierTag = (u: string) => {
              const t = ranked.find((r) => r.url === u)?.tier;
              return t === 1 ? "[T1]" : t === 2 ? "[T2-commercial]" : "[T3-low]";
            };
            console.log(`SOURCE WEB: query="${query.slice(0, 80)}" -> ${candidates.map((c) => `${tierTag(c.url)} ${c.url}`).join(" | ")}`);
          } else {
            console.warn(`SOURCE WEB: no Tier-1/Tier-2 authority for query="${query.slice(0, 80)}" (${ranked.length} candidates rejected)`);
          }
          return candidates;

        } catch (error) {
          console.error("Firecrawl source search error", error);
          return [];
        }
      })();
      firecrawlSourceCache.set(cacheKey, promise);
      return promise;
    };

    const buildReferencesFromCandidates = (sources: SourceCandidate[]): string => {
      const seenUrl = new Set<string>();
      const seenTitle = new Set<string>();
      const items: string[] = [];
      const normTitle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

      for (const source of sources) {
        const title = source.title.trim().replace(/[*_`]/g, "") || sourceTitleFromUrl(source.url);
        const url = cleanSourceUrl(source.url);
        if (!title || seenUrl.has(url)) continue;
        const titleKey = normTitle(title);
        if (titleKey && seenTitle.has(titleKey)) continue;
        seenUrl.add(url);
        if (titleKey) seenTitle.add(titleKey);
        items.push(`- [${title}](${url})`);
      }

      return items.length ? `## References\n${items.join("\n")}` : "";
    };

    // Lock to context allow-list ONLY when the context files actually contain URLs.
    // If files are attached but contain no URLs, allow a web fallback but restrict it to
    // Tier-1 authorities (gov/edu/peer-review) — never Tier-2 commercial blogs.
    const hasContextFiles = Array.isArray(contextFiles) && contextFiles.length > 0;
    const contextOnlySources = contextSourceCandidates.length > 0;
    const tier1OnlyFallback = hasContextFiles && !contextOnlySources;
    const contextAllowedUrlSet = new Set(contextSourceCandidates.map((c) => cleanSourceUrl(c.url)));
    // Internal links and CTA URLs are also legitimate (added by other pipeline steps).
    const extraAllowedUrls = new Set<string>();
    if (typeof ctaUrl === "string" && /^https?:\/\//i.test(ctaUrl)) extraAllowedUrls.add(cleanSourceUrl(ctaUrl));
    if (Array.isArray(articleImages)) {
      for (const img of articleImages as { url?: string }[]) {
        if (img?.url && /^https?:\/\//i.test(img.url)) extraAllowedUrls.add(cleanSourceUrl(img.url));
      }
    }

    // Own-domain blocklist: never cite the project's own URLs in References.
    // Sources: (1) CTA URL host, (2) article-image hosts, (3) every host found
    // in the internal_link_files table — those URLs are reserved for the inline
    // internal-links pipeline and must never appear under ## References.
    const ownDomains = new Set<string>();
    const addOwnHost = (u: string) => {
      try { ownDomains.add(new URL(u).hostname.replace(/^www\./, "").toLowerCase()); } catch { /* ignore */ }
    };
    if (typeof ctaUrl === "string" && /^https?:\/\//i.test(ctaUrl)) addOwnHost(ctaUrl);
    if (Array.isArray(articleImages)) {
      for (const img of articleImages as { url?: string }[]) {
        if (img?.url && /^https?:\/\//i.test(img.url)) addOwnHost(img.url);
      }
    }
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
      if (supabaseUrl && supabaseKey) {
        const resp = await fetch(`${supabaseUrl}/rest/v1/internal_link_files?select=urls`, {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        });
        if (resp.ok) {
          const rows = await resp.json() as { urls: unknown }[];
          for (const row of rows) {
            const list = Array.isArray(row.urls) ? row.urls : [];
            for (const entry of list) {
              const u = typeof entry === "string" ? entry : (entry && typeof entry === "object" && "url" in entry ? (entry as { url?: string }).url : undefined);
              if (typeof u === "string" && /^https?:\/\//i.test(u)) addOwnHost(u);
            }
          }
          console.log(`OWN-DOMAIN BLOCKLIST: ${ownDomains.size} host(s) excluded from References:`, [...ownDomains].join(", "));
        }
      }
    } catch (err) {
      console.warn("OWN-DOMAIN BLOCKLIST: failed to load internal_link_files:", err instanceof Error ? err.message : err);
    }

    const isOwnDomainUrl = (u: string): boolean => {
      try {
        const h = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
        for (const own of ownDomains) {
          if (h === own || h.endsWith(`.${own}`)) return true;
        }
        return false;
      } catch { return false; }
    };


    const sourcesForSection = async (heading: string, body: string): Promise<SourceCandidate[]> => {
      const existing = extractMarkdownLinks(body, "existing")
        .filter((l) => !isJunkUrl(l.url))
        .filter((l) => !contextOnlySources || contextAllowedUrlSet.has(cleanSourceUrl(l.url)));
      const existingWorking: SourceCandidate[] = [];
      for (const link of existing) {
        if (await isWorkingSourceUrl(link.url)) existingWorking.push(link);
        if (existingWorking.length >= 2) return existingWorking;
      }

      // Score every context URL against this section; only accept ones with real snippet relevance.
      const scored = contextSourceCandidates
        .map((c) => ({ cand: c, score: scoreSource(c, heading, body) }))
        .sort((a, b) => b.score - a.score);
      // When context-only is in force, drop the relevance floor — any context URL beats fabrication.
      const RELEVANCE_FLOOR = contextOnlySources ? 1 : 6;
      const relevantContext = scored.filter((s) => s.score >= RELEVANCE_FLOOR).slice(0, 10).map((s) => s.cand);

      const contextWorking: SourceCandidate[] = [...existingWorking];
      for (const link of relevantContext) {
        if (contextWorking.some((c) => c.url === link.url)) continue;
        if (await isWorkingSourceUrl(link.url)) contextWorking.push(link);
        if (contextWorking.length >= 2) {
          console.log(`SOURCE PICK [context]: "${heading.slice(0, 60)}" -> ${contextWorking.map((c) => c.url).join(" | ")}`);
          return contextWorking;
        }
      }

      // Strict mode: if context URLs exist, NEVER fall back to web search — return what we have (possibly empty).
      if (contextOnlySources) {
        if (contextWorking.length) {
          console.log(`SOURCE PICK [context-strict]: "${heading.slice(0, 60)}" -> ${contextWorking.map((c) => c.url).join(" | ")}`);
        } else {
          console.warn(`SOURCE PICK [context-strict EMPTY]: "${heading.slice(0, 60)}" — no allow-listed URL fits; omitting Sources block`);
        }
        return contextWorking;
      }

      // Not enough relevant context URLs — fall back to web search.
      // When context files are attached (but had no URLs), restrict to Tier-1 only.
      const web = await searchWebSources(heading, body, tier1OnlyFallback);
      const combined = [...contextWorking, ...web.filter((w) => !contextWorking.some((c) => c.url === w.url))].slice(0, 2);
      console.log(`SOURCE PICK [mixed${tier1OnlyFallback ? "-T1only" : ""}]: "${heading.slice(0, 60)}" -> context=${contextWorking.length} web=${web.length}`);

      if (combined.length) return combined;

      const broadWeb = await searchWebSources(topic || heading, "", tier1OnlyFallback);
      if (broadWeb.length) {
        console.log(`SOURCE PICK [broad-web${tier1OnlyFallback ? "-T1only" : ""}]: "${heading.slice(0, 60)}" -> ${broadWeb.map((c) => c.url).join(" | ")}`);
        return broadWeb.slice(0, 1);
      }

      const fallbackContext: SourceCandidate[] = [];
      for (const candidate of scored.map((s) => s.cand)) {
        if (fallbackContext.some((c) => c.url === candidate.url)) continue;
        if (await isWorkingSourceUrl(candidate.url)) fallbackContext.push(candidate);
        if (fallbackContext.length >= 1) break;
      }
      if (fallbackContext.length) {
        console.log(`SOURCE PICK [fallback-context]: "${heading.slice(0, 60)}" -> ${fallbackContext.map((c) => c.url).join(" | ")}`);
        return fallbackContext;
      }

      return [];
    };



    // ═══════════════════════════════════════════════════════════════════════
    // DETERMINISTIC CITATION PIPELINE (allow-list only, no model improvisation)
    // ═══════════════════════════════════════════════════════════════════════
    // Strips every "Sources:" block, every model-emitted external markdown link,
    // and any model-written References section. Then attaches at most one inline
    // anchor link per body H2 from the verified context-files allow-list, and
    // builds a single consolidated ## References section at the end. If the
    // context files have zero URLs, the article has zero citations and no
    // References section. Never falls back to web search.
    const enforceSourcesAndReferences = async (markdown: string): Promise<string> => {
      if (skipSources) return markdown;

      // 1. Drop any model-written References / Bibliography section.
      let cleaned = markdown.replace(/^#{2,3}\s+(References|Bibliography|Sources|Works\s+Cited):?\s*[\s\S]*$/im, "").trimEnd();

      // 2. Strip every "**Sources:**" / "Sources:" / "Source:" block, plus any
      //    orphan bullet that is a bare URL or a bare label with no link.
      {
        const lines = cleaned.split("\n");
        const out: string[] = [];
        let inSourcesBlock = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (/^[>*-]?\s*\*?\*?Sources?:\*?\*?\s*$/i.test(trimmed) || /^[>*-]?\s*\*\*Sources?:\*\*/i.test(trimmed)) {
            inSourcesBlock = true;
            continue;
          }
          if (inSourcesBlock) {
            // Drop trailing source bullets (linked or bare) and bare URL bullets.
            if (!trimmed) continue;
            if (/^[-*+]\s+\[[^\]]+\]\(https?:\/\/[^)\s]+\)/i.test(trimmed)) continue;
            if (/^[-*+]\s+https?:\/\/\S+/i.test(trimmed)) continue;
            if (/^\[[^\]]+\]\(https?:\/\/[^)\s]+\)$/i.test(trimmed)) continue;
            // Orphan label bullet (e.g. "- NHS Orthodontics Guidance" with no link) — drop only if it looks source-shaped.
            if (/^[-*+]\s+[A-Z][\w'’\-\s,&]+$/.test(trimmed) && trimmed.length < 80) continue;
            inSourcesBlock = false;
          }
          out.push(line);
        }
        cleaned = out.join("\n");
      }

      // 3. Strip ALL inline external markdown links (the model must never decide
      //    what gets cited). Preserve image markdown ![...](...) and internal
      //    CTA/article-image URLs.
      cleaned = cleaned.replace(/(!)?\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (full, bang, label, rawUrl) => {
        if (bang) return full; // image
        const c = cleanSourceUrl(rawUrl);
        if (extraAllowedUrls.has(c)) return full; // CTA / image URLs are legitimate
        return String(label);
      });

      // 4. Build the verified allow-list. Prefer context-file URLs. If the
      //    context files contain zero URLs (or none survive HEAD check), fall
      //    back to Tier-1 web authorities per-section — never leave the article
      //    without citations just because the uploaded doc had no links.
      const verifiedAllowList: SourceCandidate[] = [];
      if (contextSourceCandidates.length > 0) {
        await Promise.all(contextSourceCandidates.map(async (c) => {
          if (isOwnDomainUrl(c.url)) return; // never cite own domain in References
          if (await isWorkingSourceUrl(c.url)) verifiedAllowList.push(c);
        }));
        console.log(`CITATION: ${verifiedAllowList.length}/${contextSourceCandidates.length} allow-listed URLs verified working (own-domain filtered).`);
      }
      const useWebFallback = verifiedAllowList.length === 0;
      if (useWebFallback) {
        console.log("CITATION: No context-file URLs available → using Tier-1 web fallback per section.");
      }

      // 5. Walk H2/H3 sections. For each non-structural body section, pick the
      //    single highest-scoring allow-list URL (score ≥ 6, max 2 uses per URL)
      //    and inject ONE inline anchor link by safely wrapping a phrase in the
      //    body. When the context allow-list is empty, fetch Tier-1 web sources
      //    via sourcesForSection (which already enforces tier1OnlyFallback).
      const headingRegex = /^#{2,3}\s+.+$/gm;
      const matches = [...cleaned.matchAll(headingRegex)];
      if (matches.length === 0) return cleaned.trim();

      const intro = cleaned.slice(0, matches[0].index ?? 0).trim();
      const urlUseCount = new Map<string, number>();
      const usedSources: SourceCandidate[] = [];
      const rebuilt: string[] = [];

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const start = match.index ?? 0;
        const end = i + 1 < matches.length ? (matches[i + 1].index ?? cleaned.length) : cleaned.length;
        const headingLine = match[0];
        const heading = headingLine.replace(/^#{2,3}\s+/, "").trim();
        const headingLower = heading.toLowerCase();
        let body = cleaned.slice(start + headingLine.length, end).trim();

        const isStructural = /references|bibliography|sources|in\s+this\s+article|tl;?dr|quick\s*tips|frequently\s*asked|faq|final\s*thoughts|conclusion|how\s+to\s+(choose|pick|decide|select|find)/i.test(headingLower);

        if (!isStructural) {
          let chosen: SourceCandidate | null = null;

          if (!useWebFallback) {
            const ranked = verifiedAllowList
              .filter((c) => (urlUseCount.get(c.url) || 0) < 2)
              .map((c) => ({ cand: c, score: scoreSource(c, heading, body) }))
              .filter((s) => s.score >= 6)
              .sort((a, b) => b.score - a.score);
            if (ranked.length > 0) chosen = ranked[0].cand;
          } else {
            // Web-fallback path: ask sourcesForSection for Tier-1 candidates.
            const webCands = await sourcesForSection(heading, body);
            const fresh = webCands.find((c) => !isOwnDomainUrl(c.url) && (urlUseCount.get(cleanSourceUrl(c.url)) || 0) < 2);
            if (fresh) chosen = fresh;
          }

          if (chosen) {
            const anchor = (chosen.title || "").trim().replace(/[*_`\[\]()]/g, "") || sourceTitleFromUrl(chosen.url);
            const cleanUrl = cleanSourceUrl(chosen.url);
            // Append a "Source:" line at the END of the section body instead of
            // injecting an inline anchor mid-prose. Keeps the body clean and puts
            // attribution exactly where the user expects (bottom of each section).
            // Internal links from the Settings panel are injected by a separate
            // pipeline (insert-internal-links) and are unaffected by this change.
            body = `${body.trimEnd()}\n\n*Source: [${anchor}](${cleanUrl})*`;
            urlUseCount.set(cleanUrl, (urlUseCount.get(cleanUrl) || 0) + 1);
            if (!usedSources.find((s) => cleanSourceUrl(s.url) === cleanUrl)) {
              usedSources.push({ ...chosen, url: cleanUrl, title: anchor });
            }
            console.log(`CITATION${useWebFallback ? " [web-fallback]" : ""}: "${heading.slice(0, 60)}" -> ${cleanUrl} (section-end Source line)`);
          }
        }

        rebuilt.push(`${headingLine}\n${body}`.trim());
      }

      let result = [intro, ...rebuilt].filter(Boolean).join("\n\n").trim();

      // 6. Top-up References. CRITICAL RULE: when context files exist, the
      //    References list is built EXCLUSIVELY from context URLs. No web
      //    search, no Firecrawl fallback, no "relaxed top-up". Prefer fewer
      //    references that the user trusts over four that they don't.
      const MIN_REFERENCES = 4;
      if (usedSources.length < MIN_REFERENCES) {
        const usedUrlSet = new Set(usedSources.map((s) => cleanSourceUrl(s.url)));
        const pushCand = (c: SourceCandidate) => {
          const cleanUrl = cleanSourceUrl(c.url);
          if (usedUrlSet.has(cleanUrl)) return;
          if (isOwnDomainUrl(cleanUrl)) return; // never add own-domain URLs to References
          if (isJunkUrl(cleanUrl)) return;
          const anchor = (c.title || "").trim().replace(/[*_`\[\]()]/g, "") || sourceTitleFromUrl(cleanUrl);
          usedSources.push({ ...c, url: cleanUrl, title: anchor });
          usedUrlSet.add(cleanUrl);
        };

        // 6a. Top up from REMAINING context-file URLs that survived eligibility
        //     but weren't selected per-section. This always runs when we have
        //     context files, regardless of useWebFallback.
        for (const c of verifiedAllowList) {
          if (usedSources.length >= MIN_REFERENCES) break;
          pushCand(c);
        }

        // 6b. Web fallback (Tier-1 search + relaxed Firecrawl). Runs when the
        //     context files did NOT contribute any usable URLs (either no
        //     context files at all, or context files attached but containing
        //     zero extractable URLs). If context files provided URLs we trust
        //     them and stop here even if we're below MIN_REFERENCES.
        if (!contextOnlySources && usedSources.length < MIN_REFERENCES) {
          // Pull additional Tier-1 web sources keyed to the article topic + each H2.
          const seedQueries: Array<{ heading: string; body: string }> = [{ heading: topic || "", body: "" }];
          for (const m of matches) {
            const h = m[0].replace(/^#{2,3}\s+/, "").trim();
            if (/references|bibliography|sources|in\s+this\s+article|tl;?dr|quick\s*tips|frequently\s*asked|faq|final\s*thoughts|conclusion/i.test(h)) continue;
            seedQueries.push({ heading: h, body: "" });
          }
          for (const q of seedQueries) {
            if (usedSources.length >= MIN_REFERENCES) break;
            const web = await searchWebSources(q.heading, q.body, hasContextFiles);
            for (const c of web) {
              if (usedSources.length >= MIN_REFERENCES) break;
              if (await isWorkingSourceUrl(c.url)) pushCand(c);
            }
          }

          // 6c. RELAXED TOP-UP: only when NO context files exist.
          if (usedSources.length < MIN_REFERENCES) {
            const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
            if (apiKey) {
              const relaxedQueries = [topic || "", ...matches
                .map((m) => m[0].replace(/^#{2,3}\s+/, "").trim())
                .filter((h) => !/references|bibliography|sources|in\s+this\s+article|tl;?dr|quick\s*tips|frequently\s*asked|faq|final\s*thoughts|conclusion/i.test(h))
                .map((h) => `${topic || ""} ${h}`.trim())
              ].filter(Boolean);
              const lowAuthorityRelaxed = [
                /(^|\.)reddit\.com$/i, /(^|\.)quora\.com$/i, /(^|\.)pinterest\.[a-z.]+$/i,
                /(^|\.)tumblr\.com$/i, /(^|\.)blogspot\.com$/i, /(^|\.)wordpress\.com$/i,
                /(^|\.)wixsite\.com$/i, /(^|\.)weebly\.com$/i, /(^|\.)squarespace\.com$/i,
                /(^|\.)answers\.com$/i, /(^|\.)ehow\.com$/i, /(^|\.)wikihow\.com$/i,
                /(^|\.)tripadvisor\.[a-z.]+$/i, /(^|\.)yelp\.com$/i,
                /(^|\.)stackexchange\.com$/i, /(^|\.)stackoverflow\.com$/i,
                /(^|\.)facebook\.com$/i, /(^|\.)instagram\.com$/i, /(^|\.)tiktok\.com$/i,
                /(^|\.)x\.com$/i, /(^|\.)twitter\.com$/i, /(^|\.)youtube\.com$/i,
              ];
              const isLowRelaxed = (url: string): boolean => {
                try { return lowAuthorityRelaxed.some((re) => re.test(new URL(url).hostname)); }
                catch { return true; }
              };
              for (const q of relaxedQueries) {
                if (usedSources.length >= MIN_REFERENCES) break;
                try {
                  const resp = await fetch("https://api.firecrawl.dev/v2/search", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ query: q.slice(0, 260), limit: 10 }),
                  });
                  if (!resp.ok) continue;
                  const data = await resp.json();
                  const results: any[] = data?.data?.web || (Array.isArray(data?.data) ? data.data : null) || data?.web || [];
                  for (const r of results) {
                    if (usedSources.length >= MIN_REFERENCES) break;
                    const rawUrl = cleanSourceUrl(r?.url || r?.link || "");
                    if (!rawUrl) continue;
                    if (isJunkUrl(rawUrl)) continue;
                    if (isLowRelaxed(rawUrl)) continue;
                    if (isOwnDomainUrl(rawUrl)) continue;
                    if (!(await isWorkingSourceUrl(rawUrl))) continue;
                    const title = String(r?.title || sourceTitleFromUrl(rawUrl)).trim();
                    pushCand({ url: rawUrl, title, origin: "web" });
                  }
                  console.log(`CITATION [relaxed-topup]: query="${q.slice(0, 60)}" -> usedSources=${usedSources.length}`);
                } catch (err) {
                  console.warn("CITATION [relaxed-topup]: search failed:", err instanceof Error ? err.message : err);
                }
              }
            }
          }
        } else if (contextOnlySources && usedSources.length < MIN_REFERENCES) {
          console.log(`CITATION: References (${usedSources.length}) below MIN (${MIN_REFERENCES}) but context files provided URLs — web fallback DISABLED. Returning context-only references.`);
        }
        console.log(`CITATION: Top-up brought References to ${usedSources.length} source(s) (target ${MIN_REFERENCES}, hasContextFiles=${hasContextFiles}).`);
      }


      // 7. Build References from used sources. FINAL RENDER GATE:
      //    - Always drop own-domain URLs.
      //    - Always drop junk URLs.
      //    - When context files exist, allow ANY surviving URL (user trusted it).
      //    - When NO context files exist, additionally enforce the
      //      commercial/authority filter on web-fallback URLs.
      const contextAllowed = new Set(contextSourceCandidates.map((c) => cleanSourceUrl(c.url)));
      const refSources = usedSources.filter((s) => {
        const u = cleanSourceUrl(s.url);
        if (isOwnDomainUrl(u)) {
          console.log(`CITATION [render-gate] DROP own-domain: ${u}`);
          return false;
        }
        if (isJunkUrl(u)) {
          console.log(`CITATION [render-gate] DROP junk: ${u}`);
          return false;
        }
        // Context-file URLs are always allowed at the render gate.
        if (contextAllowed.has(u)) return true;
        // Non-context URLs (web fallback) must clear the quality filter.
        if (contextOnlySources) {
          console.log(`CITATION [render-gate] DROP non-context URL (context URLs present): ${u}`);
          return false;
        }
        if (isLowQualityDomain(u)) {
          console.log(`CITATION [render-gate] DROP low-quality web URL: ${u}`);
          return false;
        }
        return true;
      });
      if (refSources.length > 0) {
        const refLines = refSources.map((s, idx) => `${idx + 1}. [${s.title}](${cleanSourceUrl(s.url)})`);
        result += `\n\n## References\n${refLines.join("\n")}`;
        console.log(`CITATION: References section built with ${refSources.length} source(s) after render gate.`);
      } else {
        console.log("CITATION: No external sources qualified → no References section emitted.");
      }



      return result;
    };

    // Safely wrap a phrase in the body with a markdown link. Skips headings,
    // tables, bullets, blockquotes, and lines that already contain links.
    // Wraps a short phrase (3-6 words) near the end of the best-matching
    // sentence so the prose stays clean.
    const injectInlineAnchor = (body: string, anchorText: string, url: string): { body: string; changed: boolean } => {
      const lines = body.split("\n");
      const anchorTokens = new Set(((anchorText || "").toLowerCase().match(/[a-z0-9]{4,}/g) || []));

      // Score each eligible line by token overlap with anchor.
      type Cand = { idx: number; overlap: number; len: number };
      const cands: Cand[] = [];
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t) continue;
        if (t.startsWith("#") || t.startsWith("|") || t.startsWith(">") || t.startsWith("![")) continue;
        if (/^[-*+]\s/.test(t) || /^\d+\.\s/.test(t)) continue;
        if (t.includes("](")) continue; // already has a link
        if (t.length < 40) continue;
        const lineTokens = new Set((t.toLowerCase().match(/[a-z0-9]{4,}/g) || []));
        let overlap = 0;
        for (const tok of anchorTokens) if (lineTokens.has(tok)) overlap++;
        cands.push({ idx: i, overlap, len: t.length });
      }
      if (cands.length === 0) return { body, changed: false };
      cands.sort((a, b) => (b.overlap - a.overlap) || (b.len - a.len));
      const target = cands[0];

      // Wrap the last 3-5 words of that sentence (before terminal punctuation).
      const line = lines[target.idx];
      const m = line.match(/^(.*?)([A-Za-z][A-Za-z0-9'’\-]+(?:\s+[A-Za-z][A-Za-z0-9'’\-]+){2,5})([.!?,;:]?)\s*$/);
      if (!m) return { body, changed: false };
      const before = m[1];
      const phrase = m[2];
      const tail = m[3] || "";
      lines[target.idx] = `${before}[${phrase}](${url})${tail}`;
      return { body: lines.join("\n"), changed: true };
    };


    const buildFallbackBullets = (heading: string, body: string): string[] => {
      const plain = body
        .split("\n")
        .filter(line => !/^\s*[-*+]\s+/.test(line) && !/^\s*\d+\.\s+/.test(line) && !line.includes("|") && !/^\s*\*\*Sources?:\*\*/i.test(line) && !/^\s*Sources?:/i.test(line))
        .join(" ")
        .replace(/\[[^\]]+\]\([^)]+\)/g, "")
        .replace(/[*_`>#]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const sentences = plain.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 24);
      const seeds = [...sentences.slice(1), ...sentences.slice(0, 1)];
      const bullets: string[] = [];
      const seen = new Set<string>();
      for (const seed of seeds) {
        if (bullets.length >= 3) break;
        const cleaned = seed.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "").replace(/\s+/g, " ").trim();
        const key = cleaned.toLowerCase().replace(/\W+/g, " ").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        bullets.push(`- ${cleaned}`);
      }
      const fallbacks = [0, 1, 2].map((_, index) => {
        const fallback = index === 0
          ? `${heading.replace(/\?$/, "")} depends on the mechanism, clinical use, and maintenance expectations.`
          : index === 1
            ? `Concrete numbers, examples, or timeframes make this section useful when read alone.`
            : `The practical takeaway should stay specific to ${topic || "the topic"}.`;
        return `- ${fallback}`;
      });
      for (const fallback of fallbacks) {
        if (bullets.length >= 3) break;
        const key = fallback.toLowerCase().replace(/^[-*+]\s+/, "").replace(/\W+/g, " ").trim();
        if (seen.has(key)) continue;
        seen.add(key);
        bullets.push(fallback);
      }
      return bullets.slice(0, 3);
    };

    const enforceThreeBulletsPerBodySection = (markdown: string): { markdown: string; changedSections: string[] } => {
      const headingRegex = /^#{2,3}\s+.+$/gm;
      const matches = [...markdown.matchAll(headingRegex)];
      if (matches.length === 0) return { markdown: markdown.trim(), changedSections: [] };

      const intro = markdown.slice(0, matches[0].index ?? 0).trim();
      const changedSections: string[] = [];
      const rebuiltSections = matches.map((match, index) => {
        const start = match.index ?? 0;
        const end = index + 1 < matches.length ? (matches[index + 1].index ?? markdown.length) : markdown.length;
        const headingLine = match[0];
        const heading = headingLine.replace(/^#{2,3}\s+/, "").trim();
        const bodyText = markdown.slice(start + headingLine.length, end).trim();

        if (bodySectionSkipPattern.test(heading)) return `${headingLine}\n${bodyText}`.trim();

        const lines = bodyText.split("\n");
        const seenBullets = new Set<string>();
        const existingBullets = lines.filter(line => /^\s*-\s+/.test(line)).map(line => line.trim()).filter(line => {
          const key = line.toLowerCase().replace(/^[-*+]\s+/, "").replace(/\W+/g, " ").trim();
          if (!key || seenBullets.has(key)) return false;
          seenBullets.add(key);
          return true;
        });
        if (lines.filter(line => /^\s*-\s+/.test(line)).length === 3 && existingBullets.length === 3) return `${headingLine}\n${bodyText}`.trim();

        changedSections.push(heading.slice(0, 60));
        const keptBulletSet = new Set(existingBullets.slice(0, 3));
        const nonBulletLines = lines.filter(line => !/^\s*([-*+]|\d+\.)\s+/.test(line) || keptBulletSet.has(line.trim()));
        const sourceIndex = nonBulletLines.findIndex(line => /^\s*\*\*Sources?:\*\*/i.test(line) || /^\s*Sources?:/i.test(line));
        const beforeSources = sourceIndex >= 0 ? nonBulletLines.slice(0, sourceIndex) : nonBulletLines;
        const sourceLines = sourceIndex >= 0 ? nonBulletLines.slice(sourceIndex) : [];
        const bullets = existingBullets.slice(0, 3);
        for (const fallback of buildFallbackBullets(heading, bodyText)) {
          if (bullets.length >= 3) break;
          bullets.push(fallback);
        }

        const cleanedBeforeSources = beforeSources.filter(line => !keptBulletSet.has(line.trim()));
        const body = [cleanedBeforeSources.join("\n").trim(), bullets.slice(0, 3).join("\n"), sourceLines.join("\n").trim()].filter(Boolean).join("\n\n");
        return `${headingLine}\n${body}`.trim();
      });

      return { markdown: [intro, ...rebuiltSections].filter(Boolean).join("\n\n").trim(), changedSections };
    };


    // ═══════════════════════════════════════════════════════════════════════
    // TABLE GUARD: deterministic local injection if model under-delivered
    // ═══════════════════════════════════════════════════════════════════════
    if (!expandExistingContent) {
      const isGenericTemplateTable = (table: string): boolean => {
        return /\bOption\s+[ABC]\b/i.test(table)
          || /\bType\s+[123]\b/i.test(table)
          || /\bChoice\s+[123]\b/i.test(table)
          || /\b(Beginners?|Intermediate users?|Advanced needs?)\b/i.test(table)
          || /\|\s*Aspect\s*\|\s*Option\s+A\s*\|/i.test(table);
      };
      const stripGenericTemplateTables = (md: string): string => {
        const lines = md.split("\n");
        const kept: string[] = [];
        let removed = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes("|") && i + 1 < lines.length && /^\s*\|?[\s\-:|]+\|[\s\-:|]+$/.test(lines[i + 1])) {
            const start = i;
            let end = i + 2;
            while (end < lines.length && lines[end].includes("|")) end++;
            const table = lines.slice(start, end).join("\n");
            if (isGenericTemplateTable(table)) {
              removed += 1;
              i = end - 1;
              continue;
            }
          }
          kept.push(lines[i]);
        }
        if (removed > 0) console.warn(`TABLE GUARD: Removed ${removed} generic template table(s).`);
        return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      };
      const buildTopicAwareFallbackTable = (): string => {
        const t = `${topic || ""} ${outline || ""} ${instructions || ""}`.toLowerCase();
        if (/invisalign|aligner|underbite|class\s*iii|malocclusion/.test(t)) {
          return `\n\n| Case type | Definition | Invisalign suitable? | Typical timeline | Key risk if misdiagnosed |\n| --- | --- | --- | --- | --- |\n| Dental underbite | Tooth position creates the reverse bite while jaw relationship is manageable | Often suitable when movement is tooth-led and space allows | Commonly 12-24 months depending on staging and compliance | Treating it as skeletal can overcomplicate care |\n| Skeletal underbite | Lower jaw position or upper-jaw deficiency drives the bite | Limited suitability; surgical orthodontic assessment often comes first | Orthodontics plus surgery can extend beyond 18-24 months | Camouflage can worsen facial balance or stability |\n| Combined pattern | Tooth position and jaw relationship both contribute | Sometimes suitable for camouflage when skeletal discrepancy is mild | Timeline depends on whether surgery is avoided or planned | Misclassification leads to relapse or an incomplete bite correction |\n`;
        }
        if (/screwless|implant|dental\s+implant|morse|cement/.test(t)) {
          return `\n\n| System type | How retention works | Screw present? | Primary risk | Best-fit case |\n| --- | --- | --- | --- | --- |\n| Cement-retained crown | Dental cement bonds the crown to the abutment | No access screw through the crown | Residual cement can inflame peri-implant tissue | Aesthetic zones where access holes would compromise appearance |\n| Friction-fit or Morse taper | Precision taper locks components through mechanical friction | Not through the crown surface | Removal can be difficult if repair is needed | Single-tooth cases with accurate component seating |\n| Traditional screw-retained | A prosthetic screw fixes the crown or bridge to the implant | Yes | Access-channel aesthetics or screw loosening | Retrievable restorations and maintenance-heavy cases |\n`;
        }
        return "";
      };

      content = stripGenericTemplateTables(content);

      // ── Fabricated-quote + unsourced-currency guards ────────────────────
      const lineHasAttribution = (line: string): boolean => {
        if (/\bSource\s*:/i.test(line)) return true;
        if (/\]\(https?:\/\//i.test(line)) return true;
        if (/[—–-]\s+[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3},\s+[A-Za-z]/.test(line)) return true;
        return false;
      };
      const stripFabricatedQuotes = (md: string): string => {
        const lines = md.split("\n");
        const kept: string[] = [];
        let removed = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/^\s*>\s+/.test(line)) {
            const next = (lines[i + 1] || "") + " " + (lines[i + 2] || "");
            if (!lineHasAttribution(line) && !lineHasAttribution(next)) {
              removed += 1;
              continue;
            }
          }
          kept.push(line);
        }
        const inlineRe =
          /(?:[A-Z][^.!?"]*?\b(?:expert|doctor|specialist|clinician|orthodontist|dentist|surgeon|physician|practitioner|authority)s?\b[^.!?"]*?\b(?:noted|said|commented|observed|explained|stated|remarked|argued|warned|told)\b[^.!?"]*?["“][^"”]{8,}["”][^.!?]*[.!?])/g;
        const cleaned = kept.map((line) => {
          if (lineHasAttribution(line)) return line;
          return line.replace(inlineRe, () => { removed += 1; return ""; });
        });
        if (removed > 0) console.warn(`QUOTE GUARD: stripped ${removed} unattributed quote(s).`);
        return cleaned.join("\n");
      };
      const stripUnsourcedCurrencyClaims = (md: string): string => {
        const lines = md.split("\n");
        let removed = 0;
        const currencyRe = /[\$£€¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:USD|GBP|EUR|JPY))?/;
        const cleaned = lines.map((line) => {
          if (line.includes("|")) return line;
          if (/^\s*>/.test(line)) return line;
          if (!currencyRe.test(line)) return line;
          if (lineHasAttribution(line)) return line;
          const parts = line.split(/(?<=[.!?])\s+/);
          const keptParts = parts.filter((s) => {
            if (currencyRe.test(s)) { removed += 1; return false; }
            return true;
          });
          return keptParts.join(" ");
        });
        if (removed > 0) console.warn(`CURRENCY GUARD: stripped ${removed} unsourced currency sentence(s).`);
        return cleaned.join("\n");
      };
      content = stripFabricatedQuotes(content);
      content = stripUnsourcedCurrencyClaims(content);
      const countTables = (md: string): number => {
        const lines = md.split("\n");
        let count = 0;
        for (let i = 0; i < lines.length - 1; i++) {
          if (lines[i].includes("|") && /^\s*\|?[\s\-:|]+\|[\s\-:|]+$/.test(lines[i + 1])) {
            count++;
          }
        }
        return count;
      };
      const existingTables = countTables(content);
      const tablesNeeded = requiredTables - existingTables;
      if (tablesNeeded > 0) {
        const fallbackTable = buildTopicAwareFallbackTable();
        if (!fallbackTable) {
          console.warn(`TABLE GUARD: Found ${existingTables}/${requiredTables} tables, but no safe topic-aware fallback exists. Skipping table injection.`);
        } else {
          console.warn(`TABLE GUARD: Found ${existingTables}/${requiredTables} tables. Injecting 1 topic-aware fallback table.`);
          // Find body H2 sections (skip TL;DR, Quick Tips, In This Article, FAQ, Final Thoughts, References)
          const lines = content.split("\n");
          const h2Indices: number[] = [];
          for (let i = 0; i < lines.length; i++) {
            if (/^##\s+/.test(lines[i]) && !bodySectionSkipPattern.test(lines[i])) {
              h2Indices.push(i);
            }
          }
          if (h2Indices.length > 0) {
            const h2Idx = h2Indices[Math.min(1, h2Indices.length - 1)];
            let endIdx = lines.length;
            for (let j = h2Idx + 1; j < lines.length; j++) {
              if (/^##\s+/.test(lines[j])) {
                endIdx = j;
                break;
              }
            }
            lines.splice(endIdx, 0, fallbackTable);
            content = lines.join("\n");
            console.log(`TABLE GUARD: Injected 1 topic-aware table into a body H2 section`);
          }
        }
      } else {
        console.log(`TABLE GUARD: ${existingTables}/${requiredTables} tables present ✓`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ATOMIC SECTION GUARD: strip banned dependency phrases + log gaps
    // (non-destructive: only removes/replaces banned transitions, never rewrites prose)
    // ═══════════════════════════════════════════════════════════════════════
    if (!expandExistingContent && !migrationMode && !formatReference) {
      const bannedPhrases: { pattern: RegExp; replacement: string }[] = [
        { pattern: /\bas\s+mentioned\s+(above|earlier|previously)\b[,]?\s*/gi, replacement: "" },
        { pattern: /\bas\s+(we\s+)?(saw|discussed|noted)\s+(above|earlier|previously)\b[,]?\s*/gi, replacement: "" },
        { pattern: /\bcontinuing\s+from\s+(earlier|above|the\s+previous\s+section)\b[,]?\s*/gi, replacement: "" },
        { pattern: /\bin\s+the\s+previous\s+section\b[,]?\s*/gi, replacement: "" },
        { pattern: /\bthe\s+following\s+point\b[,]?\s*/gi, replacement: "" },
        { pattern: /\bbuilding\s+on\s+(what\s+we\s+covered|the\s+above|the\s+previous)\b[,]?\s*/gi, replacement: "" },
      ];
      let strippedCount = 0;
      bannedPhrases.forEach(({ pattern, replacement }) => {
        const matches = content.match(pattern);
        if (matches) {
          strippedCount += matches.length;
          content = content.replace(pattern, replacement);
        }
      });
      // Tidy: capitalize first letter after a stripped phrase at sentence start
      content = content.replace(/(^|\n|\. )([a-z])/g, (_m, p1, p2) => p1 + p2.toUpperCase());
      if (strippedCount > 0) {
        console.log(`ATOMIC GUARD: Stripped ${strippedCount} banned dependency phrase(s)`);
      }

      const bulletResult = enforceThreeBulletsPerBodySection(content);
      content = bulletResult.markdown;
      if (bulletResult.changedSections.length > 0) {
        console.warn(`ATOMIC GUARD: Enforced exactly 3 bullets in ${bulletResult.changedSections.length} body section(s): ${bulletResult.changedSections.join(" | ")}`);
      }

      // Verify H2 sections have exactly three markdown bullets after deterministic enforcement
      const atomicLines = content.split("\n");
      const sectionsWithWrongBulletCount: string[] = [];
      for (let i = 0; i < atomicLines.length; i++) {
        if (/^##\s+/.test(atomicLines[i]) && !bodySectionSkipPattern.test(atomicLines[i])) {
          let endIdx = atomicLines.length;
          for (let j = i + 1; j < atomicLines.length; j++) {
            if (/^##\s+/.test(atomicLines[j])) { endIdx = j; break; }
          }
          const body = atomicLines.slice(i + 1, endIdx).join("\n");
          const bulletCount = body.split("\n").filter(line => /^\s*-\s+/.test(line)).length;
          if (bulletCount !== 3) {
            sectionsWithWrongBulletCount.push(`${atomicLines[i].replace(/^##\s+/, "").slice(0, 60)} (${bulletCount})`);
          }
        }
      }
      if (sectionsWithWrongBulletCount.length > 0) {
        console.warn(`ATOMIC GUARD: ${sectionsWithWrongBulletCount.length} body section(s) still have wrong bullet count: ${sectionsWithWrongBulletCount.join(" | ")}`);
      } else {
        console.log(`ATOMIC GUARD: All body sections contain exactly 3 bullets ✓`);
      }
    }

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
      // References are deterministically built by enforceSourcesAndReferences below — do not check or inject here.

      const buildReferencesFromRealLinks = (md: string): string => {
        const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
        const seen = new Set<string>();
        const items: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(md)) !== null) {
          const title = m[1].trim();
          const url = m[2].replace(/[)\]\.,;]+$/, "");
          if (!title || seen.has(url)) continue;
          seen.add(url);
          items.push(`- [${title}](${url})`);
        }
        return items.length ? `## References\n${items.join("\n")}` : "";
      };

      const normaliseReferencesSection = (md: string): string => {
        if (skipSources || !/^#{1,3}\s.*references/im.test(md)) return md;
        const rebuilt = buildReferencesFromRealLinks(md.replace(/^#{1,3}\s.*references[\s\S]*$/im, ""));
        if (!rebuilt) return md;
        return md.replace(/^#{1,3}\s.*references[\s\S]*$/im, rebuilt);
      };

      if (!hasTLDR) missingSections.push("TL;DR");
      if (!hasQuickTips) missingSections.push("Quick Tips");
      if (!hasInThisArticle) missingSections.push("In This Article");
      if (!hasFAQ) missingSections.push("FAQ");
      if (!hasFinalThoughts) missingSections.push("Final Thoughts");
      // (References handled separately by enforceSourcesAndReferences)

      if (missingSections.length > 0) {
        console.warn(`COMPLETENESS GUARD: Missing sections detected: ${missingSections.join(", ")}. Injecting deterministic fallback sections.`);

        const fallbackFor = (section: string): string => {
          switch (section) {
            case "TL;DR":
              return `## TL;DR\nThis article covers everything you need to know about ${topic}, including key considerations, practical comparisons, and actionable recommendations to help you make an informed decision.`;
            case "Quick Tips":
              return `## Quick Tips\n> Start with verified figures, not generic claims.\n> Compare at least two realistic options before deciding.\n> Match every recommendation to your exact use case.`;
            case "In This Article":
              return `## In This Article\n- 1. Core topic questions - direct answers and key context\n- 2. Side-by-side comparison - practical differences that affect outcomes\n- 3. Decision framework - how to choose based on constraints\n- 4. FAQ and references - quick clarifications and credible sources`;
            case "FAQ":
              return `## Frequently Asked Questions\n**What is the safest way to act on this advice?**\n\nPrioritise evidence-backed options, then validate against your budget, timeline, and constraints.\n\n**How should readers compare alternatives?**\n\nUse consistent criteria, including cost, reliability, and expected results.\n\n**What mistakes should be avoided first?**\n\nAvoid vague claims, missing data, and one-size-fits-all recommendations.\n\n**How often should this be reviewed?**\n\nRe-check assumptions whenever pricing, regulations, or market conditions change.`;
            case "Final Thoughts":
              return `## Final Thoughts\nThe strongest results come from clear criteria, grounded comparisons, and deliberate trade-offs. Use the framework above to choose confidently and execute the next step with evidence, not guesswork.`;
            case "References": {
              // Build References from real markdown links found in the body.
              // Never inject placeholder authority URLs — fake sources are worse than none.
              return buildReferencesFromRealLinks(content);
            }
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

      // (normaliseReferencesSection removed — enforceSourcesAndReferences handles all citation/References work below.)
    }

    if (!expandExistingContent && !migrationMode && !formatReference) {
      const finalBulletResult = enforceThreeBulletsPerBodySection(content);
      content = finalBulletResult.markdown;
      if (finalBulletResult.changedSections.length > 0) {
        console.warn(`FINAL ATOMIC GUARD: Enforced exactly 3 bullets in ${finalBulletResult.changedSections.length} section(s): ${finalBulletResult.changedSections.join(" | ")}`);
      }
    }

    if (!expandExistingContent && !migrationMode && !formatReference && !skipSources) {
      content = await enforceSourcesAndReferences(content);
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
