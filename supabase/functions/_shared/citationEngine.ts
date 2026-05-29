// Shared citation / references engine extracted from generate-content/index.ts.
// Parametrised via CitationEngineContext so it can be imported by any edge function.
//
// The logic is mechanically equivalent to the `enforceSourcesAndReferences` closure
// in generate-content — same pipeline, same ordering, same render gate — but:
//   - All closure variables become local variables derived from `ctx`.
//   - `urlStatusCache` and `firecrawlSourceCache` are fresh Maps per invocation.
//   - References section is rendered as a NUMBERED list (1. […](url)).
//   - `MIN_REFERENCES` = 4.

import {
  type SourceCandidate,
  cleanSourceUrl,
  extractMarkdownLinks,
  isHighAuthority,
  isJunkUrl,
  isLowAuthority,
  isLowQualityDomain,
  looksCommercial,
  sourceTitleFromUrl,
} from "./urlClassifiers.ts";

export interface CitationEngineContext {
  contextFiles?: Array<{ name: string; content: string }>;
  skipSources?: boolean;
  topic?: string;
  allowedUrls?: string[];      // CTA, image URLs — never unwrapped from markdown links
  ownDomainHosts?: string[];   // hosts never cited (client domain, CTA domain)
}

// ── internal helpers ──────────────────────────────────────────────────────────

function buildOwnDomainSet(ownDomainHosts: string[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const h of ownDomainHosts || []) {
    const norm = h.replace(/^www\./, "").toLowerCase().trim();
    if (norm) set.add(norm);
  }
  return set;
}

function isOwnDomainUrl(u: string, ownDomains: Set<string>): boolean {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
    for (const own of ownDomains) {
      if (h === own || h.endsWith(`.${own}`)) return true;
    }
    return false;
  } catch { return false; }
}

function isWorkingSourceUrl(
  rawUrl: string,
  urlStatusCache: Map<string, Promise<boolean>>,
): Promise<boolean> {
  const placeholderHosts = [
    "example.com", "example.org", "example.net",
    "yourdomain.com", "your-domain.com", "placeholder.com",
  ];
  const url = cleanSourceUrl(rawUrl);
  if (urlStatusCache.has(url)) return urlStatusCache.get(url)!;
  const promise = (async () => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return false; }
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (placeholderHosts.some((host) => parsed.hostname.toLowerCase().endsWith(host))) return false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      let resp = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (SourceVerifier)" },
      }).catch(() => null);
      if (!resp || resp.status === 405 || resp.status === 403 || resp.status === 0 || resp.status >= 500) {
        resp = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: ctrl.signal,
          headers: { "User-Agent": "Mozilla/5.0 (SourceVerifier)" },
        });
      }
      return resp.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  })();
  urlStatusCache.set(url, promise);
  return promise;
}

function extractContextCandidates(
  contextFiles: Array<{ name: string; content: string }>,
  ownDomains: Set<string>,
): SourceCandidate[] {
  const candidates: SourceCandidate[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  const push = (cand: SourceCandidate) => {
    if (seen.has(cand.url)) return;
    if (isJunkUrl(cand.url)) {
      rejected.push(cand.url);
      seen.add(cand.url);
      return;
    }
    if (isOwnDomainUrl(cand.url, ownDomains)) {
      rejected.push(cand.url);
      seen.add(cand.url);
      return;
    }
    seen.add(cand.url);
    candidates.push(cand);
  };
  for (const file of contextFiles) {
    const fileText = file.content || "";
    const fileName = file.name || "";
    for (const link of extractMarkdownLinks(fileText, "context")) {
      push({ ...link, fileName });
    }
    const rawUrlRe = /https?:\/\/[^\s)\],;<>"']+/g;
    let raw: RegExpExecArray | null;
    while ((raw = rawUrlRe.exec(fileText)) !== null) {
      const url = cleanSourceUrl(raw[0]);
      if (seen.has(url)) continue;
      const snipStart = Math.max(0, raw.index - 320);
      const snipEnd = Math.min(fileText.length, raw.index + url.length + 320);
      const snippet = fileText.slice(snipStart, snipEnd).replace(/\s+/g, " ").trim();
      push({ title: sourceTitleFromUrl(url), url, origin: "context", snippet, fileName });
    }
  }
  if (rejected.length > 0) {
    console.log(`SOURCE CATALOGUE: dropped ${rejected.length} junk/own-domain context URL(s): ${rejected.slice(0, 8).join(", ")}${rejected.length > 8 ? " …" : ""}`);
  }
  console.log(`SOURCE CATALOGUE: accepted ${candidates.length} context URL(s) — context files are trusted, commercial/authority filter NOT applied`);
  return candidates.slice(0, 80);
}

