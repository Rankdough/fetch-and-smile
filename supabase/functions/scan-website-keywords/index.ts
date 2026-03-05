import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

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

    console.log("Scanning website:", formattedUrl);

    // Step 1: Map the site to get all URLs
    const mapResponse = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        limit: 500,
        includeSubdomains: false,
      }),
    });

    if (!mapResponse.ok) {
      const errData = await mapResponse.json().catch(() => ({}));
      console.error("Firecrawl map error:", mapResponse.status, errData);
      throw new Error(errData.error || `Map failed: ${mapResponse.status}`);
    }

    const mapData = await mapResponse.json();
    const allUrls: string[] = mapData.links || [];
    console.log(`Found ${allUrls.length} URLs on site`);

    // Extract keyword ideas from URL paths
    const urlKeywords = new Set<string>();
    for (const u of allUrls) {
      try {
        const path = new URL(u).pathname;
        const segments = path.split("/").filter(Boolean);
        for (const seg of segments) {
          // Clean URL segments into readable terms
          const cleaned = seg
            .replace(/[-_]/g, " ")
            .replace(/\.(html|htm|php|aspx|jsp)$/i, "")
            .replace(/[0-9]{5,}/g, "") // remove long IDs
            .trim();
          if (cleaned.length >= 3 && cleaned.length <= 60 && !/^[0-9]+$/.test(cleaned)) {
            urlKeywords.add(cleaned.toLowerCase());
          }
        }
      } catch {}
    }

    // Step 2: Scrape the homepage for navigation/category names
    const scrapeResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ["links", "markdown"],
        onlyMainContent: false, // we want nav/menus too
      }),
    });

    let pageTerms: string[] = [];
    if (scrapeResponse.ok) {
      const scrapeData = await scrapeResponse.json();
      const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";

      // Extract headings and nav-like items from markdown
      const headingMatches = markdown.match(/^#{1,3}\s+(.+)$/gm) || [];
      for (const h of headingMatches) {
        const text = h.replace(/^#+\s+/, "").trim();
        if (text.length >= 3 && text.length <= 60) {
          pageTerms.push(text.toLowerCase());
        }
      }

      // Extract link texts (markdown links [text](url))
      const linkMatches = markdown.match(/\[([^\]]+)\]\([^)]+\)/g) || [];
      for (const link of linkMatches) {
        const text = link.match(/\[([^\]]+)\]/)?.[1]?.trim();
        if (text && text.length >= 3 && text.length <= 60 && !/^(http|mailto|#)/i.test(text)) {
          pageTerms.push(text.toLowerCase());
        }
      }
    }

    // Combine and deduplicate all extracted terms
    const allTerms = new Set<string>([...urlKeywords, ...pageTerms]);

    // Remove generic/boilerplate terms
    const stopTerms = new Set([
      "home", "index", "page", "about", "contact", "privacy", "terms",
      "cookie", "cookies", "login", "signup", "sign up", "sign in",
      "register", "cart", "checkout", "account", "search", "sitemap",
      "blog", "news", "faq", "help", "support", "careers", "jobs",
      "legal", "disclaimer", "accessibility", "subscribe", "unsubscribe",
      "share", "print", "email", "menu", "close", "open", "back",
      "next", "previous", "read more", "learn more", "click here",
      "view all", "see all", "show more", "load more",
    ]);

    const filtered = [...allTerms].filter(t => !stopTerms.has(t));

    console.log(`Extracted ${filtered.length} keyword ideas from website (${urlKeywords.size} from URLs, ${pageTerms.length} from page content)`);

    return new Response(
      JSON.stringify({
        url: formattedUrl,
        total_urls_found: allUrls.length,
        extracted_terms: filtered.sort(),
        sample_urls: allUrls.slice(0, 20),
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
