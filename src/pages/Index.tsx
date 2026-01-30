import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, FileText, Link, Search, X, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const SAMPLE_CONTENT = `# Composite Bonding vs Veneers: Which Smile Transformation is Right for You?

We've all been there—looking in the mirror and focusing on that one chipped tooth, a persistent stain, or a small gap that makes us self-conscious when we laugh. In the modern world of cosmetic dentistry, you no longer have to live with a smile you don't love. [1]

> **TL;DR: The Quick Verdict**
> - **Choose Composite Bonding** if you want a fast, non-invasive, and budget-friendly fix for minor chips, gaps, or staining.
> - **Choose Porcelain Veneers** if you want a long-term, durable, and transformative solution that resists stains.

---

## What is Composite Bonding?

Often referred to as dental bonding, this procedure involves applying a **tooth-colored resin material** to the surface of your teeth. Your dentist sculpts the resin by hand to hide imperfections, close gaps, or change the shape of a tooth. [2]

The resin is hardened using a specialized ultraviolet light and then polished to match the natural sheen of your enamel. It is an artistic process that is usually completed in a single visit without the need for anesthesia. [1]

### The Benefits of Bonding
- **Minimally Invasive:** No natural tooth structure needs to be removed [2]
- **Speed:** Completed in a single visit (~60 minutes)
- **Reversible:** The process can often be undone or adjusted
- **Affordability:** Significantly cheaper than porcelain alternatives [3]

---

## What are Porcelain Veneers?

Veneers are custom-made, wafer-thin shells of high-quality porcelain designed to cover the front surface of the teeth. Unlike bonding, veneers are fabricated in a dental laboratory based on a mold of your mouth. [2]

To ensure the veneers don't look bulky, a small amount of enamel (usually less than a millimeter) is typically removed from the front of the tooth. This makes the procedure permanent. [1]

### The Benefits of Veneers
- **Durability:** Can last 10 to 15 years (or longer) with proper care [3]
- **Stain Resistance:** Porcelain is non-porous and won't stain from coffee or tea [2]
- **Total Transformation:** Ideal for correcting severe issues like misalignment
- **Natural Esthetics:** Mimics light-reflecting properties of natural teeth [1]

---

## Comparing the Two: At a Glance

| Feature | Composite Bonding | Porcelain Veneers |
| :--- | :--- | :--- |
| **Treatment Time** | 1 Appointment (~60 mins) | 2-3 Appointments over 2 weeks |
| **Lifespan** | 3 to 7 years [3] | 10 to 20 years [3] |
| **Tooth Preparation** | Little to none | Enamel removal required |
| **Stain Resistance** | Low (can stain over time) | High (highly resistant) |
| **Repairable?** | Yes, easily patched | No, must be replaced |
| **Average Cost** | $200 - $600 per tooth [3] | $900 - $2,500 per tooth [3] |

---

## Which Option Should You Choose?

### Choose Composite Bonding if:
- You have **minor imperfections** like a small chip or gap
- You are on a **tighter budget** but want immediate improvement
- You are **hesitant about removing enamel** from natural teeth [2]

### Choose Veneers if:
- You have **severely stained teeth** that don't respond to whitening
- Your teeth have **significant wear, large chips, or cracks**
- You want a **long-term investment** that lasts over a decade [1]

---

## Final Thoughts

A beautiful smile is one of the best investments you can make in your self-confidence. **Composite bonding** offers an accessible, fast, and conservative route to a better smile, while **Porcelain Veneers** offer a premium, durable, and life-changing transformation. [1]

**Ready to take the next step?** Schedule a consultation with a cosmetic dentist today to see what your new smile could look like!

---

## Sources

1. [VHI Healthcare - Veneers, Dentures and Composite Bonding](https://www1.vhi.ie/blog/articles/veneers-dentures-and-composite-bonding) - Comprehensive guide on cosmetic dental options
2. [Harcourt Dental Clinic - Veneers and Composite Bonding](https://harcourtdentalclinic.ie/service/veneers-and-composite-bonding/) - Professional dental service overview
3. [3Dental - Composite Bonding vs Veneers](https://www.3dental.ie/blog/composite-bonding-vs-veneers/) - Detailed cost and durability comparison
`;

