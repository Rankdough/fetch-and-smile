// Proprietary Mode — full-article orchestrator (demo path).
//
// Shortest end-to-end pipeline that calls the proprietary engine on every
// section. No mapping UI required: this function auto-picks the best brain
// unit per section by deterministic token overlap.
//
// Pipeline:
//   1. Load every brain_insights row for the project (capped).
//   2. AI call: derive 3 H2 question headings for the topic.
//   3. Build outline: opening (framing) → TL;DR (framing) → 3 H2s (body) →
//      failure-mode (body, healthcare/service only) → final thoughts (framing).
//   4. For each section, auto-pick the highest-overlap unit (or null).
//   5. Series-call section generator, threading surroundingContext.
//   6. Stitch markdown and return alongside per-section telemetry.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  assembleSectionPrompt,
  buildContradictionPrompt,
  lintRule5,
  type BusinessType,
  type MappedUnit,
  type SectionSpec,
  type UnitType,
} from "../_shared/proprietaryPromptAssembler.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

interface RequestBody {
  topic: string;
  audienceSentence?: string;
  businessType?: BusinessType;
  publicationDestination?: "ai-search" | "human-blog" | "both";
  model?: string;
}

interface BrainUnit {
  id: string;
  title: string | null;
  summary: string | null;
  full_text: string | null;
  unit_type: UnitType | "legacy" | null;
}

async function callModelRaw(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
): Promise<{ content: string; finishReason: string }> {
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
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("Rate limit exceeded — try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted — top up the workspace.");
    throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return {
    content: json?.choices?.[0]?.message?.content ?? "",
    finishReason: json?.choices?.[0]?.finish_reason ?? "stop",
  };
}

async function callModel(system: string, user: string, model: string, maxTokens = 1200): Promise<string> {
  const first = await callModelRaw(system, user, model, maxTokens);
  let content = first.content;
  // If hit length cap, ask for continuation and stitch.
  if (first.finishReason === "length") {
    console.warn(`PROPRIETARY: hit max_tokens (${maxTokens}); requesting continuation`);
    const contSys = system + "\n\nYou are continuing a partial response. Output ONLY the remaining text, starting at the exact point the previous response stopped. No restating, no preamble.";
    const contUser = `${user}\n\n--- PARTIAL RESPONSE SO FAR (continue from the exact next character) ---\n${content}`;
    try {
      const second = await callModelRaw(contSys, contUser, model, maxTokens);
      // Join with no separator; trim leading whitespace from continuation.
      content = content.replace(/\s+$/, "") + (content.endsWith(" ") ? "" : " ") + second.content.replace(/^\s+/, "");
    } catch (e) {
      console.warn("PROPRIETARY: continuation failed (non-fatal):", e);
    }
  }
  // Strip any trailing dangling-incomplete sentence (no terminator) as a last-resort guard.
  const trimmed = content.trim();
  const lastTerm = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
  if (lastTerm > 0 && lastTerm < trimmed.length - 1) {
    const tail = trimmed.slice(lastTerm + 1).trim();
    // Drop if tail looks like an incomplete sentence (no terminator, > 0 chars, not just markdown).
    if (tail.length > 0 && !/[.!?]$/.test(tail) && !/^[#*\-|]/.test(tail)) {
      return trimmed.slice(0, lastTerm + 1);
    }
  }
  return content;
}

/* ── outline generation ───────────────────────────────────────────────── */

async function generateH2Questions(topic: string, model: string): Promise<string[]> {
  const sys = `You generate H2 question headings for non-commodity articles. Output exactly 3 question headings, one per line, no numbering, no bullets, no markdown. Each must be a real question a reader would type, phrased in 4-10 words. No filler openers. No "what is X" if there's a sharper question.`;
  const user = `Topic: ${topic}\n\nReturn 3 H2 question headings.`;
  const raw = await callModel(sys, user, model, 400);
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\d\-*.\s)#]+/, "").trim())
    .filter((l) => l.length > 5 && l.length < 140);
  return lines.slice(0, 3);
}

/* ── deterministic unit auto-mapping ──────────────────────────────────── */

const STOPWORDS = new Set([
  "the","and","for","with","that","this","from","have","been","were","when","what",
  "which","their","there","about","into","over","than","then","they","them","your",
  "you","are","was","but","not","can","does","how","why","who","whom","one","two",
  "use","using","used","also","its","it's","more","most","some","any","all","will",
  "should","could","would","may","might","much","many","very","just","like","such",
  "make","made","take","gets","get","got","need","needs","needed",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
  );
}

