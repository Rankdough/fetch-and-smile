// Edge function: fix-broken-links
// Scans every markdown link in the article, HEAD/GET-checks them,
// and for any broken URL tries to find a working replacement via Firecrawl search.
// If no replacement found, the link is removed (anchor text kept as plain prose).
// The ## References section is rebuilt from real, working links after the swap.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLACEHOLDER_HOSTS = [
  "example.com", "example.org", "example.net",
  "yourdomain.com", "your-domain.com", "placeholder.com",
];

type CheckResult = { ok: boolean; status: number; reason?: string };

async function checkUrl(rawUrl: string): Promise<CheckResult> {
  const url = (rawUrl || "").trim();
  if (!url) return { ok: false, status: 0, reason: "empty" };
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { return { ok: false, status: 0, reason: "invalid URL" }; }
  if (!/^https?:$/.test(parsed.protocol)) return { ok: false, status: 0, reason: "non-http" };
  if (PLACEHOLDER_HOSTS.some((h) => parsed.hostname.toLowerCase().endsWith(h))) {
    return { ok: false, status: 0, reason: "placeholder host" };
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
    if (!resp || resp.status === 405 || resp.status === 403 || resp.status === 0 || resp.status >= 500) {
      resp = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (LinkChecker)" },
      });
    }
    return { ok: resp.ok, status: resp.status };
  } catch (e: any) {
    return { ok: false, status: 0, reason: e?.name === "AbortError" ? "timeout" : "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function firecrawlReplace(anchor: string, context: string): Promise<string | null> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    console.warn("FIRECRAWL_API_KEY not set — cannot search for replacements");
    return null;
  }
  const query = [anchor, context].filter(Boolean).join(" ").slice(0, 200);
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit: 5 }),
    });
    if (!resp.ok) {
      console.warn(`Firecrawl search failed: ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    // v2 response shape: { success, data: { web: [...] } } or { data: [...] }
    const candidates: any[] =
      data?.data?.web ||
      (Array.isArray(data?.data) ? data.data : null) ||
      data?.web ||
      [];
    for (const r of candidates) {
      const candidate: string | undefined = r?.url || r?.link;
      if (!candidate) continue;
      const check = await checkUrl(candidate);
      if (check.ok) return candidate;
    }
    return null;
  } catch (e) {
    console.error("firecrawl error", e);
    return null;
  }
}

function buildReferencesFromRealLinks(md: string): string {
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const seen = new Set<string>();
  const items: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(md)) !== null) {
    const title = m[1].trim();
    const url = m[2].replace(/[)\]. ,;]+$/, "");
    if (!title || seen.has(url)) continue;
    seen.add(url);
    items.push(`- [${title}](${url})`);
  }
  return items.length ? `## References\n${items.join("\n")}` : "";
}

function rebuildReferences(content: string): string {
  const refRe = /^##\s+References[\s\S]*$/im;
  if (!refRe.test(content)) return content;
  const body = content.replace(refRe, "").trimEnd();
  const newRefs = buildReferencesFromRealLinks(body);
  if (!newRefs) return body;
  return `${body}\n\n${newRefs}\n`;
}

function findNearestHeading(content: string, index: number): string {
  const before = content.slice(0, index);
  const matches = [...before.matchAll(/(?:^|\n)#{1,3}\s+([^\n]+)/g)];
  if (!matches.length) return "";
  return matches[matches.length - 1][1].trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { content } = await req.json();
    if (typeof content !== "string" || !content.trim()) {
      return new Response(JSON.stringify({ error: "content required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract all markdown links
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    type Link = { full: string; anchor: string; url: string; index: number };
    const links: Link[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(content)) !== null) {
      links.push({
        full: m[0],
        anchor: m[1],
        url: m[2].replace(/[)\]. ,;]+$/, ""),
        index: m.index,
      });
    }

    if (!links.length) {
      return new Response(JSON.stringify({
        content,
        totalLinks: 0, brokenCount: 0, fixedCount: 0, removedCount: 0,
        fixed: [], removed: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check each unique URL
    const uniqueUrls = Array.from(new Set(links.map((l) => l.url)));
    const statusMap = new Map<string, CheckResult>();
    await Promise.all(uniqueUrls.map(async (u) => {
      statusMap.set(u, await checkUrl(u));
    }));

    const brokenUrls = uniqueUrls.filter((u) => !statusMap.get(u)?.ok);
    let updated = content;
    const fixed: { from: string; to: string; anchor: string }[] = [];
    const removed: { url: string; anchor: string }[] = [];
    const replacementMap = new Map<string, string | null>();

    // Process each link occurrence
    for (const link of links) {
      const st = statusMap.get(link.url);
      if (st?.ok) continue;

      let replacement = replacementMap.get(link.url);
      if (replacement === undefined) {
        const context = findNearestHeading(content, link.index);
        replacement = await firecrawlReplace(link.anchor, context);
        replacementMap.set(link.url, replacement);
      }

      if (replacement) {
        const newMd = `[${link.anchor}](${replacement})`;
        updated = updated.split(link.full).join(newMd);
        fixed.push({ from: link.url, to: replacement, anchor: link.anchor });
      } else {
        // Remove broken link, keep anchor text as plain prose
        updated = updated.split(link.full).join(link.anchor);
        removed.push({ url: link.url, anchor: link.anchor });
      }
    }

    // Rebuild References section from the now-clean link set
    updated = rebuildReferences(updated);

    // Dedupe fixed/removed reports by URL
    const dedupe = <T extends { url?: string; from?: string }>(arr: T[]): T[] => {
      const seen = new Set<string>();
      return arr.filter((x) => {
        const k = (x.url || x.from) as string;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    return new Response(JSON.stringify({
      content: updated,
      totalLinks: links.length,
      brokenCount: brokenUrls.length,
      fixedCount: dedupe(fixed).length,
      removedCount: dedupe(removed).length,
      fixed: dedupe(fixed),
      removed: dedupe(removed),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("fix-broken-links error", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
