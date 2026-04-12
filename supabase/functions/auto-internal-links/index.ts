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

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
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

    // Step 1: Ask AI to pick the most relevant URLs from the candidate list
    const maxSelectable = Math.min(filteredCandidates.length, 12);
    const pickPrompt = `You are an SEO internal linking expert. Given the article content below and a list of candidate URLs with their page titles, select up to ${maxSelectable} URLs that are MOST contextually relevant to link FROM this article.

RULES:
- Pick URLs whose topics are genuinely related to phrases or concepts mentioned in the article
- Prefer URLs about similar products, related foods/drinks, or the same category
- Do NOT pick URLs that are unrelated just to fill the quota
- Do NOT pick the article's own URL or any URL about the same specific product
- If fewer than ${maxSelectable} URLs are truly relevant, pick only the relevant ones
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

    // Keep only known candidate URLs and allow up to 12 selected links
    const candidateUrlSet = new Set(filteredCandidates.map(c => c.url));
    selectedUrls = selectedUrls.filter(url => candidateUrlSet.has(url)).slice(0, 12);
    
    // Also filter out self-links from AI selection
    if (articleSlug) {
      selectedUrls = selectedUrls.filter(u => extractSlug(u) !== articleSlug);
    }

    if (selectedUrls.length === 0) {
      return new Response(
        JSON.stringify({ content, insertedCount: 0, insertedUrls: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build a title map for selected URLs
    const titleMap: Record<string, string> = {};
    for (const url of selectedUrls) {
      const candidate = filteredCandidates.find(c => c.url === url);
      if (candidate) titleMap[url] = candidate.title;
    }
    
    console.log(`[auto-internal-links] Selected ${selectedUrls.length} URLs:`, selectedUrls);

    // Step 2: Insert the selected links into the content
    const insertPrompt = `You are an SEO editor. Insert internal links into the markdown article below.

For each URL provided, find a relevant phrase in the article body and convert it into a markdown link.

RULES:
1. Do NOT change, rewrite, or remove any existing text — only add link markup around existing words
2. Each URL must be linked EXACTLY ONCE
3. Do NOT link text in headings (#, ##, ###), blockquotes (>), or the first paragraph
4. Do NOT link text inside existing links
5. Return the COMPLETE article with links inserted
6. If you cannot find a good phrase for a URL, skip it

DISTRIBUTION RULE (CRITICAL):
- Links MUST be spread as evenly as possible across the entire article — early, middle, and late sections.
- Use different H2 sections whenever possible. Do not stack multiple links into one section if other eligible sections exist.
- The final section (Final Thoughts, Conclusion, FAQ, References) may contain AT MOST 1 link total.
- If there are N links and at least N eligible sections, place them in N different sections.
- If there are fewer sections than links, distribute them as evenly as possible and never cluster the majority in the last section.

EXAMPLE:
Before: "many people enjoy craft beer alternatives"
After: "[craft beer alternatives](https://example.com/craft-beer)"`;

    const insertUserPrompt = `URLs to insert (with their page topics):

${selectedUrls.map((url, i) => `${i + 1}. ${url} — Topic: "${titleMap[url] || 'related content'}"`).join("\n")}

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

    // Guardrail: never accept a link-inserted result that drops major content
    const sourceWords = countWords(content);
    const linkedWords = countWords(linkedContent);
    const sourceH2Count = (content.match(/^##\s+/gm) || []).length;
    const linkedH2Count = (linkedContent.match(/^##\s+/gm) || []).length;
    const sourceHasFinalThoughts = /^##\s.*final\s*thoughts|^##\s.*conclusion/im.test(content);
    const linkedHasFinalThoughts = /^##\s.*final\s*thoughts|^##\s.*conclusion/im.test(linkedContent);

    const tooShort = linkedWords < Math.max(Math.floor(sourceWords * 0.85), sourceWords - 80);
    const lostStructure = linkedH2Count + 1 < sourceH2Count || (sourceHasFinalThoughts && !linkedHasFinalThoughts);

    if (tooShort || lostStructure) {
      console.warn(`[auto-internal-links] Guardrail triggered. Keeping original content. sourceWords=${sourceWords}, linkedWords=${linkedWords}, sourceH2=${sourceH2Count}, linkedH2=${linkedH2Count}`);
      linkedContent = content;
    }

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
