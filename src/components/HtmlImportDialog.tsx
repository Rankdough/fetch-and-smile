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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileCode, Loader2 } from "lucide-react";
import TurndownService from "turndown";

interface HtmlImportDialogProps {
  onImport: (markdown: string) => void;
}

export function HtmlImportDialog({ onImport }: HtmlImportDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");
  const [isConverting, setIsConverting] = useState(false);

  const handleImport = async () => {
    if (!htmlContent.trim()) {
      toast({
        title: "No content",
        description: "Please paste some HTML content to import.",
        variant: "destructive",
      });
      return;
    }

    setIsConverting(true);

    try {
      // Configure Turndown for better markdown output
      const turndownService = new TurndownService({
        headingStyle: "atx",
        hr: "---",
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        emDelimiter: "*",
        strongDelimiter: "**",
      });

      // Add rules for tables
      turndownService.addRule("tableCell", {
        filter: ["th", "td"],
        replacement: function (content) {
          return " " + content.trim() + " |";
        },
      });

      turndownService.addRule("tableRow", {
        filter: "tr",
        replacement: function (content, node) {
          const cells = content.trim();
          const isHeader = (node as HTMLTableRowElement).parentElement?.tagName === "THEAD";
          
          if (isHeader) {
            const cellCount = (node as HTMLTableRowElement).cells.length;
            const separator = "\n|" + Array(cellCount).fill(" --- ").join("|") + "|";
            return "|" + cells + separator + "\n";
          }
          return "|" + cells + "\n";
        },
      });

      turndownService.addRule("table", {
        filter: "table",
        replacement: function (content) {
          return "\n" + content + "\n";
        },
      });

      // Keep images with their attributes
      turndownService.addRule("image", {
        filter: "img",
        replacement: function (content, node) {
          const img = node as HTMLImageElement;
          const alt = img.alt || "";
          const src = img.src || "";
          return `![${alt}](${src})`;
        },
      });

      // Convert HTML to Markdown
      const markdown = turndownService.turndown(htmlContent);

      // Clean up the result
      const cleanedMarkdown = markdown
        .replace(/\n{3,}/g, "\n\n") // Remove excessive newlines
        .replace(/—/g, "-") // Replace em dashes
        .replace(/–/g, "-") // Replace en dashes
        .trim();

      onImport(cleanedMarkdown);
      setHtmlContent("");
      setIsOpen(false);

      toast({
        title: "HTML imported!",
        description: "Content has been converted to Markdown and loaded into the editor.",
      });
    } catch (error) {
      console.error("HTML conversion error:", error);
      toast({
        title: "Conversion failed",
        description: error instanceof Error ? error.message : "Failed to convert HTML to Markdown",
        variant: "destructive",
      });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileCode className="h-4 w-4" />
          Import HTML
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import HTML Content</DialogTitle>
          <DialogDescription>
            Paste your HTML content below. It will be converted to Markdown for editing.
            Images will be preserved with their URLs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 min-h-0">
          <Label htmlFor="html-input">HTML Content</Label>
          <Textarea
            id="html-input"
            placeholder="<article>
  <h1>Your Article Title</h1>
  <p>Paste your HTML content here...</p>
  <img src='https://example.com/image.jpg' alt='Description' />
</article>"
            className="min-h-[300px] max-h-[400px] font-mono text-sm resize-none"
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Tip: Copy the HTML from your article's source code or exported content.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={isConverting || !htmlContent.trim()}>
            {isConverting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Converting...
              </>
            ) : (
              "Import & Convert"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
