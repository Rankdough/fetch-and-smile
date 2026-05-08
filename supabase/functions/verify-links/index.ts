import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLACEHOLDER_HOSTS = ["example.com", "example.org", "example.net", "yourdomain.com", "your-domain.com", "placeholder.com"];

async function checkOne(rawUrl: string): Promise<{ url: string; ok: boolean; status: number; reason?: string }> {
  const url = (rawUrl || "").trim();
  if (!url) return { url, ok: false, status: 0, reason: "empty" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, ok: false, status: 0, reason: "invalid URL" };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { url, ok: false, status: 0, reason: "non-http" };
  }
  if (PLACEHOLDER_HOSTS.some((h) => parsed.hostname.toLowerCase().endsWith(h))) {
    return { url, ok: false, status: 0, reason: "placeholder host" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    let resp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (LinkChecker)" },
    }).catch(() => null);
    if (!resp || resp.status === 405 || resp.status === 403 || resp.status === 0) {
      resp = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (LinkChecker)" },
      });
    }
    clearTimeout(timer);
    return { url, ok: resp.ok, status: resp.status };
  } catch (e: any) {
    clearTimeout(timer);
    return { url, ok: false, status: 0, reason: e?.name === "AbortError" ? "timeout" : "fetch failed" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { urls } = (await req.json()) as { urls: string[] };
    if (!Array.isArray(urls)) {
      return new Response(JSON.stringify({ error: "urls array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const unique = Array.from(new Set(urls.map((u) => (u || "").trim()).filter(Boolean))).slice(0, 50);
    const results = await Promise.all(unique.map(checkOne));
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
