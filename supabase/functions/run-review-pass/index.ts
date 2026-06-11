const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const BUILD_MARKER = "BUILD-2026-06-11-B17-editorial-synthesis run-review-pass";

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

Do not list individual sentences. Synthesise 3-5 patterns — recurring problems that affect multiple sections or the article as a whole.

For each pattern answer all of these:
- Does this section satisfy the reader's search intent?
- Is it useful — does it give the reader something they can act on?
- Does it solve the reader's problem, or does it talk around it?
- If it fails any of the above — exactly why, and what is missing?

Then for each pattern write:
- ISSUE: name the pattern in 4-6 words
- ANALYSIS: 2-3 sentences answering the questions above from the reader's perspective
- FIX: one specific, concrete action — name the section and exactly what to change

Prioritise patterns in this order:
1. Search intent failure — the reader cannot find the answer they came for
2. Non-commodity risk — sections a competing AI article could replicate without source material
3. Narrative breakdown — the article's promise is not delivered or the H2 flow breaks down

Ignore: individual sentence wording, promotional links, care/maintenance sections unless care is the primary search intent.

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
Flag anything that violates:
- No em dashes
- No: tapestry, delve, vibrant, meticulous, bespoke, explore, leverage
- No "In conclusion" / "In summary"
- Opening paragraph delivers the H1 promise in sentence one
- Every H2 opens with a direct answer, not a preamble
- Final Thoughts names a specific conclusion, not a generic summary

---

Based on Steps 1-3, list the top 3 fixes that would most improve this article for the reader defined in Step 0. Be specific and actionable.

Then write the corrected article applying ONLY those 3 fixes as surgical edits.

CORRECTION RULES — violating any of these voids the correction:
- Copy every unchanged section character-for-character from the original
- Preserve ALL markdown formatting exactly: ## headings, - bullet points, | tables, **bold**, _italic_
- Preserve ALL HTML exactly: id= attributes, itemscope, itemtype, itemprop, class= attributes, <div>, <span> tags
- Preserve ALL CTA blocks exactly — do not alter a single word inside them
- Preserve ALL source URLs and reference links exactly
- Do not add, remove, or reorder any H2 or H3 headings
- Do not change the paragraph count in any section by more than ±1
- Do not change the bullet count in any list by more than ±1
- British English throughout — do not switch to American English

---

RETURN FORMAT — use these exact delimiter tags in this exact order:

====READER PROFILE====
[3-sentence reader profile]
====END READER PROFILE====

====PRIORITY ACTIONS====
1. [Verb-led fix, max 20 words]
2. [Verb-led fix, max 20 words]
3. [Verb-led fix, max 20 words]
====END PRIORITY ACTIONS====

====STEP 1 FLAGS====
[3-5 patterns. Each formatted as:
ISSUE: [4-6 word name]
ANALYSIS: [2-3 sentences — intent, usefulness, problem-solving, why it fails]
FIX: [specific action — section name + what to change]

Or write "No issues." if none found.]
====END STEP 1 FLAGS====

====STEP 2 ANALYSIS====
NON-COMMODITY: [findings]
INFORMATION GAP: [findings]
NARRATIVE THREAD: [findings]
READER ENGAGEMENT: [first stop sentence, or "None identified."]
====END STEP 2 ANALYSIS====

====STEP 3 FLAGS====
[Bullet list of compliance violations, or "No violations."]
====END STEP 3 FLAGS====

====CORRECTED ARTICLE====
[Complete corrected article in markdown. If no changes needed, write: NO CHANGES]
====END CORRECTED ARTICLE====

====FIX LOG====
[One line per change: [SECTION] what was wrong → what was fixed. Write NONE if no changes.]
====END FIX LOG====`;
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

    const correctedRaw = extractSection(raw, "CORRECTED ARTICLE");
    const fixLogRaw = extractSection(raw, "FIX LOG");

    const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;
    const originalWords = countWords(content);
    let correctedContent = "";
    if (correctedRaw && correctedRaw !== "NO CHANGES") {
      const revisedWords = countWords(correctedRaw);
      const delta = Math.abs(revisedWords - originalWords) / (originalWords || 1);
      if (delta <= 0.40) {
        correctedContent = correctedRaw;
      } else {
        console.warn(`REVIEW PASS: word count deviation ${(delta * 100).toFixed(1)}% > 40%, discarding corrected article.`);
      }
    }

    const fixLog = !fixLogRaw || fixLogRaw.toUpperCase() === "NONE"
      ? []
      : fixLogRaw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    return new Response(JSON.stringify({
      readerProfile:   extractSection(raw, "READER PROFILE"),
      priorityActions: extractSection(raw, "PRIORITY ACTIONS"),
      step1Flags:      extractSection(raw, "STEP 1 FLAGS"),
      step2Analysis:   extractSection(raw, "STEP 2 ANALYSIS"),
      step3Flags:      extractSection(raw, "STEP 3 FLAGS"),
      correctedContent,
      fixLog,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
