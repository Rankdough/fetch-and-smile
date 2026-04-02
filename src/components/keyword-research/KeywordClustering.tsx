import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  TrendingUp, FileText, Copy, Download, BarChart3, Target, Info, Lightbulb, Trash2, RefreshCw, ArrowRight, Search, Bookmark, Clock, Star, Plus, ArrowDownToLine, Pencil, Merge, CheckCircle2, FilePlus2, Tag
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ContentQueue from "./ContentQueue";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const USED_IDEAS_KEY = "kw-used-blog-ideas";
const BOOKMARKED_IDEAS_KEY_PREFIX = "kw-bookmarked-blog-ideas";
const FAVORITED_CLUSTERS_KEY = "kw-favorited-clusters";
const DEMOTED_CLUSTERS_KEY = "kw-demoted-clusters";

const getBookmarkedKey = (projectId: string | null) =>
  projectId ? `${BOOKMARKED_IDEAS_KEY_PREFIX}::${projectId}` : BOOKMARKED_IDEAS_KEY_PREFIX;

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
const getBookmarkedIdeas = (projectId: string | null): Set<string> => {
  const key = getBookmarkedKey(projectId);
  const current = getStoredSet(key);
  // Migrate old non-namespaced bookmarks to the current project if they exist
  if (projectId) {
    const oldKey = BOOKMARKED_IDEAS_KEY_PREFIX;
    const old = getStoredSet(oldKey);
    if (old.size > 0) {
      const merged = new Set([...current, ...old]);
      localStorage.setItem(key, JSON.stringify([...merged]));
      localStorage.removeItem(oldKey);
      return merged;
    }
  }
  return current;
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
  value_promises?: string[];
}

interface LandingPageIdea {
  title: string;
  description: string;
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
  landing_page_ideas?: LandingPageIdea[];
  question_overrides?: string[]; // keywords manually moved to "questions"
  silo_instructions?: string; // quick instructions for blog generation in this silo
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
  client_tag: string | null;
}

