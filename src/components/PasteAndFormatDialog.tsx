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
import { ClipboardPaste } from "lucide-react";

interface PasteAndFormatDialogProps {
  onPasteAndFormat: (content: string) => void;
}

/**
 * Pre-process pasted plain text into proper markdown:
 * - Detect and convert section headers to ## / # headings
 * - Format Q&A interview blocks
 * - Clean up spacing
 */
function preprocessToMarkdown(raw: string): string {
  const lines = raw.split("\n");
  const result: string[] = [];
  
  // Track if the first real heading was found (for H1)
  let h1Found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines - pass through
    if (!trimmed) {
      result.push("");
      continue;
    }

    // Already has markdown heading - keep as is
    if (/^#{1,6}\s/.test(trimmed)) {
      if (/^#\s/.test(trimmed)) h1Found = true;
      result.push(line);
      continue;
    }

    // Detect H1: First line that looks like a title (long enough, no period, followed by blank line)
    if (!h1Found && i < 5 && trimmed.length > 15 && !trimmed.endsWith(".") && !trimmed.startsWith(">")) {
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim());
      if (!nextNonEmpty || nextNonEmpty.trim().length > 20) {
        result.push(`# ${trimmed}`);
        h1Found = true;
        continue;
      }
    }

    // Detect numbered section headers: "1. Title Here" or "10. Title Here"
    // Must be followed by a paragraph (not a short line) to qualify as a section header
    const numberedMatch = trimmed.match(/^(\d{1,2})\.\s+(.+)$/);
    if (numberedMatch) {
      const title = numberedMatch[2];
      // Section headers are typically questions or short phrases, not full sentences ending with period
      if (title.length > 10 && (title.endsWith("?") || !title.endsWith("."))) {
        result.push(`## ${title}`);
        continue;
      }
    }

    // Detect known structural headers as plain text
    const structuralHeaders: Record<string, string> = {
      "tl;dr": "## TL;DR",
      "tldr": "## TL;DR",
      "quick tips": "## Quick Tips",
      "in this article": "## In This Article",
      "frequently asked questions": "## Frequently Asked Questions",
      "faq": "## Frequently Asked Questions",
      "final thoughts": "## Final Thoughts",
      "conclusion": "## Conclusion",
      "references": "## References",
    };

    const lowerTrimmed = trimmed.toLowerCase().replace(/:$/, "");
    if (structuralHeaders[lowerTrimmed]) {
      result.push(structuralHeaders[lowerTrimmed]);
      continue;
    }

    // Detect standalone short lines that look like section headers
    // (short, no period, preceded and followed by blank lines)
    const prevLine = i > 0 ? lines[i - 1]?.trim() : "";
    const nextLine = i < lines.length - 1 ? lines[i + 1]?.trim() : "";
    if (
      trimmed.length >= 10 &&
      trimmed.length <= 120 &&
      !trimmed.endsWith(".") &&
      !trimmed.startsWith(">") &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("•") &&
      !trimmed.startsWith("Tip ") &&
      !trimmed.startsWith("Marcela:") &&
      !trimmed.startsWith("Dr.") &&
      prevLine === "" &&
      nextLine === "" &&
      // Looks like a title (starts with uppercase or is a question)
      (/^[A-Z]/.test(trimmed) || trimmed.endsWith("?"))
    ) {
      // Check if it's likely a sub-section or image caption - skip those
      const looksLikeCaption = /^(Dr\.|Image|Figure|Photo|Source|Credit)/i.test(trimmed);
      if (!looksLikeCaption) {
        result.push(`## ${trimmed}`);
        continue;
      }
    }

    // Format interview Q&A: "Marcela: ..." → bold question, "Dr. Aida: ..." → blockquote answer
    if (/^Marcela:\s*/.test(trimmed)) {
      const question = trimmed.replace(/^Marcela:\s*/, "");
      result.push(`**Marcela:** ${question}`);
      continue;
    }
    if (/^Dr\.\s*Aida:\s*/i.test(trimmed)) {
      const answer = trimmed.replace(/^Dr\.\s*Aida:\s*/i, "");
      result.push(`**Dr. Aida:** ${answer}`);
      continue;
    }

    // Format tips: "Tip 1: ..." → blockquote format
    const tipMatch = trimmed.match(/^Tip\s+(\d+):?\s*(.+)$/i);
    if (tipMatch) {
      result.push(`> **Tip ${tipMatch[1]}:** ${tipMatch[2]}`);
      continue;
    }

    // Pass through everything else unchanged
    result.push(line);
  }

  // Clean up excessive blank lines (3+ → 2)
  let output = result.join("\n");
  output = output.replace(/\n{3,}/g, "\n\n");

  return output.trim();
}

export function PasteAndFormatDialog({ onPasteAndFormat }: PasteAndFormatDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [pastedContent, setPastedContent] = useState("");

  const handleSubmit = () => {
    if (!pastedContent.trim()) {
      toast({
        title: "No content",
        description: "Please paste an article to format.",
        variant: "destructive",
      });
      return;
    }

    // Pre-process plain text into markdown before sending to apply-format
    const markdownContent = preprocessToMarkdown(pastedContent.trim());
    onPasteAndFormat(markdownContent);
    setPastedContent("");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          title="Paste a plain-text or markdown article and automatically apply our template format: TL;DR, Quick Tips, In This Article navigation, FAQ section, and CTA banners. The original text stays unchanged."
        >
          <ClipboardPaste className="h-4 w-4" />
          Paste &amp; Format
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Paste &amp; Format Article</DialogTitle>
          <DialogDescription>
            Paste your article below. It will be loaded into the editor and automatically
            formatted with our template (TL;DR, Quick Tips, Navigation, FAQ, CTAs) without
            changing the original text.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 min-h-0">
          <Label htmlFor="paste-format-input">Article Content</Label>
          <Textarea
            id="paste-format-input"
            placeholder={`Your Article Title

Paste your full article here — plain text or markdown.

Section One
Your content goes here...

Section Two
More content...`}
            className="min-h-[300px] max-h-[400px] font-mono text-sm resize-none"
            value={pastedContent}
            onChange={(e) => setPastedContent(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Plain text is automatically converted to markdown. The formatter will add
            TL;DR, Quick Tips, "In This Article" navigation, FAQ, and CTA banners
            while keeping your text intact.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!pastedContent.trim()}>
            Paste &amp; Apply Format
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
