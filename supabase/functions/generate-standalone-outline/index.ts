import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, researchContent, customInstructions, keywords, length } = await req.json();

    if (!topic || !topic.trim()) {
      return new Response(JSON.stringify({ error: "Topic is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const wordCounts: Record<string, number> = {
      short: 500,
      medium: 1000,
      "medium-long": 1500,
      long: 2000,
      extended: 3000,
      comprehensive: 3500,
    };
    const targetWords = wordCounts[length] || 1000;

    const systemPrompt = `You are an expert SEO content strategist. Generate a detailed, structured blog post outline that is easy to read, copy, and share with copywriters.

OUTPUT FORMAT:
- Return ONLY the outline in clean, well-formatted markdown
- Use # for the article title
- Use ## for main section headings
- Use ### for sub-section headings where appropriate
- Use bullet points (-) for key points to cover under each section
- Use indented bullet points (  -) for sub-points or specific details
- Add brief 1-line notes in [brackets] for guidance (e.g., [Include comparison table here])
- Leave a blank line between each section for readability
- Use **bold** for emphasis on key instructions

STRUCTURE:
- # [Article Title]
- ## TL;DR
  - 3-5 key takeaway bullet points
- ## Quick Tips
  - 3 actionable tips the reader can use immediately
- ## In This Article
  - Numbered navigation list of all main sections
- Main ## sections (each phrased as a QUESTION, e.g., "## What Is X?")
  - Key points to cover
  - Specific data/stats to include
  - [TABLE] markers where comparison tables should appear
  - ### Sub-sections where needed
- ## How Do They Compare Side by Side?
  - [Include comparison table with columns: Feature, Option A, Option B]
- ## Which Option Should You Choose?
- ## Frequently Asked Questions
  - 4-6 Q&As listed as **Q: ...** followed by brief answer guidance
- ## Final Thoughts
- ## References
  - [List authoritative sources to cite]

IMPORTANT RULES:
- All main H2 headings (except TL;DR, Quick Tips, In This Article, FAQ, Final Thoughts, References) MUST be phrased as questions
- Be specific and actionable in your guidance notes, not generic
- Include word count targets per section in [brackets] (e.g., [~200 words])
- The outline should be detailed enough that a copywriter can write the full article from it alone
- If deep research content is provided, USE IT extensively — incorporate specific facts, statistics, expert quotes, and insights from the research into the outline guidance notes
- The outline should reflect the depth and specificity of the research, not generic placeholder text`;

    let userPrompt = `Generate a detailed blog post outline for the topic: "${topic}"

Target length: approximately ${targetWords} words (the final article must stay within 15% of this target)

CRITICAL: Budget section word counts so ALL sections together total approximately ${targetWords} words. Plan ${Math.max(3, Math.min(6, Math.floor(targetWords / 350)))} main H2 sections.`;

    if (researchContent && researchContent.trim()) {
      userPrompt += `\n\n📚 DEEP RESEARCH CONTENT — USE THIS AS YOUR PRIMARY SOURCE:\nThe following is detailed research on the topic. Incorporate specific facts, statistics, expert opinions, comparisons, and insights from this research into the outline. Each section should reference specific data points from the research.\n\n${researchContent.substring(0, 15000)}`;
    }

    if (keywords && keywords.length > 0) {
      userPrompt += `\n\nSEO KEYWORDS TO INCORPORATE:\n${keywords.map((k: string, i: number) => `${i + 1}. ${k}`).join("\n")}`;
    }

    if (customInstructions && customInstructions.trim()) {
      userPrompt += `\n\nCUSTOM INSTRUCTIONS FROM USER:\n${customInstructions}`;
    }

    console.log("Generating standalone outline for topic:", topic, "research length:", researchContent?.length || 0);

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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const outline = data.choices?.[0]?.message?.content;

    if (!outline) throw new Error("No outline generated");

    console.log("Standalone outline generated successfully");

    return new Response(JSON.stringify({ outline }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-standalone-outline error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: e.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
