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

const COUNTRY_CONFIG: Record<string, { gl: string; hl: string; location: string; tbs?: string }> = {
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

    const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY");
    if (!SERPER_API_KEY) {
      return new Response(JSON.stringify({ error: "SERPER_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = COUNTRY_CONFIG[country] || COUNTRY_CONFIG["United Kingdom"];
    console.log(`fetch-serp-urls: "${keyword}" gl=${cfg.gl}`);

    // Serper.dev — real Google results with genuine country targeting
    const searchResponse = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: keyword.trim(),
        gl: cfg.gl,
        hl: cfg.hl,
        location: cfg.location,
        num: 20,
        type: "search",
      }),
    });

    if (!searchResponse.ok) {
      const err = await searchResponse.text();
      console.error("Serper error:", searchResponse.status, err);
      return new Response(JSON.stringify({ error: "Search failed", detail: err }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await searchResponse.json();

    // Serper returns organic results in data.organic
    // Each item: { title, link, snippet, position }
    const organic: any[] = data?.organic || [];
    console.log(`fetch-serp-urls: ${organic.length} organic results from Serper`);

    const seen = new Set<string>();
    const filtered: Array<{ url: string; title: string; domain: string }> = [];

    for (const r of organic) {
      const url = r.link || "";
      if (!url) continue;
      if (isExcluded(url)) continue;
      const domain = getDomain(url);
      if (seen.has(domain)) continue;
      seen.add(domain);
      filtered.push({
        url,
        title: r.title || domain,
        domain,
      });
      if (filtered.length >= 6) break;
    }

    console.log(`fetch-serp-urls: returning ${filtered.length} results for ${country}`);

    return new Response(JSON.stringify({ results: filtered, country, gl: cfg.gl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("fetch-serp-urls error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
