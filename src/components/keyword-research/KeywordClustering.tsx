import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Upload, Layers, ChevronDown, ChevronRight, Loader2, Square,
  TrendingUp, FileText, Copy, Download, BarChart3, Target, Info, Lightbulb
} from "lucide-react";

interface KeywordWithVolume {
  keyword: string;
  volume: number | null;
}

interface BlogIdea {
  title: string;
  description: string;
  reason: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [keywordsWithVolume, setKeywordsWithVolume] = useState<KeywordWithVolume[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ClusteringResult | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());

  const [rawInput, setRawInput] = useState("");

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
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cluster-keywords`,
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

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      const data: ClusteringResult = await response.json();
      setResult(data);
      setExpandedClusters(new Set(data.clusters.slice(0, 3).map(c => c.topic)));
      toast({ title: "Clustering complete!", description: `${data.clusters.length} topic silos identified from ${keywords.length} keywords` });
    } catch (err: any) {
      if (err.name === "AbortError") {
        toast({ title: "Analysis stopped" });
      } else {
        toast({ title: "Clustering failed", description: err.message, variant: "destructive" });
      }
    } finally {
      abortRef.current = null;
      setIsAnalyzing(false);
    }
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
        ? c.blog_ideas.map((b, i) => `${i+1}. ${b.title} — ${b.description} (${b.reason})`).join(" | ")
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
              Analyzing {keywordCount} keywords and grouping into topic silos...
            </div>
            <Progress value={undefined} className="h-1" />
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
              <Button variant="outline" size="sm" onClick={exportClustersCSV} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
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
                              {cluster.blog_ideas.map((idea, i) => (
                                <div key={i} className="border rounded-md p-3 space-y-1">
                                  <div className="flex items-start gap-2">
                                    <span className="text-xs font-bold text-primary mt-0.5 shrink-0">{i + 1}.</span>
                                    <div className="space-y-1 min-w-0">
                                      <p className="text-sm font-medium leading-snug">{idea.title}</p>
                                      <p className="text-xs text-muted-foreground">{idea.description}</p>
                                      <p className="text-xs text-primary/80 italic">↳ {idea.reason}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
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
