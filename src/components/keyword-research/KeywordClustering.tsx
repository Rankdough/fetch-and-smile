import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
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
  TrendingUp, FileText, Copy, Download, BarChart3, Target, Info, Lightbulb, Trash2, RefreshCw, ArrowRight, Search, Bookmark, Clock
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Check } from "lucide-react";

const USED_IDEAS_KEY = "kw-used-blog-ideas";
const BOOKMARKED_IDEAS_KEY = "kw-bookmarked-blog-ideas";

const getStoredSet = (key: string): Set<string> => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
};

const toggleStoredSet = (key: string, value: string): Set<string> => {
  const set = getStoredSet(key);
  if (set.has(value)) set.delete(value); else set.add(value);
  localStorage.setItem(key, JSON.stringify([...set]));
  return new Set(set);
};

const getUsedIdeas = (): Set<string> => getStoredSet(USED_IDEAS_KEY);
const getBookmarkedIdeas = (): Set<string> => getStoredSet(BOOKMARKED_IDEAS_KEY);

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
  value_promises?: string[];
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
  const [enrichingSilo, setEnrichingSilo] = useState<string | null>(null);
  const [analysisStage, setAnalysisStage] = useState<"classify" | "enrich" | null>(null);
  const [result, setResult] = useState<ClusteringResult | null>(null);
  const [usedIdeas, setUsedIdeas] = useState<Set<string>>(getUsedIdeas);
  const [bookmarkedIdeas, setBookmarkedIdeas] = useState<Set<string>>(getBookmarkedIdeas);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [rawInput, setRawInput] = useState("");
  const [projectName, setProjectName] = useState("");
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

  const saveResult = async (keywords: string[], clusteringResult: ClusteringResult, topicName?: string) => {
    // Derive a meaningful name from the clusters or keywords
    let name = topicName || "";
    if (!name) {
      // Try to find a common theme from top 3 cluster topics
      const topTopics = clusteringResult.clusters
        .sort((a, b) => b.estimated_monthly_volume - a.estimated_monthly_volume)
        .slice(0, 3)
        .map(c => c.topic);
      // Use the most common single word across cluster topics, or just use the first topic
      name = topTopics[0] || `${clusteringResult.clusters.length} silos`;
    }
    const displayName = `${name}`;
    const { data, error } = await supabase
      .from("keyword_clustering_results")
      .insert({ input_keywords: keywords, result: clusteringResult as any, name: displayName })
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
      await saveResult(keywords, finalResult, projectName.trim() || undefined);
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

  const reEnrichSingleCluster = async (clusterTopic: string) => {
    if (!result) return;
    const cluster = result.clusters.find(c => c.topic === clusterTopic);
    if (!cluster) return;

    setEnrichingSilo(clusterTopic);
    try {
      const enrichResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cluster-keywords-enrich`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ clusters: [cluster] }),
        }
      );

      if (!enrichResponse.ok) {
        const errData = await enrichResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Enrichment failed: ${enrichResponse.status}`);
      }

      const enrichData = await enrichResponse.json();
      const enrichedCluster = enrichData.clusters?.[0];
      if (!enrichedCluster) throw new Error("No cluster returned");

      const updatedResult: ClusteringResult = {
        ...result,
        clusters: result.clusters.map(c =>
          c.topic === clusterTopic ? { ...c, ...enrichedCluster } : c
        ),
      };

      setResult(updatedResult);
      toast({ title: `"${clusterTopic}" ideas regenerated` });

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
      setEnrichingSilo(null);
    }
  };

  const sendToGenerator = (cluster: KeywordCluster, idea: BlogIdea) => {
    // Clear ALL old generator state first to avoid stale data
    const keysToRemove = [
      "seo-generator-formData", "seo-generator-internalLinks", "seo-generator-competitorUrls",
      "seo-generator-formatUrl", "seo-generator-formatReference", "seo-generator-gapAnalysis",
      "seo-generator-contextFiles", "seo-generator-keywords", "seo-generator-ctaUrl",
      "seo-generator-useKnowledgeBase", "seo-generator-toneProfileId", "seo-generator-valuePromise",
      "seo-generator-selectedAngles", "seo-generator-selectedGapInsights", "seo-generator-articleImages",
      "seo-generator-generatedContent", "seo-generator-appliedRules", "seo-generator-generatedCTAs",
      "seo-generator-originalContent", "seo-generator-valuePromiseClaims", "seo-generator-colorPalette",
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));

    const formData = {
      topic: idea.title,
      length: "medium",
      outline: "",
      instructions: "",
    };

    localStorage.setItem("seo-generator-formData", JSON.stringify(formData));
    localStorage.setItem("seo-generator-keywords", JSON.stringify(idea.target_keywords || []));

    // Pre-fill value promise claims (up to 5 from blog idea)
    if (idea.value_promises && idea.value_promises.length > 0) {
      const claims = [...idea.value_promises.slice(0, 5)];
      while (claims.length < 5) claims.push("");
      localStorage.setItem("seo-generator-valuePromiseClaims", JSON.stringify(claims));
    }

    const key = makeIdeaKey(cluster.topic, idea.title);
    markIdeaUsed(key);
    setUsedIdeas(prev => new Set(prev).add(key));

    toast({ title: "Pre-filled article settings", description: `Topic: ${idea.title}` });
    // Use full page navigation to ensure Index mounts fresh with new localStorage values
    window.location.href = "/";
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
        ? c.blog_ideas.map((b, i) => `${i+1}. ${b.title} — ${b.description} (${b.reason}) [Keywords: ${b.target_keywords?.join(", ") || "n/a"}] [Value Promises: ${b.value_promises?.join("; ") || "n/a"}]`).join(" | ")
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
        {/* Project name input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Project Name</label>
          <Input
            placeholder="e.g. pickleball, lacrosse, hiking gear..."
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Saved results - Previous Research style */}
        {savedResults.length > 0 && (
          <Card className="border-dashed">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                Previous Research
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {savedResults.map(saved => {
                  const clusterCount = saved.result?.clusters?.length || 0;
                  const kwCount = saved.input_keywords?.length || 0;
                  return (
                    <div
                      key={saved.id}
                      className={`flex items-center justify-between p-3 rounded-md border hover:bg-accent/50 transition-colors cursor-pointer ${activeResultId === saved.id ? "border-primary bg-primary/5" : ""}`}
                      onClick={() => {
                        loadResult(saved);
                        setProjectName(saved.name || "");
                      }}
                    >
                      <div className="flex-1 text-left">
                        <span className="font-medium text-sm">{saved.name || "Untitled"}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {kwCount} terms · {clusterCount} silos · {new Date(saved.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); deleteResult(saved.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
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
                          {(() => {
                            const ideas = cluster.blog_ideas || [];
                            const usedCount = ideas.filter(idea => usedIdeas.has(makeIdeaKey(cluster.topic, idea.title))).length;
                            if (ideas.length === 0) return null;
                            return (
                              <Badge
                                variant="outline"
                                className={`text-xs gap-1 shrink-0 ${
                                  usedCount === ideas.length
                                    ? "border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30"
                                    : usedCount > 0
                                    ? "border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30"
                                    : ""
                                }`}
                              >
                                <FileText className="h-3 w-3" />
                                {usedCount}/{ideas.length} articles
                              </Badge>
                            );
                          })()}
                          {(() => {
                            const ideas = cluster.blog_ideas || [];
                            const bmCount = ideas.filter(idea => bookmarkedIdeas.has(makeIdeaKey(cluster.topic, idea.title))).length;
                            if (bmCount === 0) return null;
                            return (
                              <Badge
                                variant="outline"
                                className="text-xs gap-1 shrink-0 border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
                              >
                                <Bookmark className="h-3 w-3 fill-current" />
                                {bmCount} saved
                              </Badge>
                            );
                          })()}
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
                        
                        {/* Keywords column with volume - collapsible, collapsed by default */}
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-1.5 group">
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Keywords</h4>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{cluster.keywords.length}</Badge>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="border rounded-md overflow-hidden mt-2">
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
                          </CollapsibleContent>
                        </Collapsible>

                        {/* Blog Ideas */}
                        {cluster.blog_ideas && cluster.blog_ideas.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <Lightbulb className="h-3.5 w-3.5" />
                                Blog Ideas
                              </h4>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-xs h-6 px-2 text-muted-foreground"
                                disabled={enrichingSilo !== null || isAnalyzing}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  reEnrichSingleCluster(cluster.topic);
                                }}
                              >
                                {enrichingSilo === cluster.topic ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                {enrichingSilo === cluster.topic ? "Regenerating..." : "Regenerate Ideas"}
                              </Button>
                            </div>
                            <div className="space-y-2">
                              {cluster.blog_ideas.map((idea, i) => {
                                const ideaKey = makeIdeaKey(cluster.topic, idea.title);
                                const isUsed = usedIdeas.has(ideaKey);
                                return (
                                <div key={i} className={`border rounded-md p-3 space-y-1 transition-colors ${isUsed ? "border-green-500 bg-green-50 dark:bg-green-950/30" : ""}`}>
                                  <div className="flex items-start gap-2">
                                    <button
                                      className={`mt-0.5 shrink-0 flex items-center justify-center h-5 w-5 rounded-full border transition-colors ${
                                        isUsed
                                          ? "bg-green-500 border-green-500 text-white hover:bg-green-600"
                                          : "border-muted-foreground/30 text-muted-foreground hover:border-green-500 hover:text-green-500"
                                      }`}
                                      title={isUsed ? "Mark as not done" : "Mark as done"}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setUsedIdeas(toggleStoredSet(USED_IDEAS_KEY, ideaKey));
                                      }}
                                    >
                                      {isUsed ? (
                                        <Check className="h-3 w-3" />
                                      ) : (
                                        <span className="text-[10px] font-bold">{i + 1}</span>
                                      )}
                                    </button>
                                    <div className="space-y-1 min-w-0 flex-1">
                                      <p className={`text-sm font-medium leading-snug ${isUsed ? "text-green-700 dark:text-green-400" : ""}`}>{idea.title}</p>
                                      <p className="text-xs text-muted-foreground">{idea.description}</p>
                                      <p className="text-xs text-primary/80 italic">↳ {idea.reason}</p>
                                      {idea.target_keywords && idea.target_keywords.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {idea.target_keywords.map((kw, ki) => {
                                            const vol = cluster.keyword_volumes?.[kw];
                                            return (
                                              <span key={ki} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                                                {kw}
                                                {vol != null && (
                                                  <span className="text-primary/70 font-semibold">{vol.toLocaleString()}</span>
                                                )}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      )}
                                      {idea.value_promises && idea.value_promises.length > 0 && (
                                        <div className="mt-1.5 space-y-0.5">
                                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Value Promises</span>
                                          {idea.value_promises.map((vp, vi) => (
                                            <div key={vi} className="flex items-start gap-1.5">
                                              <span className="text-[10px] text-primary mt-0.5">✓</span>
                                              <span className="text-[11px] text-muted-foreground leading-tight">{vp}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-1 shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`gap-1 text-xs h-7 px-2 ${bookmarkedIdeas.has(ideaKey) ? "text-amber-600" : "text-muted-foreground"}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setBookmarkedIdeas(toggleStoredSet(BOOKMARKED_IDEAS_KEY, ideaKey));
                                        }}
                                      >
                                        <Bookmark className={`h-3 w-3 ${bookmarkedIdeas.has(ideaKey) ? "fill-current" : ""}`} />
                                        {bookmarkedIdeas.has(ideaKey) ? "Saved" : "Save"}
                                      </Button>
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

Value promises this article must deliver:
${idea.value_promises?.map((vp, i) => `${i+1}. ${vp}`).join("\n") || "N/A"}

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
