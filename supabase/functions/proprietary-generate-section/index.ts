// Proprietary Mode — per-section generator.
//
// For BODY sections, generation is routed to Anthropic claude-sonnet-4-20250514
// with the canonical "non-commodity clinical writer" system prompt. The exact
// prompt text is preserved verbatim when businessType === "healthcare-clinical";
// for other business types the same rule set is reused with the domain noun
// swapped from "dental and medical" to a generic "professional".
//
// For FRAMING sections (tldr, opening, quick-tips, faq, final-thoughts,
// references) we keep the existing Lovable AI Gateway + assembler path — those
// don't need the clinical writer prompt and the shared rules already handle
// them.
//
// Post-processing (Rule-5 lint + Rule-6 contradiction enrichment for contrarian
// units) runs identically in both paths.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  assembleSectionPrompt,
  buildContradictionPrompt,
  lintRule5,
  type AssemblerInput,
  type MappedUnit,
} from "../_shared/proprietaryPromptAssembler.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const CLINICAL_MODEL = "claude-sonnet-4-20250514";

interface Body extends AssemblerInput {
  model?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Clinical writer system prompt (canonical — do not modify for healthcare-clinical).
// ──────────────────────────────────────────────────────────────────────────
const CLINICAL_SYSTEM_PROMPT_HEALTHCARE = `You are a clinical content writer producing non-commodity dental and medical content for a specific audience. Your purpose is to write the way an experienced clinician would answer — with specific, honest, experience-backed content that goes beyond what any generic website or AI tool would produce.

You follow these rules strictly:

RULE 1 — NO COMMODITY ANSWERS
Never write anything that could appear on any generic dental or medical website. No "consult your dentist," no "results vary," no generic timelines without context. If the knowledge input does not contain specific clinical detail on something, write [NEEDS EXPERT INPUT] rather than generating a plausible-sounding generic answer.

RULE 2 — LEAD WITH THE HONEST ANSWER
State the direct answer first. Then explain the clinical reasoning. Then give the honest tradeoff or limitation. Never bury the real answer in qualifications.

RULE 3 — DISTINGUISH DENTAL VS SKELETAL, SIMPLE VS COMPLEX
For every condition or treatment question, first establish which category the case falls into before giving a recommendation. The category determines everything else.

RULE 4 — INCLUDE FAILURE MODES
For every body section, include what goes wrong when the treatment is done incorrectly or on the wrong candidate. Use explicit language: "the common failure is", "what goes wrong when", "this fails when". This is the information patients need most and find least on the internet. Never omit it.

RULE 5 — SPECIFIC NUMBERS OVER RANGES
When giving timelines, costs, or success rates, give specific numbers. If a range is genuinely necessary, explain what drives each end of the range. Never write "varies", "depends on", "typically", or "usually" without a specific number in the same sentence. If no number exists in the knowledge input, write "No published figure on this — ask the clinical team directly."

RULE 6 — CONTRADICT CONVENTIONAL WISDOM WHEN EXPERIENCE WARRANTS IT
If the knowledge input contains evidence that contradicts what most websites say, say so directly. Use the pattern: "Most websites say X. In practice, Y because Z." Never confirm conventional wisdom when the knowledge input contradicts it.

RULE 7 — NEVER FABRICATE QUOTES
Never include a quoted statement unless the exact quote text and its attributed named source are explicitly present in the knowledge input. If no attributed quote exists in the input, write no quote at all. A missing quote is better than a fabricated one.

RULE 8 — TOPIC-SPECIFIC TABLES ONLY
If a comparison table is appropriate for this section, derive the column headers directly from the clinical topic. Never use generic columns like Option A, Option B, Option C, Best for Beginners, Intermediate Users, or Advanced Needs. Table columns must be clinically meaningful for the specific topic.

STRUCTURE FOR EVERY BODY SECTION:
- Direct answer or direct claim (first sentence — no preamble)
- Clinical explanation (what is actually happening and why)
- Who is and is not a good candidate (when relevant)
- What to expect specifically (timeline, process, outcome with real numbers)
- Honest failure mode or limitation (mandatory — use explicit failure language)
- Bottom line (one sentence the reader can act on)

You are writing content for patients to arrive at their clinical consultation already informed, with the right questions prepared. You are not a replacement for clinical consultation.`;

// Adapted (non-clinical) variant. Same rule logic, generic domain noun.
function clinicalSystemPromptForBusinessType(businessType: string): string {
  if (businessType === "healthcare-clinical") return CLINICAL_SYSTEM_PROMPT_HEALTHCARE;
  return CLINICAL_SYSTEM_PROMPT_HEALTHCARE
    .replace(/non-commodity dental and medical content/g, "non-commodity expert content")
    .replace(/experienced clinician/g, "experienced practitioner")
    .replace(/generic dental or medical website/g, "generic website in this field")
    .replace(/"consult your dentist,"/g, '"consult a professional,"')
    .replace(/specific clinical detail/g, "specific expert detail")
    .replace(/clinical reasoning/g, "expert reasoning")
    .replace(/DISTINGUISH DENTAL VS SKELETAL, SIMPLE VS COMPLEX/g, "DISTINGUISH CATEGORIES BEFORE RECOMMENDING")
    .replace(/For every condition or treatment question/g, "For every question about a method, product, or decision")
    .replace(/clinically meaningful/g, "domain-meaningful")
    .replace(/clinical topic/g, "topic")
    .replace(/clinical team directly\./g, "expert team directly.")
    .replace(/clinical consultation/g, "expert consultation")
    .replace(/the treatment is done incorrectly or on the wrong candidate/g, "the method is applied incorrectly or to the wrong situation")
    .replace(/Clinical explanation/g, "Explanation")
    .replace(/patients to arrive at their clinical consultation/g, "readers to arrive at their consultation");
}

function buildClinicalUserMessage(input: AssemblerInput): string {
  const { mappedUnit, audienceSentence, publicationDestination, section, articleTitle } = input;
  const knowledgeInput = mappedUnit?.full_text?.trim()
    ? mappedUnit.full_text.trim()
    : "No proprietary knowledge unit available for this section — generate from clinical expertise following all rules, use [NEEDS EXPERT INPUT] only where a specific proprietary number or case detail is required.";

  return [
    `Topic: ${articleTitle}`,
    `Section heading: ${section.heading}`,
    `Section type: ${section.kind}`,
    `Audience: ${audienceSentence}`,
    `Publication destination: ${publicationDestination}`,
    `Knowledge input: ${knowledgeInput}`,
    "",
    "Write this section now.",
  ].join("\n");
}

// ──────────────────────────────────────────────────────────────────────────
// Anthropic body-section call (claude-sonnet-4-20250514).
// ──────────────────────────────────────────────────────────────────────────
async function callAnthropicBodySection(
  system: string,
  user: string,
  maxTokens = 2200,
): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  async function once(sys: string, usr: string) {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLINICAL_MODEL,
        max_tokens: maxTokens,
        system: sys,
        messages: [{ role: "user", content: usr }],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Anthropic ${res.status}: ${txt}`);
    }
    const json = await res.json();
    const content = (json?.content ?? [])
      .filter((c: any) => c?.type === "text")
      .map((c: any) => c.text)
      .join("");
    return {
      content: content as string,
      stopReason: (json?.stop_reason ?? "end_turn") as string,
    };
  }

  const first = await once(system, user);
  let content = first.content;
  if (first.stopReason === "max_tokens") {
    const contSys = system + "\n\nYou are continuing a partial response. Output ONLY the remaining text from the exact stop point. No restating, no preamble.";
    const contUser = `${user}\n\n--- PARTIAL RESPONSE SO FAR (continue from the next character) ---\n${content}`;
    try {
      const cont = await once(contSys, contUser);
      content = content.replace(/\s+$/, "") + " " + cont.content.replace(/^\s+/, "");
    } catch (e) {
      console.warn("Anthropic continuation failed (non-fatal):", e);
    }
  }
  // Drop trailing dangling fragment (no terminator).
  const trimmed = content.trim();
  const lastTerm = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
  if (lastTerm > 0 && lastTerm < trimmed.length - 1) {
    const tail = trimmed.slice(lastTerm + 1).trim();
    if (tail.length > 0 && !/[.!?]$/.test(tail) && !/^[#*\-|]/.test(tail)) {
      return trimmed.slice(0, lastTerm + 1);
    }
  }
  return content;
}

// ──────────────────────────────────────────────────────────────────────────
// Lovable Gateway call (used for framing sections + Rule-6 editor pass).
// ──────────────────────────────────────────────────────────────────────────
async function callGatewayModel(
  system: string,
  user: string,
  model: string,
  maxTokens = 2200,
): Promise<string> {
  async function once(sys: string, usr: string) {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI gateway ${res.status}: ${txt}`);
    }
    const json = await res.json();
    return {
      content: (json?.choices?.[0]?.message?.content ?? "") as string,
      finishReason: (json?.choices?.[0]?.finish_reason ?? "stop") as string,
    };
  }
  const first = await once(system, user);
  let content = first.content;
  if (first.finishReason === "length") {
    const contSys = system + "\n\nYou are continuing a partial response. Output ONLY the remaining text from the exact stop point. No restating, no preamble.";
    const contUser = `${user}\n\n--- PARTIAL RESPONSE SO FAR (continue from the next character) ---\n${content}`;
    try {
      const cont = await once(contSys, contUser);
      content = content.replace(/\s+$/, "") + " " + cont.content.replace(/^\s+/, "");
    } catch (e) {
      console.warn("continuation failed (non-fatal):", e);
    }
  }
  const trimmed = content.trim();
  const lastTerm = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
  if (lastTerm > 0 && lastTerm < trimmed.length - 1) {
    const tail = trimmed.slice(lastTerm + 1).trim();
    if (tail.length > 0 && !/[.!?]$/.test(tail) && !/^[#*\-|]/.test(tail)) {
      return trimmed.slice(0, lastTerm + 1);
    }
  }
  return content;
}

