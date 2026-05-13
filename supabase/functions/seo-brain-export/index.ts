import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const expected = Deno.env.get("SEO_BRAIN_EXPORT_TOKEN");
    if (!expected) {
      return new Response("Server not configured", { status: 500, headers: corsHeaders });
    }

    const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const token = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : new URL(req.url).searchParams.get("token") || "";

    if (token !== expected) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: insights, error } = await supabase
      .from("brain_insights")
      .select("id, title, summary, full_text")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const ids = (insights || []).map((i: any) => i.id);
    const tagsByInsight: Record<string, string[]> = {};
    if (ids.length) {
      const { data: tagRows } = await supabase
        .from("brain_insight_tags")
        .select("insight_id, brain_tags(name)")
        .in("insight_id", ids);
      for (const row of tagRows || []) {
        const name = (row as any).brain_tags?.name;
        if (!name) continue;
        (tagsByInsight[(row as any).insight_id] ||= []).push(name);
      }
    }

    const lines: string[] = [];
    for (const ins of insights || []) {
      const tags = tagsByInsight[(ins as any).id] || [];
      lines.push(`# ${(ins as any).title || "(untitled)"}`);
      if (tags.length) lines.push(`Tags: ${tags.join(", ")}`);
      if ((ins as any).summary) lines.push(`Summary: ${(ins as any).summary}`);
      if ((ins as any).full_text) lines.push(`\n${(ins as any).full_text}`);
      lines.push("\n---\n");
    }

    return new Response(lines.join("\n"), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    console.error("seo-brain-export error:", e);
    return new Response(`Error: ${e instanceof Error ? e.message : String(e)}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
