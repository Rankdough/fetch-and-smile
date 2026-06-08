import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { restoreTrailingReferencesSection, splitTrailingReferencesSection } from "../_shared/referencesSection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InsertLinksRequest {
  content: string;
  urls: string[];
  articleTopic?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, urls, articleTopic } = (await req.json()) as InsertLinksRequest;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!urls || urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const allUrls = urls.filter((u) => u.trim()).slice(0, 12);

    // Extract slug keywords from each URL to guide anchor text relevance
    const STOP = new Set(["the","a","an","and","or","of","for","to","in","on","with","by","at","is","are","be","this","that","what","how","why","when","where","best","top","guide","blog","post","article","page","html","htm","php","aspx","www","com","org","net","co","uk"]);
    const extractKeywords = (url: string): string[] => {
      try {
        const u = new URL(url);
        const path = decodeURIComponent(u.pathname).replace(/\.[a-z]+$/i, "");
        return path
          .split(/[\/\-_]+/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s && !/^\d+$/.test(s) && !STOP.has(s) && s.length > 1);
      } catch {
        return [];
      }
    };

    // TOPICAL GATING: build a token bag from article topic + body, only keep URLs
    // whose slug keywords overlap (or are clearly synonymous) with the article.
    const SYNONYMS: Record<string, string[]> = {
      bag: ["bag","backpack","gear","kit","luggage","carry"],
      backpack: ["bag","backpack","gear","kit","carry"],
      apparel: ["apparel","clothing","clothes","wear","jersey","uniform","kit"],
      shoe: ["shoe","shoes","footwear","spikes","cleats","trainer","trainers","sneaker","sneakers"],
      shoes: ["shoe","shoes","footwear","spikes","cleats","trainer","trainers","sneaker","sneakers"],
    };
    const expand = (kw: string): string[] => [kw, ...(SYNONYMS[kw] || [])];

    const articleText = `${articleTopic || ""} ${content}`.toLowerCase();
    const articleTokens = new Set(
      articleText
        .replace(/<[^>]+>/g, " ")
        .split(/[^a-z0-9]+/)
        .filter((t) => t && t.length > 2 && !STOP.has(t))
    );
    const weakUrlTokens = new Set(["dental", "dentist", "dentists", "clinic", "clinics", "implant", "implants"]);

    const urlContexts: { url: string; keywords: string[] }[] = [];
    const skippedOffTopic: string[] = [];
    for (const url of allUrls) {
      const kws = extractKeywords(url);
      if (kws.length === 0) {
        // No detectable keywords, allow it (legacy behaviour)
        urlContexts.push({ url, keywords: kws });
        continue;
      }
      const expanded = new Set(kws.flatMap(expand));
      const hits = [...expanded].filter((k) => articleTokens.has(k));
      const strongHits = hits.filter((k) => !weakUrlTokens.has(k));
      const hit = strongHits.length > 0 || hits.length >= 2;
      if (hit) {
        urlContexts.push({ url, keywords: kws });
      } else {
        skippedOffTopic.push(url);
      }
    }

    const validUrls = urlContexts.map((c) => c.url);

    console.log("Inserting internal links", {
      contentLength: content.length,
      urlCount: validUrls.length,
      skippedOffTopicCount: skippedOffTopic.length,
      skippedOffTopic,
      urlContexts,
    });

    if (validUrls.length === 0) {
      return new Response(
        JSON.stringify({
          content,
          insertedCount: 0,
          totalProvided: allUrls.length,
          insertedUrls: [],
          skippedUrls: allUrls,
          skippedOffTopic,
          note: "No URLs were topically relevant to the article.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { body: contentWithoutReferences, references: trailingReferences } = splitTrailingReferencesSection(content);

    const systemPrompt = `You are an expert SEO editor. Your task is to insert contextual internal links into an existing markdown article.

CRITICAL RULES:
- DO NOT rewrite, rephrase, or remove any existing text or sections.
- DO NOT add, invent, or append any new words, clauses, or sentences. You may ONLY wrap phrases that already exist verbatim in the article. If no existing phrase fits a URL, skip that URL.
- Otherwise, only convert existing relevant phrases/words into markdown links.
- Return the FULL article with the links inserted.
- Each URL should be linked EXACTLY ONCE (do not repeat the same link).
- DO NOT link text inside headings (H1, H2, H3, etc.).
- DO NOT link text inside existing links.
- DO NOT link text inside bold (**) or italic (*) markers unless the entire phrase is already styled.
- DO NOT link text inside blockquotes (> lines), CTA banners, or markdown tables.
- DO NOT modify, remove, rewrite, or regenerate the final References section.
- Prefer linking phrases in the body paragraphs of the article.
- DO NOT link text in the opening paragraph (the first paragraph directly after the H1). This paragraph is marked id="direct-answer" and must stay clean — no inline links.
- DO NOT link text inside the TL;DR section (the ## TL;DR block and its paragraph). The TL;DR must stay clean for AI retrieval.
- The earliest a link may appear is the first H2 body section after TL;DR.

ANCHOR TEXT RELEVANCE:
- The anchor text should be topically related to the URL's destination (described by the slug keywords).
- STRONGLY PREFER noun phrases in the body that contain, are synonyms of, or directly describe the slug keywords (e.g. for slug "track-field-bags-backpacks" prefer phrases like "bag", "backpack", "gear bag", "kit bag").
- If the article does not literally contain such a phrase, choose the closest reasonable noun phrase that a reader would expect to lead to that destination page given the article's overall topic.
- DO NOT link clearly unrelated generic phrases like "venues", "schedules", "click here", "for example", or random adjectives.
- Prefer an imperfect-but-plausible EXISTING noun phrase over skipping, but NEVER add new text to host a link. If no suitable phrase already exists in the article, skip the URL.

DISTRIBUTION RULE:
- Spread links as evenly as possible across the full article. Use different H2 sections when possible.
- The final section (Final Thoughts, Conclusion, FAQ, References) may contain AT MOST 1 link total.

LINK FORMAT:
Convert: "relevant phrase about the topic"
To: "[relevant phrase about the topic](URL)"

Return ONLY the enhanced markdown content with links inserted. No explanations.`;

    const userPrompt = `Here is the article. Insert contextual internal links for EACH URL below. You should insert all ${validUrls.length} link(s) unless it is genuinely impossible to find any plausible anchor phrase.

ARTICLE TOPIC: ${articleTopic || "(not provided)"}

URLS TO LINK (with destination topic keywords):
${urlContexts.map((c, i) => `${i + 1}. ${c.url}\n   Destination topic keywords: ${c.keywords.length ? c.keywords.join(", ") : "(none detectable - infer from URL)"}`).join("\n")}

ARTICLE:
${contentWithoutReferences}`;

    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 110_000);
    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        signal: aiController.signal,
      });
    } catch (err) {
      clearTimeout(aiTimeout);
      const aborted = (err as Error)?.name === "AbortError";
      console.warn("[insert-internal-links] AI call failed:", aborted ? "timeout" : err);
      // Graceful fallback: return original content so the client doesn't 504
      return new Response(
        JSON.stringify({
          content,
          insertedCount: 0,
          totalProvided: allUrls.length,
          insertedUrls: [],
          skippedUrls: allUrls,
          skippedOffTopic,
          note: aborted ? "AI link insertion timed out; returning original content." : "AI link insertion failed; returning original content.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    clearTimeout(aiTimeout);

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
    let linkedContent = data.choices?.[0]?.message?.content;

    if (!linkedContent) {
      throw new Error("No content returned from AI");
    }

    // Strip markdown code fences if present
    linkedContent = linkedContent.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    // Post-process: Remove any em dashes and horizontal rules the AI might have introduced
    linkedContent = linkedContent.replace(/—/g, "-").replace(/–/g, "-");

    // Enforce strict whitelist for NEW internal links while preserving existing article links
    // such as References/Sources. The previous version unwrapped every non-whitelisted URL,
    // which stripped generated reference links when inserting internal links.
    const norm = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
    const originalLinkedUrls = new Set<string>();
    content.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, (_m, _anchor, url) => {
      originalLinkedUrls.add(norm(url));
      return _m;
    });
    const allowedUrls = new Set(validUrls.map(norm));
    const keywordByUrl = new Map(urlContexts.map((c) => [norm(c.url), c.keywords]));
    const anchorMatchesDestination = (anchor: string, keywords: string[]) => {
      if (keywords.length === 0) return true;
      const anchorTokens = new Set(
        anchor.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && t.length > 2 && !STOP.has(t))
      );
      const expanded = new Set(keywords.flatMap(expand));
      const hits = [...expanded].filter((k) => anchorTokens.has(k));
      return hits.some((k) => !weakUrlTokens.has(k)) || hits.length >= 2;
    };
    const seenUrls = new Set<string>();
    linkedContent = linkedContent.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g,
      (_m: string, anchor: string, url: string) => {
        const key = norm(url);
        if (originalLinkedUrls.has(key)) return `[${anchor}](${url})`; // preserve existing references/sources
        if (!allowedUrls.has(key)) return anchor; // hallucinated / not whitelisted
        if (!anchorMatchesDestination(anchor, keywordByUrl.get(key) || [])) return anchor; // mismatched destination/anchor
        if (seenUrls.has(key)) return anchor; // duplicate
        seenUrls.add(key);
        return `[${anchor}](${url})`;
      }
    );

    linkedContent = restoreTrailingReferencesSection(linkedContent, trailingReferences);

    // Count how many of the provided URLs were actually inserted
    const insertedUrls = validUrls.filter((url) => linkedContent.includes(url));
    console.log(`Inserted ${insertedUrls.length}/${validUrls.length} internal links`);

    return new Response(
      JSON.stringify({
        content: linkedContent,
        insertedCount: insertedUrls.length,
        totalProvided: allUrls.length,
        insertedUrls,
        skippedUrls: [...validUrls.filter((url) => !linkedContent.includes(url)), ...skippedOffTopic],
        skippedOffTopic,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Insert internal links error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to insert internal links";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
