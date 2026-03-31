import { useEffect, useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChevronDown, TrendingUp, ArrowRight, Search, Bookmark, FileText, Download, CheckCircle2, Plus, Loader2, Lightbulb, Pencil, Star,
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
  allClusters?: KeywordCluster[];
  onReassignKeyword?: (clusterTopic: string, keyword: string, fromIdeaTitle: string, toIdeaTitle: string) => void;
  onCreateIdeaFromKeyword?: (clusterTopic: string, keyword: string) => void;
  generatingIdeaForKw?: string | null;
  onEditIdeaTitle?: (clusterTopic: string, oldTitle: string, newTitle: string) => void;
}

const EditableTitleCQ = ({ title, onSave, className = "" }: { title: string; onSave: (newTitle: string) => void; className?: string }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValue(title); }, [title]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== title) onSave(value.trim());
    else setValue(title);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(title); setEditing(false); } }}
        className={`text-lg font-semibold bg-transparent border-b border-primary outline-none w-full ${className}`}
      />
    );
  }

  return (
    <div className="group flex items-center gap-1 min-w-0">
      <h4 className={`text-lg font-semibold truncate cursor-pointer hover:underline decoration-dashed underline-offset-2 ${className}`} onClick={() => setEditing(true)}>{title}</h4>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer" onClick={() => setEditing(true)} />
    </div>
  );
};

