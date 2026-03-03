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

    onPasteAndFormat(pastedContent.trim());
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
            placeholder={`# Your Article Title

Paste your full article here — plain text or markdown.

## Section One
Your content goes here...

## Section Two
More content...`}
            className="min-h-[300px] max-h-[400px] font-mono text-sm resize-none"
            value={pastedContent}
            onChange={(e) => setPastedContent(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The formatter will add TL;DR, Quick Tips, "In This Article" navigation,
            FAQ accordion, and CTA banners while keeping your text intact.
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
