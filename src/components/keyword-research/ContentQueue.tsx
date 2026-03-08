import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  ChevronDown, TrendingUp, ArrowRight, Search, Bookmark, FileText, Download, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  silo_instructions?: string;
}

interface QueuedIdea {
  cluster: KeywordCluster;
  idea: BlogIdea;
  ideaKey: string;
}

interface ContentQueueProps {
  queuedIdeas: QueuedIdea[];
  onUseForArticle: (cluster: KeywordCluster, idea: BlogIdea) => void;
  onRemoveFromQueue: (ideaKey: string) => void;
  formatVolume: (v: number) => string;
  projectName?: string;
}

const ContentQueue = ({ queuedIdeas, onUseForArticle, onRemoveFromQueue, formatVolume, projectName }: ContentQueueProps) => {
  const { toast } = useToast();
  const [fallbackDownload, setFallbackDownload] = useState<{ url: string; filename: string } | null>(null);
  const [doneIdeas, setDoneIdeas] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("content-queue-done");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const toggleDone = useCallback((ideaKey: string) => {
    setDoneIdeas(prev => {
      const next = new Set(prev);
      if (next.has(ideaKey)) next.delete(ideaKey);
      else next.add(ideaKey);
      localStorage.setItem("content-queue-done", JSON.stringify([...next]));
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (fallbackDownload?.url?.startsWith("blob:")) URL.revokeObjectURL(fallbackDownload.url);
    };
  }, [fallbackDownload]);

  if (queuedIdeas.length === 0) return (
    <Card className="border-dashed border-muted-foreground/30">
      <CardContent className="py-8 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Content Queue is empty</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Bookmark blog ideas using the <Bookmark className="h-3 w-3 inline" /> icon to add them here</p>
      </CardContent>
    </Card>
  );

  const copyDeepResearch = (cluster: KeywordCluster, idea: BlogIdea) => {
    const prompt = `Act as an expert SEO content researcher. I'm planning to write an article titled "${idea.title}".

Topic cluster: ${cluster.topic} — ${cluster.description}

Article concept: ${idea.description}
Strategic angle: ${idea.reason}

Target keywords: ${idea.target_keywords?.join(", ") || "N/A"}

Value promises this article must deliver:
${idea.value_promises?.map((vp, i) => `${i + 1}. ${vp}`).join("\n") || "N/A"}

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
    toast({ title: "Copied!", description: "Deep research prompt copied to clipboard." });
  };

  const exportContentQueueCSV = () => {
    const rows: string[][] = [[
      "Silo", "Silo Description", "Silo Volume", "Silo Difficulty", "Silo Priority",
      "Article Title", "Article Description", "Strategic Angle",
      "Target Keywords", "Keyword Volumes", "Total Keyword Volume",
      "Value Promises", "Status"
    ]];

    for (const { cluster, idea } of queuedIdeas) {
      const volLookup: Record<string, number> = {};
      if (cluster.keyword_volumes) {
        for (const [k, v] of Object.entries(cluster.keyword_volumes)) {
          volLookup[k.toLowerCase().trim()] = v;
        }
      }
      const kws = idea.target_keywords || [];
      const kwVolPairs = kws.map((kw) => {
        const vol = volLookup[kw.toLowerCase().trim()];
        return vol != null && vol > 0 ? `${kw} (${vol.toLocaleString()})` : kw;
      });
      const totalVol = kws.reduce((sum, kw) => sum + (volLookup[kw.toLowerCase().trim()] || 0), 0);

      rows.push([
        cluster.topic,
        cluster.description,
        cluster.estimated_monthly_volume.toString(),
        cluster.difficulty,
        cluster.priority,
        idea.title,
        idea.description,
        idea.reason || "",
        kws.join("; "),
        kwVolPairs.join("; "),
        totalVol.toString(),
        (idea.value_promises || []).join("; "),
        doneIdeas.has(`${cluster.topic}::${idea.title}`) ? "Done" : ""
      ]);
    }

    const csv = rows.map((r) => r.map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const safeName = (projectName || "content-queue").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").toLowerCase();
    const filename = `${safeName}-content-queue.csv`;

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const blobUrl = URL.createObjectURL(blob);
    const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + csv)}`;

    if (fallbackDownload?.url?.startsWith("blob:")) URL.revokeObjectURL(fallbackDownload.url);
    // Always show a manual, explicit download link that users can click directly
    setFallbackDownload({ url: blobUrl, filename });

    const triggerDownload = (href: string, targetDoc: Document) => {
      const a = targetDoc.createElement("a");
      a.href = href;
      a.download = filename;
      a.rel = "noopener";
      a.style.display = "none";
      targetDoc.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 0);
    };

    // Try current document first (most reliable user-gesture context)
    try {
      triggerDownload(blobUrl, document);
    } catch {
      // no-op
    }

    // Try top document too when accessible
    try {
      if (window.top?.document?.body) triggerDownload(blobUrl, window.top.document);
    } catch {
      // no-op
    }

    // Final fallback: data URL in new tab (works in stricter sandbox setups)
    try {
      window.open(dataUrl, "_blank", "noopener,noreferrer");
    } catch {
      // manual button remains available
    }

    toast({
      title: "Spreadsheet ready",
      description: "If it didn't auto-download, click 'Download File' next to Export Spreadsheet."
    });
  };

  // Group by silo
  const bySilo = new Map<string, QueuedIdea[]>();
  for (const item of queuedIdeas) {
    const key = item.cluster.topic;
    if (!bySilo.has(key)) bySilo.set(key, []);
    bySilo.get(key)!.push(item);
  }

  return (
    <Collapsible defaultOpen>
      <Card className="border-primary/30 bg-primary/[0.02]">
        <CardHeader className="py-3">
          <div className="w-full flex items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Content Queue {projectName && <span className="text-muted-foreground font-normal">— {projectName}</span>}
              <Badge variant="default" className="text-[10px]">{queuedIdeas.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-7 px-2"
                onClick={exportContentQueueCSV}
              >
                <Download className="h-3 w-3" />
                Export Spreadsheet
              </Button>
              {fallbackDownload && (
                <Button variant="secondary" size="sm" className="gap-1.5 text-xs h-7 px-2" asChild>
                  <a href={fallbackDownload.url} download={fallbackDownload.filename}>
                    <Download className="h-3 w-3" />
                    Download File
                  </a>
                </Button>
              )}
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {[...bySilo.entries()].map(([siloTopic, ideas]) => (
              <div key={siloTopic} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Silo: {siloTopic}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                    {formatVolume(ideas[0].cluster.estimated_monthly_volume)}
                  </Badge>
                </div>
                {ideas.map(({ cluster, idea, ideaKey }) => {
                  const volLookup = cluster.keyword_volumes || {};
                  const sortedKws = [...(idea.target_keywords || [])].sort(
                    (a, b) => (volLookup[b] ?? volLookup[b.toLowerCase()] ?? 0) - (volLookup[a] ?? volLookup[a.toLowerCase()] ?? 0)
                  );
                  const totalVol = sortedKws.reduce((s, kw) => s + (volLookup[kw] ?? volLookup[kw.toLowerCase()] ?? 0), 0);

                    const isDone = doneIdeas.has(ideaKey);

                  return (
                    <div key={ideaKey} className={cn(
                      "border rounded-md transition-colors",
                      isDone
                        ? "bg-green-100 border-green-400 dark:bg-green-900/50 dark:border-green-600"
                        : "bg-background"
                    )}>
                      {/* Collapsed done state: just title + toggle */}
                      {isDone ? (
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <CheckCircle2 className="h-5 w-5 text-green-700 dark:text-green-400 fill-current shrink-0" />
                            <h4 className="text-lg font-semibold text-green-800 dark:text-green-300 truncate">{idea.title}</h4>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs h-7 px-2 text-green-700 dark:text-green-400"
                              onClick={() => toggleDone(ideaKey)}
                            >
                              <CheckCircle2 className="h-3 w-3 fill-current" />
                              Undo
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs h-7 px-2 text-destructive"
                              onClick={() => onRemoveFromQueue(ideaKey)}
                            >
                              <Bookmark className="h-3 w-3 fill-current" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-1.5">
                          <h4 className="text-lg font-semibold">{idea.title}</h4>
                          <p className="text-xs text-muted-foreground">{idea.description}</p>
                          {idea.reason && (
                            <p className="text-xs italic text-primary/70">⚡ {idea.reason}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs h-7 px-2"
                            onClick={() => onUseForArticle(cluster, idea)}
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
                                  onClick={() => copyDeepResearch(cluster, idea)}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs h-7 px-2 text-muted-foreground"
                            onClick={() => toggleDone(ideaKey)}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Mark Done
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs h-7 px-2 text-destructive"
                            onClick={() => onRemoveFromQueue(ideaKey)}
                          >
                            <Bookmark className="h-3 w-3 fill-current" />
                            Remove
                          </Button>
                        </div>
                      </div>

                      {/* Keywords with volumes */}
                      {sortedKws.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                              <TrendingUp className="h-2.5 w-2.5" />
                              {totalVol > 0 ? `${totalVol.toLocaleString()} vol` : "— vol"}
                            </span>
                            {sortedKws.slice(0, 3).map((kw, i) => (
                              <span key={i} className="text-sm font-semibold text-foreground">{kw}</span>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {sortedKws.map((kw, ki) => {
                              const vol = volLookup[kw] ?? volLookup[kw.toLowerCase()];
                              return (
                                <Badge key={ki} variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 font-medium">
                                  {kw}
                                  {vol != null && vol > 0 && (
                                    <span className="text-primary/70 font-semibold">{vol.toLocaleString()}</span>
                                  )}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Value promises */}
                      {idea.value_promises && idea.value_promises.length > 0 && (
                        <div className="space-y-0.5">
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
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default ContentQueue;
