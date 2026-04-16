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
    .select("title, summary, insight_type, source_file_id, is_bookmarked")
    .eq("status", "approved");

  const { data: allFiles } = await supabase
    .from("brain_files")
    .select("id, title")
    .eq("status", "processed");

  const latestAdditionName = newFileId
    ? (allFiles || []).find((file) => file.id === newFileId)?.title || "Unknown file"
    : "File removal";

  // Fetch existing strategy row (including locked fields)
  const { data: currentStrategyRow } = await supabase
    .from("brain_strategy")
    .select("id, content, prioritized_points, locked_principles, locked_tactics")
    .limit(1)
    .maybeSingle();

  const lockedPrinciples: string[] = (currentStrategyRow as any)?.locked_principles || [];
  const lockedTactics: string[] = (currentStrategyRow as any)?.locked_tactics || [];

  if (!allInsights || allInsights.length === 0) {
    // No approved insights left — clear generated strategy but KEEP locked anchors
    if (currentStrategyRow) {
      const preservedContent = buildMarkdownFromLocked(lockedPrinciples, lockedTactics, [], [], []);
      await supabase.from("brain_strategy").update({
        content: preservedContent,
        strategy_snapshot: (currentStrategyRow as any).content || "",
        key_patterns: [], knowledge_gaps: [],
        contributing_file_ids: [],
        last_change_summary: "All insights removed — strategy cleared. Locked points preserved.",
        last_contributing_file_id: null,
      }).eq("id", currentStrategyRow.id);
    }
    return;
  }

  // Get all connections
  const { data: connections } = await supabase
    .from("brain_connections")
    .select("relationship_type, explanation");

  // Separate bookmarked insights as high-priority evidence
  const bookmarkedInsights = allInsights.filter((i: any) => i.is_bookmarked);
  const regularInsights = allInsights.filter((i: any) => !i.is_bookmarked);

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

  const insightBlock = regularInsights.map(i => `- [${i.insight_type}] ${i.title}: ${i.summary}`).join("\n");
  const bookmarkedBlock = bookmarkedInsights.length > 0
    ? bookmarkedInsights.map(i => `- [${i.insight_type}] ${i.title}: ${i.summary}`).join("\n")
    : "";
  const fileNames = (allFiles || []).map(f => f.title).join(", ");
  const connBlock = (connections || []).map(c => `- ${c.relationship_type}: ${c.explanation}`).join("\n");

  const stripPriorityLabel = (text: string) => text.replace(/^\s*PRIORITIZED:\s*/i, "").trim();
  const sanitizeStrategyMarkdown = (text: string) =>
    text
      .split("\n")
      .map((line) => line.replace(/^(\s*[-*]\s+)PRIORITIZED:\s*/i, "$1"))
      .join("\n")
      .trim();

  const existingStrategy = sanitizeStrategyMarkdown((currentStrategyRow as any)?.content || "");
  const prioritizedPoints: string[] = ((currentStrategyRow as any)?.prioritized_points || []).map(stripPriorityLabel);

  // Build locked context for the prompt
  const lockedContext = [];
  if (lockedPrinciples.length > 0) {
    lockedContext.push(`LOCKED CORE PRINCIPLES (these are user-pinned and MUST appear in core_principles verbatim):\n${lockedPrinciples.map(p => `- ${p}`).join("\n")}`);
  }
  if (lockedTactics.length > 0) {
    lockedContext.push(`LOCKED CORE TACTICS (these are user-pinned and MUST appear in core_tactics verbatim):\n${lockedTactics.map(p => `- ${p}`).join("\n")}`);
  }

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
          content: `You are an SEO strategist maintaining a living strategy document. Your job is to evolve the existing strategy, not rewrite it from scratch.

Rules:
- LOCKED points are sacred. Include them verbatim in the output. Never modify, rephrase, or omit them.
- Preserve supported points.
- Add only genuinely new points backed by evidence.
- Refine points when new evidence strengthens them.
- Remove points only when evidence directly contradicts them AND the point is NOT locked.
- If new evidence contradicts a LOCKED point, add a watch_out entry about the tension instead.
- Keep the same structure and tone throughout.
- User-prioritized points should be preserved in substance.
- Bookmarked insights carry higher weight than regular insights.
- Write in plain British English.
- Be direct, terse, and actionable.
- No educational tone, no scene-setting, no abstract strategy waffle.
- Keep every bullet easy to scan.
- Prefer commands and hard calls over explanations.
- Never output the literal label "PRIORITIZED:" in the visible strategy.

Return ONLY valid JSON with these keys:
{
  "core_principles": ["..."],
  "core_tactics": ["..."],
  "watch_out": ["..."],
  "key_patterns": ["..."],
  "knowledge_gaps": ["..."]
}

Requirements:
- core_principles: 3-8 bullets, strategic beliefs backed by evidence. MUST include all locked principles.
- core_tactics: 3-8 bullets, direct actions. MUST include all locked tactics.
- watch_out: 1-4 bullets, contradictions, trade-offs, or risks.
- key_patterns: 3-6 short strings.
- knowledge_gaps: 2-4 short strings.
- Max 28 words per bullet.
- No filler phrases.
- Use actual concepts from the insights, not generic SEO advice.
- All five keys are mandatory.`,
        },
        {
          role: "user",
          content: `${lockedContext.length > 0 ? lockedContext.join("\n\n") + "\n\n" : ""}${existingStrategy ? `CURRENT STRATEGY (preserve and evolve this):\n${existingStrategy}\n\n` : ""}${prioritizedPoints.length > 0 ? `USER-PRIORITIZED POINTS (keep these in substance):\n${prioritizedPoints.map(p => `- ${p}`).join("\n")}\n\n` : ""}${bookmarkedBlock ? `HIGH-PRIORITY BOOKMARKED INSIGHTS (weight these above regular insights):\n${bookmarkedBlock}\n\n` : ""}LATEST CHANGE: ${latestAdditionName}${newFileId ? ` (${newInsightCount} new insights)` : ""}\n\nSOURCES: ${fileNames}\n\nALL INSIGHTS:\n${insightBlock}\n\nCONNECTIONS:\n${connBlock || "None yet"}`,
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

  const sanitizeList = (items: unknown) =>
    Array.isArray(items)
      ? items
          .map((item) => stripPriorityLabel(String(item || "")))
          .filter(Boolean)
      : [];

  parsed.core_principles = sanitizeList(parsed.core_principles);
  parsed.core_tactics = sanitizeList(parsed.core_tactics);
  parsed.watch_out = sanitizeList(parsed.watch_out);

  // DETERMINISTIC ENFORCEMENT: Merge locked points back in if the model omitted them
  parsed.core_principles = enforceLocked(parsed.core_principles, lockedPrinciples);
  parsed.core_tactics = enforceLocked(parsed.core_tactics, lockedTactics);

  // Build markdown from structured arrays
  const buildSection = (heading: string, items: string[]) => {
    if (!items || items.length === 0) return "";
    return `## ${heading}\n${items.map(i => `- ${stripPriorityLabel(i)}`).join("\n")}\n`;
  };

  const strategyMarkdown = [
    buildSection("Core Principles", parsed.core_principles),
    buildSection("Core Tactics", parsed.core_tactics),
    buildSection("Watch Out", parsed.watch_out),
  ].filter(Boolean).join("\n");

  const finalStrategy = sanitizeStrategyMarkdown(strategyMarkdown);
  const allFileIds = (allFiles || []).map(f => f.id);

  const strategyPayload: Record<string, unknown> = {
    content: finalStrategy,
    strategy_snapshot: existingStrategy || "",
    key_patterns: parsed.key_patterns || [],
    knowledge_gaps: parsed.knowledge_gaps || [],
    contributing_file_ids: allFileIds,
    last_change_summary: changeSummary,
    last_contributing_file_id: newFileId,
    prioritized_points: prioritizedPoints,
  };

  if (currentStrategyRow) {
    await supabase.from("brain_strategy").update(strategyPayload).eq("id", currentStrategyRow.id);
  } else {
    await supabase.from("brain_strategy").insert({
      ...strategyPayload,
      locked_principles: [],
      locked_tactics: [],
    });
  }

  console.log("Strategy document updated with locked point enforcement");
}

/** Ensure all locked points appear in the output list. Adds missing ones at the top. */
function enforceLocked(generated: string[], locked: string[]): string[] {
  if (locked.length === 0) return generated;
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const generatedNorm = new Set(generated.map(normalise));
  const missing = locked.filter(lp => !generatedNorm.has(normalise(lp)));
  return [...missing, ...generated];
}

/** Build minimal markdown from locked points only (used when all insights are removed). */
function buildMarkdownFromLocked(
  principles: string[],
  tactics: string[],
  watchOut: string[],
  _keyPatterns: string[],
  _knowledgeGaps: string[]
): string {
  const sections: string[] = [];
  if (principles.length > 0) sections.push(`## Core Principles\n${principles.map(p => `- ${p}`).join("\n")}`);
  if (tactics.length > 0) sections.push(`## Core Tactics\n${tactics.map(t => `- ${t}`).join("\n")}`);
  if (watchOut.length > 0) sections.push(`## Watch Out\n${watchOut.map(w => `- ${w}`).join("\n")}`);
  return sections.join("\n\n");
}
