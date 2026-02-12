import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Loader2, Link, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ConvertFileDialogProps {
  onConvert: (markdown: string) => void;
  formatReference?: string;
  colorPaletteId?: string;
}

export function ConvertFileDialog({ onConvert, formatReference, colorPaletteId }: ConvertFileDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [samplePageUrl, setSamplePageUrl] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedLayout, setScrapedLayout] = useState("");

  const handleScrapeLayout = async () => {
    if (!samplePageUrl.trim()) return;
    setIsScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-format", {
        body: { url: samplePageUrl.trim() },
      });
      if (error) throw error;
      setScrapedLayout(data.markdown || "");
      toast({
        title: "Layout captured",
        description: `Scraped "${data.title}" — its structure will be used as the template.`,
      });
    } catch (err) {
      console.error("Scrape error:", err);
      toast({
        title: "Failed to scrape page",
        description: err instanceof Error ? err.message : "Could not fetch layout from that URL.",
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  const handleConvert = async () => {
    if (!pastedText.trim() && !uploadedFile) {
      toast({
        title: "No content",
        description: "Upload a file or paste text to convert.",
        variant: "destructive",
      });
      return;
    }

    setIsConverting(true);
    try {
      let sourceText = pastedText.trim();

      // Parse uploaded file if present
      if (uploadedFile) {
        const ext = uploadedFile.name.split(".").pop()?.toLowerCase();
        if (ext === "txt" || ext === "md") {
          sourceText = await uploadedFile.text();
        } else {
          // Use parse-context-file edge function for PDF/DOCX
          const formData = new FormData();
          formData.append("file", uploadedFile);
          const { data, error } = await supabase.functions.invoke("parse-context-file", {
            body: formData,
          });
          if (error) throw error;
          sourceText = data.content || "";
          if (data.truncated) {
            toast({
              title: "Content truncated",
              description: "File was too large — first 10,000 characters used.",
            });
          }
        }
      }

      if (!sourceText) {
        toast({ title: "Empty content", description: "No text could be extracted.", variant: "destructive" });
        return;
      }

      // Build conversion instructions
      let instructions = `REFORMAT ONLY: The following content has been provided by the user. Restructure it into the standard article format (TL;DR, Quick Tips, In This Article navigation, question-based H2 headings, FAQ, References) but preserve the original text, facts, and voice as closely as possible. Do not invent new information. Only reorganise and add the required structural elements.`;

      if (scrapedLayout) {
        instructions += `\n\nLAYOUT REFERENCE: The user wants the output to match the structure and layout of this sample page. Mimic its heading hierarchy, section ordering, table usage, and content density:\n\n${scrapedLayout.substring(0, 4000)}`;
      } else if (formatReference) {
        instructions += `\n\nFORMAT REFERENCE: Use this format reference for structural guidance:\n\n${formatReference.substring(0, 4000)}`;
      }

      // Extract a topic from the content (first heading or first line)
      const topicMatch = sourceText.match(/^#\s+(.+)$/m) || sourceText.match(/^(.{10,80})/);
      const topic = topicMatch ? topicMatch[1].trim() : "Article";

      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          topic,
          length: "long",
          instructions,
          contextFiles: [{ name: "source-content", content: sourceText.substring(0, 8000) }],
        },
      });

      if (error) throw error;
      const content = data.content || data.generatedContent || "";
      if (!content) throw new Error("No content returned from generation");

      onConvert(content);
      setIsOpen(false);
      setPastedText("");
      setUploadedFile(null);
      setSamplePageUrl("");
      setScrapedLayout("");

      toast({
        title: "Content converted!",
        description: "Your content has been restructured into the article format. Use 'Copy HTML' to export.",
      });
    } catch (err) {
      console.error("Conversion error:", err);
      toast({
        title: "Conversion failed",
        description: err instanceof Error ? err.message : "Failed to convert content.",
        variant: "destructive",
      });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="default" className="gap-2">
          <FileUp className="h-4 w-4" />
          Convert to Article
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Convert Content to Styled Article</DialogTitle>
          <DialogDescription>
            Upload a file or paste text. Optionally provide a sample page URL to mimic its layout.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 min-h-0 overflow-y-auto pr-1">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Upload File (PDF, DOCX, TXT, MD)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                className="flex-1"
              />
              {uploadedFile && (
                <Button variant="ghost" size="sm" onClick={() => setUploadedFile(null)}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* OR divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Paste Text */}
          <div className="space-y-2">
            <Label>Paste Text Content</Label>
            <Textarea
              placeholder="Paste your article text here..."
              className="min-h-[150px] max-h-[250px] text-sm resize-none"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
            />
          </div>

          {/* Sample Page URL */}
          <div className="space-y-2 border-t pt-4">
            <Label className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              Sample Page URL (optional layout reference)
            </Label>
            <p className="text-xs text-muted-foreground">
              Provide a URL of a page whose layout you want to replicate. We'll scrape its structure and use it as a template.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com/article-i-like"
                value={samplePageUrl}
                onChange={(e) => setSamplePageUrl(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleScrapeLayout}
                disabled={isScraping || !samplePageUrl.trim()}
              >
                {isScraping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isScraping ? "Scraping..." : "Capture"}
              </Button>
            </div>
            {scrapedLayout && (
              <p className="text-xs text-primary">✓ Layout captured — will be used as template</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConvert}
            disabled={isConverting || (!pastedText.trim() && !uploadedFile)}
          >
            {isConverting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <FileUp className="mr-2 h-4 w-4" />
                Convert to Article
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
