import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ValidateRequest {
  topic: string;
  promises: string[];
  contextFiles?: Array<{ name: string; content: string }>;
}

interface GapFact {
  fact: string;
  sourceUrl: string;
  sourceTitle: string;
}

interface PromiseResult {
  promise: string;
  status: "covered" | "partial" | "missing" | "unresolved";
  evidence?: string;
  missingData?: string;
  gapFacts?: GapFact[];
}

// Domains never used for gap-fill research
const EXCLUDE_DOMAINS = [
  "youtube.com", "youtu.be", "reddit.com", "quora.com",
  "twitter.com", "x.com", "facebook.com", "instagram.com",
  "pinterest.com", "tiktok.com", "amazon.com", "amazon.co.uk",
  "ebay.com", "etsy.com", "medium.com",
];

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function isExcluded(url: string): boolean {
  const host = domainOf(url);
  if (!host) return true;
  return EXCLUDE_DOMAINS.some((d) => host === d || host.endsWith("." + d));
}

// Higher score = more credible for factual gap-fill
function authorityScore(url: string): number {
  const host = domainOf(url);
  if (host.endsWith(".gov") || host.endsWith(".edu")) return 3;
  if (host.endsWith(".org")) return 2;
  // Governing-body style hosts (sport federations, official leagues)
  if (/(ncaa|naia|nfhs|worldathletics|usatf|fifa|fiba|nfl|mlb|nba|nhl|littleleague|usssa|usab)/.test(host)) return 3;
  return 1;
}

async function callAI(apiKey: string, system: string, user: string): Promise<string> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
    }),
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`AI gateway error ${response.status}: ${t.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseJson<T>(raw: string): T | null {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as T;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, promises, contextFiles } = (await req.json()) as ValidateRequest;

    if (!promises || promises.length === 0) {
      return new Response(JSON.stringify({ error: "promises array is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY");

    const contextText = (contextFiles || [])
      .map((f) => `--- FILE: ${f.name} ---\n${f.content}`)
      .join("\n\n")
      .slice(0, 60000);

    // ── STEP 1: Audit each promise against the context file ────────────────
    const auditSystem = `You are a fact-availability auditor for SEO content production. You check whether the SPECIFIC data needed to fulfil each value promise exists in the provided context material.

RULES:
- "covered": the context contains ALL specific data points the promise requires (names, numbers, rules, table data).
- "partial": some required data exists but specific elements are missing. State exactly what is missing.
- "missing": the context contains none of the required data.
- Be strict: a promise mentioning "a comparison table of X across A, B, C" is only "covered" if data for A AND B AND C is present.
- For partial/missing, write a precise Google search query (4-8 words) that would find the missing data from an authoritative source.

OUTPUT FORMAT (valid JSON only, no markdown):
{"results":[{"index":0,"status":"covered","evidence":"short quote or description of where the data is"},{"index":1,"status":"partial","missingData":"exact description of what is missing","searchQuery":"precise search query"}]}`;

    const auditUser = `TOPIC: ${topic}

VALUE PROMISES:
${promises.map((p, i) => `${i}. ${p}`).join("\n")}