const Index = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [gapAnalysis, setGapAnalysis] = useState("");
  const [formatReference, setFormatReference] = useState("");
  
  const [formData, setFormData] = useState({
    topic: "",
    length: "medium",
    outline: "",
    instructions: "",
  });

  const [competitorUrls, setCompetitorUrls] = useState(["", "", ""]);
  const [formatUrl, setFormatUrl] = useState("");
  const [contextFiles, setContextFiles] = useState<{ name: string; content: string }[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const handleAnalyzeUrls = async () => {
    const validUrls = competitorUrls.filter((url) => url.trim());
    if (validUrls.length === 0) {
      toast({
        title: "URLs required",
        description: "Please enter at least one competitor URL.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setGapAnalysis("");

    try {
      const { data, error } = await supabase.functions.invoke("analyze-urls", {
        body: { urls: validUrls, topic: formData.topic },
      });

      if (error) throw error;

      setGapAnalysis(data.gapAnalysis);
      toast({
        title: "Analysis complete!",
        description: `Analyzed ${data.articles.length} article(s).`,
      });
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Failed to analyze URLs",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFetchFormat = async () => {
    if (!formatUrl.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a URL to use as format reference.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("scrape-format", {
        body: { url: formatUrl },
      });

      if (error) throw error;

      setFormatReference(data.markdown);
      toast({
        title: "Format captured!",
        description: `Using format from: ${data.title}`,
      });
    } catch (error) {
      console.error("Format fetch error:", error);
      toast({
        title: "Failed to fetch format",
        description: error instanceof Error ? error.message : "Could not scrape the URL",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingFile(true);

    try {
      for (const file of Array.from(files)) {
        // Upload to storage
        const filePath = `${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("context-files")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Parse the file content
        const { data, error: parseError } = await supabase.functions.invoke(
          "parse-context-file",
          { body: { filePath, fileName: file.name } }
        );

        if (parseError) throw parseError;

        setContextFiles((prev) => [
          ...prev,
          { name: file.name, content: data.content },
        ]);

        toast({
          title: "File uploaded",
          description: `${file.name} added as context${data.truncated ? " (truncated to 10k chars)" : ""}`,
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploadingFile(false);
      e.target.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!formData.topic.trim()) {
      toast({
        title: "Topic required",
        description: "Please enter a topic for your content.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedContent("");

    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          ...formData,
          gapAnalysis: gapAnalysis || undefined,
          formatReference: formatReference || undefined,
          contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
        },
      });

      if (error) throw error;

      setGeneratedContent(data.content);
      toast({
        title: "Content generated!",
        description: "Your article has been created successfully.",
      });
    } catch (error) {
      console.error("Generation error:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Failed to generate content",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">SEO Content Generator</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[calc(100vh-120px)]">
          {/* Left Panel - Form */}
          <Card className="flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Blog Post Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-5">
              {/* Topic */}
              <div className="space-y-2">
                <Label htmlFor="topic">What is the topic of your post?</Label>
                <Input
                  id="topic"
                  placeholder="e.g., Best practices for React performance optimization"
                  value={formData.topic}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, topic: e.target.value }))
                  }
                />
              </div>

              {/* Competitor URLs Section */}
              <Collapsible className="space-y-2">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Competitor Analysis (Optional)
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Add up to 3 top-ranking article URLs for gap analysis
                  </p>
                  {competitorUrls.map((url, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder={`Competitor URL ${index + 1}`}
                        value={url}
                        onChange={(e) => {
                          const newUrls = [...competitorUrls];
                          newUrls[index] = e.target.value;
                          setCompetitorUrls(newUrls);
                        }}
                      />
                      {url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const newUrls = [...competitorUrls];
                            newUrls[index] = "";
                            setCompetitorUrls(newUrls);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={handleAnalyzeUrls}
                    disabled={isAnalyzing || !competitorUrls.some((u) => u.trim())}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Run Gap Analysis
                      </>
                    )}
                  </Button>
                  {gapAnalysis && (
                    <div className="rounded-md bg-muted p-3 text-sm">
                      <p className="font-medium mb-2">Gap Analysis Results:</p>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{gapAnalysis}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Format Reference URL */}
              <Collapsible className="space-y-2">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Link className="h-4 w-4" />
                      Format Reference (Optional)
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Match the format/structure of an existing article
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter URL to use as format reference"
                      value={formatUrl}
                      onChange={(e) => setFormatUrl(e.target.value)}
                    />
                    <Button
                      variant="secondary"
                      onClick={handleFetchFormat}
                      disabled={!formatUrl.trim()}
                    >
                      Capture
                    </Button>
                  </div>
                  {formatReference && (
                    <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                      ✓ Format captured - will be used during generation
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Context Files Upload */}
              <Collapsible className="space-y-2">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Context Files (Optional)
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Upload text/markdown files with brand voice, research, or reference material
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="file"
                      accept=".txt,.md,.json"
                      multiple
                      onChange={handleFileUpload}
                      disabled={isUploadingFile}
                      className="cursor-pointer"
                    />
                  </div>
                  {isUploadingFile && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                  {contextFiles.length > 0 && (
                    <div className="space-y-2">
                      {contextFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-md bg-muted p-2 text-sm"
                        >
                          <span className="truncate">{file.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              setContextFiles((prev) =>
                                prev.filter((_, i) => i !== index)
                              )
                            }
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Length */}
              <div className="space-y-2">
                <Label>How long would you like the blog post to be?</Label>
                <Select
                  value={formData.length}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, length: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select length" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short (~500 words)</SelectItem>
                    <SelectItem value="medium">Medium (~1000 words)</SelectItem>
                    <SelectItem value="long">Long (~2000 words)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Outline */}
              <div className="space-y-2">
                <Label htmlFor="outline">What is the outline of your post?</Label>
                <Textarea
                  id="outline"
                  placeholder="- Introduction&#10;- Main points&#10;- Conclusion"
                  className="min-h-[100px] resize-none"
                  value={formData.outline}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, outline: e.target.value }))
                  }
                />
              </div>

              {/* Custom Instructions */}
              <div className="space-y-2">
                <Label htmlFor="instructions">
                  Would you like to add any custom instructions?
                </Label>
                <Textarea
                  id="instructions"
                  placeholder="e.g., Use a professional tone, include statistics, add a TL;DR section..."
                  className="min-h-[60px] resize-none"
                  value={formData.instructions}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, instructions: e.target.value }))
                  }
                />
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full mt-auto"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Content
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Right Panel - Output */}
          <Card className="flex flex-col">
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Generated Content</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGeneratedContent(SAMPLE_CONTENT)}
              >
                Load Sample
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {generatedContent ? (
                <article className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{generatedContent}</ReactMarkdown>
                </article>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p className="text-center">
                    Your generated content will appear here.
                    <br />
                    Fill in the form and click "Generate Content" to start.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
