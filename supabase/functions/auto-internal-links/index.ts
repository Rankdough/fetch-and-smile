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

function normalizeUrl(url: string): string {
  if (!url) return "";

  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = (parsed.pathname.replace(/\/+$/, "") || "/").toLowerCase();
    return `${host}${path}`;
  } catch {
    return url
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

function extractSlug(url: string): string {
  try {
    const path = new URL(url.trim()).pathname.replace(/\/+$/, "");
    return path.split("/").filter(Boolean).pop()?.toLowerCase() || "";
  } catch {
    return url.trim().toLowerCase();
  }
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:markdown|json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
}

function extractLinkedUrlsFromMarkdown(content: string): string[] {
  const linked: string[] = [];
  const linkRegex = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(content)) !== null) {
    linked.push(match[1]);
  }

  return linked;
}

function detectInsertedUrls(content: string, selectedUrls: string[]): string[] {
  const linkedNormalized = new Set(extractLinkedUrlsFromMarkdown(content).map(normalizeUrl));
  return selectedUrls.filter((url) => linkedNormalized.has(normalizeUrl(url)));
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAnchorCandidates(title: string, url: string): string[] {
  const cleanedTitle = (title || "").replace(/\s+/g, " ").trim();
  const titleWords = cleanedTitle.split(/\s+/).filter((w) => w.length > 2);
  const slugWords = extractSlug(url).split(/[-_]/).filter((w) => w.length > 2);

  const phrases = [
    cleanedTitle,
    titleWords.slice(0, 4).join(" "),
    titleWords.slice(0, 3).join(" "),
    titleWords.slice(0, 2).join(" "),
    slugWords.slice(-3).join(" "),
    slugWords.slice(-2).join(" "),
    ...titleWords.slice(0, 5),
  ]
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);

  return [...new Set(phrases)];
}

