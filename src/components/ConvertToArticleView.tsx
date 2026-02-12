import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Loader2, Link, Upload, Download, Eye, Code } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  const [outputHtml, setOutputHtml] = useState("");
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");

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

      // Parse uploaded file
      if (uploadedFile) {
        const ext = uploadedFile.name.split(".").pop()?.toLowerCase();
        if (ext === "txt" || ext === "md") {
          sourceText = await uploadedFile.text();
        } else {
          // Use parse-context-file for PDF/DOCX
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

      if (!sourceText || sourceText.startsWith("[")) {
        toast({ title: "Could not extract content", description: sourceText || "No text found in the file.", variant: "destructive" });
        setIsConverting(false);
        return;
      }

      // Call the new convert-to-html edge function (uses Lovable AI, no SEO rules)
      const { data, error } = await supabase.functions.invoke("convert-to-html", {
        body: {
          sourceContent: sourceText,
          sampleLayout: scrapedLayout || undefined,
        },
      });

      if (error) throw error;
      const html = data.html || "";
      if (!html) throw new Error("No HTML returned");

      setOutputHtml(html);
      toast({ title: "HTML generated!", description: "Your content has been converted to styled HTML. Click 'Copy HTML' to use it." });
    } catch (err) {
      console.error("Conversion error:", err);
      toast({ title: "Conversion failed", description: err instanceof Error ? err.message : "Failed to convert content.", variant: "destructive" });
    } finally {
      setIsConverting(false);
    }
  };

  const handleCopyHtml = () => {
    if (!outputHtml) return;
    navigator.clipboard.writeText(outputHtml).then(() => {
      toast({ title: "HTML copied!", description: "Styled HTML copied to clipboard. Paste it into WordPress, Shopify, or any CMS." });
    }).catch(() => {
      // Fallback: download as file
      const blob = new Blob([outputHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "converted-article.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "HTML downloaded!", description: "File saved as converted-article.html" });
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
                Provide a URL of a page whose layout and styling you want to replicate.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/page-i-like"
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
                  Converting to HTML...
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  Convert to HTML
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Output Panel */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Output</CardTitle>
              {outputHtml && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode(viewMode === "preview" ? "code" : "preview")}
                    className="gap-1"
                  >
                    {viewMode === "preview" ? <Code className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {viewMode === "preview" ? "View Code" : "Preview"}
                  </Button>
                  <Button variant="default" size="sm" onClick={handleCopyHtml} className="gap-1">
                    <Download className="h-4 w-4" />
                    Copy HTML
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {outputHtml ? (
              viewMode === "preview" ? (
                <div
                  className="overflow-auto max-h-[70vh] border rounded-md p-4"
                  dangerouslySetInnerHTML={{ __html: outputHtml }}
                />
              ) : (
                <Textarea
                  value={outputHtml}
                  onChange={(e) => setOutputHtml(e.target.value)}
                  className="min-h-[60vh] font-mono text-xs resize-none"
                />
              )
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm text-center px-4">
                Upload a PDF/document or paste text, then click "Convert to HTML" to generate styled HTML you can copy into any website.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