function scoreSource(source: SourceCandidate, heading: string, body: string, topic: string | undefined): number {
  const stop = new Set(["this","that","with","from","about","what","when","where","which","their","there","they","have","been","will","would","could","should","into","than","then","your","also","more","most","some","such","other","over","under","between","during","while","just","like","make","made","does","doing","because","through","against","both","each","every","very","much","many","only","upon","onto","these","those","being","after","before","still"]);
  const tokenise = (text: string): Set<string> => {
    const tokens = (text.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((t) => !stop.has(t));
    return new Set(tokens);
  };
  const wanted = tokenise(`${topic || ""} ${heading} ${body.slice(0, 900)}`);
  if (wanted.size === 0) return source.origin === "context" ? 2 : 1;
  const haystackUrl = `${source.title} ${source.url} ${source.fileName || ""}`.toLowerCase();
  const snippet = (source.snippet || "").toLowerCase();
  let score = source.origin === "context" ? 3 : 1;
  let snippetHits = 0;
  let urlHits = 0;
  for (const token of wanted) {
    if (snippet.includes(token)) { score += 3; snippetHits += 1; }
    if (haystackUrl.includes(token)) { score += 1; urlHits += 1; }
  }
  if (snippetHits >= 3) score += 4;
  if (snippetHits >= 5) score += 4;
  if (source.origin === "context" && snippetHits === 0 && urlHits === 0) score -= 5;
  return score;
}

function searchWebSources(
  heading: string,
  body: string,
  topic: string | undefined,
  tier1Only: boolean,
  urlStatusCache: Map<string, Promise<boolean>>,
  firecrawlSourceCache: Map<string, Promise<SourceCandidate[]>>,
): Promise<SourceCandidate[]> {
  const cacheKey = `${tier1Only ? "T1:" : ""}${`${topic || ""} ${heading} ${body.replace(/\[[^\]]+\]\([^)]+\)/g, "").replace(/[#*_`|>\n]/g, " ").slice(0, 180)}`.replace(/\s+/g, " ").trim().slice(0, 260)}`;
  const query = cacheKey.replace(/^T1:/, "");
  if (!query) return Promise.resolve([]);
  if (firecrawlSourceCache.has(cacheKey)) return firecrawlSourceCache.get(cacheKey)!;
  const promise = (async () => {
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      console.warn("FIRECRAWL_API_KEY not set - cannot fetch online source references");
      return [];
    }
    try {
      const resp = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 15 }),
      });
      if (!resp.ok) {
        console.warn(`Firecrawl source search failed: ${resp.status}`);
        return [];
      }
      const data = await resp.json();
      // deno-lint-ignore no-explicit-any
      const results: any[] = data?.data?.web || (Array.isArray(data?.data) ? data.data : null) || data?.web || [];

      type Ranked = { url: string; title: string; rank: number; tier: 1 | 2 | 3 };
      const ranked: Ranked[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const url = cleanSourceUrl(result?.url || result?.link || "");
        if (!url || seen.has(url)) continue;
        seen.add(url);
        if (isJunkUrl(url)) continue;
        const title = String(result?.title || sourceTitleFromUrl(url)).trim();
        let tier: 1 | 2 | 3;
        if (isHighAuthority(url)) tier = 1;
        else if (isLowAuthority(url) || looksCommercial(url)) tier = 3;
        else tier = 2;
        ranked.push({ url, title, rank: i, tier });
      }

      const passes: Ranked[][] = tier1Only
        ? [
            ranked.filter((r) => r.tier === 1 && r.rank < 5),
            ranked.filter((r) => r.tier === 1 && r.rank >= 5),
          ]
        : [
            ranked.filter((r) => r.tier === 1 && r.rank < 5),
            ranked.filter((r) => r.tier === 1 && r.rank >= 5),
            ranked.filter((r) => r.tier === 2 && r.rank < 5),
          ];
      const candidates: SourceCandidate[] = [];
      const picked = new Set<string>();
      for (const pass of passes) {
        for (const r of pass) {
          if (picked.has(r.url)) continue;
          if (await isWorkingSourceUrl(r.url, urlStatusCache)) {
            candidates.push({ title: r.title, url: r.url, origin: "web" });
            picked.add(r.url);
          }
          if (candidates.length >= 2) break;
        }
        if (candidates.length >= 2) break;
      }
      if (candidates.length) {
        const tierTag = (u: string) => {
          const t = ranked.find((r) => r.url === u)?.tier;
          return t === 1 ? "[T1]" : t === 2 ? "[T2-commercial]" : "[T3-low]";
        };
        console.log(`SOURCE WEB: query="${query.slice(0, 80)}" -> ${candidates.map((c) => `${tierTag(c.url)} ${c.url}`).join(" | ")}`);
      } else {
        console.warn(`SOURCE WEB: no Tier-1/Tier-2 authority for query="${query.slice(0, 80)}" (${ranked.length} candidates rejected)`);
      }
      return candidates;
    } catch (error) {
      console.error("Firecrawl source search error", error);
      return [];
    }
  })();
  firecrawlSourceCache.set(cacheKey, promise);
  return promise;
}

