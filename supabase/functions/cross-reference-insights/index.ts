import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.24.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RequestSchema = z
  .object({
    fileId: z.string().uuid().optional(),
    rebuildOnly: z.boolean().optional().default(false),
  })
  .refine((value) => value.rebuildOnly || !!value.fileId, {
    message: "fileId or rebuildOnly required",
    path: ["fileId"],
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedBody = RequestSchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return new Response(JSON.stringify({ error: parsedBody.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fileId, rebuildOnly } = parsedBody.data;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rebuild-only mode: just regenerate strategy from all approved insights
    if (rebuildOnly) {
      await buildStrategy(supabase, LOVABLE_API_KEY, null, 0, 0);
      return new Response(JSON.stringify({ success: true, connections: 0, message: "Strategy rebuilt" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get approved insights from this file (only approved, not pending/rejected)
    const { data: newInsights } = await supabase
      .from("brain_insights")
      .select("id, title, summary, insight_type, full_text")
      .eq("source_file_id", fileId)
      .eq("status", "approved");

    if (!newInsights || newInsights.length === 0) {
      return new Response(JSON.stringify({ success: true, connections: 0, message: "No insights to cross-reference" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get ALL existing approved insights from OTHER files
    const { data: existingInsights } = await supabase
      .from("brain_insights")
      .select("id, title, summary, insight_type, source_file_id")
      .neq("source_file_id", fileId)
      .eq("status", "approved");

    if (!existingInsights || existingInsights.length === 0) {
      // First file — no cross-referencing possible, just build initial strategy
      await buildStrategy(supabase, LOVABLE_API_KEY, fileId, 0, newInsights.length);
      return new Response(JSON.stringify({ success: true, connections: 0, message: "First file — strategy initialized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Ask AI to find connections
    const newSummaries = newInsights.map((i, idx) => `[NEW-${idx}] ${i.title}: ${i.summary}`).join("\n");
    const existingSummaries = existingInsights.slice(0, 80).map((i, idx) => `[OLD-${idx}] ${i.title}: ${i.summary}`).join("\n");

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
            content: `You find connections between SEO insights. Compare NEW insights against OLD ones.

For each meaningful connection, return:
- new_idx: index of the NEW insight
- old_idx: index of the OLD insight
- type: "confirms" | "contradicts" | "extends" (extends = adds new depth/angle)
- explanation: One sentence explaining the connection (max 20 words)

PAY SPECIAL ATTENTION to contradictions. If a NEW insight directly disagrees with, disproves, or recommends the opposite of an OLD insight, mark it as "contradicts". These are the most valuable connections.

Only return STRONG, meaningful connections. Skip weak or obvious ones. Max 15 connections.

Return ONLY valid JSON: { "connections": [...] }`,
          },
          {
            role: "user",
            content: `NEW INSIGHTS:\n${newSummaries}\n\nEXISTING INSIGHTS:\n${existingSummaries}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI cross-ref error:", response.status);
      // Still build strategy even if cross-referencing fails
      await buildStrategy(supabase, LOVABLE_API_KEY, fileId, 0, newInsights.length);
      return new Response(JSON.stringify({ success: true, connections: 0, message: "Cross-referencing skipped, strategy updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse cross-ref response");
      parsed = { connections: [] };
    }

    // 4. Store connections
    let connectionCount = 0;
    for (const conn of (parsed.connections || [])) {
      const newInsight = newInsights[conn.new_idx];
      const oldInsight = existingInsights[conn.old_idx];
      if (!newInsight || !oldInsight) continue;

      const { error } = await supabase.from("brain_connections").insert({
        source_insight_id: newInsight.id,
        related_insight_id: oldInsight.id,
        relationship_type: conn.type || "related",
        explanation: conn.explanation || null,
      });
      if (!error) connectionCount++;
    }

    console.log(`Found ${connectionCount} connections for file ${fileId}`);

    // 5. Update evolving strategy with change tracking
    await buildStrategy(supabase, LOVABLE_API_KEY, fileId, connectionCount, newInsights.length);

    return new Response(
      JSON.stringify({ success: true, connections: connectionCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("cross-reference error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to cross-reference" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function buildStrategy(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  newFileId: string | null,
  connectionCount: number,
  newInsightCount: number
) {
  // Get ALL approved insights across all files
  const { data: allInsights } = await supabase
    .from("brain_insights")
    .select("title, summary, insight_type, source_file_id")
    .eq("status", "approved");

  const { data: allFiles } = await supabase
    .from("brain_files")
    .select("id, title")
    .eq("status", "processed");

  const latestAdditionName = newFileId
    ? (allFiles || []).find((file) => file.id === newFileId)?.title || "Unknown file"
    : "File removal";

  if (!allInsights || allInsights.length === 0) {
    // No approved insights left — clear strategy
    const { data: existing } = await supabase.from("brain_strategy").select("id").limit(1).maybeSingle();
    if (existing) {
      await supabase.from("brain_strategy").update({
        content: "", key_patterns: [], knowledge_gaps: [],
        contributing_file_ids: [], last_change_summary: "All insights removed — strategy cleared.",
        last_contributing_file_id: null,
      }).eq("id", existing.id);
    }
    return;
  }

  // Get all connections
  const { data: connections } = await supabase
    .from("brain_connections")
    .select("relationship_type, explanation");

  // Build change summary
  const changeParts: string[] = [];
  if (newFileId) {
    const newFileInsights = allInsights.filter(i => i.source_file_id === newFileId);
    changeParts.push(`📄 **${latestAdditionName}** added ${newInsightCount} insight${newInsightCount !== 1 ? "s" : ""}`);
    if (connectionCount > 0) {
      changeParts.push(`🔗 Found ${connectionCount} connection${connectionCount !== 1 ? "s" : ""} to existing knowledge`);
    }
    if (newFileInsights.length > 0) {
      const topInsights = newFileInsights.slice(0, 3).map(i => `- ${i.title}`).join("\n");
      changeParts.push(`**New insights:**\n${topInsights}`);
    }
  } else {
    changeParts.push(`🔄 Strategy rebuilt after file removal`);
  }
  const changeSummary = changeParts.join("\n\n");

  const insightBlock = allInsights.map(i => `- [${i.insight_type}] ${i.title}: ${i.summary}`).join("\n");
  const fileNames = (allFiles || []).map(f => f.title).join(", ");
  const connBlock = (connections || []).map(c => `- ${c.relationship_type}: ${c.explanation}`).join("\n");

  // Fetch existing strategy to evolve incrementally
  const { data: currentStrategyRow } = await supabase
    .from("brain_strategy")
    .select("content, prioritized_points")
    .limit(1)
    .maybeSingle();
  const existingStrategy = currentStrategyRow?.content || "";
  const prioritizedPoints: string[] = (currentStrategyRow as any)?.prioritized_points || [];

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are an SEO strategist maintaining a living strategy document. Your job is to EVOLVE the existing strategy — not rewrite it from scratch.

Rules:
- PRESERVE all existing points that are still supported by the evidence
- ADD new points only when new insights provide genuinely new strategic value
- REFINE existing points if new evidence strengthens, nuances, or updates them
- REMOVE points only if new evidence directly contradicts them
- Keep the same structure and tone throughout
- **PRIORITIZED POINTS ARE SACRED**: Points marked as PRIORITIZED by the user MUST ALWAYS be kept. Never remove, weaken, or significantly alter them. They represent the user's core strategic priorities. You may slightly refine wording for clarity but the substance must remain.
- Write in plain British English.
- Be direct, terse, and actionable.
- No educational tone, no scene-setting, no abstract strategy waffle.
- Keep every bullet easy to scan.
- Prefer commands and hard calls over explanations.

Output format — return ONLY valid JSON with these keys:

{
  "core_principles": ["bullet 1", "bullet 2", ...],
  "core_tactics": ["bullet 1", "bullet 2", ...],
  "watch_out": ["bullet 1", "bullet 2", ...],
  "key_patterns": ["pattern 1", ...],
  "knowledge_gaps": ["gap 1", ...]
}

MANDATORY SECTIONS (all three MUST be present — never omit any):

1. "core_principles" — Array of 3-6 strings. High-level strategic beliefs backed by evidence.

2. "core_tactics" — Array of 3-6 strings. Direct actions or instructions. Start each with a strong verb (e.g., "Audit", "Build", "Target", "Diversify"). These are DOING items, not THINKING items.

3. "watch_out" — Array of 1-3 strings. Contradictions, trade-offs, or risks found across sources.

4. "key_patterns" — Array of 3-6 strings: recurring themes confirmed by multiple sources.

5. "knowledge_gaps" — Array of 2-4 strings: important SEO areas NOT covered by any document.

Bullet rules for ALL arrays:
- Max 28 words per bullet
- No filler phrases like "it is important to", "this means", "strategic shift", or "underpins"
- Use actual concepts from the insights, not generic SEO advice

CRITICAL: You MUST return all five keys. If you omit core_tactics or watch_out, the output is INVALID.`,
        },
        {
          role: "user",
          content: `${existingStrategy ? `CURRENT STRATEGY (preserve and evolve this):\n${existingStrategy}\n\n` : ""}${prioritizedPoints.length > 0 ? `USER-PRIORITIZED POINTS (MUST keep these — they are sacred):\n${prioritizedPoints.map(p => `- ${p}`).join("\n")}\n\n` : ""}LATEST CHANGE: ${latestAdditionName}${newFileId ? ` (${newInsightCount} new insights)` : ""}\n\nSOURCES: ${fileNames}\n\nALL INSIGHTS:\n${insightBlock}\n\nCONNECTIONS:\n${connBlock || "None yet"}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error("Strategy build failed:", response.status);
    return;
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse strategy response");
    return;
  }

  // If strategy came back as structured JSON instead of markdown string, convert it
  if (parsed.strategy && typeof parsed.strategy === "object") {
    const sections: string[] = [];
    for (const [heading, items] of Object.entries(parsed.strategy)) {
      sections.push(`## ${heading}`);
      if (Array.isArray(items)) {
        for (const item of items) sections.push(`- ${item}`);
      } else if (typeof items === "string") {
        sections.push(String(items));
      }
      sections.push("");
    }
    parsed.strategy = sections.join("\n");
  }

  const allFileIds = (allFiles || []).map(f => f.id);

  // Upsert — keep only one strategy row
  const { data: existing } = await supabase
    .from("brain_strategy")
    .select("id, content")
    .limit(1)
    .maybeSingle();

  const strategyPayload = {
    content: parsed.strategy || "",
    key_patterns: parsed.key_patterns || [],
    knowledge_gaps: parsed.knowledge_gaps || [],
    contributing_file_ids: allFileIds,
    last_change_summary: changeSummary,
    last_contributing_file_id: newFileId,
  };

  if (existing) {
    await supabase.from("brain_strategy").update(strategyPayload).eq("id", existing.id);
  } else {
    await supabase.from("brain_strategy").insert(strategyPayload);
  }

  console.log("Strategy document updated with change summary");
}
