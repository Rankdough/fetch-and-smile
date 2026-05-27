// Experience Signal extraction + commodity grading.
// Pure, deterministic, client-side. No LLM calls.
// Off by default — only consumed when the global gate setting is enabled.

import { supabase } from "@/integrations/supabase/client";

export type SignalType =
  | "case-volume"
  | "named-operator"
  | "concrete-price"
  | "named-outcome"
  | "procedural-specificity"
  | "patient-story"
  | "internal-protocol"
  // Stage 3 additions — proprietary-grade markers.
  | "study-citation"
  | "comparative-stat"
  | "failure-marker"
  | "contrarian-marker";


export interface ExperienceSignal {
  type: SignalType;
  snippet: string;
  source: string;
}

export interface CommodityGrade {
  badge: "red" | "amber" | "green";
  score: number; // 0-100
  reasons: string[];
}

// Hedge phrases that mark commodity / generic content.
export const HEDGE_PHRASES: string[] = [
  "varies significantly",
  "varies widely",
  "depends on a number of factors",
  "depends on several factors",
  "it's important to note",
  "it is important to note",
  "in today's world",
  "in today's fast-paced",
  "in the modern era",
  "navigating the world of",
  "the world of",
  "when it comes to",
  "at the end of the day",
  "leverage",
  "delve into",
  "delve deeper",
  "unlock the potential",
  "unleash",
  "embark on a journey",
  "in conclusion",
  "in summary",
  "it goes without saying",
  "needless to say",
  "a wide range of",
  "a variety of factors",
  "numerous benefits",
  "countless benefits",
  "wide array of",
  "ever-evolving",
  "ever-changing landscape",
  "cutting-edge",
  "game-changer",
  "revolutionize",
];

const HEDGE_REPLACEMENT =
  "Ask the clinical team for current figures";

/**
 * Replace banned hedge phrases in-place with a concrete fallback.
 * Case-insensitive, preserves surrounding punctuation.
 */
export function stripHedges(text: string): { text: string; hits: number } {
  let out = text;
  let hits = 0;
  for (const phrase of HEDGE_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = out.match(re);
    if (matches) {
      hits += matches.length;
      out = out.replace(re, HEDGE_REPLACEMENT);
    }
  }
  return { text: out, hits };
}

