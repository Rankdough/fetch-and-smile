import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Search, Sparkles, Copy, Download, Trash2,
  ChevronDown, ChevronRight, Clock, Loader2, Square
} from "lucide-react";
import QuestionnaireUpload, { BrandAnalysis } from "@/components/keyword-research/QuestionnaireUpload";
import SeedKeywordsUpload, { SeedFile } from "@/components/keyword-research/SeedKeywordsUpload";

interface KeywordCategory {
  name: string;
  terms: string[];
}

interface KeywordResult {
  categories: KeywordCategory[];
}

interface SavedResearch {
  id: string;
  topic: string;
  context: string | null;
  results: KeywordResult;
  created_at: string;
}

const KeywordResearch = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<KeywordResult | null>(null);
  const [currentTopic, setCurrentTopic] = useState("");
  const [savedResearch, setSavedResearch] = useState<SavedResearch[]>([]);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [brandAnalysis, setBrandAnalysis] = useState<BrandAnalysis | null>(null);
  const [questionnaireText, setQuestionnaireText] = useState("");
  const [seedFiles, setSeedFiles] = useState<SeedFile[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadSavedResearch();
  }, []);

  const loadSavedResearch = async () => {
    setIsLoadingSaved(true);
    const { data, error } = await supabase
      .from("keyword_research" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setSavedResearch(data.map((d: any) => ({
        id: d.id,
        topic: d.topic,
        context: d.context,
        results: d.results as KeywordResult,
        created_at: d.created_at,
      })));
    }
    setIsLoadingSaved(false);
  };

  const generateKeywords = async () => {
    const effectiveTopic = topic.trim() || (brandAnalysis?.suggested_topic) || "";
    if (!effectiveTopic) return;
    setIsGenerating(true);
    setResults(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Build context from manual input + questionnaire analysis
      let fullContext = context.trim() || "";
      if (brandAnalysis) {
        const brandContext = `Brand: ${brandAnalysis.brand}. Industry: ${brandAnalysis.industry}. Target Audience: ${brandAnalysis.target_audience}. Products/Services: ${brandAnalysis.products_services}. Goals: ${brandAnalysis.goals}. Competitors: ${brandAnalysis.competitors.join(", ")}. Key Insights: ${brandAnalysis.key_insights.join("; ")}`;
        fullContext = fullContext ? `${fullContext}\n\n${brandContext}` : brandContext;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-keyword-universe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            topic: effectiveTopic,
            context: fullContext || undefined,
            brandAnalysis: brandAnalysis || undefined,
            seedKeywords: seedFiles.length > 0
              ? [...new Set(seedFiles.flatMap((f) => f.keywords))]
              : undefined,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      const data = await response.json();
      const error = null;

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const keywordResults = data.results as KeywordResult;
      setResults(keywordResults);
      setCurrentTopic(effectiveTopic);
      if (!topic.trim()) setTopic(effectiveTopic);
      setOpenCategories(new Set(keywordResults.categories.map((c) => c.name)));

      // Save to database
      const { error: saveError } = await supabase
        .from("keyword_research" as any)
        .insert({
          topic: effectiveTopic,
          context: context.trim() || null,
          results: keywordResults as any,
        });

      if (saveError) {
        console.error("Failed to save:", saveError);
      } else {
        loadSavedResearch();
      }

      toast({ title: "Keyword universe generated!", description: `${getTotalTerms(keywordResults)} terms across ${keywordResults.categories.length} categories` });
    } catch (err: any) {
      if (err.name === "AbortError") {
        toast({ title: "Generation stopped" });
      } else {
        console.error(err);
        toast({ title: "Generation failed", description: err.message || "Please try again", variant: "destructive" });
      }
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  };

  const stopGenerating = () => {
    abortControllerRef.current?.abort();
  };

  const getTotalTerms = (r: KeywordResult) => r.categories.reduce((sum, c) => sum + c.terms.length, 0);

  const copyAll = () => {
    if (!results) return;
    const allTerms = results.categories.flatMap((c) => c.terms).join("\n");
    navigator.clipboard.writeText(allTerms);
    toast({ title: "Copied!", description: "All terms copied to clipboard" });
  };

  const exportCSV = () => {
    if (!results) return;
    const rows = [["Category", "Term"]];
    results.categories.forEach((c) => c.terms.forEach((t) => rows.push([c.name, t])));
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-${currentTopic.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadResearch = (saved: SavedResearch) => {
    setResults(saved.results);
    setCurrentTopic(saved.topic);
    setTopic(saved.topic);
    setContext(saved.context || "");
    setOpenCategories(new Set(saved.results.categories.map((c) => c.name)));
  };

  const deleteResearch = async (id: string) => {
    const { error } = await supabase.from("keyword_research" as any).delete().eq("id", id);
    if (!error) {
      setSavedResearch((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Deleted" });
    }
  };

  const toggleCategory = (name: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Keyword Research</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Generate Semantic Keyword Universe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Topic *</label>
              <Input
                placeholder="e.g. video games, baseball, digital marketing..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isGenerating && generateKeywords()}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Context / Guidance (optional)</label>
              <Textarea
                placeholder="e.g. Focus on competitive gaming and esports terminology..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={generateKeywords} disabled={(!topic.trim() && !brandAnalysis) || isGenerating} className="gap-2">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isGenerating ? "Generating..." : "Generate Keywords"}
              </Button>
              {isGenerating && (
                <Button variant="destructive" size="sm" onClick={stopGenerating} className="gap-2">
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </Button>
              )}
              {!brandAnalysis && (
                <QuestionnaireUpload
                  analysis={null}
                  onAnalysisComplete={(analysis, rawText) => {
                    setBrandAnalysis(analysis);
                    setQuestionnaireText(rawText);
                    if (!topic.trim()) setTopic(analysis.suggested_topic || "");
                  }}
                  onClear={() => {
                    setBrandAnalysis(null);
                    setQuestionnaireText("");
                  }}
                />
              )}
            </div>
            <SeedKeywordsUpload seedFiles={seedFiles} onSeedFilesChange={setSeedFiles} />
          </CardContent>
        </Card>

        {/* Brand Analysis Card */}
        {brandAnalysis && (
          <QuestionnaireUpload
            analysis={brandAnalysis}
            onAnalysisComplete={(analysis, rawText) => {
              setBrandAnalysis(analysis);
              setQuestionnaireText(rawText);
            }}
            onClear={() => {
              setBrandAnalysis(null);
              setQuestionnaireText("");
            }}
          />
        )}

        {/* Loading skeleton */}
        {isGenerating && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {/* Results */}
        {results && !isGenerating && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">"{currentTopic}"</h2>
                <Badge variant="secondary">
                  {getTotalTerms(results)} terms · {results.categories.length} categories
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyAll} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" />
                  Copy All
                </Button>
                <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {results.categories.map((category) => (
                <Collapsible
                  key={category.name}
                  open={openCategories.has(category.name)}
                  onOpenChange={() => toggleCategory(category.name)}
                >
                  <Card>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {openCategories.has(category.name) ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-medium text-sm">{category.name}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {category.terms.length} terms
                          </Badge>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {category.terms.map((term, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs"
                              onClick={() => {
                                navigator.clipboard.writeText(term);
                                toast({ title: "Copied", description: term });
                              }}
                            >
                              {term}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          </div>
        )}

        {/* Saved Research */}
        {savedResearch.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Previous Research
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {savedResearch.map((saved) => (
                  <div
                    key={saved.id}
                    className="flex items-center justify-between p-3 rounded-md border hover:bg-accent/50 transition-colors"
                  >
                    <button
                      className="flex-1 text-left"
                      onClick={() => loadResearch(saved)}
                    >
                      <span className="font-medium text-sm">{saved.topic}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {getTotalTerms(saved.results)} terms · {new Date(saved.created_at).toLocaleDateString()}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteResearch(saved.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoadingSaved && !savedResearch.length && (
          <Skeleton className="h-24 w-full" />
        )}
      </main>
    </div>
  );
};

export default KeywordResearch;