const EditableTitle = ({ title, onSave, className = "" }: { title: string; onSave: (newTitle: string) => void; className?: string }) => {
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
        className={`text-base font-semibold leading-snug bg-transparent border-b border-primary outline-none w-full ${className}`}
      />
    );
  }

  return (
    <div className="group flex items-center gap-1 min-w-0">
      <p className={`text-base font-semibold leading-snug cursor-pointer hover:underline decoration-dashed underline-offset-2 ${className}`} onClick={() => setEditing(true)}>{title}</p>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer" onClick={() => setEditing(true)} />
    </div>
  );
};

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
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [keywordsWithVolume, setKeywordsWithVolume] = useState<KeywordWithVolume[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [enrichingSilo, setEnrichingSilo] = useState<string | null>(null);
  const [generatingLandingPages, setGeneratingLandingPages] = useState<string | null>(null);
  const [analysisStage, setAnalysisStage] = useState<"classify" | "enrich" | null>(null);
  const [result, setResult] = useState<ClusteringResult | null>(null);
  const [usedIdeas, setUsedIdeas] = useState<Set<string>>(getUsedIdeas);
  const [bookmarkedIdeas, setBookmarkedIdeas] = useState<Set<string>>(() => getBookmarkedIdeas(null));
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(() => {
    const silo = searchParams.get("silo");
    return silo ? new Set([silo]) : new Set();
  });
  const [expandedKeywordSilos, setExpandedKeywordSilos] = useState<Set<string>>(new Set());
  const [kwFilterMode, setKwFilterMode] = useState<Record<string, "all" | "generic" | "questions">>({});
  const [siloSortMode, setSiloSortMode] = useState<"favorites" | "volume">("favorites");
  const [favoritedClusters, setFavoritedClusters] = useState<Set<string>>(() => getStoredSet(FAVORITED_CLUSTERS_KEY));
  const [demotedClusters, setDemotedClusters] = useState<Set<string>>(() => getStoredSet(DEMOTED_CLUSTERS_KEY));
  const [rawInput, setRawInput] = useState("");
  const [projectName, setProjectName] = useState("");
  const [clientTag, setClientTag] = useState("");
  const [clientTagFilter, setClientTagFilter] = useState<string | null>(null);
  const [suggestedSilos, setSuggestedSilos] = useState("");
  const [savedResults, setSavedResults] = useState<SavedClustering[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(() => searchParams.get("project"));
  const [userSuggestedSilos, setUserSuggestedSilos] = useState<string[]>([]);
  const [isResultsOpen, setIsResultsOpen] = useState(() => searchParams.get("view") === "results");
  const [generatingIdeaForKw, setGeneratingIdeaForKw] = useState<string | null>(null);
  const [collapsedBlogIdeas, setCollapsedBlogIdeas] = useState<Set<string>>(new Set());
  const [collapsedLandingPages, setCollapsedLandingPages] = useState<Set<string>>(new Set());
  const [mergingFromSilo, setMergingFromSilo] = useState<string | null>(null);
  const [kwSearchQuery, setKwSearchQuery] = useState("");
  const [siloKwSearch, setSiloKwSearch] = useState<Record<string, string>>({});
  const [selectedSiloKws, setSelectedSiloKws] = useState<Record<string, Set<string>>>({});
  const [generatingFromSelected, setGeneratingFromSelected] = useState<string | null>(null);
  const [showAddKeywords, setShowAddKeywords] = useState(false);
  const [addKwInput, setAddKwInput] = useState("");
  const [isAddingKeywords, setIsAddingKeywords] = useState(false);
  const [addKwTargetSilo, setAddKwTargetSilo] = useState<string | null>(null);
  const addKwFileRef = useRef<HTMLInputElement>(null);
  const [combiningIdea, setCombiningIdea] = useState<{ clusterTopic: string; ideaIndex: number } | null>(null);
  const expandedClusterTopics = [...expandedClusters];
  const activeSiloParam = isResultsOpen && expandedClusterTopics.length > 0
    ? expandedClusterTopics[expandedClusterTopics.length - 1]
    : null;

  const toggleCollapsedSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Sync state → URL params
  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (activeResultId) p.set("project", activeResultId); else p.delete("project");
      if (isResultsOpen) p.set("view", "results"); else p.delete("view");
      if (activeSiloParam) p.set("silo", activeSiloParam); else p.delete("silo");
      return p;
    }, { replace: true });
  }, [activeResultId, activeSiloParam, isResultsOpen, setSearchParams]);

  // Reload bookmarks when active project changes
  useEffect(() => {
    setBookmarkedIdeas(getBookmarkedIdeas(activeResultId));
  }, [activeResultId]);

  // Load saved results on mount
  useEffect(() => {
    loadSavedResults();
  }, []);

  const loadSavedResults = async () => {
    const urlProjectId = searchParams.get("project");
    const { data, error } = await supabase
      .from("keyword_clustering_results")
      .select("*")
      .order("created_at", { ascending: false });
    if (data && !error) {
      const mapped = data.map(d => ({
        ...d,
        result: d.result as unknown as ClusteringResult,
      }));

      // Retroactively fix generic names (e.g. "28 silos · 896 keywords")
      for (const item of mapped) {
        const name = item.name || "";
        const isGeneric = !name || /^\d+\s*silos?\s*·/i.test(name) || name === "Untitled";
        if (isGeneric && item.result?.clusters?.length > 0) {
          const derived = deriveProjectName(item.result);
          item.name = derived;
          supabase
            .from("keyword_clustering_results")
            .update({ name: derived })
            .eq("id", item.id)
            .then();
        }
      }

      setSavedResults(mapped);
      // Auto-load: prefer URL project param, else most recent
      if (data.length > 0 && !result) {
        const target = urlProjectId
          ? mapped.find(m => m.id === urlProjectId) || mapped[0]
          : mapped[0];
        setResult(target.result);
        setRawInput(target.input_keywords.join("\n"));
        setActiveResultId(target.id);
        setProjectName(target.name || "");
        setClientTag(target.client_tag || "");
        if (!urlProjectId) setExpandedClusters(new Set());
        if (urlProjectId) setIsResultsOpen(true);
      }
    }
  };

  const deriveProjectName = (clusteringResult: ClusteringResult): string => {
    // Pick the top 2-3 cluster topics by volume to form a descriptive name
    const sorted = [...clusteringResult.clusters]
      .sort((a, b) => b.estimated_monthly_volume - a.estimated_monthly_volume);
    if (sorted.length === 0) return "Untitled";
    if (sorted.length === 1) return sorted[0].topic;
    // Use top 2 topics joined
    return sorted.slice(0, 2).map(c => c.topic).join(" & ");
  };

  const saveResult = async (keywords: string[], clusteringResult: ClusteringResult, topicName?: string) => {
    const displayName = topicName || deriveProjectName(clusteringResult);

    // Auto-fill project name input if it was empty
    if (!topicName) {
      setProjectName(displayName);
    }

    const { data, error } = await supabase
      .from("keyword_clustering_results")
      .insert({ input_keywords: keywords, result: clusteringResult as any, name: displayName, client_tag: clientTag.trim() || null } as any)
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
    setExpandedClusters(new Set());
    setIsResultsOpen(true);
    setClientTag(saved.client_tag || "");
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

    const parseVolume = (raw: string | undefined): number | null => {
      if (!raw) return null;
      const s = raw.replace(/^"|"$/g, "").trim().toLowerCase();
      if (!s || s === "-" || s === "n/a") return null;
      // Handle abbreviated formats: 3.9K → 3900, 1.2M → 1200000
      const abbrevMatch = s.match(/^([0-9]*\.?[0-9]+)\s*([km])$/i);
      if (abbrevMatch) {
        const num = parseFloat(abbrevMatch[1]);
        const multiplier = abbrevMatch[2].toLowerCase() === 'k' ? 1000 : 1000000;
        return Math.round(num * multiplier);
      }
      // Standard numeric with possible commas/spaces: "3,900" or "3 900"
      const cleaned = s.replace(/[,\s]/g, "");
      const parsed = parseInt(cleaned, 10);
      return isNaN(parsed) ? null : parsed;
    };

    const results: KeywordWithVolume[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVRow(lines[i]);
      const kw = cells[kwIdx]?.replace(/^"|"$/g, "").trim();
      const vol = volIdx >= 0 ? parseVolume(cells[volIdx]) : null;
      if (kw && kw.length > 1 && kw.length < 200) {
        results.push({ keyword: kw.toLowerCase(), volume: vol });
      }
    }
    return results;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files).slice(0, 3);
    let totalParsed: KeywordWithVolume[] = [];
    let filesRead = 0;

    fileArray.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const parsed = parseCSVKeywords(text);
        totalParsed = [...totalParsed, ...parsed];
        filesRead++;

        if (filesRead === fileArray.length) {
          // Deduplicate by keyword (case-insensitive), keeping first volume found
          const seen = new Map<string, KeywordWithVolume>();
          for (const item of totalParsed) {
            const key = item.keyword.toLowerCase().trim();
            if (!key) continue;
            if (!seen.has(key)) {
              seen.set(key, item);
            } else if (item.volume !== null && seen.get(key)!.volume === null) {
              seen.set(key, item);
            }
          }
          const deduped = Array.from(seen.values());
          const dupeCount = totalParsed.length - deduped.length;

          if (deduped.length === 0) {
            toast({ title: "No keywords found", description: "Could not extract keywords from CSV files", variant: "destructive" });
            return;
          }

          // Merge with existing keywords (also deduplicate)
          const existingMap = new Map<string, KeywordWithVolume>();
          for (const item of keywordsWithVolume) {
            existingMap.set(item.keyword.toLowerCase().trim(), item);
          }
          for (const item of deduped) {
            const key = item.keyword.toLowerCase().trim();
            if (!existingMap.has(key) || (item.volume !== null && existingMap.get(key)!.volume === null)) {
              existingMap.set(key, item);
            }
          }
          const merged = Array.from(existingMap.values());

          setKeywordsWithVolume(merged);
          setRawInput(merged.map(p => p.keyword).join("\n"));
          const hasVolume = merged.some(p => p.volume !== null);
          toast({
            title: `${deduped.length} keywords loaded from ${fileArray.length} file${fileArray.length > 1 ? "s" : ""}`,
            description: `${dupeCount > 0 ? `${dupeCount} duplicates removed. ` : ""}${merged.length} total keywords ready.${hasVolume ? " Volume data detected." : ""}`,
          });
        }
      };
      reader.readAsText(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const analyzeKeywords = async () => {
    const allKeywords = [...new Set(parseKeywordsFromText(rawInput))];

    // Build volume map from uploaded CSV data
    // Ahrefs exports "0-10" as null/0, so treat missing volume as 10
    const volumeMap: Record<string, number> = {};
    const hasVolumeData = keywordsWithVolume.some(k => k.volume !== null);
    for (const item of keywordsWithVolume) {
      volumeMap[item.keyword] = (item.volume !== null && item.volume > 0) ? item.volume : 10;
    }

    const keywords = allKeywords;

    if (keywords.length < 10) {
      toast({ title: "Need more keywords", description: `Only ${keywords.length} keywords. Need at least 10 to cluster.`, variant: "destructive" });
      return;
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
            suggestedTopics: suggestedSilos.trim() ? suggestedSilos.split("\n").map(s => s.trim()).filter(Boolean) : undefined,
          }),
          signal: controller.signal,
        }
      );

      if (!classifyResponse.ok) {
        const errData = await classifyResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Classification failed: ${classifyResponse.status}`);
      }

      const classifyData = await classifyResponse.json();
      
      // Stop after Pass 1 — show silo results immediately without blog ideas
      const siloResult: ClusteringResult = {
        clusters: classifyData.clusters,
        total_keywords_clustered: classifyData.total_keywords_clustered,
        unclustered: classifyData.unclustered || [],
      };

      // Track which silos were user-suggested
      const suggested = suggestedSilos.trim() ? suggestedSilos.split("\n").map(s => s.trim().toLowerCase()).filter(Boolean) : [];
      setUserSuggestedSilos(suggested);

      setResult(siloResult);
      setExpandedClusters(new Set());
      setIsResultsOpen(true);
      toast({ title: "Clustering complete!", description: `${siloResult.clusters.length} topic silos from ${keywords.length} keywords. Generate blog ideas when ready.` });
      
      // Auto-save to database
      await saveResult(keywords, siloResult, projectName.trim() || undefined);
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
      // Filter to question keywords only for blog idea generation
      const questionFilteredClusters = result.clusters.map(c => ({
        ...c,
        keywords: c.keywords.filter(kw => isQuestionKeyword(kw, c)),
        keyword_volumes: c.keyword_volumes ? Object.fromEntries(
          Object.entries(c.keyword_volumes).filter(([kw]) => isQuestionKeyword(kw, c))
        ) : undefined,
      })).filter(c => c.keywords.length > 0);

      if (questionFilteredClusters.length === 0) {
        toast({ title: "No question keywords", description: "No silos have question keywords to generate blog ideas from.", variant: "destructive" });
        return;
      }

      const enrichResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cluster-keywords-enrich`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ clusters: questionFilteredClusters }),
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

  const isQuestionKeywordBase = (kw: string) => /^(who|what|where|when|why|how|is|are|can|do|does|did|will|would|should|could|which|shall)\b/i.test(kw.trim());
  const isQuestionKeyword = (kw: string, cluster?: KeywordCluster) => {
    if (cluster?.question_overrides?.includes(kw)) return true;
    return isQuestionKeywordBase(kw);
  };

  const reEnrichSingleCluster = async (clusterTopic: string, keywordFilter?: "generic" | "questions") => {
    if (!result) return;
    const cluster = result.clusters.find(c => c.topic === clusterTopic);
    if (!cluster) return;

    // Generic keywords → generate landing pages instead
    if (keywordFilter === "generic") {
      return generateLandingPages(clusterTopic);
    }

    // For blog ideas: always use question keywords only
    const questionKws = cluster.keywords.filter(kw => isQuestionKeyword(kw, cluster));
    const filteredCluster = {
      ...cluster,
      keywords: questionKws,
      keyword_volumes: cluster.keyword_volumes ? Object.fromEntries(
        Object.entries(cluster.keyword_volumes).filter(([kw]) => isQuestionKeyword(kw, cluster))
      ) : undefined,
    };

    if (filteredCluster.keywords.length === 0) {
      toast({ title: "No question keywords", description: "This silo has no question keywords to generate blog ideas from.", variant: "destructive" });
      return;
    }

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
          body: JSON.stringify({ clusters: [filteredCluster] }),
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
        clusters: result.clusters.map(c => {
          if (c.topic !== clusterTopic) return c;
          if (keywordFilter === "questions") {
            // Append new blog ideas
            const newIdeas = enrichedCluster.blog_ideas || [];
            return { ...c, blog_ideas: [...(c.blog_ideas || []), ...newIdeas] };
          }
          // Regenerate: replace blog ideas but preserve keywords & volumes & landing pages
          const { keywords, keyword_volumes, estimated_monthly_volume, landing_page_ideas, ...meta } = enrichedCluster;
          return { ...c, ...meta, landing_page_ideas: c.landing_page_ideas };
        }),
      };

      setResult(updatedResult);
      const label = keywordFilter === "questions" ? `Question blog ideas for "${clusterTopic}"` : `"${clusterTopic}" blog ideas`;
      toast({ title: `${label} generated` });

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

  const generateLandingPages = async (clusterTopic: string) => {
    if (!result) return;
    const cluster = result.clusters.find(c => c.topic === clusterTopic);
    if (!cluster) return;

    // Filter to generic (non-question) keywords only
    const genericKeywords = cluster.keywords.filter(kw => !isQuestionKeyword(kw, cluster));
    if (genericKeywords.length === 0) {
      toast({ title: "No generic keywords", description: "This silo only contains question keywords.", variant: "destructive" });
      return;
    }

    const filteredCluster = {
      ...cluster,
      keywords: genericKeywords,
      keyword_volumes: cluster.keyword_volumes ? Object.fromEntries(
        Object.entries(cluster.keyword_volumes).filter(([kw]) => !isQuestionKeyword(kw, cluster))
      ) : undefined,
    };

    setGeneratingLandingPages(clusterTopic);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-landing-pages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ cluster: filteredCluster }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed: ${response.status}`);
      }

      const data = await response.json();
      const landingPages = data.landing_pages || [];

      const updatedResult: ClusteringResult = {
        ...result,
        clusters: result.clusters.map(c =>
          c.topic === clusterTopic ? { ...c, landing_page_ideas: landingPages } : c
        ),
      };

      setResult(updatedResult);
      toast({ title: `${landingPages.length} landing pages generated for "${clusterTopic}"` });

      if (activeResultId) {
        await supabase
          .from("keyword_clustering_results")
          .update({ result: updatedResult as any })
          .eq("id", activeResultId);
        loadSavedResults();
      }
    } catch (err: any) {
      toast({ title: "Landing page generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingLandingPages(null);
    }
  };

  const removeKeywordFromCluster = async (clusterTopic: string, keyword: string) => {
    if (!result) return;
    const updatedResult: ClusteringResult = {
      ...result,
      clusters: result.clusters.map(c => {
        if (c.topic !== clusterTopic) return c;
        const newKeywords = c.keywords.filter(k => k !== keyword);
        const newVolumes = c.keyword_volumes ? { ...c.keyword_volumes } : undefined;
        if (newVolumes) delete newVolumes[keyword];
        const removedVol = c.keyword_volumes?.[keyword] ?? 0;
        return {
          ...c,
          keywords: newKeywords,
          keyword_volumes: newVolumes,
          estimated_monthly_volume: c.estimated_monthly_volume - removedVol,
        };
      }).filter(c => c.keywords.length > 0),
      total_keywords_clustered: result.total_keywords_clustered - 1,
    };
    setResult(updatedResult);
    if (activeResultId) {
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any })
        .eq("id", activeResultId);
    }
  };

  const moveKeywordToSilo = async (fromClusterTopic: string, keyword: string, toClusterTopic: string) => {
    if (!result) return;
    const fromCluster = result.clusters.find(c => c.topic === fromClusterTopic);
    if (!fromCluster) return;
    const vol = fromCluster.keyword_volumes?.[keyword] ?? fromCluster.keyword_volumes?.[keyword.toLowerCase()] ?? 0;

    const updatedResult: ClusteringResult = {
      ...result,
      clusters: result.clusters.map(c => {
        if (c.topic === fromClusterTopic) {
          const newKeywords = c.keywords.filter(k => k !== keyword);
          const newVolumes = c.keyword_volumes ? { ...c.keyword_volumes } : undefined;
          if (newVolumes) { delete newVolumes[keyword]; delete newVolumes[keyword.toLowerCase()]; }
          // Also remove from any blog idea target_keywords in this silo
          const updatedIdeas = (c.blog_ideas || []).map(idea => ({
            ...idea,
            target_keywords: (idea.target_keywords || []).filter(tk => tk.toLowerCase() !== keyword.toLowerCase()),
          }));
          return {
            ...c,
            keywords: newKeywords,
            keyword_volumes: newVolumes,
            estimated_monthly_volume: c.estimated_monthly_volume - vol,
            blog_ideas: updatedIdeas,
          };
        }
        if (c.topic === toClusterTopic) {
          // Add keyword if not already present
          const alreadyExists = c.keywords.some(k => k.toLowerCase() === keyword.toLowerCase());
          const newKeywords = alreadyExists ? c.keywords : [...c.keywords, keyword];
          const newVolumes = { ...(c.keyword_volumes || {}), [keyword]: vol };
          return {
            ...c,
            keywords: newKeywords,
            keyword_volumes: newVolumes,
            estimated_monthly_volume: c.estimated_monthly_volume + (alreadyExists ? 0 : vol),
          };
        }
        return c;
      }).filter(c => c.keywords.length > 0),
    };
    setResult(updatedResult);
    toast({ title: "Keyword moved", description: `"${keyword}" moved to "${toClusterTopic}"` });
    if (activeResultId) {
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any })
        .eq("id", activeResultId);
    }
  };

  const toggleKeywordAsQuestion = async (clusterTopic: string, keyword: string) => {
    if (!result) return;
    const updatedResult: ClusteringResult = {
      ...result,
      clusters: result.clusters.map(c => {
        if (c.topic !== clusterTopic) return c;
        const overrides = c.question_overrides || [];
        const isOverridden = overrides.includes(keyword);
        return {
          ...c,
          question_overrides: isOverridden
            ? overrides.filter(k => k !== keyword)
            : [...overrides, keyword],
        };
      }),
    };
    setResult(updatedResult);
    if (activeResultId) {
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any })
        .eq("id", activeResultId);
    }
  };

  const assignKeywordToIdea = async (clusterTopic: string, keyword: string, ideaIndex: number) => {
    if (!result) return;
    const updatedResult: ClusteringResult = {
      ...result,
      clusters: result.clusters.map(c => {
        if (c.topic !== clusterTopic) return c;
        const updatedIdeas = (c.blog_ideas || []).map((idea, i) => {
          if (i !== ideaIndex) return idea;
          const existing = idea.target_keywords || [];
          if (existing.some(k => k.toLowerCase() === keyword.toLowerCase())) return idea;
          return { ...idea, target_keywords: [...existing, keyword] };
        });
        return { ...c, blog_ideas: updatedIdeas };
      }),
    };
    setResult(updatedResult);
    toast({ title: "Keyword assigned", description: `"${keyword}" added to blog idea #${ideaIndex + 1}` });
    if (activeResultId) {
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any })
        .eq("id", activeResultId);
    }
  };

  const addKeywordToIdeaFromAnySilo = async (targetClusterTopic: string, targetIdeaIndex: number, keyword: string, sourceClusterTopic: string) => {
    if (!result) return;
    const sourceCluster = result.clusters.find(c => c.topic === sourceClusterTopic);
    if (!sourceCluster) return;
    const vol = sourceCluster.keyword_volumes?.[keyword] ?? sourceCluster.keyword_volumes?.[keyword.toLowerCase()] ?? 0;
    const isSameSilo = sourceClusterTopic === targetClusterTopic;

    const updatedResult: ClusteringResult = {
      ...result,
      clusters: result.clusters.map(c => {
        if (!isSameSilo && c.topic === sourceClusterTopic) {
          // Remove keyword from source silo
          const newKeywords = c.keywords.filter(k => k.toLowerCase() !== keyword.toLowerCase());
          const newVolumes = c.keyword_volumes ? { ...c.keyword_volumes } : undefined;
          if (newVolumes) { delete newVolumes[keyword]; delete newVolumes[keyword.toLowerCase()]; }
          const updatedIdeas = (c.blog_ideas || []).map(idea => ({
            ...idea,
            target_keywords: (idea.target_keywords || []).filter(tk => tk.toLowerCase() !== keyword.toLowerCase()),
          }));
          return { ...c, keywords: newKeywords, keyword_volumes: newVolumes, estimated_monthly_volume: c.estimated_monthly_volume - vol, blog_ideas: updatedIdeas };
        }
        if (c.topic === targetClusterTopic) {
          // Add keyword to target silo if not already there
          const alreadyInSilo = c.keywords.some(k => k.toLowerCase() === keyword.toLowerCase());
          const newKeywords = alreadyInSilo ? c.keywords : [...c.keywords, keyword];
          const newVolumes = { ...(c.keyword_volumes || {}), [keyword]: vol };
          // Remove from any other idea in this silo, then add to target idea
          const updatedIdeas = (c.blog_ideas || []).map((idea, idx) => {
            const withoutKw = { ...idea, target_keywords: (idea.target_keywords || []).filter(tk => tk.toLowerCase() !== keyword.toLowerCase()) };
            if (idx === targetIdeaIndex) {
              const existing = withoutKw.target_keywords || [];
              return { ...withoutKw, target_keywords: [...existing, keyword] };
            }
            return withoutKw;
          });
          return { ...c, keywords: newKeywords, keyword_volumes: newVolumes, estimated_monthly_volume: c.estimated_monthly_volume + (alreadyInSilo || isSameSilo ? 0 : vol), blog_ideas: updatedIdeas };
        }
        return c;
      }).filter(c => c.keywords.length > 0),
    };
    setResult(updatedResult);
    toast({ title: "Keyword added", description: `"${keyword}" allocated to this blog idea` });
    if (activeResultId) {
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any })
        .eq("id", activeResultId);
    }
  };

  const reassignKeyword = async (clusterTopic: string, keyword: string, fromIdeaIndex: number, toIdeaIndex: number) => {
    if (!result) return;
    const updatedResult: ClusteringResult = {
      ...result,
      clusters: result.clusters.map(c => {
        if (c.topic !== clusterTopic) return c;
        const updatedIdeas = (c.blog_ideas || []).map((idea, idx) => {
          if (idx === fromIdeaIndex) {
            // Remove keyword from source idea
            return { ...idea, target_keywords: (idea.target_keywords || []).filter(k => k.toLowerCase() !== keyword.toLowerCase()) };
          }
          if (idx === toIdeaIndex) {
            // Add keyword to target idea
            const existing = idea.target_keywords || [];
            if (existing.some(k => k.toLowerCase() === keyword.toLowerCase())) return idea;
            return { ...idea, target_keywords: [...existing, keyword] };
          }
          return idea;
        });
        return { ...c, blog_ideas: updatedIdeas };
      }),
    };
    setResult(updatedResult);
    const targetIdea = result.clusters.find(c => c.topic === clusterTopic)?.blog_ideas?.[toIdeaIndex];
    toast({ title: "Keyword reassigned", description: `"${keyword}" moved to "${targetIdea?.title || `idea #${toIdeaIndex + 1}`}"` });
    if (activeResultId) {
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any })
        .eq("id", activeResultId);
    }
  };

  const reassignKeywordByTitle = async (clusterTopic: string, keyword: string, fromIdeaTitle: string, toIdeaTitle: string) => {
    if (!result) return;
    const cluster = result.clusters.find(c => c.topic === clusterTopic);
    if (!cluster?.blog_ideas) return;
    const fromIdx = cluster.blog_ideas.findIndex(i => i.title === fromIdeaTitle);
    const toIdx = cluster.blog_ideas.findIndex(i => i.title === toIdeaTitle);
    if (fromIdx === -1 || toIdx === -1) return;
    reassignKeyword(clusterTopic, keyword, fromIdx, toIdx);
  };

  const deleteIdeaFromCluster = async (clusterTopic: string, ideaIndex: number) => {
    if (!result) return;
    // If we're combining and user deletes the source, cancel combine mode
    if (combiningIdea?.clusterTopic === clusterTopic && combiningIdea?.ideaIndex === ideaIndex) {
      setCombiningIdea(null);
    }
    const updatedResult: ClusteringResult = {
      ...result,
      clusters: result.clusters.map(c => {
        if (c.topic !== clusterTopic) return c;
        const updatedIdeas = (c.blog_ideas || []).filter((_, idx) => idx !== ideaIndex);
        return { ...c, blog_ideas: updatedIdeas };
      }),
    };
    setResult(updatedResult);
    toast({ title: "Blog idea deleted", description: "Keywords are now unassigned." });
    if (activeResultId) {
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any })
        .eq("id", activeResultId);
    }
  };

  const combineBlogIdeas = async (clusterTopic: string, sourceIndex: number, targetIndex: number) => {
    if (!result) return;
    const cluster = result.clusters.find(c => c.topic === clusterTopic);
    if (!cluster || !cluster.blog_ideas) return;
    const source = cluster.blog_ideas[sourceIndex];
    const target = cluster.blog_ideas[targetIndex];
    if (!source || !target) return;

    // Merge keywords (deduplicated)
    const mergedKws = [...(target.target_keywords || [])];
    for (const kw of (source.target_keywords || [])) {
      if (!mergedKws.some(mk => mk.toLowerCase() === kw.toLowerCase())) {
        mergedKws.push(kw);
      }
    }

    // Merge value promises (deduplicated)
    const mergedVPs = [...(target.value_promises || [])];
    for (const vp of (source.value_promises || [])) {
      if (!mergedVPs.some(mv => mv.toLowerCase() === vp.toLowerCase())) {
        mergedVPs.push(vp);
      }
    }

    // Combined idea keeps target's title, merges descriptions
    const combined: BlogIdea = {
      title: target.title,
      description: `${target.description} ${source.description}`.trim(),
      reason: `${target.reason} Additionally: ${source.reason}`.trim(),
      target_keywords: mergedKws,
      value_promises: mergedVPs,
    };

    const updatedIdeas = cluster.blog_ideas
      .map((idea, idx) => idx === targetIndex ? combined : idea)
      .filter((_, idx) => idx !== sourceIndex);

    const updatedResult: ClusteringResult = {
      ...result,
      clusters: result.clusters.map(c =>
        c.topic === clusterTopic ? { ...c, blog_ideas: updatedIdeas } : c
      ),
    };

    // Migrate bookmarks/used state
    const sourceKey = makeIdeaKey(clusterTopic, source.title);
    const targetKey = makeIdeaKey(clusterTopic, target.title);
    if (usedIdeas.has(sourceKey)) {
      const newUsed = new Set(usedIdeas);
      newUsed.delete(sourceKey);
      newUsed.add(targetKey);
      localStorage.setItem(USED_IDEAS_KEY, JSON.stringify([...newUsed]));
      setUsedIdeas(newUsed);
    }
    const bmKey = getBookmarkedKey(activeResultId);
    const bm = getStoredSet(bmKey);
    if (bm.has(sourceKey)) {
      bm.delete(sourceKey);
      bm.add(targetKey);
      localStorage.setItem(bmKey, JSON.stringify([...bm]));
      setBookmarkedIdeas(new Set(bm));
    }

    setResult(updatedResult);
    setCombiningIdea(null);
    toast({ title: "Blog ideas combined", description: `"${source.title}" merged into "${target.title}"` });

    if (activeResultId) {
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any })
        .eq("id", activeResultId);
    }
  };

  const editIdeaTitle = async (clusterTopic: string, oldTitle: string, newTitle: string) => {
    if (!result || !newTitle.trim() || newTitle === oldTitle) return;
    const trimmed = newTitle.trim();
    const oldKey = makeIdeaKey(clusterTopic, oldTitle);
    const newKey = makeIdeaKey(clusterTopic, trimmed);

    const updatedResult: ClusteringResult = {
      ...result,
      clusters: result.clusters.map(c => {
        if (c.topic !== clusterTopic) return c;
        return {
          ...c,
          blog_ideas: (c.blog_ideas || []).map(idea =>
            idea.title === oldTitle ? { ...idea, title: trimmed } : idea
          ),
        };
      }),
    };
    setResult(updatedResult);

    // Update bookmarked ideas key
    const bmKey = getBookmarkedKey(activeResultId);
    const bm = getStoredSet(bmKey);
    if (bm.has(oldKey)) {
      bm.delete(oldKey);
      bm.add(newKey);
      localStorage.setItem(bmKey, JSON.stringify([...bm]));
      setBookmarkedIdeas(new Set(bm));
    }

    // Update used/done ideas key
    const used = getStoredSet(USED_IDEAS_KEY);
    if (used.has(oldKey)) {
      used.delete(oldKey);
      used.add(newKey);
      localStorage.setItem(USED_IDEAS_KEY, JSON.stringify([...used]));
      setUsedIdeas(new Set(used));
    }

    // Update content-queue-done keys
    try {
      const doneStr = localStorage.getItem("content-queue-done");
      if (doneStr) {
        const doneSet: Set<string> = new Set(JSON.parse(doneStr));
        if (doneSet.has(oldKey)) {
          doneSet.delete(oldKey);
          doneSet.add(newKey);
          localStorage.setItem("content-queue-done", JSON.stringify([...doneSet]));
        }
      }
    } catch {}

    if (activeResultId) {
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any })
        .eq("id", activeResultId);
    }
  };

  const mergeSilos = async (sourceClusterTopic: string, targetClusterTopic: string) => {
    if (!result) return;
    const source = result.clusters.find(c => c.topic === sourceClusterTopic);
    const target = result.clusters.find(c => c.topic === targetClusterTopic);
    if (!source || !target) return;

    // Merge keywords (dedup case-insensitive)
    const existingKwsLower = new Set(target.keywords.map(k => k.toLowerCase()));
    const newKeywords = source.keywords.filter(k => !existingKwsLower.has(k.toLowerCase()));
    const mergedKeywords = [...target.keywords, ...newKeywords];

    // Merge keyword_volumes
    const mergedVolumes = { ...(target.keyword_volumes || {}), ...(source.keyword_volumes || {}) };

    // Merge blog ideas
    const mergedBlogIdeas = [...(target.blog_ideas || []), ...(source.blog_ideas || [])];

    // Merge landing page ideas
    const mergedLandingPages = [...(target.landing_page_ideas || []), ...(source.landing_page_ideas || [])];

    // Merge question overrides
    const mergedQOverrides = [...new Set([...(target.question_overrides || []), ...(source.question_overrides || [])])];

    // Update volumes
    const mergedVolume = (target.estimated_monthly_volume || 0) + (source.estimated_monthly_volume || 0);

    const mergedCluster: KeywordCluster = {
      ...target,
      keywords: mergedKeywords,
      keyword_volumes: mergedVolumes,
      blog_ideas: mergedBlogIdeas,
      landing_page_ideas: mergedLandingPages,
      question_overrides: mergedQOverrides,
      estimated_monthly_volume: mergedVolume,
    };

    // Update bookmarks/used keys: remap source cluster keys to target cluster
    const bmKey = getBookmarkedKey(activeResultId);
    const bm = getStoredSet(bmKey);
    const used = getStoredSet(USED_IDEAS_KEY);
    let bmChanged = false, usedChanged = false;

    (source.blog_ideas || []).forEach(idea => {
      const oldKey = makeIdeaKey(sourceClusterTopic, idea.title);
      const newKey = makeIdeaKey(targetClusterTopic, idea.title);
      if (bm.has(oldKey)) { bm.delete(oldKey); bm.add(newKey); bmChanged = true; }
      if (used.has(oldKey)) { used.delete(oldKey); used.add(newKey); usedChanged = true; }
    });

    if (bmChanged) { localStorage.setItem(bmKey, JSON.stringify([...bm])); setBookmarkedIdeas(new Set(bm)); }
    if (usedChanged) { localStorage.setItem(USED_IDEAS_KEY, JSON.stringify([...used])); setUsedIdeas(new Set(used)); }

    // Update content-queue-done keys
    try {
      const doneStr = localStorage.getItem("content-queue-done");
      if (doneStr) {
        const doneSet: Set<string> = new Set(JSON.parse(doneStr));
        let doneChanged = false;
        (source.blog_ideas || []).forEach(idea => {
          const oldKey = makeIdeaKey(sourceClusterTopic, idea.title);
          const newKey = makeIdeaKey(targetClusterTopic, idea.title);
          if (doneSet.has(oldKey)) { doneSet.delete(oldKey); doneSet.add(newKey); doneChanged = true; }
        });
        if (doneChanged) localStorage.setItem("content-queue-done", JSON.stringify([...doneSet]));
      }
    } catch {}

    const updatedResult: ClusteringResult = {
      ...result,
      clusters: result.clusters.filter(c => c.topic !== sourceClusterTopic).map(c =>
        c.topic === targetClusterTopic ? mergedCluster : c
      ),
      total_keywords_clustered: result.total_keywords_clustered,
    };

    setResult(updatedResult);
    setMergingFromSilo(null);
    toast({ title: "Silos merged", description: `"${sourceClusterTopic}" merged into "${targetClusterTopic}"` });

    if (activeResultId) {
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any })
        .eq("id", activeResultId);
    }
  };

  const createIdeaFromKeyword = async (clusterTopic: string, keyword: string, keywordFilter?: "generic" | "questions") => {
    if (!result) return;
    const cluster = result.clusters.find(c => c.topic === clusterTopic);
    if (!cluster) return;

    setGeneratingIdeaForKw(keyword);
    try {
      const vol = cluster.keyword_volumes?.[keyword] ?? cluster.keyword_volumes?.[keyword.toLowerCase()] ?? null;
      // Find related keywords from the same category only
      const poolKws = keywordFilter
        ? cluster.keywords.filter(kw => keywordFilter === "questions" ? isQuestionKeyword(kw, cluster) : !isQuestionKeyword(kw, cluster))
        : cluster.keywords;
      const relatedKws = poolKws
        .filter(kw => kw.toLowerCase() !== keyword.toLowerCase())
        .filter(kw => {
          const words = keyword.toLowerCase().split(/\s+/);
          return words.some(w => w.length > 3 && kw.toLowerCase().includes(w));
        })
        .slice(0, 5);

      const { data, error } = await supabase.functions.invoke("cluster-keywords-enrich", {
        body: {
          clusters: [{
            topic: clusterTopic,
            keywords: [keyword, ...relatedKws],
            estimated_monthly_volume: (vol || 0) + relatedKws.reduce((s, kw) => s + (cluster.keyword_volumes?.[kw] ?? 0), 0),
          }],
          singleIdea: true,
          focusKeyword: keyword,
        },
      });

      if (error) throw error;

      const enrichment = data?.enrichments?.[0] || data?.clusters?.[0] || data;
      if (!enrichment?.blog_ideas?.length) {
        console.error("No blog ideas in response:", JSON.stringify(data).slice(0, 500));
        toast({ title: "Failed to generate idea", variant: "destructive" });
        return;
      }

      // Take just the first idea and ensure the focus keyword is in target_keywords
      const newIdea = enrichment.blog_ideas[0];
      if (!newIdea.target_keywords) newIdea.target_keywords = [];
      if (!newIdea.target_keywords.some((tk: string) => tk.toLowerCase() === keyword.toLowerCase())) {
        newIdea.target_keywords.unshift(keyword);
      }

      const updatedResult: ClusteringResult = {
        ...result,
        clusters: result.clusters.map(c => {
          if (c.topic !== clusterTopic) return c;
          return { ...c, blog_ideas: [...(c.blog_ideas || []), newIdea] };
        }),
      };
      setResult(updatedResult);
      toast({ title: "Blog idea created", description: `"${newIdea.title}" for keyword "${keyword}"` });

      if (activeResultId) {
        await supabase
          .from("keyword_clustering_results")
          .update({ result: updatedResult as any })
          .eq("id", activeResultId);
      }
    } catch (e) {
      console.error("Error creating idea:", e);
      toast({ title: "Failed to generate idea", variant: "destructive" });
    } finally {
      setGeneratingIdeaForKw(null);
    }
  };

  const createIdeaFromSelectedKeywords = async (clusterTopic: string, keywords: string[]) => {
    if (!result || keywords.length === 0) return;
    const cluster = result.clusters.find(c => c.topic === clusterTopic);
    if (!cluster) return;

    setGeneratingFromSelected(clusterTopic);
    try {
      const totalVol = keywords.reduce((s, kw) => s + (cluster.keyword_volumes?.[kw] ?? cluster.keyword_volumes?.[kw.toLowerCase()] ?? 0), 0);

      const { data, error } = await supabase.functions.invoke("cluster-keywords-enrich", {
        body: {
          clusters: [{
            topic: clusterTopic,
            keywords,
            estimated_monthly_volume: totalVol,
          }],
          singleIdea: true,
          focusKeyword: keywords[0],
        },
      });

      if (error) throw error;

      const enrichment = data?.enrichments?.[0] || data?.clusters?.[0] || data;
      if (!enrichment?.blog_ideas?.length) {
        toast({ title: "Failed to generate idea", variant: "destructive" });
        return;
      }

      const newIdea = enrichment.blog_ideas[0];
      if (!newIdea.target_keywords) newIdea.target_keywords = [];
      // Ensure all selected keywords are in target_keywords
      for (const kw of keywords) {
        if (!newIdea.target_keywords.some((tk: string) => tk.toLowerCase() === kw.toLowerCase())) {
          newIdea.target_keywords.push(kw);
        }
      }

      const updatedResult: ClusteringResult = {
        ...result,
        clusters: result.clusters.map(c => {
          if (c.topic !== clusterTopic) return c;
          return { ...c, blog_ideas: [...(c.blog_ideas || []), newIdea] };
        }),
      };
      setResult(updatedResult);
      // Clear selection
      setSelectedSiloKws(prev => ({ ...prev, [clusterTopic]: new Set() }));
      toast({ title: "Blog idea created", description: `"${newIdea.title}" from ${keywords.length} keywords` });

      if (activeResultId) {
        await supabase
          .from("keyword_clustering_results")
          .update({ result: updatedResult as any })
          .eq("id", activeResultId);
      }
    } catch (e) {
      console.error("Error creating idea from selected:", e);
      toast({ title: "Failed to generate idea", variant: "destructive" });
    } finally {
      setGeneratingFromSelected(null);
    }
  };

  const handleAddKwFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSVKeywords(text);
      if (parsed.length === 0) {
        toast({ title: "No keywords found in CSV", variant: "destructive" });
        return;
      }
      // Append to existing text input
      const newKws = parsed.map(p => `${p.keyword}${p.volume ? `\t${p.volume}` : ""}`).join("\n");
      setAddKwInput(prev => prev ? `${prev}\n${newKws}` : newKws);
      toast({ title: `${parsed.length} keywords loaded from CSV` });
    };
    reader.readAsText(file);
    if (addKwFileRef.current) addKwFileRef.current.value = "";
  };

  const addKeywordsToProject = async () => {
    if (!result || !activeResultId) return;
    
    // Parse input: support "keyword\tvolume" or plain keywords
    const lines = addKwInput.split(/\n/).map(l => l.trim()).filter(l => l.length > 1);
    const newKeywords: KeywordWithVolume[] = [];
    const existingKwSet = new Set(result.clusters.flatMap(c => c.keywords.map(k => k.toLowerCase())));
    
    for (const line of lines) {
      const parts = line.split(/\t/);
      const kw = parts[0].trim().toLowerCase();
      if (!kw || kw.length < 2 || kw.length > 200) continue;
      if (existingKwSet.has(kw)) continue; // Skip already-in-project keywords
      const vol = parts[1] ? parseInt(parts[1].replace(/[,\s]/g, ""), 10) : null;
      newKeywords.push({ keyword: kw, volume: isNaN(vol as number) ? null : vol });
    }

    if (newKeywords.length === 0) {
      toast({ title: "No new keywords to add", description: "All keywords are already in the project or no valid keywords found.", variant: "destructive" });
      return;
    }

    setIsAddingKeywords(true);
    try {
      // If targeting a specific silo, add directly without classification
      if (addKwTargetSilo) {
        const targetIdx = result.clusters.findIndex(c => c.topic === addKwTargetSilo);
        if (targetIdx < 0) {
          toast({ title: "Silo not found", variant: "destructive" });
          return;
        }

        const updatedClusters = [...result.clusters];
        const existing = updatedClusters[targetIdx];
        const volumeMap: Record<string, number> = { ...(existing.keyword_volumes || {}) };
        for (const item of newKeywords) {
          volumeMap[item.keyword] = (item.volume !== null && item.volume > 0) ? item.volume : 10;
        }
        const addedVolume = newKeywords.reduce((s, k) => s + (volumeMap[k.keyword] || 0), 0);

        updatedClusters[targetIdx] = {
          ...existing,
          keywords: [...existing.keywords, ...newKeywords.map(k => k.keyword)],
          keyword_volumes: volumeMap,
          estimated_monthly_volume: existing.estimated_monthly_volume + addedVolume,
        };

        const updatedResult: ClusteringResult = {
          ...result,
          clusters: updatedClusters,
          total_keywords_clustered: result.total_keywords_clustered + newKeywords.length,
        };

        setResult(updatedResult);
        const allInputKws = [...new Set([
          ...(savedResults.find(s => s.id === activeResultId)?.input_keywords || []),
          ...newKeywords.map(k => k.keyword),
        ])];
        await supabase
          .from("keyword_clustering_results")
          .update({ result: updatedResult as any, input_keywords: allInputKws })
          .eq("id", activeResultId);
        loadSavedResults();

        setShowAddKeywords(false);
        setAddKwInput("");
        setAddKwTargetSilo(null);
        toast({
          title: `${newKeywords.length} keywords added to "${addKwTargetSilo}"`,
        });
        return;
      }

      // Project-wide: classify into existing silos
      const existingSiloNames = result.clusters.map(c => c.topic);
      const volumeMap: Record<string, number> = {};
      for (const item of newKeywords) {
        volumeMap[item.keyword] = (item.volume !== null && item.volume > 0) ? item.volume : 10;
      }

      // Call classify with existing silos as context
      const classifyResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cluster-keywords-classify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            keywords: newKeywords.map(k => k.keyword),
            volumeMap,
            suggestedTopics: existingSiloNames,
          }),
        }
      );

      if (!classifyResponse.ok) {
        const errData = await classifyResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Classification failed: ${classifyResponse.status}`);
      }

      const classifyData = await classifyResponse.json();
      const newClusters: KeywordCluster[] = classifyData.clusters || [];

      // Merge new clusters into existing result
      const updatedClusters = [...result.clusters];
      let addedToExisting = 0;
      let newSilosCreated = 0;

      for (const nc of newClusters) {
        const existingIdx = updatedClusters.findIndex(c => c.topic.toLowerCase() === nc.topic.toLowerCase());
        if (existingIdx >= 0) {
          // Merge keywords into existing silo
          const existing = updatedClusters[existingIdx];
          const newKws = nc.keywords.filter(k => !existing.keywords.some(ek => ek.toLowerCase() === k.toLowerCase()));
          updatedClusters[existingIdx] = {
            ...existing,
            keywords: [...existing.keywords, ...newKws],
            keyword_volumes: { ...(existing.keyword_volumes || {}), ...(nc.keyword_volumes || {}) },
            estimated_monthly_volume: existing.estimated_monthly_volume + (nc.estimated_monthly_volume || 0),
          };
          addedToExisting += newKws.length;
        } else {
          // Brand new silo
          updatedClusters.push(nc);
          newSilosCreated++;
        }
      }

      const totalNewKws = newClusters.reduce((s, c) => s + c.keywords.length, 0);
      const updatedResult: ClusteringResult = {
        ...result,
        clusters: updatedClusters,
        total_keywords_clustered: result.total_keywords_clustered + totalNewKws,
      };

      setResult(updatedResult);
      // Also update the input_keywords array in DB
      const allInputKws = [...new Set([
        ...(savedResults.find(s => s.id === activeResultId)?.input_keywords || []),
        ...newKeywords.map(k => k.keyword),
      ])];
      await supabase
        .from("keyword_clustering_results")
        .update({ result: updatedResult as any, input_keywords: allInputKws })
        .eq("id", activeResultId);
      loadSavedResults();

      setShowAddKeywords(false);
      setAddKwInput("");
      setAddKwTargetSilo(null);
      toast({
        title: `${totalNewKws} keywords added`,
        description: `${addedToExisting} added to existing silos${newSilosCreated > 0 ? `, ${newSilosCreated} new silo${newSilosCreated > 1 ? "s" : ""} created` : ""}`,
      });
    } catch (err: any) {
      toast({ title: "Failed to add keywords", description: err.message, variant: "destructive" });
    } finally {
      setIsAddingKeywords(false);
    }
  };

  const clearGeneratorState = () => {
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
  };

  const sendSiloToGenerator = (cluster: KeywordCluster) => {
    clearGeneratorState();

    const formData = {
      topic: cluster.topic,
      length: "medium",
      outline: "",
      instructions: `Write a comprehensive article about ${cluster.topic}. ${cluster.description}${cluster.silo_instructions ? `\n\nSilo instructions: ${cluster.silo_instructions}` : ""}`,
    };

    localStorage.setItem("seo-generator-formData", JSON.stringify(formData));
    // Use top keywords by volume as SEO keywords
    const topKeywords = cluster.keyword_volumes
      ? Object.entries(cluster.keyword_volumes)
          .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
          .slice(0, 10)
          .map(([kw]) => kw)
      : cluster.keywords.slice(0, 10);
    localStorage.setItem("seo-generator-keywords", JSON.stringify(topKeywords));

    toast({ title: "Pre-filled article settings", description: `Silo: ${cluster.topic} with ${topKeywords.length} keywords` });
    window.location.href = "/";
  };

  const sendToGenerator = (cluster: KeywordCluster, idea: BlogIdea) => {
    clearGeneratorState();

    const formData = {
      topic: idea.title,
      length: "medium",
      outline: "",
      instructions: cluster.silo_instructions || "",
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
    const rows: string[][] = [["Topic", "Description", "Est. Monthly Volume", "Keywords Count", "Content Type", "Difficulty", "Priority", "Keywords", "Keyword Volumes", "Blog Ideas"]];
    result.clusters.forEach(c => {
      const volStr = c.keyword_volumes 
        ? c.keywords.map(kw => `${kw}: ${c.keyword_volumes?.[kw] ?? "n/a"}`).join("; ")
        : "";
      const blogStr = c.blog_ideas 
        ? c.blog_ideas.map((b, i) => `${i+1}. ${b.title} — ${b.description} (${b.reason}) [Keywords: ${b.target_keywords?.join(", ") || "n/a"}] [Value Promises: ${b.value_promises?.join("; ") || "n/a"}]`).join(" | ")
        : "";
      rows.push([c.topic, c.description, c.estimated_monthly_volume.toString(), c.keywords.length.toString(), c.content_type, c.difficulty, c.priority, c.keywords.join("; "), volStr, blogStr]);
    });
    downloadCSV(rows, "keyword-clusters.csv");
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csv = rows.map(r => r.map(v => `"${(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    // Use top-level window to avoid iframe sandbox restrictions
    const targetDoc = window.top?.document || document;
    targetDoc.body.appendChild(a);
    a.click();
    setTimeout(() => {
      targetDoc.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  };

  const exportSiloSummaryCSV = () => {
    if (!result) return;
    const rows = [["#", "Silo Name", "Keywords", "Est. Monthly Volume", "Difficulty", "Priority", "Content Type", "Top Keywords"]];
    [...result.clusters]
      .sort((a, b) => b.estimated_monthly_volume - a.estimated_monthly_volume)
      .forEach((c, i) => {
        const topKws = c.keyword_volumes
          ? Object.entries(c.keyword_volumes)
              .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
              .slice(0, 5)
              .map(([kw, vol]) => `${kw} (${vol})`)
              .join("; ")
          : c.keywords.slice(0, 5).join("; ");
        rows.push([
          (i + 1).toString(),
          c.topic,
          c.keywords.length.toString(),
          c.estimated_monthly_volume.toString(),
          c.difficulty,
          c.priority,
          c.content_type,
          topKws,
        ]);
      });
    downloadCSV(rows, "silo-summary.csv");
  };

  const exportContentCalendar = () => {
    if (!result) return;
    const rows: string[][] = [["Month", "Silo", "Blog Post Title", "Description", "Total Volume", "Target Keywords", "Status"]];
    result.clusters.forEach(c => {
      const ideas = c.blog_ideas || [];
      ideas.forEach(idea => {
        const ideaKey = makeIdeaKey(c.topic, idea.title);
        if (!bookmarkedIdeas.has(ideaKey)) return;
        // Calculate total volume for this idea
        const volLookup: Record<string, number> = {};
        if (c.keyword_volumes) {
          for (const [k, v] of Object.entries(c.keyword_volumes)) {
            volLookup[k.toLowerCase().trim()] = v;
          }
        }
        const totalVol = (idea.target_keywords || []).reduce((sum, kw) => sum + (volLookup[kw.toLowerCase().trim()] || 0), 0);
        const status = usedIdeas.has(ideaKey) ? "Done" : "";
        rows.push(["", c.topic, idea.title, idea.description, totalVol.toString(), (idea.target_keywords || []).join("; "), status]);
      });
    });
    if (rows.length <= 1) {
      toast({ title: "No saved ideas", description: "Save blog ideas using the bookmark button first.", variant: "destructive" });
      return;
    }
    downloadCSV(rows, "content-calendar.csv");
    toast({ title: `Content calendar exported`, description: `${rows.length - 1} saved blog ideas ready for scheduling.` });
  };

  const totalVolume = result?.clusters.reduce((s, c) => s + c.estimated_monthly_volume, 0) || 0;
  const keywordCount = parseKeywordsFromText(rawInput).length;

  return (
    <div className="space-y-4">
        {/* Saved projects — at the top, grouped by client tag */}
        {savedResults.length > 0 && (() => {
          const allTags = [...new Set(savedResults.map(s => s.client_tag || "").filter(Boolean))].sort();
          const untagged = savedResults.filter(s => !s.client_tag);
          const filteredResults = clientTagFilter !== null
            ? clientTagFilter === ""
              ? savedResults.filter(s => !s.client_tag)
              : savedResults.filter(s => s.client_tag === clientTagFilter)
            : savedResults;

          return (
            <Card className="border-dashed">
              <CardContent className="py-3 px-4">
                {/* Client tag filter tabs */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    Clients:
                  </span>
                  <button
                    onClick={() => setClientTagFilter(null)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${!clientTagFilter ? "bg-primary text-primary-foreground border-primary" : "bg-accent/30 hover:bg-accent border-transparent"}`}
                  >
                    All ({savedResults.length})
                  </button>
                  {allTags.map(tag => {
                    const count = savedResults.filter(s => s.client_tag === tag).length;
                    return (
                      <button
                        key={tag}
                        onClick={() => setClientTagFilter(clientTagFilter === tag ? null : tag)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${clientTagFilter === tag ? "bg-primary text-primary-foreground border-primary" : "bg-accent/30 hover:bg-accent border-transparent"}`}
                      >
                        {tag} ({count})
                      </button>
                    );
                  })}
                  {untagged.length > 0 && (
                    <button
                      onClick={() => setClientTagFilter(clientTagFilter === "" ? null : "")}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${clientTagFilter === "" ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 hover:bg-muted border-transparent"}`}
                    >
                      Untagged ({untagged.length})
                    </button>
                  )}
                </div>

                {/* Project chips */}
                <div className="flex flex-wrap gap-2">
                  {filteredResults.map(saved => {
                    const clusterCount = saved.result?.clusters?.length || 0;
                    const kwCount = saved.input_keywords?.length || 0;
                    const isActive = activeResultId === saved.id;
                    return (
                      <div key={saved.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${isActive ? "border-primary bg-primary/10" : "bg-accent/30 hover:bg-accent"}`}>
                        <button
                          className="flex items-center gap-1.5"
                          onClick={() => { loadResult(saved); setProjectName(saved.name || ""); }}
                        >
                          <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[180px]">{saved.name || "Untitled"}</span>
                          <span className="text-muted-foreground">{clusterCount} silos · {kwCount} kw</span>
                          {saved.client_tag && !clientTagFilter && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{saved.client_tag}</Badge>
                          )}
                        </button>
                        <button
                          className="text-muted-foreground hover:text-destructive ml-1"
                          onClick={(e) => { e.stopPropagation(); deleteResult(saved.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Project name & client tag inputs */}
        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1 max-w-sm">
            <label className="text-xs font-medium text-muted-foreground">Project Name</label>
            <Input
              placeholder="e.g. pickleball, lacrosse, hiking gear..."
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={() => {
                if (activeResultId && projectName.trim()) {
                  supabase
                    .from("keyword_clustering_results")
                    .update({ name: projectName.trim() } as any)
                    .eq("id", activeResultId)
                    .then(() => loadSavedResults());
                }
              }}
            />
          </div>
          <div className="space-y-1.5 max-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Tag className="h-3 w-3" />
              Client Tag
            </label>
            <Input
              placeholder="e.g. Little Helpers"
              value={clientTag}
              onChange={(e) => setClientTag(e.target.value)}
              onBlur={() => {
                if (activeResultId) {
                  supabase
                    .from("keyword_clustering_results")
                    .update({ client_tag: clientTag.trim() || null } as any)
                    .eq("id", activeResultId)
                    .then(() => loadSavedResults());
                }
              }}
              list="client-tags-datalist"
            />
            <datalist id="client-tags-datalist">
              {[...new Set(savedResults.map(s => s.client_tag).filter(Boolean))].sort().map(tag => (
                <option key={tag} value={tag!} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileInputRef} type="file" accept=".csv" multiple className="hidden" onChange={handleFileUpload} />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Upload CSV (up to 3)
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
          {/* Suggested silos */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Target className="h-3 w-3" />
              Propose silos (optional)
              <ChevronDown className="h-3 w-3" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Textarea
                placeholder={"Suggest silo names the AI should include, one per line...\n\ne.g.:\nDental Tourism Destinations\nDental Costs & Pricing\nPost-Treatment Care"}
                value={suggestedSilos}
                onChange={(e) => setSuggestedSilos(e.target.value)}
                className="min-h-[80px] text-sm font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                The AI will include these as silos (plus its own). Keywords not matching any suggested silo will be grouped into AI-generated ones.
              </p>
            </CollapsibleContent>
          </Collapsible>

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
                ? `Classifying ${keywordCount} keywords into topic silos...`
                : `Generating blog ideas & metadata for each silo...`}
            </div>
            <Progress value={analysisStage === "enrich" ? 60 : 30} className="h-1" />
          </div>
        )}

        {/* Results */}
        {result && !isAnalyzing && (
          <Collapsible open={isResultsOpen} onOpenChange={setIsResultsOpen}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      {projectName || "Clustering Results"} — {result.clusters.length} silos · {result.total_keywords_clustered} keywords · ~{formatVolume(totalVolume)} vol
                    </CardTitle>
                    {isResultsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Input vs Output validation summary */}
            {(() => {
              const inputTotal = keywordsWithVolume.length || keywordCount;
              const inputVolume = keywordsWithVolume.reduce((s, k) => s + ((k.volume !== null && k.volume > 0) ? k.volume : 10), 0);
              const clusteredTotal = result.total_keywords_clustered;
              const clusteredVolume = totalVolume;
              const kwMatch = clusteredTotal === inputTotal;
              const kwDiff = inputTotal - clusteredTotal;
              return (
                <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium">Input:</span>
                    <span className="font-semibold">{inputTotal} keywords</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-semibold">~{formatVolume(inputVolume)} vol</span>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium">Clustered:</span>
                    <span className="font-semibold">{clusteredTotal} keywords</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-semibold">~{formatVolume(clusteredVolume)} vol</span>
                  </div>
                  {!kwMatch && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      {kwDiff > 0 ? `${kwDiff} missing` : `${Math.abs(kwDiff)} extra`}
                    </Badge>
                  )}
                  {kwMatch && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/50 text-primary">
                      <Check className="h-3 w-3 mr-0.5" /> All matched
                    </Badge>
                  )}
                </div>
              );
            })()}
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
                {(() => {
                  const hasBlogIdeas = result.clusters.some(c => c.blog_ideas && c.blog_ideas.length > 0);
                  return hasBlogIdeas ? (
                    <Button variant="outline" size="sm" onClick={reEnrichClusters} disabled={isAnalyzing} className="gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Regenerate Blog Ideas
                    </Button>
                  ) : (
                    <Button size="sm" onClick={reEnrichClusters} disabled={isAnalyzing} className="gap-1.5">
                      {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
                      Generate Blog Ideas
                    </Button>
                  );
                })()}
                <Button variant="outline" size="sm" onClick={() => { setAddKwTargetSilo(null); setShowAddKeywords(true); }} className="gap-1.5">
                  <FilePlus2 className="h-3.5 w-3.5" />
                  Add Keywords
                </Button>
                <Button variant="outline" size="sm" onClick={exportSiloSummaryCSV} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Silo Summary
                </Button>
                <Button variant="outline" size="sm" onClick={exportClustersCSV} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Full Export
                </Button>
                <Button
                  variant={bookmarkedIdeas.size > 0 ? "default" : "outline"}
                  size="sm"
                  onClick={() => document.getElementById('content-queue-section')?.scrollIntoView({ behavior: 'smooth' })}
                  className="gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Content Queue {bookmarkedIdeas.size > 0 && `(${bookmarkedIdeas.size})`}
                </Button>
                {bookmarkedIdeas.size > 0 && (
                  <Button variant="outline" size="sm" onClick={exportContentCalendar} className="gap-1.5 border-amber-500/50 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30">
                    <Bookmark className="h-3.5 w-3.5 fill-current" />
                    Content Calendar ({bookmarkedIdeas.size})
                  </Button>
                )}
              </div>
            </div>

            {/* Used Keywords Tracker */}
            {(() => {
              const usedKeywordsMap = new Map<string, { volume: number | null; sources: string[] }>();
              result.clusters.forEach(cluster => {
                (cluster.blog_ideas || []).forEach(idea => {
                  const ideaKey = makeIdeaKey(cluster.topic, idea.title);
                  if (usedIdeas.has(ideaKey) && idea.target_keywords) {
                    idea.target_keywords.forEach(kw => {
                      const vol = cluster.keyword_volumes?.[kw] ?? cluster.keyword_volumes?.[kw.toLowerCase()] ?? null;
                      const existing = usedKeywordsMap.get(kw.toLowerCase());
                      if (existing) {
                        existing.sources.push(idea.title);
                        if (vol != null && (existing.volume == null || vol > existing.volume)) existing.volume = vol;
                      } else {
                        usedKeywordsMap.set(kw.toLowerCase(), { volume: vol, sources: [idea.title] });
                      }
                    });
                  }
                });
              });
              if (usedKeywordsMap.size === 0) return null;
              const usedKwArray = [...usedKeywordsMap.entries()].sort((a, b) => (b[1].volume ?? 0) - (a[1].volume ?? 0));
              const totalUsedVol = usedKwArray.reduce((s, [, v]) => s + (v.volume ?? 0), 0);
              return (
                <Collapsible>
                  <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/10">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="font-medium text-sm text-green-700 dark:text-green-400">Used Keywords</span>
                          <Badge variant="outline" className="text-xs border-green-500/30 text-green-600">
                            {usedKwArray.length} keywords
                          </Badge>
                          {totalUsedVol > 0 && (
                            <Badge variant="outline" className="text-xs gap-1 border-green-500/30 text-green-600">
                              <TrendingUp className="h-3 w-3" />
                              {formatVolume(totalUsedVol)} vol
                            </Badge>
                          )}
                        </div>
                        <ChevronDown className="h-4 w-4 text-green-600/60" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4 px-4">
                        <div className="border rounded-md overflow-hidden bg-background">
                          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                            <span>Keyword</span>
                            <span className="text-right">Volume</span>
                            <span className="text-right">Article(s)</span>
                          </div>
                          <div className="max-h-[300px] overflow-y-auto">
                            {usedKwArray.map(([kw, info]) => (
                              <div
                                key={kw}
                                className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-1.5 text-sm border-b last:border-b-0 hover:bg-muted/30"
                              >
                                <span className="flex items-center gap-1.5 truncate">
                                  <Check className="h-3 w-3 text-green-500 shrink-0" />
                                  {kw}
                                </span>
                                <span className="text-right text-muted-foreground tabular-nums">
                                  {info.volume != null ? formatVolume(info.volume) : "—"}
                                </span>
                                <span className="text-right text-xs text-muted-foreground max-w-[200px] truncate" title={info.sources.join(", ")}>
                                  {info.sources.length}×
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })()}

            {/* Sort controls */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-foreground/70 font-medium">Sort:</span>
              <Badge
                variant={siloSortMode === "favorites" ? "default" : "outline"}
                className="text-xs px-2.5 py-0.5 cursor-pointer"
                onClick={() => setSiloSortMode("favorites")}
              >
                ★ Favorites first
              </Badge>
              <Badge
                variant={siloSortMode === "volume" ? "default" : "outline"}
                className="text-xs px-2.5 py-0.5 cursor-pointer"
                onClick={() => setSiloSortMode("volume")}
              >
                ↓ Volume
              </Badge>
            </div>

            {/* Merge mode banner */}
            {mergingFromSilo && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-md bg-primary/10 border border-primary/30">
                <Merge className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-primary flex-1">
                  Select a silo to merge <span className="font-bold">"{mergingFromSilo}"</span> into:
                </span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMergingFromSilo(null)}>Cancel</Button>
              </div>
            )}

            {/* Cluster cards */}
            <div className="space-y-2">
              {[...result.clusters]
                .map((cluster, originalIdx) => ({ cluster, originalIdx }))
                .sort((a, b) => {
                  if (siloSortMode === "volume") {
                    return b.cluster.estimated_monthly_volume - a.cluster.estimated_monthly_volume;
                  }
                  // favorites first, demoted last, then original order
                  const aRank = favoritedClusters.has(a.cluster.topic) ? 0 : demotedClusters.has(a.cluster.topic) ? 2 : 1;
                  const bRank = favoritedClusters.has(b.cluster.topic) ? 0 : demotedClusters.has(b.cluster.topic) ? 2 : 1;
                  return aRank - bRank || a.originalIdx - b.originalIdx;
                })
                .map(({ cluster, originalIdx: idx }) => (
                <Collapsible
                  key={cluster.topic}
                  open={expandedClusters.has(cluster.topic)}
                  onOpenChange={() => toggleCluster(cluster.topic)}
                >
                  <Card className={cn("border", mergingFromSilo === cluster.topic && "border-primary ring-2 ring-primary/20", mergingFromSilo && mergingFromSilo !== cluster.topic && "border-dashed border-primary/50 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors")}>
                    {/* Merge target overlay */}
                    {mergingFromSilo && mergingFromSilo !== cluster.topic && (
                      <button
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-primary/5 border-b border-primary/20 hover:bg-primary/10 transition-colors"
                        onClick={(e) => { e.stopPropagation(); mergeSilos(mergingFromSilo, cluster.topic); }}
                      >
                        <Merge className="h-3.5 w-3.5" />
                        Merge "{mergingFromSilo}" into this silo
                      </button>
                    )}
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            className="shrink-0 -ml-1 mr-0.5"
                            title={favoritedClusters.has(cluster.topic) ? "Remove from favorites" : "Add to favorites"}
                            onClick={(e) => {
                              e.stopPropagation();
                              const newFavs = toggleStoredSet(FAVORITED_CLUSTERS_KEY, cluster.topic);
                              setFavoritedClusters(newFavs);
                              // If favoriting, remove from demoted
                              if (newFavs.has(cluster.topic)) {
                                const newDemoted = new Set(demotedClusters);
                                newDemoted.delete(cluster.topic);
                                localStorage.setItem(DEMOTED_CLUSTERS_KEY, JSON.stringify([...newDemoted]));
                                setDemotedClusters(newDemoted);
                              }
                            }}
                          >
                            <Star className={`h-4 w-4 transition-colors ${favoritedClusters.has(cluster.topic) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"}`} />
                          </button>
                          <button
                            className="shrink-0 mr-0.5"
                            title={demotedClusters.has(cluster.topic) ? "Remove from demoted" : "Demote to bottom"}
                            onClick={(e) => {
                              e.stopPropagation();
                              const newDemoted = toggleStoredSet(DEMOTED_CLUSTERS_KEY, cluster.topic);
                              setDemotedClusters(newDemoted);
                              // If demoting, remove from favorites
                              if (newDemoted.has(cluster.topic)) {
                                const newFavs = new Set(favoritedClusters);
                                newFavs.delete(cluster.topic);
                                localStorage.setItem(FAVORITED_CLUSTERS_KEY, JSON.stringify([...newFavs]));
                                setFavoritedClusters(newFavs);
                              }
                            }}
                          >
                            <ArrowDownToLine className={`h-3.5 w-3.5 transition-colors ${demotedClusters.has(cluster.topic) ? "text-muted-foreground" : "text-muted-foreground/30 hover:text-muted-foreground"}`} />
                          </button>
                          <span className="text-sm font-bold text-foreground/50 w-6 shrink-0">#{idx + 1}</span>
                          {expandedClusters.has(cluster.topic) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-base text-foreground truncate">{cluster.topic}</span>
                              {userSuggestedSilos.length > 0 && userSuggestedSilos.some(s => cluster.topic.toLowerCase().includes(s) || s.includes(cluster.topic.toLowerCase())) && (
                                <Badge variant="outline" className="text-xs shrink-0 border-primary/40 text-primary bg-primary/5">
                                  Suggested
                                </Badge>
                              )}
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
                                    <FileText className="h-3.5 w-3.5" />
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
                                    <Bookmark className="h-3.5 w-3.5 fill-current" />
                                    {bmCount} saved
                                  </Badge>
                                );
                              })()}
                            </div>
                            {/* Silo preview: description + top keywords */}
                            {!expandedClusters.has(cluster.topic) && (
                              <div className="mt-1.5 space-y-1">
                                <p className="text-sm text-foreground/60 truncate">{cluster.description}</p>
                                {cluster.keyword_volumes && (
                                  <div className="flex items-center gap-2.5 flex-wrap">
                                    {Object.entries(cluster.keyword_volumes)
                                      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                                      .slice(0, 4)
                                      .map(([kw, vol]) => (
                                        <span key={kw} className="text-sm text-foreground/50">
                                          {kw} <span className="font-semibold text-foreground/70">({formatVolume(vol)})</span>
                                        </span>
                                      ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Badge variant="outline" className="text-sm gap-1 font-semibold">
                            <TrendingUp className="h-3.5 w-3.5" />
                            {formatVolume(cluster.estimated_monthly_volume)}
                          </Badge>
                          <Badge variant="outline" className="text-sm font-semibold">
                            {cluster.keywords.length} kw
                          </Badge>
                          <Badge className={`text-sm border font-medium ${difficultyColors[cluster.difficulty]}`} variant="outline">
                            {cluster.difficulty}
                          </Badge>
                          <Badge className={`text-sm border font-medium ${priorityColors[cluster.priority]}`} variant="outline">
                            {cluster.priority}
                          </Badge>
                          <Badge variant="secondary" className="text-sm font-medium">
                            {contentTypeLabels[cluster.content_type] || cluster.content_type}
                          </Badge>
                          {!mergingFromSilo && (
                            <button
                              className="shrink-0 ml-1"
                              title="Add keywords to this silo"
                              onClick={(e) => { e.stopPropagation(); setAddKwTargetSilo(cluster.topic); setShowAddKeywords(true); }}
                            >
                              <FilePlus2 className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-primary transition-colors" />
                            </button>
                          )}
                          {!mergingFromSilo && (
                            <button
                              className="shrink-0 ml-1"
                              title="Merge with another silo"
                              onClick={(e) => { e.stopPropagation(); setMergingFromSilo(cluster.topic); }}
                            >
                              <Merge className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-primary transition-colors" />
                            </button>
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4 px-4 space-y-4">
                        <p className="text-sm text-muted-foreground">{cluster.description}</p>
                        
                        {/* Quick instructions for blog generation */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <FileText className="h-3 w-3" />
                            Silo Instructions
                          </label>
                          <Textarea
                            placeholder="Add quick instructions for all blog posts in this silo (e.g., tone, audience, angle, things to include/avoid)..."
                            className="text-sm min-h-[60px] resize-none"
                            value={cluster.silo_instructions || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!result) return;
                              const updatedResult: ClusteringResult = {
                                ...result,
                                clusters: result.clusters.map(c =>
                                  c.topic === cluster.topic ? { ...c, silo_instructions: val } : c
                                ),
                              };
                              setResult(updatedResult);
                            }}
                            onBlur={async () => {
                              if (activeResultId && result) {
                                await supabase
                                  .from("keyword_clustering_results")
                                  .update({ result: result as any })
                                  .eq("id", activeResultId);
                              }
                            }}
                          />
                        </div>
                        
                        {/* Keywords column with volume - shows top 10 by default */}
                        {(() => {
                          const overrides = new Set(cluster.question_overrides || []);
                          const isQuestion = (kw: string) => overrides.has(kw) || isQuestionKeywordBase(kw);
                          const questionKws = cluster.keywords.filter(isQuestion);
                          const genericKws = cluster.keywords.filter(k => !isQuestion(k));
                          const filterMode = kwFilterMode[cluster.topic] || "all";
                          const baseKws = filterMode === "questions" ? questionKws : filterMode === "generic" ? genericKws : cluster.keywords;
                          const sortedKws = [...baseKws].sort((a, b) => {
                            const va = cluster.keyword_volumes?.[a] ?? 0;
                            const vb = cluster.keyword_volumes?.[b] ?? 0;
                            return vb - va;
                          });
                          const searchTerm = (siloKwSearch[cluster.topic] || "").toLowerCase();
                          const displayKws = searchTerm
                            ? sortedKws.filter(kw => kw.toLowerCase().includes(searchTerm))
                            : sortedKws;
                          const selected = selectedSiloKws[cluster.topic] || new Set<string>();
                          const toggleKwSelect = (kw: string) => {
                            setSelectedSiloKws(prev => {
                              const current = new Set(prev[cluster.topic] || []);
                              if (current.has(kw)) current.delete(kw); else current.add(kw);
                              return { ...prev, [cluster.topic]: current };
                            });
                          };
                          const selectAllFiltered = () => {
                            setSelectedSiloKws(prev => {
                              const current = new Set(prev[cluster.topic] || []);
                              displayKws.forEach(kw => current.add(kw));
                              return { ...prev, [cluster.topic]: current };
                            });
                          };
                          const clearSelection = () => {
                            setSelectedSiloKws(prev => ({ ...prev, [cluster.topic]: new Set() }));
                          };
                          const setFilter = (mode: "all" | "generic" | "questions") => {
                            setKwFilterMode(prev => ({ ...prev, [cluster.topic]: mode }));
                            setExpandedKeywordSilos(prev => { const n = new Set(prev); n.delete(cluster.topic); return n; });
                          };
                          return (
                            <div>
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <h4 className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">Keywords</h4>
                                <Badge
                                  variant={filterMode === "all" ? "default" : "outline"}
                                  className="text-xs px-2.5 py-0.5 cursor-pointer font-medium"
                                  onClick={() => setFilter("all")}
                                >
                                  All {cluster.keywords.length}
                                </Badge>
                                <Badge
                                  variant={filterMode === "generic" ? "default" : "outline"}
                                  className="text-xs px-2.5 py-0.5 cursor-pointer font-medium"
                                  onClick={() => setFilter("generic")}
                                >
                                  Generic {genericKws.length}
                                </Badge>
                                <Badge
                                  variant={filterMode === "questions" ? "default" : "outline"}
                                  className="text-xs px-2.5 py-0.5 cursor-pointer font-medium"
                                  onClick={() => setFilter("questions")}
                                >
                                  Questions {questionKws.length}
                                </Badge>
                              </div>
                              {/* Search + selection controls */}
                              <div className="flex items-center gap-2 mb-2">
                                <Input
                                  placeholder="Search keywords in this silo..."
                                  value={siloKwSearch[cluster.topic] || ""}
                                  onChange={e => setSiloKwSearch(prev => ({ ...prev, [cluster.topic]: e.target.value }))}
                                  className="h-8 text-xs flex-1"
                                />
                                {searchTerm && displayKws.length > 0 && (
                                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={selectAllFiltered}>
                                    <CheckCircle2 className="h-3 w-3" /> Select all ({displayKws.length})
                                  </Button>
                                )}
                                {selected.size > 0 && (
                                  <>
                                    <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 shrink-0 text-muted-foreground" onClick={clearSelection}>
                                      Clear ({selected.size})
                                    </Button>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="h-8 text-xs gap-1 shrink-0"
                                      disabled={generatingFromSelected === cluster.topic}
                                      onClick={() => createIdeaFromSelectedKeywords(cluster.topic, [...selected])}
                                    >
                                      {generatingFromSelected === cluster.topic ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lightbulb className="h-3 w-3" />}
                                      Generate blog idea ({selected.size} kw)
                                    </Button>
                                  </>
                                )}
                              </div>
                              <div className="border rounded-md overflow-hidden">
                              <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 px-3 py-2 bg-muted/50 text-sm font-semibold text-foreground/70 border-b">
                                  <span className="w-5"></span>
                                  <span>Keyword</span>
                                  <span className="text-right flex items-center gap-4 justify-end"><span>Volume</span><span className="w-12"></span></span>
                                </div>
                                <div className="max-h-[350px] overflow-y-auto">
                                  {displayKws.map((kw, i) => {
                                    const vol = cluster.keyword_volumes?.[kw];
                                    const kwLower = kw.toLowerCase().trim();
                                    const assignedIdeaTitle = (() => {
                                      for (const idea of (cluster.blog_ideas || [])) {
                                        if ((idea.target_keywords || []).some(tk => tk.toLowerCase().trim() === kwLower)) return idea.title;
                                      }
                                      for (const page of (cluster.landing_page_ideas || [])) {
                                        if ((page.target_keywords || []).some(tk => tk.toLowerCase().trim() === kwLower)) return page.title;
                                      }
                                      return null;
                                    })();
                                    const isAssigned = !!assignedIdeaTitle;
                                    const blogIdeas = cluster.blog_ideas || [];
                                    return (
                                      <div
                                        key={i}
                                        className={`grid grid-cols-[auto_1fr_auto] gap-x-4 px-3 py-2 text-[15px] border-b last:border-b-0 hover:bg-muted/30 transition-colors group/kw ${!isAssigned && blogIdeas.length > 0 ? "bg-amber-50/50 dark:bg-amber-950/10" : ""} ${selected.has(kw) ? "bg-primary/5" : ""}`}
                                      >
                                        <button
                                          className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${selected.has(kw) ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}
                                          onClick={() => toggleKwSelect(kw)}
                                        >
                                          {selected.has(kw) && <Check className="h-3 w-3" />}
                                        </button>
                                        <span className="flex items-center gap-1.5 min-w-0">
                                          {(() => {
                                            const isQuestion = isQuestionKeyword(kw, cluster);
                                            if (filterMode === "generic" || (filterMode === "all" && !isQuestion)) {
                                              return (
                                                <button
                                                  className="text-primary hover:text-primary/80 p-0.5 shrink-0"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleKeywordAsQuestion(cluster.topic, kw);
                                                  }}
                                                  title="Move to Questions"
                                                >
                                                  <ArrowRight className="h-4 w-4" />
                                                </button>
                                              );
                                            }
                                            if (filterMode === "questions" || (filterMode === "all" && isQuestion)) {
                                              return (
                                                <button
                                                  className="text-primary hover:text-primary/80 p-0.5 shrink-0"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleKeywordAsQuestion(cluster.topic, kw);
                                                  }}
                                                  title="Move back to Generic"
                                                >
                                                  <ArrowRight className="h-4 w-4 rotate-180" />
                                                </button>
                                              );
                                            }
                                            return null;
                                          })()}
                                          <span className="min-w-0 flex items-baseline gap-2 truncate">
                                            <span
                                              className="shrink-0 cursor-pointer text-foreground font-medium"
                                              onClick={() => {
                                                navigator.clipboard.writeText(kw);
                                                toast({ title: "Copied", description: kw });
                                              }}
                                            >{kw}</span>
                                            {assignedIdeaTitle && blogIdeas.length > 1 ? (
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="truncate text-[11px] text-muted-foreground/60 font-normal italic hover:text-primary/70 transition-colors cursor-pointer">← {assignedIdeaTitle}</button>
                                                </PopoverTrigger>
                                                <PopoverContent side="bottom" align="start" className="w-80 p-2">
                                                  <p className="text-xs font-semibold text-muted-foreground mb-2">Reassign "{kw}" to:</p>
                                                  <div className="space-y-1 max-h-48 overflow-y-auto">
                                                    {blogIdeas.map((idea, idx) => {
                                                      const kwLower2 = kw.toLowerCase().trim();
                                                      const isCurrentIdea = (idea.target_keywords || []).some(tk => tk.toLowerCase().trim() === kwLower2);
                                                      if (isCurrentIdea) return null;
                                                      const fromIdx = blogIdeas.findIndex(bi => (bi.target_keywords || []).some(tk => tk.toLowerCase().trim() === kwLower2));
                                                      return (
                                                        <button
                                                          key={idx}
                                                          className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors whitespace-normal break-words leading-snug"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            reassignKeyword(cluster.topic, kw, fromIdx, idx);
                                                          }}
                                                        >
                                                          <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                                                          {idea.title}
                                                        </button>
                                                      );
                                                    })}
                                                  </div>
                                                  <div className="border-t mt-2 pt-2">
                                                    <button
                                                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-primary/10 transition-colors font-semibold text-primary flex items-center gap-1.5"
                                                      disabled={generatingIdeaForKw !== null}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        createIdeaFromKeyword(cluster.topic, kw, filterMode === "questions" ? "questions" : filterMode === "generic" ? "generic" : undefined);
                                                      }}
                                                    >
                                                      {generatingIdeaForKw === kw ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lightbulb className="h-3 w-3" />}
                                                      Create new blog idea for "{kw}"
                                                    </button>
                                                  </div>
                                                  {result && result.clusters.length > 1 && (
                                                    <div className="border-t mt-1.5 pt-1.5">
                                                      <p className="text-[10px] font-semibold text-muted-foreground mb-1 px-2">Move to silo:</p>
                                                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                                        {result.clusters.filter(c => c.topic !== cluster.topic).map(targetCluster => (
                                                          <button
                                                            key={targetCluster.topic}
                                                            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              moveKeywordToSilo(cluster.topic, kw, targetCluster.topic);
                                                            }}
                                                          >
                                                            <span className="truncate"><Layers className="h-3 w-3 inline mr-1 text-muted-foreground" />{targetCluster.topic}</span>
                                                            <span className="text-muted-foreground shrink-0">{formatVolume(targetCluster.estimated_monthly_volume)}</span>
                                                          </button>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  )}
                                                </PopoverContent>
                                              </Popover>
                                            ) : assignedIdeaTitle ? (
                                              <span className="truncate text-[11px] text-muted-foreground/60 font-normal italic">← {assignedIdeaTitle}</span>
                                            ) : null}
                                          </span>
                                        </span>
                                        <span className="text-right text-foreground/70 tabular-nums flex items-center gap-1.5 justify-end font-medium">
                                          {!isAssigned && (
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <button
                                                  className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 p-0.5 shrink-0"
                                                  onClick={(e) => e.stopPropagation()}
                                                  title="Assign or create blog idea"
                                                  disabled={generatingIdeaForKw === kw}
                                                >
                                                  {generatingIdeaForKw === kw ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                                </button>
                                              </PopoverTrigger>
                                              <PopoverContent side="left" align="start" className="w-80 p-2">
                                                <p className="text-xs font-semibold text-muted-foreground mb-2">"{kw}" →</p>
                                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                                  {blogIdeas.length > 0 && blogIdeas.map((idea, idx) => (
                                                    <button
                                                      key={idx}
                                                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors whitespace-normal break-words leading-snug"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        assignKeywordToIdea(cluster.topic, kw, idx);
                                                      }}
                                                    >
                                                      <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                                                      {idea.title}
                                                    </button>
                                                  ))}
                                                </div>
                                                <div className="border-t mt-2 pt-2">
                                                  <button
                                                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-primary/10 transition-colors font-semibold text-primary flex items-center gap-1.5"
                                                    disabled={generatingIdeaForKw !== null}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      createIdeaFromKeyword(cluster.topic, kw, filterMode === "questions" ? "questions" : filterMode === "generic" ? "generic" : undefined);
                                                    }}
                                                  >
                                                    {generatingIdeaForKw === kw ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lightbulb className="h-3 w-3" />}
                                                    Create new blog idea for "{kw}"
                                                  </button>
                                                </div>
                                                {result && result.clusters.length > 1 && (
                                                  <div className="border-t mt-1.5 pt-1.5">
                                                    <p className="text-[10px] font-semibold text-muted-foreground mb-1 px-2">Move to silo:</p>
                                                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                                      {result.clusters.filter(c => c.topic !== cluster.topic).map(targetCluster => (
                                                        <button
                                                          key={targetCluster.topic}
                                                          className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            moveKeywordToSilo(cluster.topic, kw, targetCluster.topic);
                                                          }}
                                                        >
                                                          <span className="truncate"><Layers className="h-3 w-3 inline mr-1 text-muted-foreground" />{targetCluster.topic}</span>
                                                          <span className="text-muted-foreground shrink-0">{formatVolume(targetCluster.estimated_monthly_volume)}</span>
                                                        </button>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                              </PopoverContent>
                                            </Popover>
                                          )}
                                          <span>{vol != null ? formatVolume(vol) : "—"}</span>
                                          <button
                                            className="opacity-0 group-hover/kw:opacity-100 transition-opacity text-destructive hover:text-destructive/80 p-0.5"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeKeywordFromCluster(cluster.topic, kw);
                                            }}
                                            title="Remove keyword"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Blog Ideas */}
                        {cluster.blog_ideas && cluster.blog_ideas.length > 0 ? (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <button
                                className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 hover:text-foreground transition-colors"
                                onClick={(e) => { e.stopPropagation(); toggleCollapsedSet(setCollapsedBlogIdeas, cluster.topic); }}
                              >
                                {collapsedBlogIdeas.has(cluster.topic) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                <Lightbulb className="h-3.5 w-3.5" />
                                Blog Ideas ({cluster.blog_ideas!.length})
                              </button>
                              {!collapsedBlogIdeas.has(cluster.topic) && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-xs h-6 px-2 text-muted-foreground"
                                  disabled={enrichingSilo !== null || isAnalyzing}
                                  onClick={(e) => { e.stopPropagation(); reEnrichSingleCluster(cluster.topic); }}
                                >
                                  {enrichingSilo === cluster.topic ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                  Regenerate
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-xs h-6 px-2 text-muted-foreground"
                                  disabled={enrichingSilo !== null || isAnalyzing}
                                  onClick={(e) => { e.stopPropagation(); reEnrichSingleCluster(cluster.topic, "questions"); }}
                                >
                                  + Blog Ideas
                                </Button>
                              </div>
                              )}
                            </div>
                            {!collapsedBlogIdeas.has(cluster.topic) && <div className="space-y-2">
                              {[...cluster.blog_ideas]
                                .map((idea, origIdx) => ({ idea, origIdx, totalVol: (idea.target_keywords || []).reduce((sum, kw) => { const clean = kw.replace(/\s*\(\d+\)\s*$/, "").trim(); return sum + (cluster.keyword_volumes?.[kw] ?? cluster.keyword_volumes?.[kw.toLowerCase()] ?? cluster.keyword_volumes?.[clean] ?? cluster.keyword_volumes?.[clean.toLowerCase()] ?? 0); }, 0) }))
                                .sort((a, b) => b.totalVol - a.totalVol)
                                .map(({ idea, origIdx: i }) => {
                                const ideaKey = makeIdeaKey(cluster.topic, idea.title);
                                const isUsed = usedIdeas.has(ideaKey);
                                return (
                                <div key={i} className={`border rounded-md p-3 space-y-1 transition-colors ${isUsed ? "border-green-500 bg-green-50 dark:bg-green-950/30" : ""} ${combiningIdea && combiningIdea.clusterTopic === cluster.topic && combiningIdea.ideaIndex !== i ? "border-dashed border-primary/50 cursor-pointer hover:border-primary hover:bg-primary/5" : ""} ${combiningIdea && combiningIdea.clusterTopic === cluster.topic && combiningIdea.ideaIndex === i ? "ring-2 ring-primary/30 border-primary" : ""}`}>
                                  {combiningIdea && combiningIdea.clusterTopic === cluster.topic && combiningIdea.ideaIndex !== i && (
                                    <button
                                      className="w-full flex items-center justify-center gap-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors pb-1"
                                      onClick={(e) => { e.stopPropagation(); combineBlogIdeas(cluster.topic, combiningIdea.ideaIndex, i); }}
                                    >
                                      <Merge className="h-3 w-3" />
                                      Combine into this idea
                                    </button>
                                  )}
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
                                      <EditableTitle
                                        title={idea.title}
                                        onSave={(newTitle) => editIdeaTitle(cluster.topic, idea.title, newTitle)}
                                        className={isUsed ? "text-green-700 dark:text-green-400" : ""}
                                      />
                                      <p className="text-xs text-muted-foreground">{idea.description}</p>
                                      <p className="text-xs text-primary/80 italic">↳ {idea.reason}</p>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-1 text-xs h-7 px-2 text-muted-foreground w-fit"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const prompt = `Act as an expert SEO content researcher. I'm planning to write an article titled "${idea.title}".

Topic cluster: ${cluster.topic} — ${cluster.description}

Article concept: ${idea.description}
Strategic angle: ${idea.reason}

Target keywords: ${idea.target_keywords?.join(", ") || "N/A"}

Value promises this article must deliver:
${idea.value_promises?.map((vp, vi) => `${vi+1}. ${vp}`).join("\n") || "N/A"}

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
                                      {idea.target_keywords && idea.target_keywords.length > 0 && (() => {
                                        // Build a case-insensitive volume lookup from cluster keyword_volumes
                                        const volLookup: Record<string, number> = {};
                                        if (cluster.keyword_volumes) {
                                          for (const [k, v] of Object.entries(cluster.keyword_volumes)) {
                                            volLookup[k.toLowerCase().trim()] = v;
                                          }
                                        }
                                        const stripVol = (kw: string) => kw.replace(/\s*\(\d+\)\s*$/, "").replace(/\s*\(\?\)\s*$/, "").trim();
                                        const getVol = (kw: string) => volLookup[kw.toLowerCase().trim()] ?? volLookup[stripVol(kw).toLowerCase().trim()] ?? null;
                                        const totalVol = idea.target_keywords!.reduce((sum, kw) => sum + (getVol(kw) || 0), 0);
                                        // Top 3 keywords by volume for quick highlight
                                        const sortedByVol = [...idea.target_keywords!]
                                          .map(kw => ({ kw, vol: getVol(kw) || 0 }))
                                          .sort((a, b) => b.vol - a.vol)
                                          .slice(0, 3);
                                        return (
                                        <div className="mt-1.5 space-y-1">
                                          {/* Quick theme highlight */}
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                                              <TrendingUp className="h-2.5 w-2.5" />
                                              {totalVol > 0 ? `${totalVol.toLocaleString()} vol` : "— vol"}
                                            </span>
                                            {sortedByVol.map((item, si) => (
                                              <span key={si} className="text-sm font-semibold text-foreground">
                                                {item.kw}
                                              </span>
                                            ))}
                                          </div>
                                          {/* Full keyword list with volumes */}
                                          <div className="flex flex-wrap items-center gap-1">
                                             {idea.target_keywords!.map((kw, ki) => {
                                              const vol = getVol(kw);
                                              const otherIdeas = (cluster.blog_ideas || []).filter((_, idx) => idx !== i);
                                              return (
                                                <Popover key={ki}>
                                                  <PopoverTrigger asChild>
                                                    <button className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium hover:bg-muted/70 hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer">
                                                      {kw}
                                                      {vol != null && vol > 0 && (
                                                        <span className="text-primary/70 font-semibold">{vol.toLocaleString()}</span>
                                                      )}
                                                    </button>
                                                  </PopoverTrigger>
                                                  <PopoverContent side="bottom" align="start" className="w-72 p-2">
                                                      <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Reassign "{kw}" to:</p>
                                                      <div className="space-y-0.5 max-h-40 overflow-y-auto">
                                                        {(cluster.blog_ideas || []).map((targetIdea, targetIdx) => {
                                                          if (targetIdx === i) return null;
                                                          return (
                                                            <button
                                                              key={targetIdx}
                                                              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors whitespace-normal break-words leading-snug"
                                                              onClick={() => reassignKeyword(cluster.topic, kw, i, targetIdx)}
                                                            >
                                                              <span className="text-muted-foreground mr-1">{targetIdx + 1}.</span>
                                                              {targetIdea.title}
                                                            </button>
                                                          );
                                                        })}
                                                      </div>
                                                      <div className="border-t mt-1.5 pt-1.5">
                                                        <button
                                                          className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-primary/10 transition-colors flex items-center gap-1.5 text-primary font-medium"
                                                          disabled={generatingIdeaForKw === kw}
                                                          onClick={() => createIdeaFromKeyword(cluster.topic, kw, "questions")}
                                                        >
                                                          {generatingIdeaForKw === kw ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                                          Create new blog idea
                                                        </button>
                                                      </div>
                                                      {result && result.clusters.length > 1 && (
                                                        <div className="border-t mt-1.5 pt-1.5">
                                                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 px-2">Move to silo:</p>
                                                          <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                                            {result.clusters.filter(c => c.topic !== cluster.topic).map(targetCluster => (
                                                              <button
                                                                key={targetCluster.topic}
                                                                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2"
                                                                onClick={() => moveKeywordToSilo(cluster.topic, kw, targetCluster.topic)}
                                                              >
                                                                <span className="truncate"><Layers className="h-3 w-3 inline mr-1 text-muted-foreground" />{targetCluster.topic}</span>
                                                                <span className="text-muted-foreground shrink-0">{formatVolume(targetCluster.estimated_monthly_volume)}</span>
                                                              </button>
                                                            ))}
                                                          </div>
                                                        </div>
                                                      )}
                                                    </PopoverContent>
                                                </Popover>
                                              );
                                            })}
                                          </div>
                                          {/* Search & Add Keywords from any silo */}
                                          <Popover onOpenChange={(open) => { if (!open) setKwSearchQuery(""); }}>
                                            <PopoverTrigger asChild>
                                              <button className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-dashed border-primary/30 text-primary/70 font-medium hover:bg-primary/5 hover:border-primary/50 transition-all cursor-pointer mt-0.5">
                                                <Search className="h-2.5 w-2.5" />
                                                Add keyword
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent side="bottom" align="start" className="w-80 p-2">
                                              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Search keywords across all silos</p>
                                              <Input
                                                placeholder="Type to search keywords..."
                                                value={kwSearchQuery}
                                                onChange={(e) => setKwSearchQuery(e.target.value)}
                                                className="h-7 text-xs mb-2"
                                                autoFocus
                                              />
                                              {kwSearchQuery.trim().length >= 2 && (() => {
                                                const q = kwSearchQuery.toLowerCase().trim();
                                                const alreadyAssigned = new Set((idea.target_keywords || []).map(tk => tk.toLowerCase().trim()));
                                                const matches: { kw: string; vol: number; siloTopic: string }[] = [];
                                                for (const c of (result?.clusters || [])) {
                                                  for (const kw of c.keywords) {
                                                    if (kw.toLowerCase().includes(q) && !alreadyAssigned.has(kw.toLowerCase().trim())) {
                                                      const v = c.keyword_volumes?.[kw] ?? c.keyword_volumes?.[kw.toLowerCase()] ?? 0;
                                                      matches.push({ kw, vol: v, siloTopic: c.topic });
                                                    }
                                                  }
                                                }
                                                matches.sort((a, b) => b.vol - a.vol);
                                                const limited = matches.slice(0, 20);
                                                if (limited.length === 0) return <p className="text-xs text-muted-foreground px-1 py-2">No matching keywords found.</p>;
                                                return (
                                                  <div className="space-y-0.5 max-h-52 overflow-y-auto">
                                                    {limited.map((m, mi) => (
                                                      <button
                                                        key={mi}
                                                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2"
                                                        onClick={() => {
                                                          addKeywordToIdeaFromAnySilo(cluster.topic, i, m.kw, m.siloTopic);
                                                          setKwSearchQuery("");
                                                        }}
                                                      >
                                                        <span className="min-w-0 truncate">
                                                          <span className="font-medium">{m.kw}</span>
                                                          {m.siloTopic !== cluster.topic && (
                                                            <span className="text-[10px] text-muted-foreground/60 ml-1.5">← {m.siloTopic}</span>
                                                          )}
                                                        </span>
                                                        <span className="text-primary/70 font-semibold shrink-0 tabular-nums">{m.vol > 0 ? m.vol.toLocaleString() : "—"}</span>
                                                      </button>
                                                    ))}
                                                    {matches.length > 20 && <p className="text-[10px] text-muted-foreground px-2 py-1">+ {matches.length - 20} more results…</p>}
                                                  </div>
                                                );
                                              })()}
                                            </PopoverContent>
                                          </Popover>
                                        </div>
                                        );
                                      })()}
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
                                          setBookmarkedIdeas(toggleStoredSet(getBookmarkedKey(activeResultId), ideaKey));
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
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-1 text-xs h-7 px-2 text-destructive hover:text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteIdeaFromCluster(cluster.topic, i);
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        Delete
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`gap-1 text-xs h-7 px-2 ${combiningIdea?.clusterTopic === cluster.topic && combiningIdea?.ideaIndex === i ? "text-primary" : "text-muted-foreground"}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (combiningIdea?.clusterTopic === cluster.topic && combiningIdea?.ideaIndex === i) {
                                            setCombiningIdea(null);
                                          } else {
                                            setCombiningIdea({ clusterTopic: cluster.topic, ideaIndex: i });
                                          }
                                        }}
                                      >
                                        <Merge className="h-3 w-3" />
                                        {combiningIdea?.clusterTopic === cluster.topic && combiningIdea?.ideaIndex === i ? "Cancel" : "Combine"}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                                );
                              })}
                            </div>}
                          </div>
                        ) : (
                          <div className="border border-dashed rounded-md p-4 flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">No blog ideas generated yet for this silo.</p>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-xs"
                                disabled={enrichingSilo !== null || isAnalyzing}
                                onClick={(e) => { e.stopPropagation(); reEnrichSingleCluster(cluster.topic); }}
                              >
                                {enrichingSilo === cluster.topic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
                                Generate from Questions
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Landing Page Ideas */}
                        {cluster.landing_page_ideas && cluster.landing_page_ideas.length > 0 ? (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <button
                                className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 hover:text-foreground transition-colors"
                                onClick={(e) => { e.stopPropagation(); toggleCollapsedSet(setCollapsedLandingPages, cluster.topic); }}
                              >
                                {collapsedLandingPages.has(cluster.topic) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                <FileText className="h-3.5 w-3.5" />
                                Landing Pages ({cluster.landing_page_ideas!.length})
                              </button>
                              {!collapsedLandingPages.has(cluster.topic) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-xs h-6 px-2 text-muted-foreground"
                                disabled={generatingLandingPages !== null || isAnalyzing}
                                onClick={(e) => { e.stopPropagation(); generateLandingPages(cluster.topic); }}
                              >
                                {generatingLandingPages === cluster.topic ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                Regenerate
                              </Button>
                              )}
                            </div>
                            {!collapsedLandingPages.has(cluster.topic) && <div className="space-y-2">
                              {cluster.landing_page_ideas.map((page, i) => (
                                <div key={i} className="border rounded-md p-3 space-y-1.5 hover:bg-muted/30 transition-colors">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium flex items-center gap-1.5">
                                      <span className="text-muted-foreground text-xs">{i + 1}</span>
                                      {page.title}
                                    </p>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{page.description}</p>
                                  {page.target_keywords && page.target_keywords.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {page.target_keywords.map((kw, ki) => {
                                        const vol = cluster.keyword_volumes?.[kw] ?? cluster.keyword_volumes?.[kw.toLowerCase()];
                                        return (
                                          <Badge key={ki} variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                                            {kw}
                                            {vol != null && <span className="text-primary font-semibold">{formatVolume(vol)}</span>}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>}
                          </div>
                        ) : (
                          <div className="border border-dashed rounded-md p-3 flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">No landing pages generated yet.</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              disabled={generatingLandingPages !== null || isAnalyzing}
                              onClick={(e) => { e.stopPropagation(); generateLandingPages(cluster.topic); }}
                            >
                              {generatingLandingPages === cluster.topic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
                              Generate Landing Pages
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))}
          </div>
          </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Content Queue - saved/bookmarked ideas */}
        <div id="content-queue-section">
        {result && (() => {
          const queuedIdeas = result.clusters.flatMap(cluster =>
            (cluster.blog_ideas || [])
              .filter(idea => bookmarkedIdeas.has(makeIdeaKey(cluster.topic, idea.title)))
              .map(idea => ({
                cluster,
                idea,
                ideaKey: makeIdeaKey(cluster.topic, idea.title),
              }))
          );
          return (
            <ContentQueue
              queuedIdeas={queuedIdeas}
              onUseForArticle={sendToGenerator}
              onRemoveFromQueue={(ideaKey) => setBookmarkedIdeas(toggleStoredSet(getBookmarkedKey(activeResultId), ideaKey))}
              formatVolume={formatVolume}
              projectName={projectName}
              allClusters={result?.clusters}
              onReassignKeyword={reassignKeywordByTitle}
              onCreateIdeaFromKeyword={(clusterTopic, kw) => createIdeaFromKeyword(clusterTopic, kw, "questions")}
              generatingIdeaForKw={generatingIdeaForKw}
              onEditIdeaTitle={editIdeaTitle}
              onAddKeywordToIdea={(clusterTopic, ideaTitle, keyword, sourceClusterTopic) => {
                if (!result) return;
                const targetCluster = result.clusters.find(c => c.topic === clusterTopic);
                const targetIdeaIdx = targetCluster?.blog_ideas?.findIndex(bi => bi.title === ideaTitle);
                if (targetIdeaIdx != null && targetIdeaIdx >= 0) {
                  addKeywordToIdeaFromAnySilo(clusterTopic, targetIdeaIdx, keyword, sourceClusterTopic);
                }
              }}
            />
          );
        })()}
        </div>


      {/* Add Keywords Dialog */}
      <Dialog open={showAddKeywords} onOpenChange={(open) => { setShowAddKeywords(open); if (!open) { setAddKwTargetSilo(null); setAddKwInput(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{addKwTargetSilo ? `Add Keywords to "${addKwTargetSilo}"` : "Add Keywords to Project"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {addKwTargetSilo
                ? `Paste keywords (one per line) or upload an Ahrefs CSV. Keywords will be added directly to the "${addKwTargetSilo}" silo.`
                : "Paste keywords (one per line) or upload an Ahrefs CSV. New keywords will be classified into existing silos automatically."}
            </p>
            <input
              ref={addKwFileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleAddKwFileUpload}
            />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => addKwFileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Upload CSV
            </Button>
            <Textarea
              placeholder={"Paste keywords here, one per line...\n\nOr use tab-separated format:\nkeyword1\t250\nkeyword2\t100"}
              value={addKwInput}
              onChange={e => setAddKwInput(e.target.value)}
              className="min-h-[200px] text-sm font-mono"
            />
            {addKwInput.trim() && (
              <p className="text-xs text-muted-foreground">
                {addKwInput.split(/\n/).filter(l => l.trim().length > 1).length} keywords ready{addKwTargetSilo ? ` for "${addKwTargetSilo}"` : " to classify"}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowAddKeywords(false); setAddKwInput(""); setAddKwTargetSilo(null); }}>Cancel</Button>
            <Button onClick={addKeywordsToProject} disabled={isAddingKeywords || !addKwInput.trim()} className="gap-1.5">
              {isAddingKeywords ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {isAddingKeywords ? (addKwTargetSilo ? "Adding..." : "Classifying...") : (addKwTargetSilo ? "Add to Silo" : "Add & Classify")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KeywordClustering;