function buildReferences(sources: SourceCandidate[]): string {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const items: string[] = [];
  const normTitle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  for (const source of sources) {
    const title = source.title.trim().replace(/[*_`]/g, "") || sourceTitleFromUrl(source.url);
    const url = cleanSourceUrl(source.url);
    if (!title || seenUrl.has(url)) continue;
    const titleKey = normTitle(title);
    if (titleKey && seenTitle.has(titleKey)) continue;
    seenUrl.add(url);
    if (titleKey) seenTitle.add(titleKey);
    items.push(`- [${title}](${url})`);
  }

  return items.length ? `## References\n${items.join("\n")}` : "";
}

// ── exported main function ────────────────────────────────────────────────────

export async function enforceSourcesAndReferences(
  markdown: string,
  ctx: CitationEngineContext,
): Promise<string> {
  if (ctx.skipSources) return markdown;

  const urlStatusCache = new Map<string, Promise<boolean>>();
  const firecrawlSourceCache = new Map<string, Promise<SourceCandidate[]>>();
  const topic = ctx.topic;

  // Build own-domain set from explicit hosts provided by caller.
  const ownDomains = buildOwnDomainSet(ctx.ownDomainHosts);

  // Extra allowed URLs (CTA, image URLs) — never stripped from markdown links.
  const extraAllowedUrls = new Set<string>();
  for (const u of ctx.allowedUrls || []) {
    if (/^https?:\/\//i.test(u)) extraAllowedUrls.add(cleanSourceUrl(u));
  }

  // Extract context-file source candidates.
  const contextFiles = ctx.contextFiles || [];
  const contextSourceCandidates = contextFiles.length > 0
    ? extractContextCandidates(contextFiles, ownDomains)
    : [];
  console.log(`SOURCE CATALOGUE: ${contextSourceCandidates.length} context URL candidate(s) from ${contextFiles.length} context file(s)`);

  const hasContextFiles = contextFiles.length > 0;
  const contextOnlySources = contextSourceCandidates.length > 0;
  const tier1OnlyFallback = hasContextFiles && !contextOnlySources;
  const contextAllowedUrlSet = new Set(contextSourceCandidates.map((c) => cleanSourceUrl(c.url)));

  // ── sourcesForSection (inner helper) ────────────────────────────────────────
  const sourcesForSection = async (heading: string, body: string): Promise<SourceCandidate[]> => {
    const existing = extractMarkdownLinks(body, "existing")
      .filter((l) => !isJunkUrl(l.url))
      .filter((l) => !contextOnlySources || contextAllowedUrlSet.has(cleanSourceUrl(l.url)));
    const existingWorking: SourceCandidate[] = [];
    for (const link of existing) {
      if (await isWorkingSourceUrl(link.url, urlStatusCache)) existingWorking.push(link);
      if (existingWorking.length >= 2) return existingWorking;
    }

    const scored = contextSourceCandidates
      .map((c) => ({ cand: c, score: scoreSource(c, heading, body, topic) }))
      .sort((a, b) => b.score - a.score);
    const RELEVANCE_FLOOR = contextOnlySources ? 1 : 6;
    const relevantContext = scored.filter((s) => s.score >= RELEVANCE_FLOOR).slice(0, 10).map((s) => s.cand);

    const contextWorking: SourceCandidate[] = [...existingWorking];
    for (const link of relevantContext) {
      if (contextWorking.some((c) => c.url === link.url)) continue;
      if (await isWorkingSourceUrl(link.url, urlStatusCache)) contextWorking.push(link);
      if (contextWorking.length >= 2) {
        console.log(`SOURCE PICK [context]: "${heading.slice(0, 60)}" -> ${contextWorking.map((c) => c.url).join(" | ")}`);
        return contextWorking;
      }
    }

    if (contextOnlySources) {
      if (contextWorking.length) {
        console.log(`SOURCE PICK [context-strict]: "${heading.slice(0, 60)}" -> ${contextWorking.map((c) => c.url).join(" | ")}`);
      } else {
        console.warn(`SOURCE PICK [context-strict EMPTY]: "${heading.slice(0, 60)}" — no allow-listed URL fits; omitting Sources block`);
      }
      return contextWorking;
    }

    const web = await searchWebSources(heading, body, topic, tier1OnlyFallback, urlStatusCache, firecrawlSourceCache);
    const combined = [...contextWorking, ...web.filter((w) => !contextWorking.some((c) => c.url === w.url))].slice(0, 2);
    console.log(`SOURCE PICK [mixed${tier1OnlyFallback ? "-T1only" : ""}]: "${heading.slice(0, 60)}" -> context=${contextWorking.length} web=${web.length}`);

    if (combined.length) return combined;

    const broadWeb = await searchWebSources(topic || heading, "", topic, tier1OnlyFallback, urlStatusCache, firecrawlSourceCache);
    if (broadWeb.length) {
      console.log(`SOURCE PICK [broad-web${tier1OnlyFallback ? "-T1only" : ""}]: "${heading.slice(0, 60)}" -> ${broadWeb.map((c) => c.url).join(" | ")}`);
      return broadWeb.slice(0, 1);
    }

    const fallbackContext: SourceCandidate[] = [];
    for (const candidate of scored.map((s) => s.cand)) {
      if (fallbackContext.some((c) => c.url === candidate.url)) continue;
      if (await isWorkingSourceUrl(candidate.url, urlStatusCache)) fallbackContext.push(candidate);
      if (fallbackContext.length >= 1) break;
    }
    if (fallbackContext.length) {
      console.log(`SOURCE PICK [fallback-context]: "${heading.slice(0, 60)}" -> ${fallbackContext.map((c) => c.url).join(" | ")}`);
      return fallbackContext;
    }

    return [];
  };

  // ── 1. Drop any model-written References / Bibliography section ──────────────
  let cleaned = markdown.replace(/^#{2,3}\s+(References|Bibliography|Sources|Works\s+Cited):?\s*[\s\S]*$/im, "").trimEnd();

  // ── 2. Strip every "Sources:" block and orphan bullets ──────────────────────
  {
    const lines = cleaned.split("\n");
    const out: string[] = [];
    let inSourcesBlock = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[>*-]?\s*\*?\*?Sources?:\*?\*?\s*$/i.test(trimmed) || /^[>*-]?\s*\*\*Sources?:\*\*/i.test(trimmed)) {
        inSourcesBlock = true;
        continue;
      }
      if (inSourcesBlock) {
        if (!trimmed) continue;
        if (/^[-*+]\s+\[[^\]]+\]\(https?:\/\/[^)\s]+\)/i.test(trimmed)) continue;
        if (/^[-*+]\s+https?:\/\/\S+/i.test(trimmed)) continue;
        if (/^\[[^\]]+\]\(https?:\/\/[^)\s]+\)$/i.test(trimmed)) continue;
        if (/^[-*+]\s+[A-Z][\w''\-\s,&]+$/.test(trimmed) && trimmed.length < 80) continue;
        inSourcesBlock = false;
      }
      out.push(line);
    }
    cleaned = out.join("\n");
  }

  // ── 3. Strip ALL inline external markdown links ──────────────────────────────
  cleaned = cleaned.replace(/(!)?\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (full, bang, label, rawUrl) => {
    if (bang) return full; // image
    const c = cleanSourceUrl(rawUrl);
    if (extraAllowedUrls.has(c)) return full; // CTA / image URLs are legitimate
    return String(label);
  });

  // ── 4. Build the verified allow-list ────────────────────────────────────────
  const verifiedAllowList: SourceCandidate[] = [];
  if (contextSourceCandidates.length > 0) {
    await Promise.all(contextSourceCandidates.map(async (c) => {
      if (isOwnDomainUrl(c.url, ownDomains)) return;
      if (await isWorkingSourceUrl(c.url, urlStatusCache)) verifiedAllowList.push(c);
    }));
    console.log(`CITATION: ${verifiedAllowList.length}/${contextSourceCandidates.length} allow-listed URLs verified working (own-domain filtered).`);
  }
  const useWebFallback = verifiedAllowList.length === 0;
  if (useWebFallback) {
    console.log("CITATION: No context-file URLs available → using Tier-1 web fallback per section.");
  }

  // ── 5. Walk H2/H3 sections ──────────────────────────────────────────────────
  const headingRegex = /^#{2,3}\s+.+$/gm;
  const matches = [...cleaned.matchAll(headingRegex)];
  if (matches.length === 0) return cleaned.trim();

  const intro = cleaned.slice(0, matches[0].index ?? 0).trim();
  const urlUseCount = new Map<string, number>();
  const usedSources: SourceCandidate[] = [];
  const rebuilt: string[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? cleaned.length) : cleaned.length;
    const headingLine = match[0];
    const heading = headingLine.replace(/^#{2,3}\s+/, "").trim();
    const headingLower = heading.toLowerCase();
    let body = cleaned.slice(start + headingLine.length, end).trim();

    const isStructural = /references|bibliography|sources|in\s+this\s+article|tl;?dr|quick\s*tips|frequently\s*asked|faq|final\s*thoughts|conclusion|how\s+to\s+(choose|pick|decide|select|find)/i.test(headingLower);

    if (!isStructural) {
      let chosen: SourceCandidate | null = null;

      if (!useWebFallback) {
        const ranked = verifiedAllowList
          .filter((c) => (urlUseCount.get(c.url) || 0) < 2)
          .map((c) => ({ cand: c, score: scoreSource(c, heading, body, topic) }))
          .filter((s) => s.score >= 6)
          .sort((a, b) => b.score - a.score);
        if (ranked.length > 0) chosen = ranked[0].cand;
      } else {
        const webCands = await sourcesForSection(heading, body);
        const fresh = webCands.find((c) => !isOwnDomainUrl(c.url, ownDomains) && (urlUseCount.get(cleanSourceUrl(c.url)) || 0) < 2);
        if (fresh) chosen = fresh;
      }

      if (chosen) {
        const anchor = (chosen.title || "").trim().replace(/[*_`\[\]()]/g, "") || sourceTitleFromUrl(chosen.url);
        const cleanUrl = cleanSourceUrl(chosen.url);
        body = `${body.trimEnd()}\n\n*Source: [${anchor}](${cleanUrl})*`;
        urlUseCount.set(cleanUrl, (urlUseCount.get(cleanUrl) || 0) + 1);
        if (!usedSources.find((s) => cleanSourceUrl(s.url) === cleanUrl)) {
          usedSources.push({ ...chosen, url: cleanUrl, title: anchor });
        }
        console.log(`CITATION${useWebFallback ? " [web-fallback]" : ""}: "${heading.slice(0, 60)}" -> ${cleanUrl} (section-end Source line)`);
      }
    }

    rebuilt.push(`${headingLine}\n${body}`.trim());
  }

  let result = [intro, ...rebuilt].filter(Boolean).join("\n\n").trim();

  // ── 6. Top-up References ─────────────────────────────────────────────────────
  const MIN_REFERENCES = 4;
  if (usedSources.length < MIN_REFERENCES) {
    const usedUrlSet = new Set(usedSources.map((s) => cleanSourceUrl(s.url)));
    const pushCand = (c: SourceCandidate) => {
      const cleanUrl = cleanSourceUrl(c.url);
      if (usedUrlSet.has(cleanUrl)) return;
      if (isOwnDomainUrl(cleanUrl, ownDomains)) return;
      if (isJunkUrl(cleanUrl)) return;
      const anchor = (c.title || "").trim().replace(/[*_`\[\]()]/g, "") || sourceTitleFromUrl(cleanUrl);
      usedSources.push({ ...c, url: cleanUrl, title: anchor });
      usedUrlSet.add(cleanUrl);
    };

    // 6a. Top up from remaining context-file URLs.
    for (const c of verifiedAllowList) {
      if (usedSources.length >= MIN_REFERENCES) break;
      pushCand(c);
    }

    // 6b. Web fallback (Tier-1 search + relaxed Firecrawl).
    if (!contextOnlySources && usedSources.length < MIN_REFERENCES) {
      const seedQueries: Array<{ heading: string; body: string }> = [{ heading: topic || "", body: "" }];
      for (const m of matches) {
        const h = m[0].replace(/^#{2,3}\s+/, "").trim();
        if (/references|bibliography|sources|in\s+this\s+article|tl;?dr|quick\s*tips|frequently\s*asked|faq|final\s*thoughts|conclusion/i.test(h)) continue;
        seedQueries.push({ heading: h, body: "" });
      }
      for (const q of seedQueries) {
        if (usedSources.length >= MIN_REFERENCES) break;
        const web = await searchWebSources(q.heading, q.body, topic, hasContextFiles, urlStatusCache, firecrawlSourceCache);
        for (const c of web) {
          if (usedSources.length >= MIN_REFERENCES) break;
          if (await isWorkingSourceUrl(c.url, urlStatusCache)) pushCand(c);
        }
      }

      // 6c. Relaxed top-up: only when NO context files exist.
      if (usedSources.length < MIN_REFERENCES) {
        const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
        if (apiKey) {
          const relaxedQueries = [topic || "", ...matches
            .map((m) => m[0].replace(/^#{2,3}\s+/, "").trim())
            .filter((h) => !/references|bibliography|sources|in\s+this\s+article|tl;?dr|quick\s*tips|frequently\s*asked|faq|final\s*thoughts|conclusion/i.test(h))
            .map((h) => `${topic || ""} ${h}`.trim())
          ].filter(Boolean);
          const lowAuthorityRelaxed = [
            /(^|\.)reddit\.com$/i, /(^|\.)quora\.com$/i, /(^|\.)pinterest\.[a-z.]+$/i,
            /(^|\.)tumblr\.com$/i, /(^|\.)blogspot\.com$/i, /(^|\.)wordpress\.com$/i,
            /(^|\.)wixsite\.com$/i, /(^|\.)weebly\.com$/i, /(^|\.)squarespace\.com$/i,
            /(^|\.)answers\.com$/i, /(^|\.)ehow\.com$/i, /(^|\.)wikihow\.com$/i,
            /(^|\.)tripadvisor\.[a-z.]+$/i, /(^|\.)yelp\.com$/i,
            /(^|\.)stackexchange\.com$/i, /(^|\.)stackoverflow\.com$/i,
            /(^|\.)facebook\.com$/i, /(^|\.)instagram\.com$/i, /(^|\.)tiktok\.com$/i,
            /(^|\.)x\.com$/i, /(^|\.)twitter\.com$/i, /(^|\.)youtube\.com$/i,
          ];
          const isLowRelaxed = (url: string): boolean => {
            try { return lowAuthorityRelaxed.some((re) => re.test(new URL(url).hostname)); }
            catch { return true; }
          };
          for (const q of relaxedQueries) {
            if (usedSources.length >= MIN_REFERENCES) break;
            try {
              const resp = await fetch("https://api.firecrawl.dev/v2/search", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ query: q.slice(0, 260), limit: 10 }),
              });
              if (!resp.ok) continue;
              const data = await resp.json();
              // deno-lint-ignore no-explicit-any
              const results: any[] = data?.data?.web || (Array.isArray(data?.data) ? data.data : null) || data?.web || [];
              for (const r of results) {
                if (usedSources.length >= MIN_REFERENCES) break;
                const rawUrl = cleanSourceUrl(r?.url || r?.link || "");
                if (!rawUrl) continue;
                if (isJunkUrl(rawUrl)) continue;
                if (isLowRelaxed(rawUrl)) continue;
                if (isOwnDomainUrl(rawUrl, ownDomains)) continue;
                if (!(await isWorkingSourceUrl(rawUrl, urlStatusCache))) continue;
                const title = String(r?.title || sourceTitleFromUrl(rawUrl)).trim();
                pushCand({ url: rawUrl, title, origin: "web" });
              }
              console.log(`CITATION [relaxed-topup]: query="${q.slice(0, 60)}" -> usedSources=${usedSources.length}`);
            } catch (err) {
              console.warn("CITATION [relaxed-topup]: search failed:", err instanceof Error ? err.message : err);
            }
          }
        }
      }
    } else if (contextOnlySources && usedSources.length < MIN_REFERENCES) {
      console.log(`CITATION: References (${usedSources.length}) below MIN (${MIN_REFERENCES}) but context files provided URLs — web fallback DISABLED. Returning context-only references.`);
    }
    console.log(`CITATION: Top-up brought References to ${usedSources.length} source(s) (target ${MIN_REFERENCES}, hasContextFiles=${hasContextFiles}).`);
  }

  // ── 7. Build References from used sources — FINAL RENDER GATE ───────────────
  const contextAllowed = new Set(contextSourceCandidates.map((c) => cleanSourceUrl(c.url)));
  const refSources = usedSources.filter((s) => {
    const u = cleanSourceUrl(s.url);
    if (isOwnDomainUrl(u, ownDomains)) {
      console.log(`CITATION [render-gate] DROP own-domain: ${u}`);
      return false;
    }
    if (isJunkUrl(u)) {
      console.log(`CITATION [render-gate] DROP junk: ${u}`);
      return false;
    }
    if (contextAllowed.has(u)) return true;
    if (contextOnlySources) {
      console.log(`CITATION [render-gate] DROP non-context URL (context URLs present): ${u}`);
      return false;
    }
    if (isLowQualityDomain(u)) {
      console.log(`CITATION [render-gate] DROP low-quality web URL: ${u}`);
      return false;
    }
    return true;
  });
  if (refSources.length > 0) {
    const refLines = refSources.map((s, idx) => `${idx + 1}. [${s.title}](${cleanSourceUrl(s.url)})`);
    result += `\n\n## References\n${refLines.join("\n")}`;
    console.log(`CITATION: References section built with ${refSources.length} source(s) after render gate.`);
  } else {
    console.log("CITATION: No external sources qualified → no References section emitted.");
  }

  return result;
}
