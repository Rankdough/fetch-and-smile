import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const validUrls = urls.filter((u) => u.trim()).slice(0, 12);

    // Extract slug keywords from each URL to guide anchor text relevance
    const STOP = new Set(["the","a","an","and","or","of","for","to","in","on","with","by","at","is","are","be","this","that","what","how","why","when","where","best","top","guide","blog","post","article","page","html","htm","php","aspx","www","com","org","net","co","uk"]);
    const urlContexts = validUrls.map((url) => {
      let slugWords: string[] = [];
      try {
        const u = new URL(url);
        const path = decodeURIComponent(u.pathname).replace(/\.[a-z]+$/i, "");
        slugWords = path
          .split(/[\/\-_]+/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s && !/^\d+$/.test(s) && !STOP.has(s) && s.length > 1);
      } catch {}
      return { url, keywords: slugWords };
    });

    console.log("Inserting internal links", {
      contentLength: content.length,
      urlCount: validUrls.length,
      urlContexts,
    });

    const systemPrompt = `You are an expert SEO editor. Your task is to insert contextual internal links into an existing markdown article.

CRITICAL RULES:
- DO NOT rewrite, rephrase, or remove any existing text or sections.
- You MAY add at most ONE short clause (max 12 words) to an existing body paragraph if — and ONLY if — it is needed to introduce a contextual cross-link to a related FAQ. The added clause must read naturally and must contain the link.
- Otherwise, only convert existing relevant phrases/words into markdown links.
- Return the FULL article with the links inserted.
- Each URL should be linked EXACTLY ONCE (do not repeat the same link).
- DO NOT link text inside headings (H1, H2, H3, etc.).
- DO NOT link text inside existing links.
- DO NOT link text inside bold (**) or italic (*) markers unless the entire phrase is already styled.
- DO NOT link text inside blockquotes (> lines), CTA banners, or markdown tables.
- Prefer linking phrases in the body paragraphs of the article.

ANCHOR TEXT RELEVANCE:
- The anchor text should be topically related to the URL's destination (described by the slug keywords).
- STRONGLY PREFER noun phrases in the body that contain, are synonyms of, or directly describe the slug keywords (e.g. for slug "track-field-bags-backpacks" prefer phrases like "bag", "backpack", "gear bag", "kit bag").
- If the article does not literally contain such a phrase, choose the closest reasonable noun phrase that a reader would expect to lead to that destination page given the article's overall topic.
- DO NOT link clearly unrelated generic phrases like "venues", "schedules", "click here", "for example", or random adjectives.
- It is BETTER to insert a link on an imperfect-but-plausible noun phrase than to skip the URL. Only skip a URL as an absolute last resort when no plausible anchor exists anywhere in the article.

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
          { role: "user", content: userPrompt },
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
    let linkedContent = data.choices?.[0]?.message?.content;

    if (!linkedContent) {
      throw new Error("No content returned from AI");
    }

    // Strip markdown code fences if present
    linkedContent = linkedContent.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    // Post-process: Remove any em dashes and horizontal rules the AI might have introduced
    linkedContent = linkedContent.replace(/—/g, "-").replace(/–/g, "-");

    // Count how many of the provided URLs were actually inserted
    const insertedUrls = validUrls.filter((url) => linkedContent.includes(url));
    console.log(`Inserted ${insertedUrls.length}/${validUrls.length} internal links`);

    return new Response(
      JSON.stringify({
        content: linkedContent,
        insertedCount: insertedUrls.length,
        totalProvided: validUrls.length,
        insertedUrls,
        skippedUrls: validUrls.filter((url) => !linkedContent.includes(url)),
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
