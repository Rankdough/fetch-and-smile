const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const BUILD_MARKER = "BUILD-2026-06-12-B26-flow-review run-review-pass";

function extractSection(raw: string, tag: string): string {
  const open = `====${tag}====`;
  const close = `====END ${tag}====`;
  const start = raw.indexOf(open);
  if (start < 0) return "";
  const end = raw.indexOf(close, start);
  return raw.slice(start + open.length, end >= 0 ? end : raw.length).trim();
}

function stripCodeFences(s: string): string {
  return s
    .replace(/^```(?:markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function buildPrompt(topic: string): string {
  return `You are reading this article as the target reader for this topic: ${topic}

Read the full article below. Find every place where:
- The story breaks or a section feels disconnected
- The writing feels like an AI filling a template
- A reader would lose the thread or stop reading
- A transition between sections is abrupt or missing

Rewrite only those specific sentences and transitions.

Do not change:
- Facts, statistics, or measurements
- H2 headings
- Tables
- Bullet lists
- CTAs
- Schema markup
- Source URLs
- Word count by more than 10%

Return exactly two things, using these exact delimiter tags:

====CORRECTED ARTICLE====
[The complete corrected article in plain markdown — no code fences]
====END CORRECTED ARTICLE====

====SUMMARY====
Changed: [A plain English summary of what you changed, maximum 3 sentences]
====END SUMMARY====`;
}

Deno.serve(async (req) => {
  console.log(BUILD_MARKER);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { content, topic } = await req.json();
    if (!content?.trim() || !topic?.trim()) {
      return new Response(JSON.stringify({ error: "content and topic are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 12000,
        messages: [
          { role: "system", content: buildPrompt(topic) },
          { role: "user", content },
        ],
      }),
    });

    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const json = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    console.log("RAW_LEN", raw.length, "PREVIEW", raw.slice(0, 300));

    let correctedArticle = stripCodeFences(extractSection(raw, "CORRECTED ARTICLE"));
    let summary = extractSection(raw, "SUMMARY").replace(/^Changed:\s*/i, "").trim();

    // Fallback: model ignored delimiters
    if (!correctedArticle) {
      const stripped = stripCodeFences(raw);
      // Try to split on "Summary" / "Changed:" trailing line
      const m = stripped.match(/^([\s\S]*?)\n+(?:Summary|Changed)[:\s][\s\S]*$/i);
      if (m) {
        correctedArticle = m[1].trim();
        if (!summary) summary = stripped.slice(m[1].length).replace(/^[\s\S]*?(?:Summary|Changed)[:\s]*/i, "").trim();
      } else if (stripped.length > 200) {
        correctedArticle = stripped;
      }
    }

    return new Response(JSON.stringify({
      correctedArticle,
      summary,
      rawPreview: raw.slice(0, 500),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
