import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  FileText,
  Upload,
  Loader2,
  Wand2,
  Copy,
  Check,
  X,
  Search,
  Tag,
  FileUp,
  ArrowRight,
  Plus,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const OutlineGenerator = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [topic, setTopic] = useState("");
  const [researchContent, setResearchContent] = useState("");
  const [researchFileName, setResearchFileName] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [length, setLength] = useState("long");
  const [outline, setOutline] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    const textExts = ["txt", "md", "markdown", "json"];

    if (textExts.includes(ext || "")) {
      const text = await file.text();
      setResearchContent(text);
      setResearchFileName(file.name);
      toast({ title: "File loaded", description: `${file.name} (${(text.length / 1024).toFixed(1)}KB)` });
    } else if (ext === "pdf" || ext === "docx" || ext === "doc") {
      // For binary files, read as text best-effort or inform user
      try {
        const text = await file.text();
        if (text.trim().length > 100) {
          setResearchContent(text);
          setResearchFileName(file.name);
          toast({ title: "File loaded", description: `${file.name}` });
        } else {
          toast({
            title: "File format note",
            description: "For best results with PDF/DOCX, paste the text content directly instead.",
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: "Could not read file",
          description: "Please paste the research content as text instead.",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "Unsupported format",
        description: "Please use .txt, .md, or paste the content directly.",
        variant: "destructive",
      });
    }

    e.target.value = "";
  }, [toast]);

  const addKeyword = useCallback(() => {
    const trimmed = keywordInput.trim();
    if (!trimmed) return;
    const newKws = trimmed.split(",").map(k => k.trim()).filter(k => k && !keywords.includes(k));
    if (newKws.length > 0) {
      setKeywords(prev => [...prev, ...newKws]);
    }
    setKeywordInput("");
  }, [keywordInput, keywords]);

  const removeKeyword = (kw: string) => {
    setKeywords(prev => prev.filter(k => k !== kw));
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({ title: "Topic required", description: "Please enter a topic for the outline.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-standalone-outline", {
        body: {
          topic,
          researchContent: researchContent || undefined,
          customInstructions: customInstructions || undefined,
          keywords: keywords.length > 0 ? keywords : undefined,
          length,
        },
      });

      if (error) throw error;
      if (data?.outline) {
        setOutline(data.outline);
        toast({ title: "Outline generated", description: "Your article outline is ready." });
      }
    } catch (err) {
      console.error("Outline generation error:", err);
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(outline);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUseInGenerator = () => {
    // Store outline in localStorage for the SEO generator to pick up
    const existing = localStorage.getItem("seo-generator-formData");
    let formData: any = {};
    try { formData = existing ? JSON.parse(existing) : {}; } catch {}
    formData.topic = topic;
    formData.outline = outline;
    localStorage.setItem("seo-generator-formData", JSON.stringify(formData));
    if (keywords.length > 0) {
      localStorage.setItem("seo-generator-keywords", JSON.stringify(keywords));
    }
    navigate("/");
    toast({ title: "Outline transferred", description: "Topic, outline & keywords sent to SEO Content Generator." });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
              <Sparkles className="h-4 w-4" />
              SEO Content Generator
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { navigate("/"); setTimeout(() => { /* converter tab handled by Index */ }, 100); }} className="gap-2">
              <FileUp className="h-4 w-4" />
              Convert to Article
            </Button>
            <Button variant="default" size="sm" className="gap-2">
              <FileText className="h-4 w-4" />
              Outline Generator
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/product-descriptions")} className="gap-2">
              <Tag className="h-4 w-4" />
              Product Descriptions
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/keyword-research")} className="gap-2">
              <Search className="h-4 w-4" />
              Keyword Research
            </Button>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-[1800px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Inputs */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary" />
                  Outline Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Topic */}
                <div className="space-y-1.5">
                  <Label htmlFor="outline-topic">Article Topic *</Label>
                  <Input
                    id="outline-topic"
                    placeholder="e.g. Best Dental Tourism Destinations in Europe"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="bg-input border-2 border-input-border"
                  />
                </div>

                {/* Target Length */}
                <div className="space-y-1.5">
                  <Label>Target Article Length</Label>
                  <Select value={length} onValueChange={setLength}>
                    <SelectTrigger className="bg-input border-2 border-input-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short (~500 words)</SelectItem>
                      <SelectItem value="medium">Medium (~1,000 words)</SelectItem>
                      <SelectItem value="medium-long">Medium-Long (~1,500 words)</SelectItem>
                      <SelectItem value="long">Long (~2,000 words)</SelectItem>
                      <SelectItem value="extended">Extended (~3,000 words)</SelectItem>
                      <SelectItem value="comprehensive">Comprehensive (~3,500 words)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Deep Research Upload */}
                <div className="space-y-1.5">
                  <Label>Deep Research File</Label>
                  <p className="text-xs text-muted-foreground">
                    Upload research from Perplexity, ChatGPT, or other AI tools (.txt, .md)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2" asChild>
                      <label className="cursor-pointer">
                        <Upload className="h-4 w-4" />
                        Upload File
                        <input
                          type="file"
                          className="hidden"
                          accept=".txt,.md,.markdown,.json,.pdf,.docx"
                          onChange={handleFileUpload}
                        />
                      </label>
                    </Button>
                    {researchFileName && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        <span className="truncate max-w-[200px]">{researchFileName}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => { setResearchContent(""); setResearchFileName(""); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {!researchFileName && (
                    <Textarea
                      placeholder="Or paste your deep research content here..."
                      className="min-h-[120px] resize-none bg-input border-2 border-input-border mt-2"
                      value={researchContent}
                      onChange={(e) => setResearchContent(e.target.value)}
                    />
                  )}
                  {researchContent && (
                    <p className="text-xs text-muted-foreground">
                      {(researchContent.length / 1024).toFixed(1)}KB of research loaded
                    </p>
                  )}
                </div>

                <Separator />

                {/* Keywords */}
                <div className="space-y-1.5">
                  <Label>SEO Keywords (optional)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add keywords (comma-separated)"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                      className="bg-input border-2 border-input-border"
                    />
                    <Button variant="outline" size="icon" onClick={addKeyword}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {keywords.map((kw) => (
                        <Badge key={kw} variant="secondary" className="gap-1 pr-1">
                          {kw}
                          <button onClick={() => removeKeyword(kw)} className="ml-0.5 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Custom Instructions */}
                <div className="space-y-1.5">
                  <Label>Custom Instructions (optional)</Label>
                  <Textarea
                    placeholder="e.g. Focus on cost comparisons, include a section about recovery times, target audience is UK patients..."
                    className="min-h-[80px] resize-none bg-input border-2 border-input-border"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                  />
                </div>

                {/* Generate Button */}
                <Button
                  className="w-full gap-2"
                  size="lg"
                  onClick={handleGenerate}
                  disabled={isGenerating || !topic.trim()}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating Outline...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      Generate Outline
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Output */}
          <div className="space-y-4">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Generated Outline
                  </CardTitle>
                  {outline && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                      <Button size="sm" className="gap-1.5" onClick={handleUseInGenerator}>
                        <ArrowRight className="h-3.5 w-3.5" />
                        Use in SEO Generator
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {outline ? (
                  <ScrollArea className="h-[calc(100vh-280px)]">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{outline}</ReactMarkdown>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                    <FileText className="h-12 w-12 mb-4 opacity-30" />
                    <p className="text-sm">Your generated outline will appear here</p>
                    <p className="text-xs mt-1">Upload deep research + enter a topic to get started</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OutlineGenerator;
