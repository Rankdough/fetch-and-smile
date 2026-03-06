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
  TrendingUp, FileText, Copy, Download, BarChart3, Target, Info, Lightbulb, Trash2, RefreshCw, ArrowRight, Search, Bookmark, Clock, Star, Plus
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check } from "lucide-react";

const USED_IDEAS_KEY = "kw-used-blog-ideas";
const BOOKMARKED_IDEAS_KEY = "kw-bookmarked-blog-ideas";
const FAVORITED_CLUSTERS_KEY = "kw-favorited-clusters";

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
  const [generatingLandingPages, setGeneratingLandingPages] = useState<string | null>(null);
  const [analysisStage, setAnalysisStage] = useState<"classify" | "enrich" | null>(null);
  const [result, setResult] = useState<ClusteringResult | null>(null);
  const [usedIdeas, setUsedIdeas] = useState<Set<string>>(getUsedIdeas);
  const [bookmarkedIdeas, setBookmarkedIdeas] = useState<Set<string>>(getBookmarkedIdeas);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [expandedKeywordSilos, setExpandedKeywordSilos] = useState<Set<string>>(new Set());
  const [kwFilterMode, setKwFilterMode] = useState<Record<string, "all" | "generic" | "questions">>({});
  const [siloSortMode, setSiloSortMode] = useState<"favorites" | "volume">("favorites");
  const [favoritedClusters, setFavoritedClusters] = useState<Set<string>>(() => getStoredSet(FAVORITED_CLUSTERS_KEY));
  const [rawInput, setRawInput] = useState("");
  const [projectName, setProjectName] = useState("");
  const [suggestedSilos, setSuggestedSilos] = useState("");
  const [savedResults, setSavedResults] = useState<SavedClustering[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [userSuggestedSilos, setUserSuggestedSilos] = useState<string[]>([]);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [generatingIdeaForKw, setGeneratingIdeaForKw] = useState<string | null>(null);
  const [collapsedBlogIdeas, setCollapsedBlogIdeas] = useState<Set<string>>(new Set());
  const [collapsedLandingPages, setCollapsedLandingPages] = useState<Set<string>>(new Set());

  const toggleCollapsedSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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
          // Update in DB silently
          supabase
            .from("keyword_clustering_results")
            .update({ name: derived })
            .eq("id", item.id)
            .then();
        }
      }

      setSavedResults(mapped);
      // Auto-load most recent
      if (data.length > 0 && !result) {
        const latest = mapped[0];
        setResult(latest.result);
        setRawInput(latest.input_keywords.join("\n"));
        setActiveResultId(latest.id);
        setProjectName(latest.name || "");
        setExpandedClusters(new Set());
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
    setExpandedClusters(new Set());
    setIsResultsOpen(true);
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

  const deleteIdeaFromCluster = async (clusterTopic: string, ideaIndex: number) => {
    if (!result) return;
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
                <Button variant="outline" size="sm" onClick={exportSiloSummaryCSV} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Silo Summary
                </Button>
                <Button variant="outline" size="sm" onClick={exportClustersCSV} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Full Export
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

            {/* Cluster cards */}
            <div className="space-y-2">
              {[...result.clusters]
                .map((cluster, originalIdx) => ({ cluster, originalIdx }))
                .sort((a, b) => {
                  if (siloSortMode === "volume") {
                    return b.cluster.estimated_monthly_volume - a.cluster.estimated_monthly_volume;
                  }
                  // favorites first, then original order
                  const aFav = favoritedClusters.has(a.cluster.topic) ? 0 : 1;
                  const bFav = favoritedClusters.has(b.cluster.topic) ? 0 : 1;
                  return aFav - bFav || a.originalIdx - b.originalIdx;
                })
                .map(({ cluster, originalIdx: idx }) => (
                <Collapsible
                  key={cluster.topic}
                  open={expandedClusters.has(cluster.topic)}
                  onOpenChange={() => toggleCluster(cluster.topic)}
                >
                  <Card className="border">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            className="shrink-0 -ml-1 mr-0.5"
                            title={favoritedClusters.has(cluster.topic) ? "Remove from favorites" : "Add to favorites"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFavoritedClusters(toggleStoredSet(FAVORITED_CLUSTERS_KEY, cluster.topic));
                            }}
                          >
                            <Star className={`h-4 w-4 transition-colors ${favoritedClusters.has(cluster.topic) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"}`} />
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
                          const displayKws = sortedKws;
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
                              <div className="border rounded-md overflow-hidden">
                              <div className="grid grid-cols-[1fr_auto] gap-x-4 px-3 py-2 bg-muted/50 text-sm font-semibold text-foreground/70 border-b">
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
                                        className={`grid grid-cols-[1fr_auto] gap-x-4 px-3 py-2 text-[15px] border-b last:border-b-0 hover:bg-muted/30 transition-colors group/kw ${!isAssigned && blogIdeas.length > 0 ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}
                                      >
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
                                      <p className={`text-base font-semibold leading-snug ${isUsed ? "text-green-700 dark:text-green-400" : ""}`}>{idea.title}</p>
                                      <p className="text-xs text-muted-foreground">{idea.description}</p>
                                      <p className="text-xs text-primary/80 italic">↳ {idea.reason}</p>
                                      {idea.target_keywords && idea.target_keywords.length > 0 && (() => {
                                        // Build a case-insensitive volume lookup from cluster keyword_volumes
                                        const volLookup: Record<string, number> = {};
                                        if (cluster.keyword_volumes) {
                                          for (const [k, v] of Object.entries(cluster.keyword_volumes)) {
                                            volLookup[k.toLowerCase().trim()] = v;
                                          }
                                        }
                                        const getVol = (kw: string) => volLookup[kw.toLowerCase().trim()] ?? null;
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
                                                  {otherIdeas.length > 0 && (
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
                                                    </PopoverContent>
                                                  )}
                                                </Popover>
                                              );
                                            })}
                                          </div>
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


        {/* Saved results - Previous Research */}
        {savedResults.length > 0 && (
          <Collapsible>
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CollapsibleTrigger className="w-full flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Previous Research
                    <Badge variant="secondary" className="text-[10px]">{savedResults.length}</Badge>
                  </CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {savedResults.map(saved => {
                      const clusterCount = saved.result?.clusters?.length || 0;
                      const kwCount = saved.input_keywords?.length || 0;
                      const totalVol = saved.result?.clusters?.reduce((s, c) => s + (c.estimated_monthly_volume || 0), 0) || 0;
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
                              {kwCount} terms · {clusterCount} silos{totalVol > 0 ? ` · ~${formatVolume(totalVol)} vol` : ""} · {new Date(saved.created_at).toLocaleDateString()}
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
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
    </div>
  );
};

export default KeywordClustering;
