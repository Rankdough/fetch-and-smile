import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Domains to exclude — not useful for competitor gap analysis
const EXCLUDE_DOMAINS = [
  "youtube.com", "youtu.be",
  "reddit.com", "quora.com",
  "twitter.com", "x.com",
  "facebook.com", "instagram.com",
  "pinterest.com", "tiktok.com",
  "amazon.com", "ebay.com",
  "etsy.com",
  "wikipedia.org",
];

function isExcluded(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return EXCLUDE_DOMAINS.some(d => host === d || host.endsWith("." + d));
  } catch {
    return true;
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keyword, country } = await req.json();

    if (!keyword || !keyword.trim()) {
      return new Response(JSON.stringify({ error: "keyword is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("fetch-serp-urls: searching for", keyword);

    const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: keyword,
        limit: 12, // fetch more so we have enough after filtering
        location: country || "United Kingdom", // Google country for results
        scrapeOptions: { formats: [] }, // metadata only, no content scraping
      }),
    });

    if (!searchResponse.ok) {
      const err = await searchResponse.text();
      console.error("Firecrawl search error:", searchResponse.status, err);
      return new Response(JSON.stringify({ error: "Search failed", detail: err }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchData = await searchResponse.json();
    const results = searchData.data || searchData.results || [];

    // Filter excluded domains, deduplicate by domain, take top 6
    const seen = new Set<string>();
    const filtered: Array<{ url: string; title: string; domain: string }> = [];

    for (const r of results) {
      const url = r.url || r.link || "";
      if (!url) continue;
      if (isExcluded(url)) continue;
      const domain = getDomain(url);
      if (seen.has(domain)) continue;
      seen.add(domain);
      filtered.push({
        url,
        title: r.title || r.metadata?.title || domain,
        domain,
      });
      if (filtered.length >= 6) break;
    }

    console.log(`fetch-serp-urls: returning ${filtered.length} results`);

    return new Response(JSON.stringify({ results: filtered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("fetch-serp-urls error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