CONTEXT MATERIAL:
${contextText || "(no context files provided)"}`;

    const auditRaw = await callAI(LOVABLE_API_KEY, auditSystem, auditUser);
    const audit = parseJson<{ results: Array<{ index: number; status: string; evidence?: string; missingData?: string; searchQuery?: string }> }>(auditRaw);

    if (!audit?.results) {
      throw new Error("Audit step returned unparseable output");
    }

    const results: PromiseResult[] = promises.map((p, i) => {
      const a = audit.results.find((r) => r.index === i);
      return {
        promise: p,
        status: (a?.status as PromiseResult["status"]) || "missing",
        evidence: a?.evidence,
        missingData: a?.missingData,
      };
    });

    // ── STEP 2: Gap-fill via real web retrieval (Serper) ───────────────────
    // Facts come ONLY from retrieved search result text, never model memory.
    let researchBlockParts: string[] = [];

    if (SERPER_API_KEY) {
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const a = audit.results.find((x) => x.index === i);
        if (r.status === "covered" || !a?.searchQuery) continue;

        try {
          const serpResp = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ q: a.searchQuery, gl: "us", hl: "en", num: 10, type: "search" }),
          });
          if (!serpResp.ok) { r.status = "unresolved"; continue; }
          const serp = await serpResp.json();

          // Collect retrieved text: answerBox + organic snippets, credible domains only
          type Snip = { text: string; url: string; title: string; score: number };
          const snippets: Snip[] = [];
          if (serp.answerBox?.answer || serp.answerBox?.snippet) {
            const ab = serp.answerBox;
            const url = ab.link || serp.organic?.[0]?.link || "";
            if (url && !isExcluded(url)) {
              snippets.push({ text: ab.answer || ab.snippet, url, title: ab.title || "Answer box", score: authorityScore(url) + 1 });
            }
          }
          for (const o of serp.organic || []) {
            if (!o.link || !o.snippet || isExcluded(o.link)) continue;
            snippets.push({ text: o.snippet, url: o.link, title: o.title || domainOf(o.link), score: authorityScore(o.link) });
          }
          snippets.sort((x, y) => y.score - x.score);
          const top = snippets.slice(0, 6);
          if (top.length === 0) { r.status = "unresolved"; continue; }

          // ── STEP 3: Constrained extraction — only from retrieved text ────
          const extractSystem = `You extract facts from search result snippets. ABSOLUTE RULE: you may ONLY state facts that appear verbatim or near-verbatim in the provided snippets. You must NOT add anything from your own knowledge. If the required data is not present in the snippets, return {"notFound":true}.

OUTPUT FORMAT (valid JSON only, no markdown):
{"facts":[{"fact":"specific fact with numbers/names as stated in snippet","sourceIndex":0}]}
or
{"notFound":true}`;

          const extractUser = `DATA NEEDED: ${a.missingData || r.promise}

SEARCH RESULT SNIPPETS:
${top.map((s, si) => `[${si}] (${s.url})\n${s.text}`).join("\n\n")}`;

          const extractRaw = await callAI(LOVABLE_API_KEY, extractSystem, extractUser);
          const extracted = parseJson<{ facts?: Array<{ fact: string; sourceIndex: number }>; notFound?: boolean }>(extractRaw);

          if (!extracted || extracted.notFound || !extracted.facts || extracted.facts.length === 0) {
            r.status = "unresolved";
            continue;
          }

          r.gapFacts = extracted.facts
            .filter((f) => f.sourceIndex >= 0 && f.sourceIndex < top.length)
            .map((f) => ({
              fact: f.fact,
              sourceUrl: top[f.sourceIndex].url,
              sourceTitle: top[f.sourceIndex].title,
            }));

          if (r.gapFacts.length > 0) {
            researchBlockParts.push(
              `PROMISE: ${r.promise}\n` +
              r.gapFacts.map((f) => `- ${f.fact} (Source: ${f.sourceUrl})`).join("\n")
            );
          } else {
            r.status = "unresolved";
          }
        } catch (e) {
          console.error(`Gap-fill failed for promise ${i}:`, e);
          r.status = "unresolved";
        }
      }
    }

    const researchBlock = researchBlockParts.length > 0
      ? `=== GAP-FILL RESEARCH (web-verified facts with sources) ===\nThe following facts were retrieved from credible web sources to fill gaps in the context material. Each fact carries its source URL. Use these facts in the article and cite the sources.\n\n${researchBlockParts.join("\n\n")}\n=== END GAP-FILL RESEARCH ===`
      : null;

    return new Response(
      JSON.stringify({
        results,
        researchBlock,
        summary: {
          covered: results.filter((r) => r.status === "covered").length,
          gapFilled: results.filter((r) => r.gapFacts && r.gapFacts.length > 0).length,
          unresolved: results.filter((r) => r.status === "unresolved").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("validate-value-promises error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