const ContentQueue = ({ queuedIdeas, onUseForArticle, onRemoveFromQueue, formatVolume, projectName, allClusters, onReassignKeyword, onCreateIdeaFromKeyword, generatingIdeaForKw, onEditIdeaTitle }: ContentQueueProps) => {
  const { toast } = useToast();
  const [fallbackDownload, setFallbackDownload] = useState<{ url: string; filename: string } | null>(null);
  // Map of ideaKey → ISO date string when marked done
  const [doneIdeas, setDoneIdeas] = useState<Map<string, string>>(() => {
    try {
      const saved = localStorage.getItem("content-queue-done");
      if (!saved) return new Map();
      const parsed = JSON.parse(saved);
      // Migrate from old Set (array of strings) to Map (object of key→date)
      if (Array.isArray(parsed)) {
        const migrated = new Map<string, string>();
        parsed.forEach((key: string) => migrated.set(key, ""));
        return migrated;
      }
      return new Map(Object.entries(parsed));
    } catch { return new Map(); }
  });
  const [favoriteIdeas, setFavoriteIdeas] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("content-queue-favorites");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [expandedDone, setExpandedDone] = useState<Set<string>>(new Set());
  const [completedSectionOpen, setCompletedSectionOpen] = useState(true);

  const toggleExpanded = useCallback((ideaKey: string) => {
    setExpandedDone(prev => {
      const next = new Set(prev);
      if (next.has(ideaKey)) next.delete(ideaKey);
      else next.add(ideaKey);
      return next;
    });
  }, []);

  const toggleDone = useCallback((ideaKey: string) => {
    setDoneIdeas(prev => {
      const next = new Map(prev);
      if (next.has(ideaKey)) next.delete(ideaKey);
      else next.set(ideaKey, new Date().toISOString());
      localStorage.setItem("content-queue-done", JSON.stringify(Object.fromEntries(next)));
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((ideaKey: string) => {
    setFavoriteIdeas(prev => {
      const next = new Set(prev);
      if (next.has(ideaKey)) next.delete(ideaKey);
      else next.add(ideaKey);
      localStorage.setItem("content-queue-favorites", JSON.stringify([...next]));
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (fallbackDownload?.url?.startsWith("blob:")) URL.revokeObjectURL(fallbackDownload.url);
    };
  }, [fallbackDownload]);

  const renderKeywordBadge = (kw: string, ki: number, vol: number | undefined, cluster: KeywordCluster, idea: BlogIdea) => {
    const siloCluster = allClusters?.find(c => c.topic === cluster.topic);
    const otherIdeas = siloCluster?.blog_ideas?.filter(bi => bi.title !== idea.title) || [];
    const canReassign = onReassignKeyword && (otherIdeas.length > 0 || onCreateIdeaFromKeyword);

    if (!canReassign) {
      return (
        <Badge key={ki} variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 font-medium">
          {kw}
          {vol != null && vol > 0 && <span className="text-primary/70 font-semibold">{vol.toLocaleString()}</span>}
        </Badge>
      );
    }

    return (
      <Popover key={ki}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium hover:bg-muted/70 hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer">
            {kw}
            {vol != null && vol > 0 && <span className="text-primary/70 font-semibold">{vol.toLocaleString()}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-72 p-2">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Reassign "{kw}" to:</p>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {otherIdeas.map((targetIdea, targetIdx) => (
              <button
                key={targetIdx}
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors whitespace-normal break-words leading-snug"
                onClick={() => onReassignKeyword!(cluster.topic, kw, idea.title, targetIdea.title)}
              >
                <span className="text-muted-foreground mr-1">{targetIdx + 1}.</span>
                {targetIdea.title}
              </button>
            ))}
          </div>
          {onCreateIdeaFromKeyword && (
            <div className="border-t mt-1.5 pt-1.5">
              <button
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-primary/10 transition-colors flex items-center gap-1.5 text-primary font-medium"
                disabled={generatingIdeaForKw === kw}
                onClick={() => onCreateIdeaFromKeyword(cluster.topic, kw)}
              >
                {generatingIdeaForKw === kw ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Create new blog idea
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  };

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
      "Value Promises", "Status", "Completed Date", "Month"
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

      const ideaKey = `${cluster.topic}::${idea.title}`;
      const doneDate = doneIdeas.get(ideaKey);
      const isDone = doneIdeas.has(ideaKey);
      const formattedDate = doneDate ? new Date(doneDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
      const monthYear = doneDate ? new Date(doneDate).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "";

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
        isDone ? "Done" : "",
        formattedDate,
        monthYear
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

  // Separate done vs pending items
  const doneItems = queuedIdeas.filter(item => doneIdeas.has(item.ideaKey));
  const pendingItems = queuedIdeas.filter(item => !doneIdeas.has(item.ideaKey));

  // Helper to compute total volume for an idea
  const getIdeaVolume = (item: QueuedIdea) => {
    const vl = item.cluster.keyword_volumes || {};
    return (item.idea.target_keywords || []).reduce((s, kw) => s + (vl[kw] ?? vl[kw.toLowerCase()] ?? 0), 0);
  };

  // Separate favorites from regular pending
  const favoritePending = pendingItems.filter(item => favoriteIdeas.has(item.ideaKey))
    .sort((a, b) => getIdeaVolume(b) - getIdeaVolume(a));
  const regularPending = pendingItems.filter(item => !favoriteIdeas.has(item.ideaKey));

  // Group regular pending by silo
  const bySilo = new Map<string, QueuedIdea[]>();
  for (const item of regularPending) {
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
            {/* Done items at the very top */}
            {doneItems.length > 0 && (() => {
              const grandTotalVol = doneItems.reduce((sum, { cluster, idea }) => {
                const vl = cluster.keyword_volumes || {};
                return sum + (idea.target_keywords || []).reduce((s, kw) => s + (vl[kw] ?? vl[kw.toLowerCase()] ?? 0), 0);
              }, 0);
              return (
              <div className="space-y-2">
                <div
                  className="flex items-center gap-2 cursor-pointer select-none"
                  onClick={() => setCompletedSectionOpen(prev => !prev)}
                >
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !completedSectionOpen && "-rotate-90")} />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    ✅ Completed ({doneItems.length})
                  </span>
                  {grandTotalVol > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                      {formatVolume(grandTotalVol)} total vol
                    </Badge>
                  )}
                </div>
                {completedSectionOpen && doneItems.map(({ cluster, idea, ideaKey }) => {
                  const volLookup = cluster.keyword_volumes || {};
                  const sortedKws = [...(idea.target_keywords || [])].sort(
                    (a, b) => (volLookup[b] ?? volLookup[b.toLowerCase()] ?? 0) - (volLookup[a] ?? volLookup[a.toLowerCase()] ?? 0)
                  );
                  const totalVol = sortedKws.reduce((s, kw) => s + (volLookup[kw] ?? volLookup[kw.toLowerCase()] ?? 0), 0);
                  const isExpanded = expandedDone.has(ideaKey);

                  return (
                    <div key={ideaKey} className={cn(
                      "border rounded-md transition-colors",
                      "bg-green-100 border-green-400 dark:bg-green-900/50 dark:border-green-600"
                    )}>
                      <div className="space-y-0">
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <div
                            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                            onClick={() => toggleExpanded(ideaKey)}
                          >
                            <CheckCircle2 className="h-5 w-5 text-green-700 dark:text-green-400 fill-current shrink-0" />
                            {onEditIdeaTitle ? (
                              <div onClick={e => e.stopPropagation()}>
                                <EditableTitleCQ title={idea.title} onSave={(newTitle) => onEditIdeaTitle(cluster.topic, idea.title, newTitle)} className="text-green-800 dark:text-green-300" />
                              </div>
                            ) : (
                              <h4 className="text-lg font-semibold text-green-800 dark:text-green-300 truncate">{idea.title}</h4>
                            )}
                            <Badge variant="outline" className="text-[10px] shrink-0">{cluster.topic}</Badge>
                            {totalVol > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">
                                <TrendingUp className="h-2.5 w-2.5" />
                                {totalVol.toLocaleString()} vol
                              </span>
                            )}
                            {(() => {
                              const doneDate = doneIdeas.get(ideaKey);
                              if (!doneDate) return null;
                              const d = new Date(doneDate);
                              return (
                                <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                                  {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                </span>
                              );
                            })()}
                            <ChevronDown className={cn(
                              "h-4 w-4 text-green-600 dark:text-green-400 transition-transform shrink-0",
                              isExpanded && "rotate-180"
                            )} />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-green-700 dark:text-green-400" onClick={() => toggleDone(ideaKey)}>
                              <CheckCircle2 className="h-3 w-3 fill-current" /> Undo
                            </Button>
                            <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-destructive" onClick={() => onRemoveFromQueue(ideaKey)}>
                              <Bookmark className="h-3 w-3 fill-current" /> Remove
                            </Button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="px-4 pb-3 space-y-2 border-t border-green-300 dark:border-green-700 pt-2">
                            <p className="text-xs text-muted-foreground">{idea.description}</p>
                            {idea.reason && <p className="text-xs italic text-primary/70">⚡ {idea.reason}</p>}
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
                                    return renderKeywordBadge(kw, ki, vol, cluster, idea);
                                  })}
                                </div>
                              </div>
                            )}
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
                    </div>
                  );
                })}
              </div>
              );
            })()}

            {/* Priority (favorited) items outside silos */}
            {favoritePending.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Priority Articles ({favoritePending.length})
                  </span>
                  {(() => {
                    const totalFavVol = favoritePending.reduce((s, item) => s + getIdeaVolume(item), 0);
                    return totalFavVol > 0 ? (
                      <Badge variant="outline" className="text-[10px]">
                        <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                        {formatVolume(totalFavVol)} total vol
                      </Badge>
                    ) : null;
                  })()}
                </div>
                {favoritePending.map(({ cluster, idea, ideaKey }) => {
                  const volLookup = cluster.keyword_volumes || {};
                  const sortedKws = [...(idea.target_keywords || [])].sort(
                    (a, b) => (volLookup[b] ?? volLookup[b.toLowerCase()] ?? 0) - (volLookup[a] ?? volLookup[a.toLowerCase()] ?? 0)
                  );
                  const totalVol = sortedKws.reduce((s, kw) => s + (volLookup[kw] ?? volLookup[kw.toLowerCase()] ?? 0), 0);
                  const isExpanded = expandedDone.has(ideaKey);

                  return (
                    <div key={ideaKey} className="border rounded-md border-amber-400 bg-amber-50/30 dark:bg-amber-900/10 dark:border-amber-600">
                      <div className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleExpanded(ideaKey)}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <button
                            className="shrink-0"
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(ideaKey); }}
                            title="Remove from favorites"
                          >
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500 transition-colors" />
                          </button>
                          {onEditIdeaTitle ? (
                            <div onClick={e => e.stopPropagation()}>
                              <EditableTitleCQ title={idea.title} onSave={(newTitle) => onEditIdeaTitle(cluster.topic, idea.title, newTitle)} />
                            </div>
                          ) : (
                            <h4 className="text-lg font-semibold truncate">{idea.title}</h4>
                          )}
                          <Badge variant="outline" className="text-[10px] shrink-0">{cluster.topic}</Badge>
                          {totalVol > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">
                              <TrendingUp className="h-2.5 w-2.5" />
                              {totalVol.toLocaleString()} vol
                            </span>
                          )}
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-180")} />
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2" onClick={() => onUseForArticle(cluster, idea)}>
                            Use for Article <ArrowRight className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-muted-foreground" onClick={() => toggleDone(ideaKey)}>
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </Button>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-destructive" onClick={() => onRemoveFromQueue(ideaKey)}>
                            <Bookmark className="h-3 w-3 fill-current" />
                          </Button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-2 border-t pt-2">
                          <p className="text-xs text-muted-foreground">{idea.description}</p>
                          {idea.reason && <p className="text-xs italic text-primary/70">⚡ {idea.reason}</p>}
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-muted-foreground" onClick={() => copyDeepResearch(cluster, idea)}>
                                    <Search className="h-3 w-3" /> Deep Research
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  <p className="text-xs">Copy a deep research prompt for this blog idea</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
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
                                  return renderKeywordBadge(kw, ki, vol, cluster, idea);
                                })}
                              </div>
                            </div>
                          )}
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
            )}

            {/* Pending items grouped by silo */}
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
                  const isExpanded = expandedDone.has(ideaKey);

                  return (
                    <div key={ideaKey} className="border rounded-md bg-background">
                      {/* Collapsed header */}
                      <div className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleExpanded(ideaKey)}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <button
                            className="shrink-0"
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(ideaKey); }}
                            title={favoriteIdeas.has(ideaKey) ? "Remove from favorites" : "Add to favorites"}
                          >
                            <Star className={cn("h-4 w-4 transition-colors", favoriteIdeas.has(ideaKey) ? "text-amber-500 fill-amber-500" : "text-muted-foreground/40 hover:text-amber-400")} />
                          </button>
                          {onEditIdeaTitle ? (
                            <div onClick={e => e.stopPropagation()}>
                              <EditableTitleCQ title={idea.title} onSave={(newTitle) => onEditIdeaTitle(cluster.topic, idea.title, newTitle)} />
                            </div>
                          ) : (
                            <h4 className="text-lg font-semibold truncate">{idea.title}</h4>
                          )}
                          {totalVol > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold shrink-0">
                              <TrendingUp className="h-2.5 w-2.5" />
                              {totalVol.toLocaleString()} vol
                            </span>
                          )}
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-180")} />
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2" onClick={() => onUseForArticle(cluster, idea)}>
                            Use for Article <ArrowRight className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-muted-foreground" onClick={() => toggleDone(ideaKey)}>
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </Button>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-destructive" onClick={() => onRemoveFromQueue(ideaKey)}>
                            <Bookmark className="h-3 w-3 fill-current" />
                          </Button>
                        </div>
                      </div>
                      {/* Expandable details */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-2 border-t pt-2">
                          <p className="text-xs text-muted-foreground">{idea.description}</p>
                          {idea.reason && <p className="text-xs italic text-primary/70">⚡ {idea.reason}</p>}
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-muted-foreground" onClick={() => copyDeepResearch(cluster, idea)}>
                                    <Search className="h-3 w-3" /> Deep Research
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  <p className="text-xs">Copy a deep research prompt for this blog idea</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
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
                                  return renderKeywordBadge(kw, ki, vol, cluster, idea);
                                })}
                              </div>
                            </div>
                          )}
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
