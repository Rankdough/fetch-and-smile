const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const BUILD_MARKER = "BUILD-2026-06-11-B11-human-checker run-review-pass";

function extractSection(raw: string, tag: string): string {
  const open = `====${tag}====`;
  const close = `====END ${tag}====`;
  const start = raw.indexOf(open);
  if (start < 0) return "";
  const end = raw.indexOf(close, start);
  return raw.slice(start + open.length, end >= 0 ? end : raw.length).trim();
}

function buildPrompt(topic: string): string {
  return `You are a senior editor. Before reading a single word of this article, establish who you are reading it for.

STEP 0 — DEFINE THE READER
Topic: ${topic}

Answer these before proceeding:
- Who is this person? What is their situation right now?
- What decision are they trying to make?
- What emotion are they feeling — anxiety, excitement, scepticism, confusion?
- What would make them trust this article in the first 30 seconds?
- What would make them leave?
- What question must this article answer for them to feel the visit was worth their time?

Write your reader profile in 3 sentences. This profile is your editorial filter for everything below.

---

STEP 1 — READ AS THAT READER
Read the full article through this person's eyes.

Flag every moment where:
- The article stops speaking to them and starts speaking generically
- A claim is made that does not serve their decision
- A section answers a question they did not have
- A section fails to answer a question they definitely have
- The tone shifts from helpful to promotional without earning it
- They would stop reading and why

---

STEP 2 — HUMAN QUALITY CHECK

1. NON-COMMODITY
Does every H2 contain at least one specific fact, measurement, named product, or insight that could not be generated from generic public knowledge alone?
Flag any section that a competing AI article could replicate word for word.

2. INFORMATION GAP
What question does your reader have that this article fails to answer?
If one exists, note it.

3. NARRATIVE THREAD
Does the article open with a promise to the reader?
Does each H2 build on the last toward that promise?
Does Final Thoughts deliver the conclusion the reader was building toward?

4. READER ENGAGEMENT
Identify the first sentence where your reader would stop reading.

---

STEP 3 — STRUCTURAL COMPLIANCE CHECK
Report only — do not rewrite. Flag anything that violates:
- No em dashes
- No: tapestry, delve, vibrant, meticulous, bespoke, explore, leverage
- No "In conclusion" / "In summary"
- Opening paragraph delivers the H1 promise in sentence one
- Every H2 opens with a direct answer, not a preamble
- Final Thoughts names a specific conclusion, not a generic summary

---

RETURN FORMAT — use these exact delimiter tags:

====READER PROFILE====
[3-sentence reader profile]
====END READER PROFILE====

====STEP 1 FLAGS====
[Bullet list of flagged moments, or "No flags."]
====END STEP 1 FLAGS====

====STEP 2 ANALYSIS====
NON-COMMODITY: [findings]
INFORMATION GAP: [findings]
NARRATIVE THREAD: [findings]
READER ENGAGEMENT: [first stop sentence, or "None identified."]
====END STEP 2 ANALYSIS====

====STEP 3 FLAGS====
[Bullet list of compliance violations, or "No violations."]
====END STEP 3 FLAGS====`;
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
        max_tokens: 8000,
        messages: [
          { role: "system", content: buildPrompt(topic) },
          { role: "user", content },
        ],
      }),
    });

    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const json = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({
      readerProfile: extractSection(raw, "READER PROFILE"),
      step1Flags:    extractSection(raw, "STEP 1 FLAGS"),
      step2Analysis: extractSection(raw, "STEP 2 ANALYSIS"),
      step3Flags:    extractSection(raw, "STEP 3 FLAGS"),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