function pickUnit(
  sectionHeading: string,
  topic: string,
  units: BrainUnit[],
  minOverlap = 2,
): MappedUnit | null {
  if (!units.length) return null;
  const target = tokenize(`${topic} ${sectionHeading}`);
  let best: { unit: BrainUnit; score: number } | null = null;
  for (const u of units) {
    if (!u.full_text || !u.unit_type || u.unit_type === "legacy") continue;
    const haystack = `${u.title || ""} ${u.summary || ""} ${u.full_text.slice(0, 800)}`;
    const tokens = tokenize(haystack);
    let score = 0;
    for (const t of target) if (tokens.has(t)) score++;
    if (!best || score > best.score) best = { unit: u, score };
  }
  if (!best || best.score < minOverlap) return null;
  const u = best.unit;
  return {
    id: u.id,
    unit_type: u.unit_type as UnitType,
    title: u.title,
    summary: u.summary,
    full_text: u.full_text!,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function naturaliseKeywordPhrase(keyword: string): string {
  const cleaned = keyword
    .toLowerCase()
    .replace(/\b(how|what|why|when|where|which|who|can|does|do|is|are|will|should|could|would)\b/g, " ")
    .replace(/\b(fix|help|work|mean|cost)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || keyword).replace(/\b\w/g, (c) => c.toUpperCase());
}

function sanitiseGeneratedMarkdown(markdown: string, articleTitle: string): string {
  const titleIsLongQuery = articleTitle.trim().split(/\s+/).length >= 4;
  const titleRegex = titleIsLongQuery ? new RegExp(`\\b${escapeRegExp(articleTitle.trim())}\\b`, "gi") : null;
  const replacement = titleIsLongQuery ? naturaliseKeywordPhrase(articleTitle) : "";
  const lines = markdown.split("\n");
  const kept: string[] = [];
  let titleHeadingSeen = false;
  let removedTables = 0;
  let rewrittenKeywords = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s\-:|]+\|[\s\-:|]+$/.test(lines[i + 1])) {
      const start = i;
      let end = i + 2;
      while (end < lines.length && lines[end].includes("|")) end++;
      const table = lines.slice(start, end).join("\n");
      if (/\bOption\s+[ABC]\b|\bType\s+[123]\b|\bChoice\s+[123]\b|\b(Beginners?|Intermediate users?|Advanced needs?)\b/i.test(table)) {
        removedTables += 1;
        i = end - 1;
        continue;
      }
    }

    const trimmed = line.trim();
    let out = line;
    if (titleRegex && replacement) {
      const isHeading = /^#{1,6}\s/.test(trimmed);
      if (isHeading && !titleHeadingSeen) {
        titleHeadingSeen = true;
      } else {
        const matches = out.match(titleRegex);
        if (matches) rewrittenKeywords += matches.length;
        out = out.replace(titleRegex, replacement);
      }
    }

    if (trimmed && !/^#{1,6}\s/.test(trimmed) && !/^\s*(\||[-*+]|\d+\.)\s?/.test(out) && !out.includes("|") && !/^>/.test(trimmed) && !/[.!?:)]\s*$/.test(trimmed)) {
      const lastTerm = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
      if (lastTerm > 20) out = out.slice(0, out.indexOf(trimmed) + lastTerm + 1);
    }

    kept.push(out);
  }

  if (removedTables > 0) console.warn(`PROPRIETARY SANITISER: removed ${removedTables} generic table(s).`);
  if (rewrittenKeywords > 0) console.warn(`PROPRIETARY SANITISER: rewrote ${rewrittenKeywords} exact title-query injection(s).`);
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ── per-section generation (inlined from proprietary-generate-section) ─ */

async function runSection(input: {
  businessType: BusinessType;
  mappedUnit: MappedUnit | null;
  audienceSentence: string;
  publicationDestination: "ai-search" | "human-blog" | "both";
  section: SectionSpec;
  surroundingContext: Array<{ heading: string; content: string }>;
  articleTitle: string;
  model: string;
}) {
  const { system, user, appliedRules } = assembleSectionPrompt(input);
  // Body sections get a larger budget than framing sections to prevent mid-sentence
  // truncation. Gemini/OpenAI default caps were producing dangling sentences.
  const tokenBudget = input.section.type === "body" ? 2200 : 1000;
  let content = (await callModel(system, user, input.model, tokenBudget)).trim();
  const needsExpertInput = /^\[NEEDS EXPERT INPUT\]\s*$/i.test(content);
  const ruleFlags = needsExpertInput ? [] : lintRule5(content);

  let contradicted = false;
  if (!needsExpertInput && input.mappedUnit?.unit_type === "contrarian") {
    const cp = buildContradictionPrompt({
      generatedSection: content,
      contrarianUnit: input.mappedUnit,
      sectionHeading: input.section.heading,
    });
    try {
      const raw = await callModel(cp.system, cp.user, input.model, 2200);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (parsed?.rewritten && typeof parsed.rewritten === "string") {
        contradicted = !!parsed.contradicted;
        if (contradicted) content = parsed.rewritten.trim();
      }
    } catch (e) {
      console.warn("Rule-6 pass failed (non-fatal):", e);
    }
  }
  return { content, needsExpertInput, ruleFlags, contradicted, appliedRules };
}

