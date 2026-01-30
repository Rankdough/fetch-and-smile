import { useState, useMemo } from "react";
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
import { Loader2, Sparkles, FileText, Link, Search, X, Upload, Plus, Tag, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { GenerationChecklist } from "@/components/GenerationChecklist";
import { ContentVerification } from "@/components/ContentVerification";

const SAMPLE_CONTENT = `# Composite Bonding vs Veneers: Which Smile Transformation is Right for You?

We've all been there - looking in the mirror and focusing on that one chipped tooth, a persistent stain, or a small gap that makes us self-conscious when we laugh.

## TL;DR

- **Composite bonding** is a minimally invasive, largely reversible cosmetic dental treatment best suited to small chips, gaps, and minor shape issues. It is cheaper upfront, but requires more maintenance over time.
- **Veneers** are a permanent cosmetic solution designed for full smile makeovers, severe discolouration, and significant shape or symmetry issues. They are more expensive but last longer.

---

## What is Composite Bonding?

Composite bonding and veneers are often grouped together as cosmetic dentistry, but clinically, they serve different purposes. Composite bonding is an additive procedure that builds onto the natural tooth with resin, preserving enamel and keeping future options open.

The resin is hardened using a specialized ultraviolet light and then polished to match the natural sheen of your enamel. It is an artistic process that is usually completed in a single visit without the need for anesthesia.

### The Benefits of Bonding
- **Minimally Invasive:** No natural tooth structure needs to be removed
- **Speed:** Completed in a single visit (~30-60 minutes per tooth)
- **Reversible:** The process can largely be undone or adjusted
- **Affordability:** Typical UK cost is £200-£450 per tooth

**Sources:** [What Is Dental Bonding? - Cleveland Clinic](https://my.clevelandclinic.org/health/treatments/10922-dental-bonding) | [Composite bonding - Bupa Dental Care](https://www.bupa.co.uk/dental/dental-care/treatments/composite-bonding)

---

## What are Porcelain Veneers?

Veneers involve permanently altering the tooth surface to create a new external layer. Unlike bonding, veneers are fabricated in a dental laboratory based on a mold of your mouth.

To ensure the veneers don't look bulky, a small amount of enamel (usually less than a millimeter) is typically removed from the front of the tooth. This makes the procedure permanent.

### The Benefits of Veneers
- **Durability:** Can last 10 to 15+ years with proper care
- **Stain Resistance:** Porcelain is non-porous and won't stain from coffee or tea
- **Total Transformation:** Ideal for correcting severe issues like misalignment
- **Natural Esthetics:** Mimics light-reflecting properties of natural teeth

**Sources:** [Dental Veneers: Benefits, Procedure, Costs - Healthline](https://www.healthline.com/health/dental-veneers) | [Long-Term Survival of Porcelain Veneers - NIH](https://pmc.ncbi.nlm.nih.gov/articles/PMC7961608/)

---

## At-a-Glance Comparison Table

| Factor | Composite Bonding | Veneers (Porcelain) |
| :--- | :--- | :--- |
| **Treatment Time** | 1 Appointment (~30-60 mins per tooth) | 2-3 Appointments over 2 weeks |
| **Lifespan** | 5 to 8 years | 10 to 15+ years |
| **Tooth Preparation** | Little to none | Enamel removal required |
| **Stain Resistance** | Low (can stain over time) | High (highly resistant) |
| **Reversibility** | Largely reversible | Permanent |
| **Typical UK Cost** | £200 - £450 per tooth | £600 - £1,100 per tooth |

**Sources:** [Composite bonding vs veneers - Bupa](https://www.bupa.co.uk/newsroom/ourviews/composite-bonding-vs-veneers)

---

## Which Option Should You Choose?

### Choose Composite Bonding if:
- You have **minor chips or small gaps**
- You want to **preserve natural enamel**
- You prefer a **lower upfront cost**
- You're looking for a **reversible option**

### Choose Veneers if:
- You want a **major colour or shape change**
- You're planning a **full smile makeover**
- You prioritise **long-term durability**
- You need **colour stability** over many years

---

## Frequently Asked Questions

**Is composite bonding reversible?**

Composite bonding is largely reversible, though the enamel surface may not return to its original state.

**Do veneers ruin teeth?**

Veneers permanently remove enamel, which is irreversible. However, when done properly by a skilled dentist, they protect and enhance your teeth.

**Which lasts longer?**

Porcelain veneers last significantly longer than composite bonding—typically 10-15+ years compared to 5-8 years.

**Can bonding stain?**

Yes. Composite resin absorbs pigments over time from coffee, tea, red wine, and smoking.

**Can veneers be whitened?**

No. Veneers must be replaced to change colour. It's recommended to whiten natural teeth before getting veneers.

---

## Final Thoughts

The right choice depends on the scale of change you want, how long you want results to last, and whether you are comfortable with permanent enamel alteration. Bonding prioritises flexibility and tooth preservation. Veneers prioritise longevity, colour stability, and comprehensive aesthetic change.

**Ready to take the next step?** Schedule a consultation with a cosmetic dentist today to see what your new smile could look like!

---

## References:

[Composite bonding vs veneers: What's the difference? - Bupa](https://www.bupa.co.uk/newsroom/ourviews/composite-bonding-vs-veneers)

[What Is Dental Bonding? - Cleveland Clinic](https://my.clevelandclinic.org/health/treatments/10922-dental-bonding)

[Long-Term Survival and Complication Rates of Porcelain Laminate Veneers - NIH](https://pmc.ncbi.nlm.nih.gov/articles/PMC7961608/)

[Composite bonding - Bupa Dental Care](https://www.bupa.co.uk/dental/dental-care/treatments/composite-bonding)

[Dental Veneers: Benefits, Procedure, Costs, and Results - Healthline](https://www.healthline.com/health/dental-veneers)
`;

const Index = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [appliedRules, setAppliedRules] = useState<{
    gapAnalysisUsed: boolean;
    formatReferenceUsed: boolean;
    contextFilesUsed: boolean;
    contextFileNames: string[];
    keywordsUsed: boolean;
    keywords: string[];
    targetWordCount: number;
    outlineProvided: boolean;
    customInstructionsProvided: boolean;
  } | null>(null);
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
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");

  // Checklist items computation
  const checklistItems = useMemo(() => {
    const hasCompetitorUrls = competitorUrls.some((url) => url.trim());
    const hasGapAnalysis = gapAnalysis.trim().length > 0;
    const hasFormatReference = formatReference.trim().length > 0;
    const hasContextFiles = contextFiles.length > 0;
    const hasTopic = formData.topic.trim().length > 0;
    const hasKeywords = keywords.length > 0;
    const topKeywords = keywords.slice(0, 5);

    return [
      {
        id: "topic",
        label: "Topic entered",
        completed: hasTopic,
        required: true,
      },
      {
        id: "keywords",
        label: hasKeywords 
          ? `Keywords (top 5 will be used): ${topKeywords.join(", ")}${keywords.length > 5 ? ` (+${keywords.length - 5} more)` : ""}`
          : "SEO keywords added (up to 10, top 5 used in article)",
        completed: hasKeywords,
        required: false,
      },
      {
        id: "gap-analysis",
        label: "Content gap analysis completed",
        completed: hasGapAnalysis,
        required: false,
      },
      {
        id: "format-reference",
        label: "Format reference captured (TL;DR as H2, colored tables)",
        completed: hasFormatReference,
        required: false,
      },
      {
        id: "context-files",
        label: hasContextFiles 
          ? `Context files uploaded: ${contextFiles.map(f => f.name).join(", ")}`
          : "Context files uploaded (sources/references will be cited)",
        completed: hasContextFiles,
        required: false,
      },
      {
        id: "word-count",
        label: `Word count selected (${
          formData.length === "short" ? "~500" : 
          formData.length === "medium" ? "~1000" : 
          formData.length === "long" ? "~2000" :
          formData.length === "extended" ? "~3000" : "~3500"
        } words)`,
        completed: true, // Always completed since there's a default
        required: true,
      },
    ];
  }, [competitorUrls, gapAnalysis, formatReference, contextFiles, formData.topic, formData.length, keywords]);

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
    setAppliedRules(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          ...formData,
          keywords: keywords.length > 0 ? keywords.slice(0, 5) : undefined,
          gapAnalysis: gapAnalysis || undefined,
          formatReference: formatReference || undefined,
          contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
        },
      });

      if (error) throw error;

      setGeneratedContent(data.content);
      setAppliedRules(data.appliedRules || null);
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

              {/* Keywords */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  SEO Keywords (up to 10, top 5 used)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Paste comma-separated keywords or add one at a time
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., keyword1, keyword2, keyword3"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && keywordInput.trim()) {
                        e.preventDefault();
                        // Parse comma-separated keywords
                        const newKeywords = keywordInput
                          .split(",")
                          .map((k) => k.trim())
                          .filter((k) => k.length > 0);
                        const availableSlots = 10 - keywords.length;
                        const keywordsToAdd = newKeywords.slice(0, availableSlots);
                        if (keywordsToAdd.length > 0) {
                          setKeywords((prev) => [...prev, ...keywordsToAdd]);
                        }
                        setKeywordInput("");
                      }
                    }}
                    disabled={keywords.length >= 10}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (keywordInput.trim()) {
                        // Parse comma-separated keywords
                        const newKeywords = keywordInput
                          .split(",")
                          .map((k) => k.trim())
                          .filter((k) => k.length > 0);
                        const availableSlots = 10 - keywords.length;
                        const keywordsToAdd = newKeywords.slice(0, availableSlots);
                        if (keywordsToAdd.length > 0) {
                          setKeywords((prev) => [...prev, ...keywordsToAdd]);
                        }
                        setKeywordInput("");
                      }
                    }}
                    disabled={!keywordInput.trim() || keywords.length >= 10}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((keyword, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                          index < 5
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {index < 5 && <span className="text-xs font-medium">#{index + 1}</span>}
                        <span>{keyword}</span>
                        <button
                          type="button"
                          onClick={() => setKeywords((prev) => prev.filter((_, i) => i !== index))}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {keywords.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setKeywords([])}
                        className="text-xs text-muted-foreground hover:text-destructive underline"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                )}
                {keywords.length >= 10 && (
                  <p className="text-xs text-muted-foreground">Maximum 10 keywords reached</p>
                )}
              </div>

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
                    <SelectItem value="extended">Extended (~3000 words)</SelectItem>
                    <SelectItem value="comprehensive">Comprehensive (~3500 words)</SelectItem>
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

              {/* Pre-Generation Checklist */}
              <GenerationChecklist items={checklistItems} />

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !formData.topic.trim()}
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
              <div className="flex gap-2">
                {generatedContent && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Convert markdown to HTML with clickable links
                      const tempDiv = document.createElement("div");
                      const articleElement = document.querySelector("article.prose");
                      if (articleElement) {
                        tempDiv.innerHTML = articleElement.innerHTML;
                        // Ensure all links are properly formatted
                        tempDiv.querySelectorAll("a").forEach((link) => {
                          link.setAttribute("target", "_blank");
                          link.setAttribute("rel", "noopener noreferrer");
                        });
                        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Article</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #333; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    h2 { font-size: 1.5rem; margin-top: 2rem; margin-bottom: 0.5rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
    h3 { font-size: 1.25rem; margin-top: 1.5rem; }
    p { margin: 1rem 0; }
    a { color: #2563eb; text-decoration: underline; }
    a:hover { color: #1d4ed8; }
    ul, ol { padding-left: 1.5rem; margin: 1rem 0; }
    li { margin: 0.5rem 0; }
    table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.75rem; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    strong { font-weight: 600; }
    hr { border: none; border-top: 1px solid #eee; margin: 2rem 0; }
  </style>
</head>
<body>
${tempDiv.innerHTML}
</body>
</html>`;
                        const blob = new Blob([htmlContent], { type: "text/html" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "article.html";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export HTML
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGeneratedContent(SAMPLE_CONTENT)}
                >
                  Load Sample
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto space-y-4">
              {generatedContent ? (
                <>
                  {/* Content Verification Panel */}
                  <ContentVerification content={generatedContent} appliedRules={appliedRules} />
                  
                  {/* Generated Article */}
                  <article className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h2: ({ children, ...props }) => {
                          const text = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                          return <h2 id={text} {...props}>{children}</h2>;
                        },
                        a: ({ href, children, ...props }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {generatedContent}
                    </ReactMarkdown>
                  </article>
                </>
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
