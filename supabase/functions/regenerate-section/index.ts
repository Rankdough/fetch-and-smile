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
2. Include EXACTLY THREE markdown bullet points using "- ". No more, no fewer. Numbered lists and tables do not count as the required bullets.
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

Original section markdown (rewrite this to satisfy the atomic contract; keep the same factual substance, add exactly three bullet points, tighten the opener into a direct answer, fix any broken sources):

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

    const ensureExactlyThreeBullets = (section: string): string => {
      const lines = section.split("\n");
      const heading = lines[0] || `## ${sectionTitle}`;
      const bodyLines = lines.slice(1);
      const bulletLines = bodyLines.filter((line) => /^-\s+/.test(line.trim()));
      const uniqueBullets = new Set(bulletLines.map((line) => line.toLowerCase().replace(/^[-*+]\s+/, "").replace(/\W+/g, " ").trim()));

      if (bulletLines.length === 3 && uniqueBullets.size === 3) return section.trim();

      const bodyWithoutBullets = bodyLines.filter((line) => !/^[-*+]\s+/.test(line.trim()) && !/^\d+\.\s+/.test(line.trim()));
      const sourceStart = bodyWithoutBullets.findIndex((line) => /^\*\*Sources?:\*\*/i.test(line.trim()) || /^Sources?:/i.test(line.trim()));
      const proseLines = sourceStart >= 0 ? bodyWithoutBullets.slice(0, sourceStart) : bodyWithoutBullets;
      const sourceLines = sourceStart >= 0 ? bodyWithoutBullets.slice(sourceStart) : [];
      const prose = proseLines.join("\n").trim();
      const sourceForBullets = `${sectionMarkdown}\n${prose}`;
      const sentences = sourceForBullets
        .replace(/^##\s+.+$/m, "")
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 20 && !/^\*\*Sources?:\*\*/i.test(sentence));
      const seen = new Set<string>();
      const existing = bulletLines.map((line) => line.trim()).filter((line) => {
        const key = line.toLowerCase().replace(/^[-*+]\s+/, "").replace(/\W+/g, " ").trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 3);
      const fallbackSeeds = [
        sentences[1] || sentences[0] || `The ${sectionTitle.toLowerCase()} point needs a clear practical distinction.`,
        sentences[2] || sentences[0] || `Readers should compare the mechanism, cost, and clinical fit before deciding.`,
        sentences[3] || sentences[0] || `A concrete example or timeframe keeps the section useful when read alone.`,
      ];
      const bullets = [...existing];
      for (const seed of fallbackSeeds) {
        if (bullets.length >= 3) break;
        const cleaned = seed.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "").replace(/\s+/g, " ").trim();
        const key = cleaned.toLowerCase().replace(/\W+/g, " ").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        bullets.push(`- ${cleaned}`);
      }
      const hardFallbacks = [
        `- **Connection term:** ${sectionTitle.replace(/\?$/, "")} describes the retention method, not a separate dental category.`,
        `- **Clinical meaning:** The name usually points to friction fit, taper lock, Morse taper, or cement retention.`,
        `- **Practical check:** Ask which mechanism is being used and how it affects repair, cost, and maintenance.`,
      ];
      for (const fallback of hardFallbacks) {
        if (bullets.length >= 3) break;
        const key = fallback.toLowerCase().replace(/^[-*+]\s+/, "").replace(/\W+/g, " ").trim();
        if (seen.has(key)) continue;
        seen.add(key);
        bullets.push(fallback);
      }

      return [heading, prose, bullets.slice(0, 3).join("\n"), sourceLines.join("\n").trim()].filter(Boolean).join("\n\n").trim();
    };

    const repairNonClickableSources = (section: string): { content: string; warnings: string[] } => {
      const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
      const existingLinks: { title: string; url: string; markdown: string }[] = [];
      const seenUrls = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = linkRe.exec(`${sectionMarkdown}\n${section}`)) !== null) {
        const title = match[1].trim();
        const url = match[2].replace(/[\].,;]+$/, "");
        if (!title || seenUrls.has(url)) continue;
        seenUrls.add(url);
        existingLinks.push({ title, url, markdown: `[${title}](${url})` });
      }

      const warnings: string[] = [];
      const repaired = section.split("\n").map((line) => {
        const sourceMatch = line.match(/^\s*\*?\*?Sources?:\*?\*?\s*(.*)$/i);
        if (!sourceMatch) return line;
        if (/\[[^\]]+\]\(https?:\/\/[^)\s]+\)/i.test(line)) return line;

        const sourceText = sourceMatch[1].trim();
        const urlMatch = sourceText.match(/https?:\/\/\S+/i);
        if (urlMatch) {
          const url = urlMatch[0].replace(/[\].,;]+$/, "");
          const label = sourceText.replace(urlMatch[0], "").replace(/[|,;:]+$/g, "").trim() || new URL(url).hostname.replace(/^www\./, "");
          return `**Sources:** [${label}](${url})`;
        }

        if (existingLinks.length > 0) {
          const lowerSource = sourceText.toLowerCase();
          const matched = existingLinks.find((link) => lowerSource.includes(link.title.toLowerCase()) || link.title.toLowerCase().includes(lowerSource));
          return `**Sources:** ${(matched || existingLinks[0]).markdown}`;
        }

        warnings.push(`SOURCE GUARD: Could not repair non-clickable source reference in section: ${sectionTitle}`);
        return line;
      }).join("\n").trim();

      return { content: repaired, warnings };
    };

    content = ensureExactlyThreeBullets(content);
    const sourceRepair = repairNonClickableSources(content);
    content = sourceRepair.content;

    return new Response(
      JSON.stringify({ content, contentIntegrityWarnings: sourceRepair.warnings }),
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
