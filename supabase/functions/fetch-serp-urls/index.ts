import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXCLUDE_DOMAINS = [
  "youtube.com", "youtu.be",
  "reddit.com", "quora.com",
  "twitter.com", "x.com",
  "facebook.com", "instagram.com",
  "pinterest.com", "tiktok.com",
  "amazon.com", "amazon.co.uk",
  "ebay.com", "ebay.co.uk",
  "etsy.com",
  "wikipedia.org",
  "google.com", "google.co.uk",
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

const COUNTRY_CONFIG: Record<string, { gl: string; hl: string; location: string }> = {
  "United Kingdom": { gl: "gb", hl: "en", location: "United Kingdom" },
  "United States":  { gl: "us", hl: "en", location: "United States" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keyword, country } = await req.json();

    if (!keyword?.trim()) {
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

    const cfg = COUNTRY_CONFIG[country] || COUNTRY_CONFIG["United Kingdom"];
    console.log(`fetch-serp-urls: v2 search for "${keyword}" — country: ${cfg.location} (gl=${cfg.gl})`);

    // Use Firecrawl v2/search — the working endpoint in this codebase
    const searchResponse = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: keyword.trim(),
        limit: 15,
        gl: cfg.gl,
        hl: cfg.hl,
        location: cfg.location,
        country: cfg.gl,
      }),
    });

    if (!searchResponse.ok) {
      const err = await searchResponse.text();
      console.error("Firecrawl v2 search error:", searchResponse.status, err);
      return new Response(JSON.stringify({ error: "Search failed", detail: err }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await searchResponse.json();
    console.log("v2 response keys:", Object.keys(data));

    // v2 response: { success, data: { web: [...] } } or { data: [...] }
    const results: any[] =
      data?.data?.web ||
      (Array.isArray(data?.data) ? data.data : null) ||
      data?.web ||
      data?.results ||
      [];

    console.log(`fetch-serp-urls: ${results.length} raw results`);

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

    return new Response(JSON.stringify({ results: filtered, country: cfg.location }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("fetch-serp-urls error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
