import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEIGHT_SCORES: Record<string, number> = {
  official: 4,
  industry: 3,
  opinion: 2,
  anecdotal: 1,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { question, history } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: "question required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch approved insights with source file weight
    const { data: allInsights } = await supabase
      .from("brain_insights")
      .select("id, title, insight_type, summary, full_text, source_file_id")
      .eq("status", "approved");

    // Fetch file weights
    const { data: allFiles } = await supabase
      .from("brain_files")
      .select("id, source_weight");
    const fileWeightMap: Record<string, number> = {};
    (allFiles || []).forEach((f: any) => {
      fileWeightMap[f.id] = WEIGHT_SCORES[f.source_weight] || 2;
    });

    // Simple relevance scoring with authority weighting
    const queryWords = question.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    const scored = (allInsights || []).map((insight: any) => {
      const text = `${insight.title} ${insight.summary || ""} ${insight.full_text || ""}`.toLowerCase();
      const keywordScore = queryWords.reduce((acc: number, word: string) => acc + (text.includes(word) ? 1 : 0), 0);
      const authorityMultiplier = fileWeightMap[insight.source_file_id] || 2;
      return { ...insight, score: keywordScore * authorityMultiplier };
    }).filter((i: any) => i.score > 0).sort((a: any, b: any) => b.score - a.score).slice(0, 10);

    // Build context from top insights
    const contextBlock = scored.map((i: any) => {
      const weight = Object.entries(WEIGHT_SCORES).find(([, v]) => v === (fileWeightMap[i.source_file_id] || 2))?.[0] || "industry";
      return `[${i.insight_type.toUpperCase()} | Source: ${weight}] ${i.title}\n${i.summary || ""}\n${i.full_text || ""}`;
    }).join("\n---\n");

    const sources = scored.map((i: any) => ({ id: i.id, title: i.title, insight_type: i.insight_type }));

    // Build messages with history
    const chatMessages: any[] = [
      {
        role: "system",
        content: `You are an SEO Brain assistant. Answer questions using the knowledge base insights provided below. Be specific, actionable, and reference the source insights when relevant. Prioritise insights from "official" and "industry" sources over "opinion" and "anecdotal" ones.

${contextBlock ? `## Knowledge Base Context\n\n${contextBlock}` : "No relevant insights found in the knowledge base. Answer based on general SEO knowledge and note that the knowledge base doesn't have specific information on this topic."}`,
      },
    ];

    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        chatMessages.push({ role: msg.role, content: msg.content });
      }
    }
    chatMessages.push({ role: "user", content: question });

    // Stream response
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: chatMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted, please add funds" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    writer.write(encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`));

    const reader = response.body!.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } finally {
        writer.close();
      }
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("ask-brain error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
