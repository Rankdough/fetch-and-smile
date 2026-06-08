import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUILD_MARKER = "BUILD-2026-06-08-A9-docx-link-pairing parse-context-file";

function decodeXmlText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractWordText(fragment: string): string {
  return [...fragment.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXmlText(match[1]))
    .join("");
}

function cleanMarkdownLabel(text: string): string {
  return text.replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim();
}

function renderWordFragmentWithHyperlinks(
  fragment: string,
  hyperlinkMap: Record<string, string>,
): { text: string; linkCount: number } {
  let rendered = "";
  let linkCount = 0;
  let lastIndex = 0;
  const hyperlinkRe = /<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/g;
  let match: RegExpExecArray | null;

  while ((match = hyperlinkRe.exec(fragment)) !== null) {
    rendered += extractWordText(fragment.slice(lastIndex, match.index));

    const idMatch = match[1].match(/\br:id="([^"]+)"/);
    const visibleText = extractWordText(match[2]);
    const url = idMatch ? hyperlinkMap[idMatch[1]] : "";

    if (url && /^https?:\/\//i.test(url)) {
      const label = cleanMarkdownLabel(visibleText) || url;
      rendered += `[${label}](${url})`;
      linkCount += 1;
    } else {
      rendered += visibleText;
    }

    lastIndex = match.index + match[0].length;
  }

  rendered += extractWordText(fragment.slice(lastIndex));
  return { text: rendered.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim(), linkCount };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(BUILD_MARKER);
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

        // Extract hyperlink URL map from word/_rels/document.xml.rels
        // Word stores hyperlink URLs as relationships, NOT as <w:t> text.
        // Without this step, all https:// URLs are invisible to text extraction.
        const hyperlinkMap: Record<string, string> = {};
        for (const [relsPath, relsContent] of Object.entries(unzipped)) {
          if (relsPath === "word/_rels/document.xml.rels") {
            const relsDecoder = new TextDecoder("utf-8");
            const relsXml = relsDecoder.decode(relsContent as Uint8Array);
            // Parse each <Relationship> element independently of attribute order.
            // Standard Word format is Id, Type, Target — NOT Id, Target, Type.
            // A single regex expecting a fixed order silently returns zero matches.
            const relEls = relsXml.matchAll(/<Relationship[^>]+>/g);
            for (const el of relEls) {
              const raw = el[0];
              const idM     = raw.match(/Id="([^"]+)"/);
              const typeM   = raw.match(/Type="([^"]+)"/);
              const targetM = raw.match(/Target="([^"]+)"/);
              if (idM && typeM && targetM
                  && typeM[1].includes("/hyperlink")
                  && targetM[1].startsWith("http")) {
                hyperlinkMap[idM[1]] = targetM[1];
              }
            }
            console.log("Hyperlink map extracted:", Object.keys(hyperlinkMap).length, "URLs");
            break;
          }
        }
        
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
          // Extract text from Word paragraphs while keeping each hyperlink paired
          // to its visible anchor text. Do NOT append all paragraph URLs at the
          // end: that destroys title→URL pairing when a references paragraph
          // contains multiple linked citations.
          const paragraphs: string[] = [];
          let resolvedHyperlinks = 0;
          const paragraphMatches = documentXml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g);
          
          for (const match of paragraphMatches) {
            const rendered = renderWordFragmentWithHyperlinks(match[1], hyperlinkMap);
            resolvedHyperlinks += rendered.linkCount;
            if (rendered.text) {
              paragraphs.push(rendered.text);
            }
          }
          
          // Also extract table rows from <w:tbl> elements — tables often contain
          // the most valuable structured data (e.g. lists of colleges, comparison tables)
          // Put table content FIRST so it is always within any character cap
          const tableRows: string[] = [];
          const tableSections = documentXml.split(/<w:tbl[^>]*>/);
          for (let t = 1; t < tableSections.length; t++) {
            const rowSections = tableSections[t].split(/<w:tr[^>]*>/);
            for (let r = 1; r < rowSections.length; r++) {
              const cellSections = rowSections[r].split(/<w:tc[^>]*>/);
              const cells: string[] = [];
              for (let c = 1; c < cellSections.length; c++) {
                const renderedCell = renderWordFragmentWithHyperlinks(cellSections[c], hyperlinkMap);
                resolvedHyperlinks += renderedCell.linkCount;
                if (renderedCell.text) cells.push(renderedCell.text);
              }
              if (cells.length > 0) tableRows.push(cells.join(" | "));
            }
          }

          // Tables first, then prose paragraphs
          const allContent = [
            ...(tableRows.length > 0 ? ["=== TABLE DATA ===", ...tableRows, "=== END TABLE DATA ==="] : []),
            ...paragraphs,
          ];
          textContent = allContent.join("\n\n");
          console.log("Extracted text from docx using fflate, length:", textContent.length, "table rows:", tableRows.length, "resolved hyperlinks:", resolvedHyperlinks);
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

    // Raised from 10k → 500k chars (~75k words) so long research briefs are stored
    // in full. Downstream chunk+embed pipeline (brain_chunks) handles retrieval.
    const MAX_CHARS = 500_000;
    return new Response(
      JSON.stringify({
        content: textContent.substring(0, MAX_CHARS),
        fileName,
        truncated: textContent.length > MAX_CHARS,
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
