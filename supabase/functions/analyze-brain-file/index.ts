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
            content: `You are an SEO knowledge extraction expert. Analyze the document and extract structured insights.

First, provide a file_summary: a 3-5 sentence overview of what this document covers, its main thesis, and the most important takeaways. Write it as a quick briefing for someone who hasn't read the document.

Then, for each distinct insight, principle, tactic, framework, or case study found, extract:
- title: concise name
- insight_type: one of "principle", "tactic", "case_study", "framework", "client_note"
- summary: 1-2 sentence summary
- full_text: the full relevant passage or elaboration
- tags: array of topic tags (e.g., "AEO", "internal linking", "content strategy")

Return ONLY valid JSON:
{
  "file_summary": "3-5 sentence overview of the entire document...",
  "top_learnings": ["Learning 1", "Learning 2", "Learning 3"],
  "insights": [
    {
      "title": "...",
      "insight_type": "...",
      "summary": "...",
      "full_text": "...",
      "tags": ["..."]
    }
  ]
}

Extract as many distinct insights as the document supports. Focus on actionable, specific knowledge rather than generic statements.`,
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
        })
        .select("id")
        .single();

      if (insightErr) { console.error("Insert insight error:", insightErr); continue; }
      insertedCount++;

      // Handle tags
      if (insight.tags && Array.isArray(insight.tags)) {
        for (const tagName of insight.tags) {
          const normalized = tagName.toLowerCase().trim();
          if (!normalized) continue;

          // Upsert tag
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

    // Mark file as processed
    await supabase.from("brain_files").update({ status: "processed" }).eq("id", fileId);

    console.log(`Processed ${insertedCount} insights from ${fileName}`);

    return new Response(
      JSON.stringify({ success: true, insightsCount: insertedCount }),
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
