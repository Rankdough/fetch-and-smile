import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Known bot-protection / junk terms to filter out
const botProtectionTerms = new Set([
  "imperva", "incapsula", "cloudflare", "captcha", "recaptcha",
  "what should i do", "why am i seeing this page", "why am i seeing this",
  "access denied", "please verify", "are you a robot", "bot protection",
  "checking your browser", "please wait", "ray id", "performance security by",
  "enable javascript", "enable cookies", "just a moment", "ddos protection",
  "security check", "human verification", "verify you are human",
  "attention required", "pardon our interruption", "one more step",
  "sitemap.xml", "en gb", "en us", "de de", "fr fr", "es es", "it it",
  "www.smythstoys.com", "www.", ".com", ".co.uk",
]);

// Generic boilerplate/navigation terms to drop from extracted terms
const stopTerms = new Set([
  "home", "index", "page", "about", "contact", "privacy", "terms",
  "cookie", "cookies", "login", "signup", "sign up", "sign in",
  "register", "cart", "checkout", "account", "search", "sitemap",
  "blog", "news", "faq", "help", "support", "careers", "jobs",
  "legal", "disclaimer", "accessibility", "subscribe", "unsubscribe",
  "share", "print", "email", "menu", "close", "open", "back",
  "next", "previous", "read more", "learn more", "click here",
  "view all", "see all", "show more", "load more",
  "trusted source", "source", "medically reviewed",
  "about us", "advertise with us", "advertising policy", "all",
]);

