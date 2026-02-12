import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Loader2, Link, Upload, Download, Eye, Edit2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ConvertToArticleViewProps {
  formatReference?: string;
  onContentReady?: (markdown: string) => void;
}

export function ConvertToArticleView({ formatReference, onContentReady }: ConvertToArticleViewProps) {
  const { toast } = useToast();
  const [pastedText, setPastedText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [samplePageUrl, setSamplePageUrl] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedLayout, setScrapedLayout] = useState("");
  const [convertedContent, setConvertedContent] = useState("");
  const [isPreview, setIsPreview] = useState(true);

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
      toast({ title: "No content", description: "Upload a file or paste text to convert.", variant: "destructive" });
      return;
    }

    setIsConverting(true);
    try {
      let sourceText = pastedText.trim();

      if (uploadedFile) {
        const ext = uploadedFile.name.split(".").pop()?.toLowerCase();
        if (ext === "txt" || ext === "md") {
          sourceText = await uploadedFile.text();
        } else {
          const formData = new FormData();
          formData.append("file", uploadedFile);
          const { data, error } = await supabase.functions.invoke("parse-context-file", { body: formData });
          if (error) throw error;
          sourceText = data.content || "";
          if (data.truncated) {
            toast({ title: "Content truncated", description: "File was too large — first 10,000 characters used." });
          }
        }
      }

      if (!sourceText) {
        toast({ title: "Empty content", description: "No text could be extracted.", variant: "destructive" });
        return;
      }

      let instructions = "";

      if (scrapedLayout) {
        // User provided a sample page — mimic THAT layout, not the SEO generator format
        instructions = `LAYOUT REPLICATION: Convert the user's source content into a well-structured HTML-ready article that follows the EXACT same layout, heading hierarchy, section ordering, and content density as the sample page below. Do NOT apply any other template (no TL;DR, Quick Tips, FAQ, or other SEO generator sections unless the sample page itself uses them). Preserve the user's original text, facts, and voice. Only reorganise to match the sample layout.\n\nSAMPLE PAGE LAYOUT:\n${scrapedLayout.substring(0, 5000)}`;
      } else {
        // No sample page — preserve the source content's own structure as-is
        instructions = `CONTENT CONVERSION: Convert the following source content into clean, well-formatted markdown suitable for HTML export. PRESERVE the original structure, headings, sections, and formatting exactly as they appear in the source. Do NOT add TL;DR, Quick Tips, FAQ, "In This Article" navigation, or any other structural elements that are not already in the source content. Keep the original text, facts, voice, and layout intact. Your job is to faithfully reproduce the content in clean markdown, not to restructure it.`;
      }

      const topicMatch = sourceText.match(/^#\s+(.+)$/m) || sourceText.match(/^(.{10,80})/);
      const topic = topicMatch ? topicMatch[1].trim() : "Article";

      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          topic,
          length: "long",
          instructions,
          contextFiles: [{ name: "source-content", content: sourceText.substring(0, 12000) }],
        },
      });

      if (error) throw error;
      const content = data.content || data.generatedContent || "";
      if (!content) throw new Error("No content returned from generation");

      setConvertedContent(content);
      onContentReady?.(content);

      toast({ title: "Content converted!", description: "Your content has been restructured. Preview below or copy as HTML." });
    } catch (err) {
      console.error("Conversion error:", err);
      toast({ title: "Conversion failed", description: err instanceof Error ? err.message : "Failed to convert content.", variant: "destructive" });
    } finally {
      setIsConverting(false);
    }
  };

  const handleCopyHtml = () => {
    if (!convertedContent) return;
    // Simple HTML wrapping — for full styled export, user can switch to generator tool
    const html = `<article>\n${convertedContent}\n</article>`;
    navigator.clipboard.writeText(html).then(() => {
      toast({ title: "HTML copied!", description: "Article HTML copied to clipboard." });
    });
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-[1400px]">
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Left: Input Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileUp className="h-5 w-5" />
              Source Content
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
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

            {/* Divider */}
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
                className="min-h-[200px] text-sm resize-none"
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
                Provide a URL of a page whose layout you want to replicate.
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

            {/* Convert Button */}
            <Button
              onClick={handleConvert}
              disabled={isConverting || (!pastedText.trim() && !uploadedFile)}
              className="w-full"
              size="lg"
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
          </CardContent>
        </Card>

        {/* Right: Preview Panel */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Output Preview</CardTitle>
              {convertedContent && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPreview(!isPreview)}
                    className="gap-1"
                  >
                    {isPreview ? <Edit2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {isPreview ? "Edit" : "Preview"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopyHtml} className="gap-1">
                    <Download className="h-4 w-4" />
                    Copy HTML
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {convertedContent ? (
              isPreview ? (
                <div className="prose prose-sm max-w-none dark:prose-invert overflow-auto max-h-[70vh]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{convertedContent}</ReactMarkdown>
                </div>
              ) : (
                <Textarea
                  value={convertedContent}
                  onChange={(e) => setConvertedContent(e.target.value)}
                  className="min-h-[60vh] font-mono text-xs resize-none"
                />
              )
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Upload content or paste text, then click "Convert to Article" to see the result here.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
