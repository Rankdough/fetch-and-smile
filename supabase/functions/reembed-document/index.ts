// One-shot reprocessing endpoint: chunk + embed the full text of an existing
// brain_files or context_documents row into brain_chunks.
//
// POST body: { sourceType: "brain_file" | "context_document", sourceId: "<uuid>" }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chunkAndEmbed } from "../_shared/embedChunks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const projectId = (() => { try { return new URL(SUPABASE_URL).hostname.split(".")[0]; } catch { return ""; } })();

    const { sourceType, sourceId } = await req.json();
    if (!sourceId || (sourceType !== "brain_file" && sourceType !== "context_document")) {
      return new Response(
        JSON.stringify({ error: "sourceType must be 'brain_file' or 'context_document'; sourceId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let content = "";
    let label = "";

    if (sourceType === "context_document") {
      const { data, error } = await supabase
        .from("context_documents")
        .select("id, file_name, content")
        .eq("id", sourceId)
        .single();
      if (error || !data) throw new Error(`context_document not found: ${error?.message ?? "no row"}`);
      content = data.content || "";
      label = data.file_name;
    } else {
      const { data: file, error: fErr } = await supabase
        .from("brain_files")
        .select("id, title, file_url")
        .eq("id", sourceId)
        .single();
      if (fErr || !file) throw new Error(`brain_file not found: ${fErr?.message ?? "no row"}`);
      label = file.title;
      // Pull raw text from the bucket
      const { data: blob, error: dErr } = await supabase.storage.from("brain-files").download(file.file_url);
      if (dErr || !blob) throw new Error(`download failed: ${dErr?.message}`);
      content = await blob.text();
    }

    if (!content.trim()) {
      return new Response(JSON.stringify({ error: "source has no content" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await chunkAndEmbed(
      supabase,
      sourceType === "brain_file"
        ? { brain_file_id: sourceId, project_id: projectId || undefined }
        : { context_document_id: sourceId, project_id: projectId || undefined },
      content,
      LOVABLE_API_KEY,
    );

    console.log(`reembed-document: ${label} -> inserted ${result.inserted}/${result.chunks}`);
    return new Response(JSON.stringify({ success: true, label, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("reembed-document error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
