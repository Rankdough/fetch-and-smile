const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-3-flash-preview";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const BUILD_MARKER = "BUILD-2026-06-12-managed-gateway-flash-v1 run-review-pass";

function extractSection(raw: string, tag: string): string {
  const open = `====${tag}====`;
  const start = raw.indexOf(open);
  if (start < 0) return "";
  const closeCandidates = tag === "CORRECTED ARTICLE"
    ? [`====END ${tag}====`, "====END ARTICLE====", "====SUMMARY===="]
    : [`====END ${tag}====`];
  const end = closeCandidates
    .map((close) => raw.indexOf(close, start + open.length))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b)[0];
  return raw.slice(start + open.length, end >= 0 ? end : raw.length).trim();
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

function buildPrompt(topic: string): string {
  return `You are a senior editor. Read the entire article below from start to finish, in one go, as the real human reader for this topic would read it.

TOPIC: ${topic}

HOW TO READ
Read it as that human. Notice every moment where:
- The story breaks or a section feels disconnected from the one before it
- A transition is abrupt or missing
- The writing suddenly feels like an AI filling a template rather than a person explaining something
- A reader would lose the thread, get bored, or stop reading
- The opening promises one thing and the article drifts away from it
- The ending does not deliver the conclusion the reader was building toward

YOUR JOB
Rewrite the article so it reads as one continuous, human, well-flowing piece for that reader. Improve only the things that hurt flow: transitions, opening, connective sentences, paragraphs that read template-like, the closing. Leave everything else exactly as it is.

HARD RULES (do not break any of these)
- Do not change any fact, statistic, number, measurement, name, date, or quote.
- Do not change any H2 heading.
- Do not change any table, bullet list, ordered list, CTA block, image, schema markup, or source URL.
- Do not change the article's overall length by more than 10%.
- British English. No em dashes (—). No en dashes (–). No horizontal rules.
- Every paragraph must be 60 words or fewer AND 3 sentences or fewer. Split anything longer at a logical pivot.
- Do not add new sections. Do not remove sections.

OUTPUT FORMAT (use these exact delimiters)

====CORRECTED ARTICLE====
[The full rewritten article in plain markdown. No code fences. No commentary.]
====END CORRECTED ARTICLE====

====SUMMARY====
[2-4 sentences in plain English describing what you improved to make it flow better for this reader. No bullet lists.]
====END SUMMARY====`;
}

Deno.serve(async (req) => {
  console.log(BUILD_MARKER);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { content, topic } = await req.json();
    if (!content?.trim() || !topic?.trim()) {
      return new Response(JSON.stringify({ error: "content and topic are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
        "X-Lovable-AIG-SDK": "direct-edge-fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: 16000,
        messages: [
          { role: "system", content: buildPrompt(topic) },
          { role: "user", content },
        ],
      }),
    });

    if (!res.ok) {
      const errText = (await res.text()).slice(0, 400);
      throw new Error(`AI gateway ${res.status}: ${errText}`);
    }

    const json = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    console.log("RAW_LEN", raw.length);

    let correctedArticle = stripCodeFences(extractSection(raw, "CORRECTED ARTICLE"));
    let summary = extractSection(raw, "SUMMARY").trim();

    if (!correctedArticle) {
      const stripped = stripCodeFences(raw);
      const m = stripped.match(/^([\s\S]*?)\n+(?:Summary|Changed)[:\s][\s\S]*$/i);
      if (m) {
        correctedArticle = m[1].trim();
        if (!summary) summary = stripped.slice(m[1].length).replace(/^[\s\S]*?(?:Summary|Changed)[:\s]*/i, "").trim();
      } else if (stripped.length > 200) {
        correctedArticle = stripped;
      }
    }

    return new Response(JSON.stringify({ correctedArticle, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
