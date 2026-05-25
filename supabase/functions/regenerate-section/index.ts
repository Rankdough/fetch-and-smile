import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ToneProfile {
  summary: string | null;
  characteristics: Record<string, string>;
  example_phrases: string[] | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      sectionMarkdown,
      sectionTitle,
      topic,
      toneProfile,
      useFirstPerson,
    }: {
      sectionMarkdown: string;
      sectionTitle: string;
      topic?: string;
      toneProfile?: ToneProfile | null;
      useFirstPerson?: boolean;
    } = await req.json();

    if (!sectionMarkdown || !sectionTitle) {
      return new Response(
        JSON.stringify({ error: "sectionMarkdown and sectionTitle are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let toneBlock = "";
    if (toneProfile) {
      const chars = Object.entries(toneProfile.characteristics || {})
        .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`)
        .join("\n");
      const phrases = toneProfile.example_phrases?.length
        ? `\nExample phrases to emulate:\n${toneProfile.example_phrases.map((p, i) => `${i + 1}. "${p}"`).join("\n")}`
        : "";
      toneBlock = `\nTONE (HIGHEST PRIORITY):\nVoice summary: ${toneProfile.summary || "Professional and helpful"}\nStyle characteristics:\n${chars}${phrases}\n`;
    }

    const perspective = useFirstPerson
      ? "Use first person plural (we/our) where natural."
      : "Strictly third person. Never use I, we, our, us.";

    const system = `You are rewriting ONE section of an SEO article to make it ATOMIC and self-contained.

ATOMIC SECTION CONTRACT (MANDATORY — output is REJECTED if any rule fails):
1. Start with ONE direct answer sentence that fully answers the H2 question on its own.
2. Include AT LEAST ONE markdown bullet list (- or *), numbered list, or table.
3. 90-180 words total in the section body (excluding the H2 line).
4. No back-reference phrases: never say "as mentioned above", "as we saw earlier", "continuing from", "in the previous section", "building on the above", "the following point".
5. Include at least one concrete specific (number, price, timeframe, name, or example).
6. If you cite a source, render it as a clickable markdown link [Source Name](https://url). NEVER write plain-text "Sources: ..." without links. If you don't have a real URL, omit the source line entirely.
7. Preserve the EXACT H2 heading line from the input. Do not change the heading wording.
8. ${perspective}
9. British English. No em dashes or en dashes. No AI buzzwords ("delve", "in today's", "in the realm of", "moreover", "furthermore" as transitions).

Output ONLY the rewritten section in markdown, starting with the same ## heading. No preamble, no code fences, no commentary.${toneBlock}`;

    const user = `Topic: ${topic || "(not provided)"}
Section heading: ${sectionTitle}

Original section markdown (rewrite this to satisfy the atomic contract; keep the same factual substance, add a bullet list, tighten the opener into a direct answer, fix any broken sources):

${sectionMarkdown}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("AI gateway error:", resp.status, errText);
      return new Response(
        JSON.stringify({ error: `AI gateway error: ${resp.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    let content = (data.choices?.[0]?.message?.content || "").trim();

    // Strip code fences if model added them
    content = content.replace(/^```(?:markdown)?\s*/i, "").replace(/```$/i, "").trim();

    // Ensure section starts with the same heading
    if (!/^##\s+/m.test(content)) {
      content = `## ${sectionTitle}\n\n${content}`;
    }

    // Strip em/en dashes defensively
    content = content.replace(/—/g, "-").replace(/–/g, "-");

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("regenerate-section error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
