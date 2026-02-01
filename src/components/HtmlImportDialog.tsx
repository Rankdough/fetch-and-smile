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

      // Remove thead/tbody wrappers to simplify table parsing
      turndownService.addRule("thead", {
        filter: "thead",
        replacement: function (content) {
          return content;
        },
      });

      turndownService.addRule("tbody", {
        filter: "tbody",
        replacement: function (content) {
          return content;
        },
      });

      // Handle table cells
      turndownService.addRule("tableCell", {
        filter: ["th", "td"],
        replacement: function (content) {
          return " " + content.trim().replace(/\|/g, "\\|") + " |";
        },
      });

      // Handle table rows with proper header separator
      turndownService.addRule("tableRow", {
        filter: "tr",
        replacement: function (content, node) {
          const row = node as HTMLTableRowElement;
          const cells = content.trim();
          
          // Check if this is a header row (in thead or has th children)
          const isHeader = 
            row.parentElement?.tagName === "THEAD" || 
            row.querySelectorAll("th").length > 0;
          
          if (isHeader) {
            const cellCount = row.cells.length;
            const separator = "\n|" + Array(cellCount).fill(" --- ").join("|") + "|";
            return "|" + cells + separator + "\n";
          }
          return "|" + cells + "\n";
        },
      });

      // Handle complete table
      turndownService.addRule("table", {
        filter: "table",
        replacement: function (content) {
          return "\n\n" + content.trim() + "\n\n";
        },
      });

      // Preserve CTA banners by converting to markdown format
      turndownService.addRule("ctaBanner", {
        filter: function (node) {
          return (
            node.nodeName === "DIV" &&
            (node.classList?.contains("cta-banner") ||
             node.getAttribute("style")?.includes("linear-gradient"))
          );
        },
        replacement: function (content, node) {
          const div = node as HTMLElement;
          
          // Try to extract CTA parts
          const headline = div.querySelector(".cta-headline, [class*='headline']")?.textContent?.trim();
          const description = div.querySelector(".cta-description, [class*='description']")?.textContent?.trim();
          const buttonEl = div.querySelector(".cta-button, a[class*='button']") as HTMLAnchorElement;
          const buttonText = buttonEl?.textContent?.trim();
          const buttonUrl = buttonEl?.href || "#";
          
          if (headline || buttonText) {
            // Convert to markdown CTA format that we can recognize
            return `\n\n---CTA---\n**${headline || "Learn More"}**\n${description || ""}\n[${buttonText || "Click Here"}](${buttonUrl})\n---/CTA---\n\n`;
          }
          
          return content;
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

      // Handle details/summary (FAQ items)
      turndownService.addRule("details", {
        filter: "details",
        replacement: function (content, node) {
          const details = node as HTMLDetailsElement;
          const summary = details.querySelector("summary")?.textContent?.trim() || "Question";
          const answer = content.replace(summary, "").trim();
          return `\n\n**Q: ${summary}**\n\n${answer}\n\n`;
        },
      });

      // Strip out style tags completely to avoid raw CSS in output
      turndownService.addRule("stripStyle", {
        filter: "style",
        replacement: function () {
          return "";
        },
      });

      // Strip out script tags for safety
      turndownService.addRule("stripScript", {
        filter: "script",
        replacement: function () {
          return "";
        },
      });

      // Convert HTML to Markdown
      const markdown = turndownService.turndown(htmlContent);

      // Clean up the result
      let cleanedMarkdown = markdown
        .replace(/\n{3,}/g, "\n\n") // Remove excessive newlines
        .replace(/—/g, "-") // Replace em dashes
        .replace(/–/g, "-") // Replace en dashes
        .replace(/\\\|/g, "|") // Unescape pipe characters in regular text (keep in tables)
        .trim();

      // Remove "In This Article" section (gets auto-generated by ArticleNavigationPanel)
      cleanedMarkdown = cleanedMarkdown.replace(
        /## In This Article[\s\S]*?(?=\n## |\n# |$)/gi,
        ""
      );

      // Remove any stray CSS that leaked through (e.g. details[open] summary svg {...})
      cleanedMarkdown = cleanedMarkdown.replace(
        /details\[open\][\s\S]*?display:\s*none;\s*\}/g,
        ""
      );
      
      // Remove any other inline CSS patterns like "selector { property: value; }"
      cleanedMarkdown = cleanedMarkdown.replace(
        /[a-z-]+(?:\[[^\]]*\])?\s*[a-z-]*\s*\{[^}]*\}/gi,
        ""
      );

      // Convert CTA markers back to proper markdown blockquotes
      cleanedMarkdown = cleanedMarkdown.replace(
        /---CTA---\n\*\*(.+?)\*\*\n(.*?)\n\[(.+?)\]\((.+?)\)\n---\/CTA---/gs,
        (_, headline, desc, btnText, btnUrl) => {
          return `\n> **${headline}**\n> ${desc}\n> [${btnText}](${btnUrl})\n`;
        }
      );

      onImport(cleanedMarkdown);
      setHtmlContent("");
      setIsOpen(false);

      toast({
        title: "HTML imported!",
        description: "Content has been converted to Markdown. Use 'Enhance Import' to apply tone and add CTAs.",
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
            Tables, CTAs, and images will be preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 min-h-0">
          <Label htmlFor="html-input">HTML Content</Label>
          <Textarea
            id="html-input"
            placeholder="<article>
  <h1>Your Article Title</h1>
  <p>Paste your HTML content here...</p>
  <table>
    <thead><tr><th>Column 1</th><th>Column 2</th></tr></thead>
    <tbody><tr><td>Data 1</td><td>Data 2</td></tr></tbody>
  </table>
</article>"
            className="min-h-[300px] max-h-[400px] font-mono text-sm resize-none"
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Tip: After importing, use "Enhance Import" to apply tone profile and inject CTAs.
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
