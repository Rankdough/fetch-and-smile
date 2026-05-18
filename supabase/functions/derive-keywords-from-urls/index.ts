import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STOP = new Set([
  "the","a","an","and","or","of","for","to","in","on","at","by","with","from","is","are","was","were","be","been","being","this","that","these","those","it","its","as","but","not","you","your","our","we","they","their","i","my","me","do","does","did","how","what","when","where","why","which","who","whom","whose","can","will","just","than","then","so","if","into","over","about","more","most","best","top","new","get","got","go","goes","up","down","out","off","one","two","three","page","home","read","learn","click","here","menu","close","open","next","previous","skip","privacy","terms","cookie","cookies","login","signup","contact","blog","faq","help","support",
]);

const cleanText = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[“”"]/g, "")
    .replace(/[‘’']/g, "'")
    .replace(/[^a-z0-9\s'\-]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const tokenize = (s: string): string[] =>
  cleanText(s)
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));

const extractFromMarkdown = (md: string) => {
  const phrases = new Set<string>();
  // H1
  for (const m of md.matchAll(/^\s*#\s+(.+)$/gm)) {
    const t = cleanText(m[1]);
    if (t.length >= 3) phrases.add(t);
  }
  // H2
  for (const m of md.matchAll(/^\s*##\s+(.+)$/gm)) {
    const t = cleanText(m[1]);
    if (t.length >= 3) phrases.add(t);
  }
  return [...phrases];
};

const extractFromMetadata = (meta: Record<string, unknown> | undefined) => {
  const out = new Set<string>();
  if (!meta) return out;
  const title = (meta.title as string) || (meta.ogTitle as string) || "";
  const desc = (meta.description as string) || (meta.ogDescription as string) || "";
  if (title) out.add(cleanText(title));
  if (desc) out.add(cleanText(desc));
  return out;
};

const scrapeOne = async (url: string, apiKey: string) => {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 1500,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { url, keywords: [] as string[], phrases: [] as string[], error: data.error || `HTTP ${res.status}` };
    const md: string = data.data?.markdown || data.markdown || "";
    const meta = data.data?.metadata || data.metadata;

    const phrases = new Set<string>([...extractFromMarkdown(md), ...extractFromMetadata(meta)]);
    // Filter out massive boilerplate phrases
    const cleanPhrases = [...phrases].filter((p) => p.length >= 3 && p.length <= 120 && /[a-z]/.test(p));

    // Build a word-bag from phrases (used to seed semantic match against keyword list)
    const wordBag = new Set<string>();
    for (const p of cleanPhrases) {
      for (const t of tokenize(p)) wordBag.add(t);
    }

    return { url, keywords: [...wordBag], phrases: cleanPhrases };
  } catch (e) {
    return { url, keywords: [] as string[], phrases: [] as string[], error: (e as Error).message };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { urls } = await req.json();
    if (!Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ error: "urls array is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalise + dedupe URLs
    const cleaned: string[] = [...new Set(
      urls
        .map((u: string) => (u || "").trim())
        .filter((u: string) => !!u)
        .map((u: string) => (u.startsWith("http://") || u.startsWith("https://")) ? u : `https://${u}`)
    )];

    // SSE stream so the UI can show progress on large URL lists
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

        const BATCH = 10;
        const results: { url: string; keywords: string[]; phrases: string[]; error?: string }[] = [];

        for (let i = 0; i < cleaned.length; i += BATCH) {
          const batch = cleaned.slice(i, i + BATCH);
          const batchResults = await Promise.all(batch.map((u) => scrapeOne(u, apiKey)));
          results.push(...batchResults);
          send({
            type: "progress",
            done: results.length,
            total: cleaned.length,
            message: `Scraped ${results.length} / ${cleaned.length} URLs`,
          });
        }

        send({
          type: "complete",
          results,
          totalUrls: cleaned.length,
          successCount: results.filter((r) => !r.error && r.phrases.length > 0).length,
        });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
