import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InsertLinksRequest {
  content: string;
  urls: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, urls } = (await req.json()) as InsertLinksRequest;

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
    console.log("Inserting internal links", {
      contentLength: content.length,
      urlCount: validUrls.length,
      urls: validUrls,
    });

    const systemPrompt = `You are an expert SEO editor. Your task is to insert contextual internal links into an existing markdown article.

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
- DO NOT link text inside bold (**) or italic (*) markers unless the entire phrase is already styled
- DO NOT link text inside blockquotes (> lines) or CTA banners
- Prefer linking phrases in the body paragraphs of the article
- If a URL's topic doesn't match any phrase in the article, SKIP that URL entirely - do not force it

DISTRIBUTION RULE (CRITICAL):
- Spread links as evenly as possible across the full article.
- Use different H2 sections whenever possible.
- Do NOT place the majority of links in the last section.
- The final section (Final Thoughts, Conclusion, FAQ, References) may contain AT MOST 1 link total.
- If there are N links and at least N eligible sections, place them in N different sections.

LINK FORMAT:
Convert: "relevant phrase about the topic"
To: "[relevant phrase about the topic](URL)"

EXAMPLE:
If URL is "https://example.com/teeth-whitening" and the article mentions "professional teeth whitening treatments", convert it to "[professional teeth whitening treatments](https://example.com/teeth-whitening)"

Return ONLY the enhanced markdown content with links inserted. No explanations.`;

    const userPrompt = `Here is the article content. Insert contextual internal links for the following URLs where they naturally fit:

URLS TO LINK:
${validUrls.map((url, i) => `${i + 1}. ${url}`).join("\n")}

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