// Heuristic signal extraction over a single source string.
// Looks for sentences containing numbers, currency, dates, named entities,
// or named procedures/protocols.
export function extractSignalsFromText(
  text: string,
  source: string
): ExperienceSignal[] {
  if (!text || typeof text !== "string") return [];
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 400);

  const signals: ExperienceSignal[] = [];
  for (const s of sentences) {
    // === Stage 3: proprietary-grade signals (checked first, high weight) ===

    // study-citation: institutional acronym + year, or year + research verb
    if (
      /\b(PubMed|AAO|NICE|Cochrane|NHS|FDA|CDC|WHO|NIH|EMA|ADA|BDA|RCS|AMA|ACS|ISO|NIST|IEEE)\b/.test(s) ||
      /\b(19|20)\d{2}\b[^.]{0,80}\b(stud(?:y|ies)|trial|review|research|meta[- ]analysis|paper|cohort|audit)\b/i.test(s) ||
      /\b(stud(?:y|ies)|trial|review|research|meta[- ]analysis|paper|cohort|audit)\b[^.]{0,80}\b(found|showed|reported|demonstrated|concluded|observed|indicated)\b/i.test(s)
    ) {
      signals.push({ type: "study-citation", snippet: s, source });
      continue;
    }

    // comparative-stat: numeric A vs/versus/compared-to numeric B (with units anywhere nearby)
    if (
      /\b\d+(?:\.\d+)?\s*(?:%|months?|weeks?|years?|days?|hours?|patients?|cases?|mm|kg|mg|ml|£|\$|€)?\s*(?:vs\.?|versus|compared\s+to|compared\s+with|against)\s*\d+(?:\.\d+)?\s*(?:%|months?|weeks?|years?|days?|hours?|patients?|cases?|mm|kg|mg|ml|£|\$|€)?/i.test(s)
    ) {
      signals.push({ type: "comparative-stat", snippet: s, source });
      continue;
    }

    // failure-marker: explicit failure-mode language
    if (
      /\b(common failure is|fails when|goes wrong when|the failure mode|the risk is|ends up with|end up with|pushed into unhealthy|multiple refinement rounds|unstable finishing|gum recession risk|open bite|the wrong tool|does not (?:reliably )?(?:fix|work|solve)|usually cannot|cannot change|won'?t (?:fix|work|solve))\b/i.test(s) ||
      /\b(honest (?:failure|limitation)|failure mode|what goes wrong|limitations? of)\b/i.test(s)
    ) {
      signals.push({ type: "failure-marker", snippet: s, source });
      continue;
    }

    // contrarian-marker: explicit rebuttal of consensus
    if (
      /\b(most (?:websites?|sites?|articles?|blogs?|people|guides?) (?:say|claim|tell you|make it sound|suggest|recommend)|in practice,?|contrary to|despite what|what you won'?t read|the real (?:answer|truth) is|conventional wisdom|popular(?:ly)? believed?)\b/i.test(s)
    ) {
      signals.push({ type: "contrarian-marker", snippet: s, source });
      continue;
    }

    // === Original signal rules ===

    // Currency or percentage
    if (/[£$€¥]\s?\d|\d+\s?%/.test(s)) {
      signals.push({ type: "concrete-price", snippet: s, source });
      continue;
    }

    // Case volume: number followed by patients/cases/jobs/events/clients
    if (/\b\d{2,}\s*(patients?|cases?|jobs?|events?|clients?|customers?|members?|users?|implants?|procedures?)\b/i.test(s)) {
      signals.push({ type: "case-volume", snippet: s, source });
      continue;
    }
    // Outcomes with percentages, ratios, time-to-result
    if (/\b\d+(?:\.\d+)?\s*(?:days?|weeks?|months?|years?|hours?|min(?:ute)?s?)\b/i.test(s) && /\b(reduced?|increased?|improved?|saved?|avoided?|cut|dropped?|grew|gained?|achieved?|completed?)\b/i.test(s)) {
      signals.push({ type: "named-outcome", snippet: s, source });
      continue;
    }
    // Named operator: Dr/Mr/Mrs/Ms/Prof + capitalized name
    if (/\b(Dr|Mr|Mrs|Ms|Prof|Professor)\.?\s+[A-Z][a-z]+/.test(s)) {
      signals.push({ type: "named-operator", snippet: s, source });
      continue;
    }
    // Procedural specificity: named technique/material/protocol
    if (/\b(All-on-\d|Morse taper|titanium|zirconia|protocol|guideline|method|technique|procedure)\b/i.test(s) && /\b(use|used|switch|switched|prefer|preferred|adopt|adopted|implement|implemented|require|requires|mandate)\b/i.test(s)) {
      signals.push({ type: "procedural-specificity", snippet: s, source });
      continue;
    }
    // Patient story marker
    if (/\b(one (patient|client|customer|member)|a patient|a client|recently|last (week|month|year))\b/i.test(s) && /\b(told|reported|asked|complained|noted|shared|said|came in|booked|booked in|came back|returned)\b/i.test(s)) {
      signals.push({ type: "patient-story", snippet: s, source });
      continue;
    }
    // Internal protocol marker
    if (/\b(our (process|policy|rule|protocol|workflow|checklist|standard)|we (require|mandate|insist|always|never)|in[- ]house)\b/i.test(s)) {
      signals.push({ type: "internal-protocol", snippet: s, source });
      continue;
    }
  }
  return signals;
}

// Aggregate signals across many sources, then dedupe + cap.
export function buildExperiencePack(
  sources: Array<{ name: string; content: string }>,
  cap = 12
): { signals: ExperienceSignal[]; pack: string } {
  const all: ExperienceSignal[] = [];
  for (const s of sources) {
    all.push(...extractSignalsFromText(s.content, s.name));
  }
  // Dedup by snippet
  const seen = new Set<string>();
  const unique: ExperienceSignal[] = [];
  for (const sig of all) {
    const key = sig.snippet.toLowerCase().slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(sig);
    if (unique.length >= cap) break;
  }
  const pack = unique
    .map((s, i) => `${i + 1}. [${s.type}] (${s.source}) ${s.snippet}`)
    .join("\n");
  return { signals: unique, pack };
}

// Grade a generated text based on signal coverage + hedge density.
export function gradeCommodity(
  signals: ExperienceSignal[],
  outputText: string
): CommodityGrade {
  const reasons: string[] = [];
  let score = 50;

  // Signal source diversity
  const sources = new Set(signals.map((s) => s.source));
  if (signals.length === 0) {
    reasons.push("No first-hand experience signals provided");
    score -= 30;
  } else if (signals.length < 3) {
    reasons.push(`Only ${signals.length} signal(s) available`);
    score -= 10;
  } else if (sources.size >= 2 && signals.length >= 5) {
    reasons.push(`${signals.length} signals across ${sources.size} sources`);
    score += 25;
  } else {
    score += 10;
  }

  // Hedge phrase density in output
  const { hits } = stripHedges(outputText);
  if (hits === 0) {
    reasons.push("No banned hedge phrases");
    score += 10;
  } else if (hits <= 2) {
    reasons.push(`${hits} hedge phrase${hits === 1 ? "" : "s"}`);
    score -= 5;
  } else {
    reasons.push(`${hits} hedge phrases (high)`);
    score -= 15;
  }

  // Concrete numbers in body
  const numbers = outputText.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  if (numbers.length >= 8) {
    reasons.push(`${numbers.length} concrete numbers`);
    score += 10;
  } else if (numbers.length < 3) {
    reasons.push(`Only ${numbers.length} concrete numbers`);
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));
  const badge: CommodityGrade["badge"] =
    score >= 70 ? "green" : score >= 40 ? "amber" : "red";
  return { badge, score, reasons };
}

// Load project-wide signals from Supabase (brain_insights + context_documents).
// Capped to keep payload small.
export async function loadProjectSignals(
  cap = 12
): Promise<{ signals: ExperienceSignal[]; pack: string }> {
  const sources: Array<{ name: string; content: string }> = [];

  try {
    const { data: insights } = await supabase
      .from("brain_insights")
      .select("title, summary, full_text")
      .limit(40);
    if (insights) {
      for (const i of insights) {
        const txt = [i.summary, i.full_text].filter(Boolean).join(" ");
        if (txt) sources.push({ name: `insight: ${i.title}`, content: txt });
      }
    }
  } catch (e) {
    console.warn("loadProjectSignals: brain_insights fetch failed", e);
  }

  try {
    const { data: docs } = await supabase
      .from("context_documents")
      .select("file_name, content, summary")
      .limit(20);
    if (docs) {
      for (const d of docs) {
        const txt = [d.summary, (d.content || "").slice(0, 4000)]
          .filter(Boolean)
          .join(" ");
        if (txt) sources.push({ name: `context: ${d.file_name}`, content: txt });
      }
    }
  } catch (e) {
    console.warn("loadProjectSignals: context_documents fetch failed", e);
  }

  return buildExperiencePack(sources, cap);
}

// Persisted toggle.
const STORAGE_KEY = "seo-generator-experienceGate";

export function isExperienceGateEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setExperienceGateEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new Event("experience-gate-changed"));
}
