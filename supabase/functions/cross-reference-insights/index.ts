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
    const { fileId } = await req.json();
    if (!fileId) {
      return new Response(JSON.stringify({ error: "fileId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get new insights from this file
    const { data: newInsights } = await supabase
      .from("brain_insights")
      .select("id, title, summary, insight_type, full_text")
      .eq("source_file_id", fileId);

    if (!newInsights || newInsights.length === 0) {
      return new Response(JSON.stringify({ success: true, connections: 0, message: "No insights to cross-reference" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get ALL existing insights from OTHER files
    const { data: existingInsights } = await supabase
      .from("brain_insights")
      .select("id, title, summary, insight_type, source_file_id")
      .neq("source_file_id", fileId);

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
  newFileId: string,
  connectionCount: number,
  newInsightCount: number
) {
  // Get ALL insights across all files
  const { data: allInsights } = await supabase
    .from("brain_insights")
    .select("title, summary, insight_type, source_file_id");

  const { data: allFiles } = await supabase
    .from("brain_files")
    .select("id, title")
    .eq("status", "processed");

  if (!allInsights || allInsights.length === 0) return;

  // Get all connections
  const { data: connections } = await supabase
    .from("brain_connections")
    .select("relationship_type, explanation");

  // Get new file's insights for change summary
  const newFileInsights = allInsights.filter(i => i.source_file_id === newFileId);
  const newFileName = (allFiles || []).find(f => f.id === newFileId)?.title || "Unknown file";

  // Get connections involving new insights
  const { data: newConnections } = await supabase
    .from("brain_connections")
    .select("relationship_type, explanation, source_insight_id, related_insight_id")
    .or(`source_insight_id.in.(${newFileInsights.map(() => newFileId).join(",")})`);

  // Build change summary
  const changeParts: string[] = [];
  changeParts.push(`📄 **${newFileName}** added ${newInsightCount} insight${newInsightCount !== 1 ? "s" : ""}`);
  if (connectionCount > 0) {
    changeParts.push(`🔗 Found ${connectionCount} connection${connectionCount !== 1 ? "s" : ""} to existing knowledge`);
  }
  if (newFileInsights.length > 0) {
    const topInsights = newFileInsights.slice(0, 3).map(i => `- ${i.title}`).join("\n");
    changeParts.push(`**New insights:**\n${topInsights}`);
  }
  const changeSummary = changeParts.join("\n\n");

  const insightBlock = allInsights.map(i => `- [${i.insight_type}] ${i.title}: ${i.summary}`).join("\n");
  const fileNames = (allFiles || []).map(f => f.title).join(", ");
  const connBlock = (connections || []).map(c => `- ${c.relationship_type}: ${c.explanation}`).join("\n");

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
          content: `You are an SEO strategist synthesizing all available knowledge into a living strategy document.

Based on all insights and their connections, produce:

1. "strategy" — A concise markdown strategy document (max 400 words) structured as:
   - **Core Principles** (3-5 bullet points — the strongest, most-confirmed ideas)
   - **Key Tactics** (3-5 actionable steps based on the evidence)
   - **Watch Out** (1-3 contradictions or tensions to be aware of)

2. "key_patterns" — Array of 3-5 strings: recurring themes confirmed by multiple sources

3. "knowledge_gaps" — Array of 2-4 strings: important SEO areas NOT covered by any document

Write for a practitioner. Be specific, not generic. Reference actual concepts from the insights.

Return ONLY valid JSON: { "strategy": "...", "key_patterns": [...], "knowledge_gaps": [...] }`,
        },
        {
          role: "user",
          content: `SOURCES: ${fileNames}\n\nALL INSIGHTS:\n${insightBlock}\n\nCONNECTIONS:\n${connBlock || "None yet"}`,
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

  const allFileIds = (allFiles || []).map(f => f.id);

  // Upsert — keep only one strategy row
  const { data: existing } = await supabase
    .from("brain_strategy")
    .select("id")
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
