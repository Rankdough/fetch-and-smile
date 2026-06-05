import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Domains to exclude
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

// Country config: gl = Google country, hl = language, tbs = none
// Using Firecrawl to scrape the actual Google SERP URL directly
const COUNTRY_CONFIG: Record<string, { googleDomain: string; gl: string; hl: string }> = {
  "United Kingdom": { googleDomain: "google.co.uk", gl: "gb", hl: "en" },
  "United States":  { googleDomain: "google.com",   gl: "us", hl: "en" },
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
    
    // Build the actual Google search URL for the correct country
    const encoded_kw = encodeURIComponent(keyword.trim());
    const googleUrl = `https://www.${cfg.googleDomain}/search?q=${encoded_kw}&gl=${cfg.gl}&hl=${cfg.hl}&num=20&pws=0&nfpr=1`;
    
    console.log(`fetch-serp-urls: scraping ${googleUrl}`);

    // Use Firecrawl /v1/scrape to get the actual Google SERP page
    // then extract organic result URLs from the HTML
    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: googleUrl,
        formats: ["links", "html"],
        onlyMainContent: false,
        timeout: 15000,
      }),
    });

    if (!scrapeResponse.ok) {
      const err = await scrapeResponse.text();
      console.error("Firecrawl scrape error:", scrapeResponse.status, err);
      // Fallback: try Firecrawl search API with all geo params
      const fallbackResponse = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: keyword.trim(),
          limit: 15,
          location: country || "United Kingdom",
          country: cfg.gl,
          lang: cfg.hl,
          scrapeOptions: { formats: [] },
        }),
      });
      if (!fallbackResponse.ok) {
        return new Response(JSON.stringify({ error: "Both search and scrape failed" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const fbData = await fallbackResponse.json();
      const fbResults = fbData.data || fbData.results || [];
      const seen = new Set<string>();
      const filtered: Array<{ url: string; title: string; domain: string }> = [];
      for (const r of fbResults) {
        const url = r.url || r.link || "";
        if (!url || isExcluded(url)) continue;
        const domain = getDomain(url);
        if (seen.has(domain)) continue;
        seen.add(domain);
        filtered.push({ url, title: r.title || domain, domain });
        if (filtered.length >= 6) break;
      }
      return new Response(JSON.stringify({ results: filtered, source: "search_fallback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scrapeData = await scrapeResponse.json();
    
    // Extract links from the scraped SERP page
    // Google SERP links that are organic results have /url?q= pattern or direct URLs
    const allLinks: Array<{ url: string; text?: string }> = scrapeData.data?.links || scrapeData.links || [];
    const html: string = scrapeData.data?.html || scrapeData.html || "";
    
    console.log(`fetch-serp-urls: got ${allLinks.length} links from SERP`);

    // Extract organic result URLs from links
    // Organic results are direct links to external sites, not google.com internal pages
    const seen = new Set<string>();
    const filtered: Array<{ url: string; title: string; domain: string }> = [];

    // First try: links array (Firecrawl often returns these)
    for (const link of allLinks) {
      let url = link.url || "";
      // Handle /url?q= Google redirect format
      if (url.includes("google.com/url?") || url.includes("google.co.uk/url?")) {
        const match = url.match(/[?&]q=([^&]+)/);
        if (match) url = decodeURIComponent(match[1]);
      }
      if (!url.startsWith("http")) continue;
      if (url.includes("google.com") || url.includes("google.co.uk")) continue;
      if (isExcluded(url)) continue;
      const domain = getDomain(url);
      if (seen.has(domain)) continue;
      seen.add(domain);
      filtered.push({
        url,
        title: (link as any).text || domain,
        domain,
      });
      if (filtered.length >= 6) break;
    }

    // If we didn't get enough from links, try parsing HTML for cite tags (Google shows domain in <cite>)
    if (filtered.length < 3 && html) {
      const citeMatches = html.matchAll(/<cite[^>]*>([^<]+)<\/cite>/gi);
      for (const m of citeMatches) {
        const raw = m[1].replace(/›/g, "/").trim();
        const domain = raw.split("/")[0].replace(/^www\./, "");
        if (!domain.includes(".")) continue;
        if (EXCLUDE_DOMAINS.some(d => domain === d)) continue;
        if (seen.has(domain)) continue;
        seen.add(domain);
        filtered.push({ url: `https://${raw}`, title: domain, domain });
        if (filtered.length >= 6) break;
      }
    }

    console.log(`fetch-serp-urls: returning ${filtered.length} results for ${cfg.googleDomain}`);

    return new Response(JSON.stringify({ results: filtered, source: "scrape", country: cfg.googleDomain }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("fetch-serp-urls error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
