import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileId, fileName, content } = await req.json();
    if (!fileId || !content) {
      return new Response(JSON.stringify({ error: "fileId and content required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Analyzing brain file:", fileName);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You analyse documents and return structured summaries. Return ONLY valid JSON with exactly these keys:

1. "what_is_it" — String. One or two sentences describing what this file is. Be specific about the source and format.

2. "why_it_matters" — String. A brief paragraph (2-3 sentences max) explaining why this file matters strategically for SEO, AEO, content strategy, branding, positioning, growth, or marketing.

3. "top_takeaways" — Array of 4-7 objects, each with:
   - "heading": A bold mini-heading (3-8 words, e.g. "Think in clusters")
   - "detail": One short practical explanation sentence. Include an important stat if relevant. Max 25 words.
   - "table": (optional) If a table would help clarify comparisons or frameworks, include it as an array of objects with consistent keys.

4. "bottom_line" — String. 2-4 sentences. Say what the file is most useful for. State whether it is foundational, tactical, outdated, incomplete, or high value. If relevant, note how it can be used in SEO or marketing without turning it into a guide.

5. "insights" — Array of detailed insights for the knowledge base. For each:
   - title: concise name
   - insight_type: one of "principle", "tactic", "case_study", "framework", "client_note"
   - summary: 1 sentence summary
   - full_text: the relevant passage
   - tags: array of topic tags
   - credibility: one of "aligned", "debatable", "outdated"
   - credibility_note: 1 sentence explaining why you gave that rating. Reference established SEO consensus, Google documentation, or known best practices. If debatable or outdated, explain what the current consensus actually is.

CREDIBILITY RULES:
- "aligned" = matches current Google guidelines, widely accepted SEO/AEO practice, or well-evidenced.
- "debatable" = partially true but oversimplified, context-dependent, or lacks nuance. Explain the caveat.
- "outdated" = contradicts current best practices or relies on deprecated signals. Say what replaced it.
- Be honest. If a claim is wrong, say so. Do not soften outdated advice.

RULES:
- Write in clear, plain British English.
- Keep it short, sharp, and practical. Never make the response long.
- No fluff, long intros, or generic commentary.
- Focus on SEO, AEO, content strategy, branding, positioning, or business relevance depending on the file.
- If the file includes stats, include only the most important ones.
- If the file is weak, outdated, or incomplete, say so clearly.
- Do not guess. Only use what is actually in the file.
- Always make it sound commercially useful, not academic.
- Every word must earn its place.`,
          },
          {
            role: "user",
            content: `Extract structured SEO insights from this document:\n\n${content.substring(0, 60000)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      
      if (response.status === 429) {
        await supabase.from("brain_files").update({ status: "error" }).eq("id", fileId);
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        await supabase.from("brain_files").update({ status: "error" }).eq("id", fileId);
        return new Response(JSON.stringify({ error: "Credits exhausted, please add funds" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No AI response");

    let parsed;
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse:", raw);
      await supabase.from("brain_files").update({ status: "error" }).eq("id", fileId);
      throw new Error("Failed to parse AI response");
    }

    const whatIsIt = parsed.what_is_it || "";
    const whyItMatters = parsed.why_it_matters || [];
    const topTakeaways = parsed.top_takeaways || [];
    const bottomLine = parsed.bottom_line || "";
    const insights = parsed.insights || [];
    let insertedCount = 0;

    for (const insight of insights) {
      const { data: insightRow, error: insightErr } = await supabase
        .from("brain_insights")
        .insert({
          title: insight.title,
          insight_type: insight.insight_type || "principle",
          summary: insight.summary || null,
          full_text: insight.full_text || null,
          source_file_id: fileId,
          status: "pending_review",
          credibility_flag: insight.credibility || "aligned",
          credibility_note: insight.credibility_note || null,
        })
        .select("id")
        .single();

      if (insightErr) { console.error("Insert insight error:", insightErr); continue; }
      insertedCount++;

      if (insight.tags && Array.isArray(insight.tags)) {
        for (const tagName of insight.tags) {
          const normalized = tagName.toLowerCase().trim();
          if (!normalized) continue;

          let tagId: string;
          const { data: existing } = await supabase
            .from("brain_tags")
            .select("id")
            .eq("name", normalized)
            .maybeSingle();

          if (existing) {
            tagId = existing.id;
          } else {
            const { data: newTag } = await supabase
              .from("brain_tags")
              .insert({ name: normalized, tag_type: "topic" })
              .select("id")
              .single();
            if (!newTag) continue;
            tagId = newTag.id;
          }

          await supabase.from("brain_insight_tags").insert({
            insight_id: insightRow.id,
            tag_id: tagId,
          });
        }
      }
    }

    // Build rich summary matching exact section format
    let fullSummary = "";
    if (whatIsIt) fullSummary += `## What it is\n\n${whatIsIt}\n\n`;
    
    if (typeof whyItMatters === "string" && whyItMatters) {
      fullSummary += `## Why it matters\n\n${whyItMatters}\n\n`;
    } else if (Array.isArray(whyItMatters) && whyItMatters.length > 0) {
      fullSummary += `## Why it matters\n\n${whyItMatters.join(" ")}\n\n`;
    }

    if (topTakeaways.length > 0) {
      fullSummary += `## Key takeaways\n\n`;
      for (const t of topTakeaways) {
        if (typeof t === "string") {
          fullSummary += `- ${t}\n`;
        } else if (t.heading) {
          const detail = Array.isArray(t.detail) ? t.detail.join(" ") : (t.detail || "");
          fullSummary += `- **${t.heading}**: ${detail}\n`;
        }
        // Render optional table
        if (t.table && Array.isArray(t.table) && t.table.length > 0) {
          const keys = Object.keys(t.table[0]);
          fullSummary += `\n| ${keys.join(" | ")} |\n| ${keys.map(() => "---").join(" | ")} |\n`;
          for (const row of t.table) {
            fullSummary += `| ${keys.map(k => row[k] || "").join(" | ")} |\n`;
          }
          fullSummary += "\n";
        }
      }
      fullSummary += "\n";
    }

    if (bottomLine) fullSummary += `## Bottom line\n\n${bottomLine}`;

    // Mark file as processed with summary
    await supabase.from("brain_files").update({ status: "processed", file_summary: fullSummary }).eq("id", fileId);

    console.log(`Processed ${insertedCount} insights from ${fileName}`);

    return new Response(
      JSON.stringify({ success: true, insightsCount: insertedCount, pendingReview: insertedCount, summary: fullSummary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-brain-file error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to analyze file" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
