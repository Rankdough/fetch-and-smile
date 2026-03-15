import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LinkCandidate {
  url: string;
  title: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, candidates, articleUrl } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ error: "content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ content, insertedCount: 0, insertedUrls: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Filter out the article's own URL — compare by slug (last meaningful path segment)
    const extractSlug = (u: string) => {
      try {
        const path = new URL(u.trim()).pathname.replace(/\/+$/, "");
        return path.split("/").filter(Boolean).pop()?.toLowerCase() || "";
      } catch { return u.trim().toLowerCase(); }
    };
    const articleSlug = articleUrl ? extractSlug(articleUrl) : null;
    const filteredCandidates: LinkCandidate[] = (candidates as LinkCandidate[])
      .filter(c => {
        if (!c.url.trim()) return false;
        if (articleSlug && extractSlug(c.url) === articleSlug) return false;
        return true;
      });

    // Step 1: Ask AI to pick 3-5 relevant URLs from the candidate list
    const pickPrompt = `You are an SEO internal linking expert. Given the article content below and a list of candidate URLs with their page titles, select exactly 3 to 5 URLs that are MOST contextually relevant to link FROM this article.

RULES:
- Pick URLs whose topics are genuinely related to phrases or concepts mentioned in the article
- Do NOT pick URLs that are unrelated just to fill the quota
- If fewer than 3 URLs are truly relevant, pick only the relevant ones
- Return ONLY a JSON array of the selected URLs, nothing else

CANDIDATE URLs:
${filteredCandidates.slice(0, 200).map((c, i) => `${i + 1}. ${c.url} — ${c.title}`).join("\n")}

ARTICLE (first 3000 chars):
${content.substring(0, 3000)}

Return ONLY a JSON array like: ["https://...", "https://..."]`;

    console.log(`[auto-internal-links] Picking from ${filteredCandidates.length} candidates`);

    const pickResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: pickPrompt },
        ],
      }),
    });

    if (!pickResponse.ok) {
      const errText = await pickResponse.text();
      console.error("Pick AI error:", pickResponse.status, errText);
      throw new Error(`AI pick failed: ${pickResponse.status}`);
    }

    const pickData = await pickResponse.json();
    let pickContent = pickData.choices?.[0]?.message?.content || "[]";
    // Extract JSON array from response
    const jsonMatch = pickContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log("[auto-internal-links] No URLs picked by AI");
      return new Response(
        JSON.stringify({ content, insertedCount: 0, insertedUrls: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let selectedUrls: string[];
    try {
      selectedUrls = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("[auto-internal-links] Failed to parse picked URLs");
      return new Response(
        JSON.stringify({ content, insertedCount: 0, insertedUrls: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!selectedUrls || selectedUrls.length === 0) {
      return new Response(
        JSON.stringify({ content, insertedCount: 0, insertedUrls: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cap at 5
    selectedUrls = selectedUrls.slice(0, 5);
    console.log(`[auto-internal-links] Selected ${selectedUrls.length} URLs:`, selectedUrls);

    // Step 2: Insert the selected links into the content
    const insertPrompt = `You are an expert SEO editor. Your task is to insert contextual internal links into an existing markdown article.

CRITICAL RULES:
- DO NOT rewrite, rephrase, or modify ANY existing text
- DO NOT remove any existing sections, headings, or formatting
- DO NOT add new paragraphs, sentences, or content
- ONLY convert existing relevant phrases/words into markdown links
- Return the FULL article with the links inserted
- Each URL should be linked EXACTLY ONCE (do not repeat the same link)
- Choose the MOST contextually relevant phrase for each URL
- Links should feel natural - link phrases that genuinely relate to the URL's topic
- DO NOT link text inside headings (H1, H2, H3, etc.)
- DO NOT link text inside existing links
- DO NOT link text inside bold (**) or italic (*) markers
- DO NOT link text inside blockquotes (> lines) or CTA banners
- NEVER link any text in the FIRST paragraph of the article (the opening paragraph right after the title)
- Link natural phrases that relate to the URL's topic
- Prefer linking phrases in the body paragraphs of the article
- If a URL's topic doesn't match any phrase in the article, SKIP that URL entirely

LINK FORMAT:
Convert: "relevant phrase about the topic"
To: "[relevant phrase about the topic](URL)"

Return ONLY the enhanced markdown content with links inserted. No explanations.`;

    const insertUserPrompt = `Insert contextual internal links for these URLs:

${selectedUrls.map((url, i) => `${i + 1}. ${url}`).join("\n")}

ARTICLE:
${content}`;

    const insertResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: insertPrompt },
          { role: "user", content: insertUserPrompt },
        ],
      }),
    });

    if (!insertResponse.ok) {
      const errText = await insertResponse.text();
      console.error("Insert AI error:", insertResponse.status, errText);
      throw new Error(`AI insert failed: ${insertResponse.status}`);
    }

    const insertData = await insertResponse.json();
    let linkedContent = insertData.choices?.[0]?.message?.content;

    if (!linkedContent) {
      throw new Error("No content returned from AI");
    }

    // Strip markdown code fences if present
    linkedContent = linkedContent.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    // Count inserted URLs
    const insertedUrls = selectedUrls.filter(url => linkedContent.includes(url));
    console.log(`[auto-internal-links] Inserted ${insertedUrls.length}/${selectedUrls.length} links`);

    return new Response(
      JSON.stringify({
        content: linkedContent,
        insertedCount: insertedUrls.length,
        totalSelected: selectedUrls.length,
        insertedUrls,
        skippedUrls: selectedUrls.filter(url => !linkedContent.includes(url)),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto internal links error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to auto-insert internal links";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