const BUILD_MARKER = "BUILD-2026-05-28-A proprietary-generate-section (anthropic clinical)";
Deno.serve(async (req) => {
  console.log(BUILD_MARKER);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const fallbackModel = body.model || DEFAULT_MODEL;
    const isBody = body.section?.type === "body";

    // 1. Generation
    let content: string;
    let appliedRules: number[] = [];
    let generationPath: "anthropic-clinical" | "gateway-framing" | "gateway-fallback" = "gateway-fallback";

    if (isBody) {
      // Body sections → Anthropic clinical writer.
      const system = clinicalSystemPromptForBusinessType(body.businessType);
      const user = buildClinicalUserMessage(body);
      content = (await callAnthropicBodySection(system, user)).trim();
      generationPath = "anthropic-clinical";
      // Track which canonical rules the prompt applies (1-8 from the clinical prompt).
      appliedRules = [1, 2, 3, 4, 5, 6, 7, 8];
    } else {
      // Framing sections → existing assembler + Lovable gateway.
      const assembled = assembleSectionPrompt(body);
      content = (await callGatewayModel(assembled.system, assembled.user, fallbackModel)).trim();
      generationPath = "gateway-framing";
      appliedRules = assembled.appliedRules;
    }

    const needsExpertInput = /^\[NEEDS EXPERT INPUT\]\s*$/i.test(content);

    // 2. Rule-5 deterministic lint (unchanged)
    const ruleFlags = needsExpertInput ? [] : lintRule5(content);

    // 3. Rule-6 contradiction enrichment when the mapped unit is contrarian.
    // This still runs through the Lovable gateway (cheap editor pass).
    let contradicted = false;
    if (
      !needsExpertInput &&
      body.mappedUnit &&
      body.mappedUnit.unit_type === "contrarian"
    ) {
      const cPrompt = buildContradictionPrompt({
        generatedSection: content,
        contrarianUnit: body.mappedUnit as MappedUnit,
        sectionHeading: body.section.heading,
      });
      try {
        const raw = await callGatewayModel(cPrompt.system, cPrompt.user, fallbackModel);
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        if (parsed && typeof parsed.rewritten === "string") {
          contradicted = !!parsed.contradicted;
          if (contradicted) content = parsed.rewritten.trim();
        }
      } catch (e) {
        console.warn("Rule-6 contradiction pass failed (non-fatal):", e);
      }
    }

    return new Response(
      JSON.stringify({
        content,
        needsExpertInput,
        ruleFlags,
        contradicted,
        appliedRules,
        generationPath,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("proprietary-generate-section error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
