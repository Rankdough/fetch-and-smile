// Proprietary Mode — per-section generator.
// Wraps the shared assembler, calls the Lovable AI gateway, runs the Rule-5
// deterministic lint, and (when the mapped unit is contrarian) runs the
// Rule-6 contradiction-surfacing editor pass.
//
// This function is intentionally narrow: one section at a time. Series
// generation is owned by the caller (so it can pass surroundingContext built
// from previously-returned sections).

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  assembleSectionPrompt,
  buildContradictionPrompt,
  lintRule5,
  type AssemblerInput,
  type MappedUnit,
} from "../_shared/proprietaryPromptAssembler.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

interface Body extends AssemblerInput {
  model?: string;
}

async function callModel(system: string, user: string, model: string): Promise<string> {
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt}`);
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const model = body.model || DEFAULT_MODEL;

    // 1. Assemble prompt + primary generation
    const { system, user, appliedRules } = assembleSectionPrompt(body);
    let content = (await callModel(system, user, model)).trim();

    const needsExpertInput = /^\[NEEDS EXPERT INPUT\]\s*$/i.test(content);

    // 2. Rule-5 deterministic lint (only meaningful if real content)
    const ruleFlags = needsExpertInput ? [] : lintRule5(content);

    // 3. Rule-6 — only when mapped unit is contrarian and content exists
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
        const raw = await callModel(cPrompt.system, cPrompt.user, model);
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
