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
    } else if (fileExtension === "docx") {
      // For Word documents, extract text from the XML inside the docx
      // docx files are ZIP archives containing XML - use fflate to decompress
      try {
        const { unzipSync } = await import("https://esm.sh/fflate@0.8.2");
        
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Unzip the docx file
        const unzipped = unzipSync(uint8Array);
        
        // Find and read document.xml (main content)
        let documentXml = "";
        for (const [path, content] of Object.entries(unzipped)) {
          if (path === "word/document.xml") {
            const decoder = new TextDecoder("utf-8");
            documentXml = decoder.decode(content as Uint8Array);
            break;
          }
        }
        
        if (documentXml) {
          // Extract text from <w:t> tags (Word text elements)
          // Split by paragraph markers to maintain structure
          const paragraphs: string[] = [];
          const paragraphSections = documentXml.split(/<w:p[^>]*>/);
          
          for (const section of paragraphSections) {
            const sectionTextMatches = section.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
            if (sectionTextMatches) {
              const paragraphText = sectionTextMatches
                .map(match => {
                  const textMatch = match.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
                  return textMatch ? textMatch[1] : "";
                })
                .join("");
              if (paragraphText.trim()) {
                paragraphs.push(paragraphText.trim());
              }
            }
          }
          
          textContent = paragraphs.join("\n\n");
          console.log("Extracted text from docx using fflate, length:", textContent.length);
        }
        
        if (!textContent || textContent.length < 20) {
          textContent = `[Could not extract text from Word document: ${fileName}. Please try pasting the content directly.]`;
        }
      } catch (e) {
        console.error("Error parsing docx:", e);
        textContent = `[Error parsing Word document: ${fileName}. Error: ${e instanceof Error ? e.message : "Unknown"}]`;
      }
    } else if (fileExtension === "doc") {
      // Old .doc format is binary and harder to parse without specialized libraries
      textContent = `[.doc format not supported. Please save as .docx or paste the content directly.]`;
    } else if (fileExtension === "pdf") {
      try {
        const { extractText } = await import("npm:unpdf@0.12.1");
        const arrayBuffer = await fileData.arrayBuffer();
        const { text } = await extractText(new Uint8Array(arrayBuffer));
        textContent = text || "";
        console.log("Extracted text from PDF, length:", textContent.length);
        if (!textContent || textContent.length < 20) {
          textContent = `[Could not extract meaningful text from PDF: ${fileName}. The PDF may be image-based. Please paste the content directly.]`;
        }
      } catch (e) {
        console.error("Error parsing PDF:", e);
        textContent = `[Error parsing PDF: ${fileName}. Error: ${e instanceof Error ? e.message : "Unknown"}. Please paste the content directly.]`;
      }
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
