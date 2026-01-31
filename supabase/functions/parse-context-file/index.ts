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
    const contentType = req.headers.get("content-type") || "";
    
    let fileData: Blob | null = null;
    let fileName = "";

    // Handle FormData (direct file upload)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      
      if (!file) {
        return new Response(
          JSON.stringify({ error: "No file provided in form data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      fileData = file;
      fileName = file.name;
      console.log("Received file via FormData:", fileName, "size:", file.size);
    } 
    // Handle JSON (file path in storage)
    else {
      const { filePath, fileName: jsonFileName } = await req.json();

      if (!filePath) {
        return new Response(
          JSON.stringify({ error: "File path is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      fileName = jsonFileName || filePath;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      console.log("Downloading file from storage:", filePath);

      // Download the file
      const { data: downloadedData, error: downloadError } = await supabase.storage
        .from("context-files")
        .download(filePath);

      if (downloadError) {
        console.error("Download error:", downloadError);
        throw new Error(`Failed to download file: ${downloadError.message}`);
      }
      
      fileData = downloadedData;
    }

    if (!fileData) {
      throw new Error("No file data available");
    }

    let textContent = "";
    const fileExtension = fileName?.split(".").pop()?.toLowerCase() || "";

    // Handle different file types
    if (fileExtension === "txt" || fileExtension === "md") {
      textContent = await fileData.text();
    } else if (fileExtension === "json") {
      const jsonText = await fileData.text();
      textContent = `JSON Content:\n${jsonText}`;
    } else if (fileExtension === "docx" || fileExtension === "doc") {
      // For Word documents, extract text from the XML inside the docx
      // docx files are ZIP archives containing XML
      try {
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Simple extraction: look for text between XML tags in document.xml
        // This is a basic approach - for complex docs, use a proper library
        const textDecoder = new TextDecoder("utf-8");
        const rawText = textDecoder.decode(uint8Array);
        
        // Try to find readable text content
        // Remove XML tags and extract text
        const xmlTextMatch = rawText.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
        if (xmlTextMatch) {
          textContent = xmlTextMatch
            .map(match => match.replace(/<[^>]+>/g, ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        if (!textContent || textContent.length < 50) {
          // Fallback: extract any readable ASCII text
          const readableChars: string[] = [];
          for (let i = 0; i < uint8Array.length; i++) {
            const char = uint8Array[i];
            if ((char >= 32 && char <= 126) || char === 10 || char === 13) {
              readableChars.push(String.fromCharCode(char));
            } else if (readableChars.length > 0 && readableChars[readableChars.length - 1] !== ' ') {
              readableChars.push(' ');
            }
          }
          const fallbackText = readableChars.join('').replace(/\s+/g, ' ').trim();
          
          // Filter out XML/binary noise
          const sentences = fallbackText.split(/[.!?]+/).filter(s => {
            const words = s.trim().split(/\s+/);
            return words.length >= 3 && words.every(w => w.length < 30);
          });
          
          if (sentences.length > 0) {
            textContent = sentences.join('. ').trim();
          }
        }
        
        if (!textContent || textContent.length < 20) {
          textContent = `[Could not extract text from Word document: ${fileName}. Please try pasting the content directly.]`;
        }
        
        console.log("Extracted text from docx, length:", textContent.length);
      } catch (e) {
        console.error("Error parsing docx:", e);
        textContent = `[Error parsing Word document: ${fileName}]`;
      }
    } else if (fileExtension === "pdf") {
      // PDF parsing would require a library - for now, return a message
      textContent = `[PDF parsing not yet supported. Please paste the content directly or convert to text.]`;
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