const normalizeTerm = (raw: string): string => {
  return raw
    .toLowerCase()
    .replace(/\\\./g, ".")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/^!\[([^\]]*)$/g, "$1")
    .replace(/^!?\[([^\]]+)\]$/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, " and ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^\d+\s*(?:[.)]|[-:])\s*/, "")
    .replace(/[0-9]+\s*trusted\s*source/gi, "")
    .replace(/\btrusted\s*source\b/gi, "")
    .replace(/^[\s!'"`*_~>#\-\[\]\u2022]+/, "")
    .replace(/[\s'"`*_~<>\-]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const isUsefulTerm = (term: string): boolean => {
  if (!term || term.length < 3 || term.length > 80) return false;
  if (!/[a-z]/i.test(term)) return false;
  if (/^!?\[/.test(term)) return false;
  if (/^(www\.|https?:)/.test(term)) return false;
  if (/\.(com|co\.uk|org|net|io)$/i.test(term)) return false;
  if (/^\d+$/.test(term)) return false;
  if (/^\d+\s*trusted\s*source$/i.test(term)) return false;
  if (/trusted\s*source/i.test(term)) return false;
  if (/click to verify/i.test(term)) return false;
  if (stopTerms.has(term)) return false;

  for (const bot of botProtectionTerms) {
    if (term === bot || term.includes(bot)) return false;
  }

  return true;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, urlFilters } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Firecrawl connector not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // Parse URL filters (comma/newline separated keywords that URLs must contain)
    const filters: string[] = (urlFilters || "")
      .split(/[,\n]+/)
      .map((f: string) => f.trim().toLowerCase())
      .filter((f: string) => f.length > 0);

    console.log("Scanning website:", formattedUrl, filters.length > 0 ? `with URL filters: ${filters.join(", ")}` : "no URL filters");

    // Step 1: Map the site to get all URLs
    const mapResponse = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        limit: 2000,
        includeSubdomains: false,
      }),
    });

    if (!mapResponse.ok) {
      const errData = await mapResponse.json().catch(() => ({}));
      console.error("Firecrawl map error:", mapResponse.status, errData);
      throw new Error(errData.error || `Map failed: ${mapResponse.status}`);
    }

    const mapData = await mapResponse.json();
    let allUrls: string[] = mapData.links || [];
    console.log(`Found ${allUrls.length} total URLs on site`);

    // Apply URL filters — only keep URLs containing at least one filter keyword
    let filteredUrls = allUrls;
    if (filters.length > 0) {
      filteredUrls = allUrls.filter(u => {
        const lower = u.toLowerCase();
        return filters.some(f => lower.includes(f));
      });
      console.log(`After URL filter: ${filteredUrls.length} of ${allUrls.length} URLs match`);
    }

    // Extract keyword ideas from URL paths
    const urlKeywords = new Set<string>();
    for (const u of filteredUrls) {
      try {
        const path = new URL(u).pathname;
        const segments = path.split("/").filter(Boolean);
        for (const seg of segments) {
          const cleaned = normalizeTerm(seg
            .replace(/[-_]/g, " ")
            .replace(/\.(html|htm|php|aspx|jsp)$/i, "")
            .replace(/[0-9]{5,}/g, "")
            .trim());
          if (isUsefulTerm(cleaned)) {
            urlKeywords.add(cleaned);
          }
        }
      } catch {}
    }

    // Step 2: Scrape the homepage + up to 10 category-level pages
    const scrapeUrl = async (targetUrl: string): Promise<string[]> => {
      try {
        const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: targetUrl,
            formats: ["markdown"],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });

        if (!scrapeResponse.ok) return [];

        const scrapeData = await scrapeResponse.json();
        const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
        const terms: string[] = [];

        // Extract headings
        const headingMatches = markdown.match(/^#{1,3}\s+(.+)$/gm) || [];
        for (const h of headingMatches) {
          const text = normalizeTerm(h.replace(/^#+\s+/, "").trim());
          if (isUsefulTerm(text)) {
            terms.push(text);
          }
        }

        // Intentionally do not extract markdown link text because it introduces navigation/related-content noise.

        return terms;
      } catch {
        return [];
      }
    };

    const isScrapablePageUrl = (u: string) => {
      try {
        const parsed = new URL(u);
        const segments = parsed.pathname.split("/").filter(Boolean);
        return segments.length >= 1 && segments.length <= 4 && !segments.some(s => /\.(jpg|png|gif|css|js|pdf|xml|json)$/i.test(s));
      } catch { return false; }
    };

    const pageTerms: string[] = [];
    let urlsToScrape: string[] = [];

    if (filters.length > 0) {
      // When a URL filter is used, only scrape matching pages (skip homepage to avoid noisy global terms)
      urlsToScrape = [...new Set(filteredUrls.filter(isScrapablePageUrl))].slice(0, 15);
      console.log(`Scraping ${urlsToScrape.length} filtered pages (URL filter active)...`);
    } else {
      // No URL filter: include homepage and a few category pages
      pageTerms.push(...await scrapeUrl(formattedUrl));
      urlsToScrape = [...new Set(filteredUrls.filter(isScrapablePageUrl))].slice(0, 10);
      console.log(`Scraping ${urlsToScrape.length} category pages...`);
    }

    const scrapeResults = await Promise.all(urlsToScrape.map(u => scrapeUrl(u)));
    for (const terms of scrapeResults) {
      pageTerms.push(...terms);
    }

    // Combine and deduplicate all extracted terms
    const allTerms = new Set<string>([...urlKeywords, ...pageTerms]);

    // Final normalize + quality filter
    const filtered = [...new Set([...allTerms].map(normalizeTerm).filter(isUsefulTerm))]
      .filter((t) => !/^!?\[/.test(t))
      .filter((t) => !/trusted\s*source/i.test(t))
      .filter((t) => !/click to verify/i.test(t));

    // Detect if the site is likely blocking us
    const isBlocked = filtered.length < 5 && filteredUrls.length < 10;

    console.log(`Extracted ${filtered.length} keyword ideas (${urlKeywords.size} from URLs, ${pageTerms.length} from content). Filtered URLs: ${filteredUrls.length}/${allUrls.length}. Blocked: ${isBlocked}`);

    return new Response(
      JSON.stringify({
        url: formattedUrl,
        total_urls_found: allUrls.length,
        filtered_urls_count: filteredUrls.length,
        url_filters_applied: filters,
        extracted_terms: filtered.sort(),
        sample_urls: filteredUrls.slice(0, 20),
        likely_blocked: isBlocked,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Scan website error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to scan website";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