/* ── handler ──────────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    if (!body.topic?.trim()) {
      return new Response(JSON.stringify({ error: "topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = body.model || DEFAULT_MODEL;
    const businessType: BusinessType = body.businessType || "healthcare-clinical";
    const audienceSentence =
      body.audienceSentence ||
      "Adults researching this topic who want a direct, expert-level answer.";
    const publicationDestination = body.publicationDestination || "both";

    // 1. Load brain units
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: rawUnits, error: brainErr } = await sb
      .from("brain_insights")
      .select("id, title, summary, full_text, unit_type")
      .limit(100);
    if (brainErr) console.warn("brain_insights fetch failed:", brainErr);
    const units: BrainUnit[] = (rawUnits as BrainUnit[]) || [];

    // 2. Outline
    const h2Questions = await generateH2Questions(body.topic, model);
    if (h2Questions.length === 0) {
      return new Response(
        JSON.stringify({ error: "Outline generation returned no questions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Build section plan
    const includeFailureMode =
      businessType === "healthcare-clinical" || businessType === "service";
    const plan: SectionSpec[] = [
      { id: "opening", heading: "Opening", kind: "opening", type: "framing" },
      { id: "tldr", heading: "TL;DR", kind: "tldr", type: "framing" },
      { id: "quick-tips", heading: "Quick Tips", kind: "quick-tips", type: "framing" },
      ...h2Questions.map(
        (q, i): SectionSpec => ({
          id: `h2-${i + 1}`,
          heading: q,
          kind: "h2-question",
          type: "body",
        }),
      ),
      ...(includeFailureMode
        ? [
            {
              id: "failure",
              heading: "Where this commonly goes wrong",
              kind: "failure-mode" as const,
              type: "body" as const,
            },
          ]
        : []),
      { id: "faq", heading: "Frequently Asked Questions", kind: "faq", type: "framing" },
      {
        id: "final",
        heading: "Final thoughts",
        kind: "final-thoughts",
        type: "framing",
      },
    ];

    // 4 + 5. Series generation with surrounding context
    const surrounding: Array<{ heading: string; content: string }> = [];
    const sectionsOut: Array<{
      id: string;
      heading: string;
      kind: string;
      type: string;
      mappedUnitId: string | null;
      mappedUnitType: string | null;
      content: string;
      needsExpertInput: boolean;
      ruleFlags: string[];
      contradicted: boolean;
      appliedRules: number[];
    }> = [];

    for (const section of plan) {
      const mappedUnit =
        section.type === "body" ? pickUnit(section.heading, body.topic, units) : null;

      const result = await runSection({
        businessType,
        mappedUnit,
        audienceSentence,
        publicationDestination,
        section,
        surroundingContext: surrounding.slice(),
        articleTitle: body.topic,
        model,
      });

      surrounding.push({ heading: section.heading, content: result.content });
      sectionsOut.push({
        id: section.id,
        heading: section.heading,
        kind: section.kind,
        type: section.type,
        mappedUnitId: mappedUnit?.id ?? null,
        mappedUnitType: mappedUnit?.unit_type ?? null,
        content: result.content,
        needsExpertInput: result.needsExpertInput,
        ruleFlags: result.ruleFlags,
        contradicted: result.contradicted,
        appliedRules: result.appliedRules,
      });
    }

    // 6. Stitch
    const md: string[] = [`# ${body.topic}`, ""];
    for (const s of sectionsOut) {
      if (s.kind === "opening") {
        md.push(s.content, "");
      } else if (s.kind === "tldr") {
        md.push("## TL;DR", "", s.content, "");
      } else if (s.kind === "quick-tips") {
        md.push("## Quick Tips", "", s.content, "");
      } else if (s.kind === "faq") {
        md.push("## Frequently Asked Questions", "", s.content, "");
      } else {
        md.push(`## ${s.heading}`, "", s.content, "");
      }
    }
    const content = md.join("\n").trim();

    // mappedUnitTexts for downstream verification grading on the client
    const mappedUnitTexts: string[] = [];
    for (const s of sectionsOut) {
      if (!s.mappedUnitId) continue;
      const u = units.find((x) => x.id === s.mappedUnitId);
      if (u?.full_text) mappedUnitTexts.push(u.full_text);
    }

    return new Response(
      JSON.stringify({
        content,
        sections: sectionsOut,
        mappedUnitTexts,
        brainUnitCount: units.length,
        outline: h2Questions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("proprietary-generate-article error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
