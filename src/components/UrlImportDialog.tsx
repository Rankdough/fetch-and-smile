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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Globe, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UrlImportDialogProps {
  onImport: (markdown: string) => void;
  formatReference?: string;
  targetLength?: string;
  instructions?: string;
}

export function UrlImportDialog({ onImport, formatReference, targetLength = "medium", instructions: userInstructions }: UrlImportDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");

  const handleImport = async () => {
    if (!url.trim()) return;

    setIsProcessing(true);
    try {
      // Step 1: Scrape the URL
      setStatus("Scraping page content...");
      const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke("scrape-format", {
        body: { url: url.trim() },
      });
      if (scrapeError) throw scrapeError;

      const sourceText = scrapeData.markdown || "";
      if (!sourceText.trim()) {
        throw new Error("No content could be extracted from that URL.");
      }

      // Step 2: Convert scraped content into article template
      setStatus("Converting to article format...");

      const wordCounts: Record<string, number> = {
        short: 500, medium: 1000, long: 2000, extended: 3000, comprehensive: 3500,
      };
      const targetWords = wordCounts[targetLength] || 1000;

      let instructions = `REFORMAT ONLY: The following content has been scraped from a web page. Restructure it into the standard article format (TL;DR, Quick Tips, In This Article navigation, question-based H2 headings, FAQ, References) but preserve the original text, facts, and voice as closely as possible. Do not invent new information. Only reorganise and add the required structural elements.

STRICT WORD COUNT LIMIT: The final article MUST NOT exceed ${targetWords} words. This is a HARD MAXIMUM. If the source content is longer than ${targetWords} words, you MUST aggressively condense, summarise, and cut less important details to fit within ${targetWords} words. Aim for exactly ${targetWords} words - not more, not less. Count your words carefully.`;

      if (userInstructions) {
        instructions += `\n\nADDITIONAL INSTRUCTIONS FROM USER:\n${userInstructions}`;
      }

      if (formatReference) {
        instructions += `\n\nFORMAT REFERENCE: Use this format reference for structural guidance:\n\n${formatReference.substring(0, 4000)}`;
      }

      const topicMatch = sourceText.match(/^#\s+(.+)$/m) || sourceText.match(/^(.{10,80})/);
      const topic = topicMatch ? topicMatch[1].trim() : "Article";

      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          topic,
          length: targetLength,
          wordCount: targetWords,
          instructions,
          contextFiles: [{ name: "source-content", content: sourceText.substring(0, 8000) }],
        },
      });

      if (error) throw error;
      const content = data.content || data.generatedContent || "";
      if (!content) throw new Error("No content returned from conversion");

      onImport(content);
      setIsOpen(false);
      setUrl("");
      setStatus("");

      toast({
        title: "Article imported!",
        description: `"${scrapeData.title || url}" has been converted into your article template.`,
      });
    } catch (err) {
      console.error("URL import error:", err);
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Failed to import from URL.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setStatus("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="default" className="gap-2">
          <Globe className="h-4 w-4" />
          Import URL
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Article from URL</DialogTitle>
          <DialogDescription>
            Paste a URL and we'll scrape the page content and convert it into your article template format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Article URL</Label>
            <Input
              placeholder="https://example.com/blog-post"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim() && !isProcessing) handleImport();
              }}
              disabled={isProcessing}
            />
          </div>

          {status && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {status}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={isProcessing || !url.trim()}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Globe className="mr-2 h-4 w-4" />
                Import & Convert
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
