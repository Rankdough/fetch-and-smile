import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CoveredItem { keyword: string; urls: string[] }
interface GapItem { keyword: string; volume: number }

async function callAI(apiKey: string, covered: string[], gaps: string[]): Promise<Record<string, string>> {
  const systemPrompt = `You are a search-intent matcher.

You are given:
- A list of COVERED topics (each one represents a page already covering that question/intent).
- A list of GAP keywords.

Your job: for each GAP keyword, decide if its SEARCH INTENT is the SAME as any COVERED topic. Two keywords share intent when a user would expect the same page/answer to satisfy both.

Examples of same intent:
- "how much are dental implants" ≡ "how much do dental implants cost" ≡ "how much does the full set of teeth implants cost" ≡ "how much are tooth implants" ≡ "how much is dental implants uk" (all ask about price of dental implants)
- "do dental implants hurt" ≡ "are dental implants painful" ≡ "is dental implant surgery painful"
- "how long do dental implants last" ≡ "lifespan of dental implants" ≡ "how durable are tooth implants"

Be GENEROUS: if a covered topic clearly answers the gap question, match it — minor modifiers (uk, turkey, seniors, full set, full mouth, tooth vs dental, cost vs price vs how much) do NOT make a new intent.

Only refuse to match when the gap genuinely asks a different question (different attribute, different procedure, different stage).

OUTPUT FORMAT (valid JSON only, no markdown, no commentary):
{"matches":{"<gap keyword>":"<covered keyword that matches>", ...}}

Only include gaps that DO match. Omit gaps that don't.`;

  const userMsg = `COVERED TOPICS (${covered.length}):
${covered.map((c, i) => `${i + 1}. ${c}`).join("\n")}

GAP KEYWORDS (${gaps.length}):
${gaps.map((g, i) => `${i + 1}. ${g}`).join("\n")}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const t = await response.text();
    if (response.status === 429) throw new Error("Rate limit exceeded");
    if (response.status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI gateway error: ${response.status} ${t}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || "";
  content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  let parsed: { matches?: Record<string, string> };
  try { parsed = JSON.parse(content); }
  catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return {};
    try { parsed = JSON.parse(m[0]); } catch { return {}; }
  }
  return parsed.matches || {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const covered: CoveredItem[] = body.covered || [];
    const gaps: GapItem[] = body.gaps || [];

    if (covered.length === 0 || gaps.length === 0) {
      return new Response(JSON.stringify({ matches: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build covered keyword list (lowercased, unique)
    const coveredKws = [...new Set(covered.map((c) => c.keyword.toLowerCase()))];
    const coveredUrls = new Map<string, string[]>();
    for (const c of covered) coveredUrls.set(c.keyword.toLowerCase(), c.urls);

    // Batch gaps to keep prompt size manageable
    const BATCH = 120;
    const allMatches: Record<string, string> = {};
    for (let i = 0; i < gaps.length; i += BATCH) {
      const slice = gaps.slice(i, i + BATCH).map((g) => g.keyword);
      const matches = await callAI(apiKey, coveredKws, slice);
      for (const [gap, cov] of Object.entries(matches)) {
        const gapLower = gap.toLowerCase();
        const covLower = cov.toLowerCase();
        if (coveredUrls.has(covLower)) {
          allMatches[gapLower] = covLower;
        }
      }
    }

    return new Response(JSON.stringify({ matches: allMatches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("match-gaps-to-covered error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
