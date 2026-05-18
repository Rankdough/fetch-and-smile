import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STOP = new Set([
  "the","a","an","and","or","of","for","to","in","on","at","by","with","from","is","are","was","were","be","been","being","this","that","these","those","it","its","as","but","not","you","your","our","we","they","their","i","my","me","do","does","did","how","what","when","where","why","which","who","whom","whose","can","will","just","than","then","so","if","into","over","about","more","most","best","top","new","get","got","go","goes","up","down","out","off","one","two","three","page","home","read","learn","click","here","menu","close","open","next","previous","skip","privacy","terms","cookie","cookies","login","signup","contact","blog","faq","help","support",
]);

const decodeEntities = (s: string): string =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)));

const cleanText = (s: string): string =>
  decodeEntities(s)
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/[‘’']/g, "'")
    .replace(/[^a-z0-9\s'\-]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const tokenize = (s: string): string[] =>
  cleanText(s).split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));

const stripTags = (s: string): string => s.replace(/<[^>]+>/g, " ");

const extractFromHtml = (html: string) => {
  const phrases = new Set<string>();

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) {
    const t = cleanText(stripTags(title));
    if (t.length >= 3) phrases.add(t);
  }

  const metaDesc = html.match(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i,
  )?.[1] ||
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["']/i,
    )?.[1] ||
    html.match(
      /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
    )?.[1];
  if (metaDesc) {
    const t = cleanText(metaDesc);
    if (t.length >= 3) phrases.add(t);
  }

  for (const m of html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const t = cleanText(stripTags(m[1]));
    if (t.length >= 3 && t.length <= 200) phrases.add(t);
  }
  for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)) {
    const t = cleanText(stripTags(m[1]));
    if (t.length >= 3 && t.length <= 200) phrases.add(t);
  }

  return [...phrases];
};

const scrapeOne = async (url: string): Promise<{ url: string; keywords: string[]; phrases: string[]; error?: string }> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LovableBot/1.0; +https://lovable.dev)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return { url, keywords: [], phrases: [], error: `HTTP ${res.status}` };
    const html = await res.text();
    const phrases = extractFromHtml(html);
    const wordBag = new Set<string>();
    for (const p of phrases) for (const t of tokenize(p)) wordBag.add(t);
    return { url, keywords: [...wordBag], phrases };
  } catch (e) {
    return { url, keywords: [], phrases: [], error: (e as Error).message };
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

    const cleaned: string[] = [...new Set(
      urls
        .map((u: string) => (u || "").trim())
        .filter((u: string) => u.length >= 4 && u.includes("."))
        .map((u: string) => (u.startsWith("http://") || u.startsWith("https://")) ? u : `https://${u}`)
    )];

    if (cleaned.length === 0) {
      return new Response(JSON.stringify({ error: "No valid URLs found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* closed */ }
        };

        // Heartbeat to keep proxies from closing the connection
        const hb = setInterval(() => {
          try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { /* closed */ }
        }, 10000);

        const CONCURRENCY = 25;
        const results: { url: string; keywords: string[]; phrases: string[]; error?: string }[] = [];
        let cursor = 0;

        send({ type: "progress", done: 0, total: cleaned.length, message: `Starting ${cleaned.length} URLs...` });

        const worker = async () => {
          while (cursor < cleaned.length) {
            const i = cursor++;
            const r = await scrapeOne(cleaned[i]);
            results.push(r);
            if (results.length % 5 === 0 || results.length === cleaned.length) {
              send({
                type: "progress",
                done: results.length,
                total: cleaned.length,
                message: `Scraped ${results.length} / ${cleaned.length}`,
              });
            }
          }
        };

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cleaned.length) }, worker));

        clearInterval(hb);
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
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
