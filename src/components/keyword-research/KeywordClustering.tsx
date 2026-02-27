import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload, Layers, ChevronDown, ChevronRight, Loader2, Square,
  TrendingUp, FileText, Copy, Download, BarChart3, Target, Info, Lightbulb, Trash2, RefreshCw, ArrowRight, Search
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Check } from "lucide-react";

const USED_IDEAS_KEY = "kw-used-blog-ideas";

const getUsedIdeas = (): Set<string> => {
  try {
    const stored = localStorage.getItem(USED_IDEAS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
};

const markIdeaUsed = (ideaKey: string) => {
  const used = getUsedIdeas();
  used.add(ideaKey);
  localStorage.setItem(USED_IDEAS_KEY, JSON.stringify([...used]));
};

const makeIdeaKey = (clusterTopic: string, ideaTitle: string) =>
  `${clusterTopic}::${ideaTitle}`;

interface KeywordWithVolume {
  keyword: string;
  volume: number | null;
}

interface BlogIdea {
  title: string;
  description: string;
  reason: string;
  target_keywords?: string[];
}

interface KeywordCluster {
  topic: string;
  description: string;
  estimated_monthly_volume: number;
  keywords: string[];
  keyword_volumes?: Record<string, number>;
  content_type: string;
  difficulty: "low" | "medium" | "high";
  priority: "high" | "medium" | "low";
  blog_ideas?: BlogIdea[];
}

interface ClusteringResult {
  clusters: KeywordCluster[];
  total_keywords_clustered: number;
  unclustered: string[];
}

interface SavedClustering {
  id: string;
  created_at: string;
  name: string | null;
  input_keywords: string[];
  result: ClusteringResult;
}

const difficultyColors: Record<string, string> = {
  low: "text-green-600 bg-green-500/10 border-green-500/20",
  medium: "text-yellow-600 bg-yellow-500/10 border-yellow-500/20",
  high: "text-red-600 bg-red-500/10 border-red-500/20",
};

const priorityColors: Record<string, string> = {
  high: "text-primary bg-primary/10 border-primary/20",
  medium: "text-muted-foreground bg-muted border-muted",
  low: "text-muted-foreground/60 bg-muted/50 border-muted/50",
};

const contentTypeLabels: Record<string, string> = {
  blog_post: "Blog Post",
  landing_page: "Landing Page",
  guide: "Guide",
  comparison: "Comparison",
  listicle: "Listicle",
  how_to: "How-To",
};

const KeywordClustering = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [keywordsWithVolume, setKeywordsWithVolume] = useState<KeywordWithVolume[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<"classify" | "enrich" | null>(null);
  const [result, setResult] = useState<ClusteringResult | null>(null);
  const [usedIdeas, setUsedIdeas] = useState<Set<string>>(getUsedIdeas);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [rawInput, setRawInput] = useState("");
  const [savedResults, setSavedResults] = useState<SavedClustering[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);

  // Load saved results on mount
  useEffect(() => {
    loadSavedResults();
  }, []);

  const loadSavedResults = async () => {
    const { data, error } = await supabase
      .from("keyword_clustering_results")
      .select("*")
      .order("created_at", { ascending: false });
    if (data && !error) {
      setSavedResults(data.map(d => ({
        ...d,
        result: d.result as unknown as ClusteringResult,
      })));
      // Auto-load most recent
      if (data.length > 0 && !result) {
        const latest = data[0];
        setResult(latest.result as unknown as ClusteringResult);
        setRawInput(latest.input_keywords.join("\n"));
        setActiveResultId(latest.id);
        const clusters = (latest.result as unknown as ClusteringResult).clusters;
        setExpandedClusters(new Set(clusters.slice(0, 3).map(c => c.topic)));
      }
    }
  };

  const saveResult = async (keywords: string[], clusteringResult: ClusteringResult) => {
    const name = `${clusteringResult.clusters.length} silos · ${keywords.length} keywords`;
    const { data, error } = await supabase
      .from("keyword_clustering_results")
      .insert({ input_keywords: keywords, result: clusteringResult as any, name })
      .select()
      .single();
    if (data && !error) {
      setActiveResultId(data.id);
      loadSavedResults();
    }
  };

  const deleteResult = async (id: string) => {
    await supabase.from("keyword_clustering_results").delete().eq("id", id);
    if (activeResultId === id) {
      setResult(null);
      setActiveResultId(null);
      setRawInput("");
    }
    loadSavedResults();
    toast({ title: "Analysis deleted" });
  };

  const loadResult = (saved: SavedClustering) => {
    setResult(saved.result);
    setRawInput(saved.input_keywords.join("\n"));
    setActiveResultId(saved.id);
    setExpandedClusters(new Set(saved.result.clusters.slice(0, 3).map(c => c.topic)));
  };

  const parseKeywordsFromText = (text: string): string[] => {
    return text
      .split(/[\n,]+/)
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 1 && k.length < 200);
  };

  const parseCSVRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const parseCSVKeywords = (text: string): KeywordWithVolume[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = parseCSVRow(lines[0]).map(h => h.replace(/^"|"$/g, "").toLowerCase());
    let kwIdx = headers.findIndex(c => c === "keyword");
    if (kwIdx === -1) kwIdx = headers.findIndex(c => c.includes("keyword"));
    if (kwIdx === -1) kwIdx = headers.findIndex(c => c.includes("top queries"));
    if (kwIdx === -1) kwIdx = 0;

    const volIdx = headers.findIndex(c => c === "volume");

    const results: KeywordWithVolume[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVRow(lines[i]);
      const kw = cells[kwIdx]?.replace(/^"|"$/g, "").trim();
      const vol = volIdx >= 0 ? parseInt(cells[volIdx]?.replace(/[^0-9]/g, ""), 10) : null;
      if (kw && kw.length > 1 && kw.length < 200) {
        results.push({ keyword: kw.toLowerCase(), volume: isNaN(vol as number) ? null : vol });
      }
    }
    return results;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSVKeywords(text);
      if (parsed.length === 0) {
        toast({ title: "No keywords found", description: "Could not extract keywords from CSV", variant: "destructive" });
        return;
      }
      setKeywordsWithVolume(parsed);
      setRawInput(parsed.map(p => p.keyword).join("\n"));
      const hasVolume = parsed.some(p => p.volume !== null);
      toast({ title: `${parsed.length} keywords loaded from ${file.name}`, description: hasVolume ? "Search volume data detected" : undefined });
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const analyzeKeywords = async () => {
    const keywords = [...new Set(parseKeywordsFromText(rawInput))];
    if (keywords.length < 10) {
      toast({ title: "Need more keywords", description: "Please provide at least 10 keywords to cluster.", variant: "destructive" });
      return;
    }

    const volumeMap: Record<string, number> = {};
    for (const item of keywordsWithVolume) {
      if (item.volume !== null) volumeMap[item.keyword] = item.volume;
    }

    setIsAnalyzing(true);
    setResult(null);
    setActiveResultId(null);
    setAnalysisStage("classify");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // PASS 1: Classify keywords into topics
      const classifyResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cluster-keywords-classify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            keywords,
            volumeMap: Object.keys(volumeMap).length > 0 ? volumeMap : undefined,
          }),
          signal: controller.signal,
        }
      );

      if (!classifyResponse.ok) {
        const errData = await classifyResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Classification failed: ${classifyResponse.status}`);
      }

      const classifyData = await classifyResponse.json();
      toast({ title: `${classifyData.clusters.length} topic silos identified`, description: "Now generating blog ideas & metadata..." });

      // PASS 2: Enrich clusters with metadata & blog ideas
      setAnalysisStage("enrich");
      const enrichResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cluster-keywords-enrich`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ clusters: classifyData.clusters }),
          signal: controller.signal,
        }
      );

      if (!enrichResponse.ok) {
        const errData = await enrichResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Enrichment failed: ${enrichResponse.status}`);
      }

      const enrichData = await enrichResponse.json();
      const finalResult: ClusteringResult = {
        clusters: enrichData.clusters,
        total_keywords_clustered: classifyData.total_keywords_clustered,
        unclustered: classifyData.unclustered || [],
      };

      setResult(finalResult);
      setExpandedClusters(new Set(finalResult.clusters.slice(0, 3).map(c => c.topic)));
      toast({ title: "Clustering complete!", description: `${finalResult.clusters.length} topic silos with blog ideas from ${keywords.length} keywords` });
      
      // Auto-save to database
      await saveResult(keywords, finalResult);
    } catch (err: any) {
      if (err.name === "AbortError") {
        toast({ title: "Analysis stopped" });
      } else {
        toast({ title: "Clustering failed", description: err.message, variant: "destructive" });
      }
    } finally {
      abortRef.current = null;
      setIsAnalyzing(false);
      setAnalysisStage(null);
    }
  };

  const reEnrichClusters = async () => {
    if (!result) return;
    setIsAnalyzing(true);
    setAnalysisStage("enrich");

    try {
      const enrichResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cluster-keywords-enrich`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ clusters: result.clusters }),
        }
      );

      if (!enrichResponse.ok) {
        const errData = await enrichResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Enrichment failed: ${enrichResponse.status}`);
      }

      const enrichData = await enrichResponse.json();
      const updatedResult: ClusteringResult = {
        ...result,
        clusters: enrichData.clusters,
      };

      setResult(updatedResult);
      toast({ title: "Blog ideas regenerated", description: "Target keywords now included for each blog idea." });

      // Update saved result in database
      if (activeResultId) {
        await supabase
          .from("keyword_clustering_results")
          .update({ result: updatedResult as any })
          .eq("id", activeResultId);
        loadSavedResults();
      }
    } catch (err: any) {
      toast({ title: "Re-enrichment failed", description: err.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
      setAnalysisStage(null);
    }
  };

  const sendToGenerator = (cluster: KeywordCluster, idea: BlogIdea) => {
    const instructions = [
      `Cluster: ${cluster.topic} — ${cluster.description}`,
      `Blog idea: ${idea.description}`,
      `Strategic reason: ${idea.reason}`,
    ].join("\n\n");

    const formData = {
      topic: idea.title,
      length: "medium",
      outline: "",
      instructions,
    };

    localStorage.setItem("seo-generator-formData", JSON.stringify(formData));
    localStorage.setItem("seo-generator-keywords", JSON.stringify(idea.target_keywords || []));

    const key = makeIdeaKey(cluster.topic, idea.title);
    markIdeaUsed(key);
    setUsedIdeas(prev => new Set(prev).add(key));

    toast({ title: "Pre-filled article settings", description: `Topic: ${idea.title}` });
    navigate("/");
  };

  const toggleCluster = (topic: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic); else next.add(topic);
      return next;
    });
  };

  const formatVolume = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toString();
  };

  const exportClustersCSV = () => {
    if (!result) return;
    const rows = [["Topic", "Description", "Est. Monthly Volume", "Keywords Count", "Content Type", "Difficulty", "Priority", "Keywords", "Keyword Volumes", "Blog Ideas"]];
    result.clusters.forEach(c => {
      const volStr = c.keyword_volumes 
        ? c.keywords.map(kw => `${kw}: ${c.keyword_volumes?.[kw] ?? "n/a"}`).join("; ")
        : "";
      const blogStr = c.blog_ideas 
        ? c.blog_ideas.map((b, i) => `${i+1}. ${b.title} — ${b.description} (${b.reason}) [Keywords: ${b.target_keywords?.join(", ") || "n/a"}]`).join(" | ")
        : "";
      rows.push([c.topic, c.description, c.estimated_monthly_volume.toString(), c.keywords.length.toString(), c.content_type, c.difficulty, c.priority, c.keywords.join("; "), volStr, blogStr]);
    });
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keyword-clusters.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalVolume = result?.clusters.reduce((s, c) => s + c.estimated_monthly_volume, 0) || 0;
  const keywordCount = parseKeywordsFromText(rawInput).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Keyword Clustering & Topic Silos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Saved results selector */}
        {savedResults.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Previous Analyses</label>
            <div className="flex flex-wrap gap-2">
              {savedResults.map(saved => (
                <div key={saved.id} className="flex items-center gap-1">
                  <Badge
                    variant={activeResultId === saved.id ? "default" : "outline"}
                    className="text-xs cursor-pointer hover:bg-primary/20 transition-colors"
                    onClick={() => loadResult(saved)}
                  >
                    {saved.name || "Untitled"} · {new Date(saved.created_at).toLocaleDateString()}
                  </Badge>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteResult(saved.id); }}
                    className="text-muted-foreground/50 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Upload CSV
            </Button>
            {keywordCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {keywordCount} keywords ready
                {keywordsWithVolume.some(k => k.volume !== null) && " (with volume data)"}
              </Badge>
            )}
          </div>
          <Textarea
            placeholder={"Paste your keywords here, one per line or comma-separated...\n\ne.g.:\nbest hiking boots\nhiking gear for beginners\nwaterproof hiking shoes\nhiking backpack reviews\n..."}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            className="min-h-[120px] text-sm font-mono"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={analyzeKeywords}
              disabled={keywordCount < 10 || isAnalyzing}
              className="gap-2"
            >
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              {isAnalyzing ? "Analyzing..." : "Cluster Keywords"}
            </Button>
            {isAnalyzing && (
              <Button variant="destructive" size="sm" onClick={() => abortRef.current?.abort()} className="gap-2">
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            )}
            {keywordCount > 0 && keywordCount < 10 && (
              <span className="text-xs text-muted-foreground">Need at least 10 keywords</span>
            )}
          </div>
        </div>

        {/* Loading */}
        {isAnalyzing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {analysisStage === "classify" 
                ? `Pass 1: Classifying ${keywordCount} keywords into topic silos...`
                : `Pass 2: Generating blog ideas & metadata for each silo...`}
            </div>
            <Progress value={analysisStage === "enrich" ? 60 : 20} className="h-1" />
          </div>
        )}

        {/* Results */}
        {result && !isAnalyzing && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-xs">
                  {result.clusters.length} topic silos
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {result.total_keywords_clustered} keywords clustered
                </Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  <TrendingUp className="h-3 w-3" />
                  ~{formatVolume(totalVolume)} est. monthly volume
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={reEnrichClusters} disabled={isAnalyzing} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate Blog Ideas
                </Button>
                <Button variant="outline" size="sm" onClick={exportClustersCSV} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </div>
            </div>

            {/* Cluster cards */}
            <div className="space-y-2">
              {result.clusters.map((cluster, idx) => (
                <Collapsible
                  key={cluster.topic}
                  open={expandedClusters.has(cluster.topic)}
                  onOpenChange={() => toggleCluster(cluster.topic)}
                >
                  <Card className="border">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-xs font-bold text-muted-foreground w-6 shrink-0">#{idx + 1}</span>
                          {expandedClusters.has(cluster.topic) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="font-medium text-sm truncate">{cluster.topic}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Badge variant="outline" className="text-xs gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {formatVolume(cluster.estimated_monthly_volume)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {cluster.keywords.length} kw
                          </Badge>
                          <Badge className={`text-xs border ${difficultyColors[cluster.difficulty]}`} variant="outline">
                            {cluster.difficulty}
                          </Badge>
                          <Badge className={`text-xs border ${priorityColors[cluster.priority]}`} variant="outline">
                            {cluster.priority}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {contentTypeLabels[cluster.content_type] || cluster.content_type}
                          </Badge>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4 px-4 space-y-4">
                        <p className="text-sm text-muted-foreground">{cluster.description}</p>
                        
                        {/* Keywords column with volume */}
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Keywords</h4>
                          <div className="border rounded-md overflow-hidden">
                            <div className="grid grid-cols-[1fr_auto] gap-x-4 px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                              <span>Keyword</span>
                              <span className="text-right">Volume</span>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                              {cluster.keywords.map((kw, i) => {
                                const vol = cluster.keyword_volumes?.[kw];
                                return (
                                  <div
                                    key={i}
                                    className="grid grid-cols-[1fr_auto] gap-x-4 px-3 py-1.5 text-sm border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                                    onClick={() => {
                                      navigator.clipboard.writeText(kw);
                                      toast({ title: "Copied", description: kw });
                                    }}
                                  >
                                    <span className="truncate">{kw}</span>
                                    <span className="text-right text-muted-foreground tabular-nums">
                                      {vol != null ? formatVolume(vol) : "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Blog Ideas */}
                        {cluster.blog_ideas && cluster.blog_ideas.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                              <Lightbulb className="h-3.5 w-3.5" />
                              Blog Ideas
                            </h4>
                            <div className="space-y-2">
                              {cluster.blog_ideas.map((idea, i) => {
                                const ideaKey = makeIdeaKey(cluster.topic, idea.title);
                                const isUsed = usedIdeas.has(ideaKey);
                                return (
                                <div key={i} className={`border rounded-md p-3 space-y-1 transition-colors ${isUsed ? "border-green-500 bg-green-50 dark:bg-green-950/30" : ""}`}>
                                  <div className="flex items-start gap-2">
                                    {isUsed ? (
                                      <span className="mt-0.5 shrink-0 flex items-center justify-center h-4 w-4 rounded-full bg-green-500/20 text-green-600">
                                        <Check className="h-3 w-3" />
                                      </span>
                                    ) : (
                                      <span className="text-xs font-bold text-primary mt-0.5 shrink-0">{i + 1}.</span>
                                    )}
                                    <div className="space-y-1 min-w-0 flex-1">
                                      <p className={`text-sm font-medium leading-snug ${isUsed ? "text-green-700 dark:text-green-400" : ""}`}>{idea.title}</p>
                                      <p className="text-xs text-muted-foreground">{idea.description}</p>
                                      <p className="text-xs text-primary/80 italic">↳ {idea.reason}</p>
                                      {idea.target_keywords && idea.target_keywords.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {idea.target_keywords.map((kw, ki) => (
                                            <span key={ki} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{kw}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-1 shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-1 text-xs h-7 px-2"
                                        onClick={() => sendToGenerator(cluster, idea)}
                                      >
                                        Use for Article
                                        <ArrowRight className="h-3 w-3" />
                                      </Button>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="gap-1 text-xs h-7 px-2 text-muted-foreground"
                                              onClick={() => {
                                                const prompt = `Act as an expert SEO content researcher. I'm planning to write an article titled "${idea.title}".

Topic cluster: ${cluster.topic} — ${cluster.description}

Article concept: ${idea.description}
Strategic angle: ${idea.reason}

Target keywords: ${idea.target_keywords?.join(", ") || "N/A"}

Please conduct deep research on this topic and provide:

1. **Key facts & statistics** — Recent, citable data points relevant to this article
2. **Expert perspectives** — Notable opinions or frameworks from authorities in this space
3. **Common misconceptions** — What do people get wrong about this topic?
4. **Unique angles** — Underexplored subtopics or fresh perspectives not covered by top-ranking content
5. **Competitor content gaps** — What are the top-ranking articles missing?
6. **Real-world examples & case studies** — Specific examples that would strengthen the article
7. **Questions people ask** — Related questions from forums, PAA boxes, and communities
8. **Recommended structure** — Suggested H2/H3 outline based on search intent and content depth

Focus on providing actionable research that will help create a comprehensive, differentiated article.`;
                                                navigator.clipboard.writeText(prompt);
                                                toast({ title: "Research prompt copied!", description: "Paste into ChatGPT, Perplexity, or any AI research tool." });
                                              }}
                                            >
                                              <Search className="h-3 w-3" />
                                              Deep Research
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent side="left">
                                            <p className="text-xs">Copy a deep research prompt for this blog idea</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default KeywordClustering;