function deterministicInsertLinks(
  content: string,
  urlsToInsert: string[],
  titleMap: Record<string, string>
): { content: string; insertedUrls: string[] } {
  const lines = content.split("\n");
  const insertedUrls: string[] = [];

  for (const url of urlsToInsert) {
    const phrases = buildAnchorCandidates(titleMap[url] || "", url);
    let inserted = false;
    let currentH2 = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) continue;

      if (/^##\s+/i.test(trimmed)) {
        currentH2 = trimmed.toLowerCase();
        continue;
      }

      if (
        /^#/.test(trimmed) ||
        /^>/.test(trimmed) ||
        /^\|/.test(trimmed) ||
        /^```/.test(trimmed) ||
        /^\s*[-*]\s+/.test(trimmed)
      ) {
        continue;
      }

      if (/frequently\s*asked|faq|references|quick\s*tips|in this article/i.test(currentH2)) {
        continue;
      }

      if (/\[[^\]]+\]\([^)]+\)/.test(line)) {
        continue;
      }

      for (const phrase of phrases) {
        const regex = new RegExp(`\\b(${escapeRegExp(phrase)})\\b`, "i");
        if (!regex.test(line)) continue;

        lines[i] = line.replace(regex, `[$1](${url})`);
        insertedUrls.push(url);
        inserted = true;
        break;
      }

      if (inserted) break;
    }
  }

  return { content: lines.join("\n"), insertedUrls };
}

function appendGuaranteedLinks(
  content: string,
  urls: string[],
  titleMap: Record<string, string>
): string {
  if (urls.length === 0) return content;

  const links = urls.map((url) => {
    const fallbackLabel = extractSlug(url).replace(/[-_]/g, " ").trim() || "related guide";
    const label = (titleMap[url] || fallbackLabel).replace(/\s+/g, " ").trim();
    return `[${label}](${url})`;
  });

  const sentence = `Related guides: ${links.join(", ")}.`;

  if (/^##\s.*final\s*thoughts|^##\s.*conclusion/im.test(content)) {
    return `${content.trim()}\n\n${sentence}`;
  }

  return `${content.trim()}\n\n## Related Reading\n${sentence}`;
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

    const articleSlug = articleUrl ? extractSlug(articleUrl) : null;
    const filteredCandidates: LinkCandidate[] = (candidates as LinkCandidate[])
      .filter((c) => c?.url?.trim())
      .filter((c) => {
        if (articleSlug && extractSlug(c.url) === articleSlug) return false;
        return true;
      });

    if (filteredCandidates.length === 0) {
      return new Response(
        JSON.stringify({ content, insertedCount: 0, insertedUrls: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Ask AI to pick 3-5 relevant URLs from the candidate list
    const pickPrompt = `You are an SEO internal linking expert. Given the article content below and a list of candidate URLs with their page titles, select exactly 3 to 5 URLs that are MOST contextually relevant to link FROM this article.

RULES:
- Pick URLs whose topics are genuinely related to phrases or concepts mentioned in the article
- Prefer URLs about similar products, related foods/drinks, or the same category
- Do NOT pick URLs that are unrelated just to fill the quota
- Do NOT pick the article's own URL or any URL about the same specific product
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
        messages: [{ role: "user", content: pickPrompt }],
      }),
    });

    if (!pickResponse.ok) {
      const errText = await pickResponse.text();
      console.error("Pick AI error:", pickResponse.status, errText);
      throw new Error(`AI pick failed: ${pickResponse.status}`);
    }

    const pickData = await pickResponse.json();
    let pickContent = stripCodeFences(pickData.choices?.[0]?.message?.content || "[]");

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

    // Cap at 5 and map selected URLs back to known candidate URLs by normalized path
    const candidateUrlSet = new Set(filteredCandidates.map((c) => c.url));
    const candidateByNormalized = new Map(filteredCandidates.map((c) => [normalizeUrl(c.url), c.url]));

    selectedUrls = [...new Set(selectedUrls
      .map((url) => candidateByNormalized.get(normalizeUrl(url)) || url.trim())
      .filter((url) => candidateUrlSet.has(url))
    )].slice(0, 5);

    // Also filter out self-links from AI selection
    if (articleSlug) {
      selectedUrls = selectedUrls.filter((u) => extractSlug(u) !== articleSlug);
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
      const candidate = filteredCandidates.find((c) => c.url === url);
      if (candidate) titleMap[url] = candidate.title;
    }

    console.log(`[auto-internal-links] Selected ${selectedUrls.length} URLs:`, selectedUrls);

    // Step 2: Insert the selected links into the content
    const insertPrompt = `You are an SEO editor. Insert internal links into the markdown article below.

For each URL provided, find a relevant phrase in the article body and convert it into a markdown link.

RULES:
1. Do NOT change, rewrite, or remove any existing text — only add link markup around existing words
2. Each URL should be linked once where context is natural
3. Do NOT link text in headings (#, ##, ###), blockquotes (>), or the first paragraph
4. Do NOT link text inside existing links
5. Return the COMPLETE article with links inserted
6. If you cannot find a good phrase for a URL, skip it

EXAMPLE:
Before: "many people enjoy craft beer alternatives"
After: "many people enjoy [craft beer alternatives](https://example.com/craft-beer)"`;

    const insertUserPrompt = `URLs to insert (with their page topics):

${selectedUrls.map((url, i) => `${i + 1}. ${url} — Topic: "${titleMap[url] || "related content"}"`).join("\n")}

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

    linkedContent = stripCodeFences(linkedContent);

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

    // Deterministic fallback: if AI inserted too few links, insert remaining URLs without rewriting text
    let insertedUrls = detectInsertedUrls(linkedContent, selectedUrls);
    const minimumExpected = Math.min(2, selectedUrls.length);

    if (insertedUrls.length < minimumExpected) {
      const missingUrls = selectedUrls.filter((u) => !insertedUrls.includes(u));
      const fallback = deterministicInsertLinks(linkedContent, missingUrls, titleMap);
      linkedContent = fallback.content;
      insertedUrls = detectInsertedUrls(linkedContent, selectedUrls);

      console.log(
        `[auto-internal-links] Fallback inserted ${fallback.insertedUrls.length} extra links; final ${insertedUrls.length}/${selectedUrls.length}`
      );
    } else {
      console.log(`[auto-internal-links] Inserted ${insertedUrls.length}/${selectedUrls.length} links`);
    }

    return new Response(
      JSON.stringify({
        content: linkedContent,
        insertedCount: insertedUrls.length,
        totalSelected: selectedUrls.length,
        insertedUrls,
        skippedUrls: selectedUrls.filter((url) => !insertedUrls.includes(url)),
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