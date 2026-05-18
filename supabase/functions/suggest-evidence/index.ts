import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EvidenceSource {
  title: string;
  url: string;
  snippet: string;
  origin: "web" | "first-party";
}

interface EvidenceCard {
  fact: string;            // 1-2 sentence quotable claim with concrete detail
  insertText: string;      // ready-to-paste sentence(s) for the article
  sourceUrl: string;
  sourceDomain: string;
  sourceTitle: string;
  origin: "web" | "first-party";
  matchHeading?: string;   // best-matching H2 from the article
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function extractH2s(markdown: string): string[] {
  const lines = markdown.split("\n");
  const h2s: string[] = [];
  for (const l of lines) {
    const m = l.match(/^##\s+(.+?)\s*$/);
    if (m) h2s.push(m[1].trim());
  }
  return h2s;
}

function extractH1(markdown: string): string {
  const m = markdown.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { article, ctaUrl, topic } = await req.json() as {
      article: string;
      ctaUrl?: string;
      topic?: string;
    };

    if (!article || article.trim().length < 100) {
      return new Response(JSON.stringify({ error: "Article content is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");

    const h1 = extractH1(article);
    const h2s = extractH2s(article).slice(0, 12);
    const articleTopic = topic?.trim() || h1 || "the article topic";

    // Build a focused search query from topic + first few H2s
    const searchQuery = `${articleTopic} ${h2s.slice(0, 2).join(" ")} statistics study research`.trim();

    // Fire Firecrawl Search (web) and Firecrawl Scrape (CTA domain) in parallel
    const searchPromise = fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 8,
        tbs: "qdr:y2", // last 2 years
      }),
    }).then(async (r) => {
      if (!r.ok) {
        console.warn("Firecrawl search failed:", r.status, await r.text());
        return null;
      }
      return r.json();
    }).catch((e) => { console.warn("Search error:", e); return null; });

    let scrapePromise: Promise<any> = Promise.resolve(null);
    if (ctaUrl && ctaUrl.trim()) {
      let formatted = ctaUrl.trim();
      if (!/^https?:\/\//i.test(formatted)) formatted = `https://${formatted}`;
      scrapePromise = fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: formatted,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      }).then(async (r) => {
        if (!r.ok) {
          console.warn("Firecrawl scrape failed:", r.status, await r.text());
          return null;
        }
        return r.json();
      }).catch((e) => { console.warn("Scrape error:", e); return null; });
    }

    const [searchRes, scrapeRes] = await Promise.all([searchPromise, scrapePromise]);

    const sources: EvidenceSource[] = [];

    // Parse search results — Firecrawl v2 returns { data: { web: [...] } } or { web: [...] }
    const webResults =
      searchRes?.data?.web ??
      searchRes?.web ??
      searchRes?.data ??
      [];
    if (Array.isArray(webResults)) {
      for (const r of webResults.slice(0, 6)) {
        const url = r.url || r.link;
        const title = r.title || r.name || "";
        const snippet = r.description || r.snippet || r.markdown?.slice(0, 400) || "";
        if (url && snippet) {
          sources.push({ url, title, snippet: String(snippet).slice(0, 500), origin: "web" });
        }
      }
    }

    // Parse CTA scrape
    if (scrapeRes) {
      const md = scrapeRes?.data?.markdown ?? scrapeRes?.markdown ?? "";
      const meta = scrapeRes?.data?.metadata ?? scrapeRes?.metadata ?? {};
      if (md) {
        sources.push({
          url: meta.sourceURL || ctaUrl || "",
          title: meta.title || "Site content",
          snippet: String(md).slice(0, 2500),
          origin: "first-party",
        });
      }
    }

    if (sources.length === 0) {
      return new Response(JSON.stringify({
        cards: [],
        warning: "No web or first-party sources could be retrieved. Try a different topic or check the CTA URL.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Ask Gemini to pick 3 strongest evidence pieces and turn them into insertable sentences
    const systemPrompt = `You extract first-hand and citable evidence from sources to embed into SEO articles. British English. No em/en dashes. No buzzwords. Be specific: prefer concrete numbers, named studies, dates, organisations, or direct first-party data.

For each evidence card you produce:
- "fact": 1 short sentence stating the concrete claim (must be quotable; include the number or specific detail).
- "insertText": 1-2 sentences ready to paste into an article paragraph. Natural prose, weaves the fact in. End with a parenthetical attribution like "(Source: domain.com, 2024)" using the source's domain.
- "sourceUrl": the exact URL from the source list.
- "matchHeading": pick the single best-matching H2 heading from the provided list where this evidence belongs (exact string from the list), or "" if none fit.
- "origin": "web" or "first-party".

Rules:
- Use ONLY facts present in the provided sources. Do not invent numbers or quotes.
- Skip sources that lack concrete detail.
- Prefer first-party (the article's own brand) sources when meaningful.
- Return EXACTLY 3 cards if possible, fewer if sources are weak. Never more than 3.`;

    const userPrompt = `ARTICLE TITLE: ${h1 || articleTopic}

H2 HEADINGS IN ARTICLE:
${h2s.map((h, i) => `${i + 1}. ${h}`).join("\n") || "(none)"}

SOURCES:
${sources.map((s, i) => `--- Source ${i + 1} (${s.origin}) ---
URL: ${s.url}
TITLE: ${s.title}
CONTENT:
${s.snippet}`).join("\n\n")}

Return JSON only.`;

    const tool = {
      type: "function",
      function: {
        name: "emit_evidence",
        description: "Return 0-3 evidence cards extracted from the sources.",
        parameters: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              minItems: 0,
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  fact: { type: "string" },
                  insertText: { type: "string" },
                  sourceUrl: { type: "string" },
                  matchHeading: { type: "string" },
                  origin: { type: "string", enum: ["web", "first-party"] },
                },
                required: ["fact", "insertText", "sourceUrl", "matchHeading", "origin"],
                additionalProperties: false,
              },
            },
          },
          required: ["cards"],
          additionalProperties: false,
        },
      },
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "emit_evidence" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("No tool call returned");
    const parsed = JSON.parse(call.function.arguments) as { cards: Omit<EvidenceCard, "sourceDomain" | "sourceTitle">[] };

    // Enrich with domain + title from sources
    const cards: EvidenceCard[] = (parsed.cards || []).map((c) => {
      const src = sources.find((s) => s.url === c.sourceUrl) ||
                  sources.find((s) => c.sourceUrl && s.url && extractDomain(s.url) === extractDomain(c.sourceUrl));
      return {
        fact: c.fact,
        insertText: c.insertText,
        sourceUrl: c.sourceUrl,
        sourceDomain: extractDomain(c.sourceUrl),
        sourceTitle: src?.title || c.sourceUrl,
        origin: c.origin,
        matchHeading: c.matchHeading || undefined,
      };
    });

    return new Response(JSON.stringify({ cards }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-evidence error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
