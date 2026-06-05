import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Domains to exclude — not useful for gap analysis
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
  "yelp.com",
  "trustpilot.com",
  "tripadvisor.com",
];

// URL path patterns that indicate paid/shopping/ad results
const SPONSORED_PATH_PATTERNS = [
  /\/aclk/,        // Google Ads click tracking
  /\/pagead/,      // Google pageads
  /[?&]gclid=/,    // Google click ID — paid traffic
  /[?&]utm_source=google.*utm_medium=cpc/i,
  /[?&]adurl=/,
];

function isExcluded(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (EXCLUDE_DOMAINS.some(d => host === d || host.endsWith("." + d))) return true;
    if (SPONSORED_PATH_PATTERNS.some(p => p.test(url))) return true;
    return false;
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

// Map country name to Google country code (gl param) and language
const COUNTRY_MAP: Record<string, { gl: string; hl: string; location: string }> = {
  "United Kingdom": { gl: "gb", hl: "en", location: "United Kingdom" },
  "United States":  { gl: "us", hl: "en", location: "United States" },
};

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

    const countryConfig = COUNTRY_MAP[country] || COUNTRY_MAP["United Kingdom"];
    console.log(`fetch-serp-urls: searching "${keyword}" in ${countryConfig.location}`);

    // Append gl/hl to query to force Google country targeting
    // Firecrawl passes these through to the underlying search
    const searchResponse = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: keyword,
        limit: 15,
        location: countryConfig.location,
        lang: countryConfig.hl,
        country: countryConfig.gl,
        scrapeOptions: { formats: [] },
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
    console.log("Firecrawl raw response keys:", Object.keys(searchData));
    
    const results = searchData.data || searchData.results || searchData.organic || [];
    console.log(`fetch-serp-urls: raw results count: ${results.length}`);

    // Filter: exclude domains, deduplicate by domain, skip sponsored, take top 6
    const seen = new Set<string>();
    const filtered: Array<{ url: string; title: string; domain: string }> = [];

    for (const r of results) {
      const url = r.url || r.link || "";
      if (!url) continue;
      if (isExcluded(url)) {
        console.log("Excluded:", url);
        continue;
      }
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

    console.log(`fetch-serp-urls: returning ${filtered.length} organic results for ${countryConfig.location}`);

    return new Response(JSON.stringify({ results: filtered, country: countryConfig.location }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("fetch-serp-urls error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
