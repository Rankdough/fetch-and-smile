import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { filePath, fileName } = await req.json();

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: "File path is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Downloading file:", filePath);

    // Download the file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("context-files")
      .download(filePath);

    if (downloadError) {
      console.error("Download error:", downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    let textContent = "";
    const fileExtension = fileName?.split(".").pop()?.toLowerCase() || "";

    // Handle different file types
    if (fileExtension === "txt" || fileExtension === "md") {
      textContent = await fileData.text();
    } else if (fileExtension === "json") {
      const jsonText = await fileData.text();
      textContent = `JSON Content:\n${jsonText}`;
    } else {
      // For other files, try to read as text
      try {
        textContent = await fileData.text();
      } catch {
        textContent = `[Binary file: ${fileName}]`;
      }
    }

    console.log("File parsed successfully, length:", textContent.length);

    return new Response(
      JSON.stringify({
        content: textContent.substring(0, 10000), // Limit to 10k chars
        fileName,
        truncated: textContent.length > 10000,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Parse error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to parse file";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
