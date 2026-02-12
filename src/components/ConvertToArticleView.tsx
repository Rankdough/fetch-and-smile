import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Loader2, Link, Upload, Download, Eye, Code, Image, Maximize2, Minimize2, ArrowRight } from "lucide-react";
import TurndownService from "turndown";
import { supabase } from "@/integrations/supabase/client";

function cleanSourceText(text: string): string {
  const navPatterns = /^(home|blog|about|contact|shop|cart|menu|search|login|sign ?in|sign ?up|register|faq|help|support|privacy|terms|sitemap|site map|english|deutsch|français|nederlands)$/i;
  const noisePatterns = /^(follow us|many links|heatmap|recording|area|ordered before|free shipping|© |copyright |\(c\) |cookie|we use cookies|accept all|reject all)/i;

  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (trimmed.length < 3) return false;
      if (navPatterns.test(trimmed)) return false;
      if (noisePatterns.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix to get raw base64
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif)$/i.test(file.name);
}

interface ConvertToArticleViewProps {
  formatReference?: string;
  onContentReady?: (markdown: string) => void;
}

export function ConvertToArticleView({ formatReference, onContentReady }: ConvertToArticleViewProps) {
  const { toast } = useToast();
  const [pastedText, setPastedText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string>("");
  const [samplePageUrl, setSamplePageUrl] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedLayout, setScrapedLayout] = useState("");
  const [outputHtml, setOutputHtmlRaw] = useState(() => {
    const saved = localStorage.getItem("convert-article-outputHtml");
    return saved || "";
  });

  const setOutputHtml = (html: string) => {
    setOutputHtmlRaw(html);
    if (html) {
      localStorage.setItem("convert-article-outputHtml", html);
    } else {
      localStorage.removeItem("convert-article-outputHtml");
    }
  };
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageUrl, setPageUrl] = useState("");

  const handleScreenshotUpload = (file: File | null) => {
    setScreenshotFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setScreenshotPreview(url);
    } else {
      setScreenshotPreview("");
    }
  };

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
    const hasScreenshot = !!screenshotFile;
    const hasText = !!pastedText.trim();
    const hasFile = !!uploadedFile;
    const hasUrl = !!pageUrl.trim();

    if (!hasScreenshot && !hasText && !hasFile && !hasUrl) {
      toast({ title: "No content", description: "Upload a screenshot, provide a URL, or paste text to convert.", variant: "destructive" });
      return;
    }

    setIsConverting(true);
    try {
      let sourceText = pastedText.trim();
      let screenshotBase64: string | undefined;

      // If screenshot is provided, convert to base64 for vision analysis
      if (hasScreenshot) {
        screenshotBase64 = await fileToBase64(screenshotFile!);
      }

      // If URL is provided, scrape it for content
      if (hasUrl && !sourceText) {
        try {
          const { data, error } = await supabase.functions.invoke("scrape-format", {
            body: { url: pageUrl.trim() },
          });
          if (error) throw error;
          sourceText = data.markdown || "";
          if (!scrapedLayout && data.markdown) {
            setScrapedLayout(data.markdown);
          }
        } catch (err) {
          console.error("URL scrape error:", err);
          if (!screenshotBase64) {
            toast({ title: "Could not scrape URL", description: "Failed to fetch content from the provided URL.", variant: "destructive" });
            setIsConverting(false);
            return;
          }
        }
      }

      // Parse uploaded document file (not images) — fall back to pasted text if it fails
      if (hasFile && !isImageFile(uploadedFile!)) {
        let fileText = "";
        let fileFailed = false;
        try {
          const ext = uploadedFile!.name.split(".").pop()?.toLowerCase();
          if (ext === "txt" || ext === "md") {
            fileText = await uploadedFile!.text();
          } else {
            const formData = new FormData();
            formData.append("file", uploadedFile!);
            const { data, error } = await supabase.functions.invoke("parse-context-file", { body: formData });
            if (error) throw error;
            fileText = data.content || "";
            if (data.truncated) {
              toast({ title: "Content truncated", description: "File was too large — first 10,000 characters used." });
            }
          }
          if (!fileText || fileText.startsWith("[")) {
            fileFailed = true;
          }
        } catch {
          fileFailed = true;
        }

        if (fileFailed && sourceText) {
          toast({ title: "File couldn't be read", description: "Using pasted text instead." });
        } else if (fileFailed && !screenshotBase64) {
          toast({ title: "Could not extract content", description: "The file couldn't be read and no pasted text was provided.", variant: "destructive" });
          setIsConverting(false);
          return;
        } else if (!fileFailed) {
          sourceText = fileText;
        }
      }

      // If uploaded file IS an image, treat it as screenshot
      if (hasFile && isImageFile(uploadedFile!) && !screenshotBase64) {
        screenshotBase64 = await fileToBase64(uploadedFile!);
      }

      // Need at least screenshot or text
      if (!screenshotBase64 && !sourceText) {
        toast({ title: "No content", description: "No text found to convert.", variant: "destructive" });
        setIsConverting(false);
        return;
      }

      // Clean noise from source text
      if (sourceText) {
        sourceText = cleanSourceText(sourceText);
      }

      const { data, error } = await supabase.functions.invoke("convert-to-html", {
        body: {
          sourceContent: sourceText || undefined,
          sampleLayout: scrapedLayout || undefined,
          screenshotBase64: screenshotBase64 || undefined,
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

  const handleSendToGenerator = () => {
    if (!outputHtml || !onContentReady) return;
    const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
    turndown.addRule("table", {
      filter: ["table"],
      replacement: function (_content, node) {
        const table = node as HTMLTableElement;
        const rows = Array.from(table.rows);
        if (rows.length === 0) return "";
        const mdRows = rows.map((row) =>
          "| " + Array.from(row.cells).map((c) => c.textContent?.trim() || "").join(" | ") + " |"
        );
        if (mdRows.length > 1) {
          const sep = "| " + Array.from(rows[0].cells).map(() => "---").join(" | ") + " |";
          mdRows.splice(1, 0, sep);
        }
        return "\n\n" + mdRows.join("\n") + "\n\n";
      },
    });
    const markdown = turndown.turndown(outputHtml);
    onContentReady(markdown);
    toast({ title: "Sent to SEO Generator", description: "Content loaded into the generator with all rules applied." });
  };

  const hasInput = !!pastedText.trim() || !!uploadedFile || !!screenshotFile || !!pageUrl.trim();

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
            {/* Screenshot Upload */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Image className="h-4 w-4" />
                Upload Screenshot (PNG, JPG) — AI will replicate the layout
              </Label>
              <p className="text-xs text-muted-foreground">
                Upload a screenshot of a page and the AI will analyze its visual layout and replicate it as HTML.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => handleScreenshotUpload(e.target.files?.[0] || null)}
                  className="flex-1"
                />
                {screenshotFile && (
                  <Button variant="ghost" size="sm" onClick={() => handleScreenshotUpload(null)}>
                    Clear
                  </Button>
                )}
              </div>
              {screenshotPreview && (
                <div className="border rounded-md overflow-hidden max-h-[200px]">
                  <img src={screenshotPreview} alt="Screenshot preview" className="w-full h-auto object-contain max-h-[200px]" />
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">AND / OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Document Upload */}
            <div className="space-y-2">
              <Label>Upload Document (PDF, DOCX, TXT, MD)</Label>
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
              <span className="text-xs text-muted-foreground">AND / OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Page URL - scrape content directly */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                Page URL (scrape content from a URL)
              </Label>
              <p className="text-xs text-muted-foreground">
                Provide the URL of the page you want to convert. Content will be scraped automatically.
              </p>
              <Input
                placeholder="https://example.com/article-to-convert"
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
                className="flex-1"
              />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">AND / OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Paste Text */}
            <div className="space-y-2">
              <Label>Paste Text Content</Label>
              <Textarea
                placeholder="Paste your article text here..."
                className="min-h-[150px] text-sm resize-none"
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
              disabled={isConverting || !hasInput}
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
        <Card className={isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Output</CardTitle>
              <div className="flex items-center gap-2">
                {outputHtml && (
                  <>
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
                    {onContentReady && (
                      <Button variant="secondary" size="sm" onClick={handleSendToGenerator} className="gap-1">
                        <ArrowRight className="h-4 w-4" />
                        Use in SEO Generator
                      </Button>
                    )}
                  </>
                )}
                {outputHtml && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="gap-1"
                  >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    {isFullscreen ? "Exit" : "Expand"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {outputHtml ? (
              viewMode === "preview" ? (
                <div
                  className={`overflow-auto border rounded-md p-4 ${isFullscreen ? "max-h-[calc(100vh-100px)]" : "max-h-[70vh]"}`}
                  dangerouslySetInnerHTML={{ __html: outputHtml }}
                />
              ) : (
                <Textarea
                  value={outputHtml}
                  onChange={(e) => setOutputHtml(e.target.value)}
                  className={`font-mono text-xs resize-none ${isFullscreen ? "min-h-[calc(100vh-120px)]" : "min-h-[60vh]"}`}
                />
              )
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm text-center px-4">
                Upload a screenshot, provide a URL, or paste text, then click "Convert to HTML" to generate styled HTML you can copy into any website.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
