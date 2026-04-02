import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Search, Sparkles, Copy, Download, Trash2,
  ChevronDown, ChevronRight, Clock, Loader2, Square, ChevronUp,
  BrainCircuit, Tag, HelpCircle, SlidersHorizontal, Building2, Ban,
  Globe, X, Link2, Plus, Layers, Upload, Filter
} from "lucide-react";
import KeywordClustering from "@/components/keyword-research/KeywordClustering";
import KeywordDeduplicator from "@/components/keyword-research/KeywordDeduplicator";

interface ScanSite {
  url: string;
  filter: string;
}

interface ScanResult {
  url: string;
  terms: string[];
  urlCount: number;
  filteredCount?: number;
  blocked: boolean;
}

interface SemanticCluster {
  cluster_name: string;
  seed_keywords: string[];
  example_entities?: string[];
  questions: string[];
  modifiers: string[];
}

interface SemanticMap {
  topic: string;
  definition: string;
  clusters: SemanticCluster[];
  cross_cutting_modifiers: string[];
  negative_keywords: string[];
  notes: string;
  scanned_terms?: string[];
  url_extracted_terms?: string[];
  scan_results?: ScanResult[];
}

// Legacy format for backward compatibility with saved research
interface LegacyResult {
  categories: { name: string; terms: string[] }[];
}

interface SavedResearch {
  id: string;
  topic: string;
  context: string | null;
  results: SemanticMap | LegacyResult;
  created_at: string;
  client_tag: string | null;
}

function isSemanticMap(r: any): r is SemanticMap {
  return r && Array.isArray(r.clusters);
}

function isLegacy(r: any): r is LegacyResult {
  return r && Array.isArray(r.categories);
}

const KeywordResearch = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const hasClusteringStateInUrl = Boolean(
    searchParams.get("project") ||
    searchParams.get("silo") ||
    searchParams.get("view") === "results"
  );

  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [country, setCountry] = useState("");
  const [scanSites, setScanSites] = useState<ScanSite[]>([{ url: "", filter: "" }]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scannedTerms, setScannedTerms] = useState<string[]>([]);
  const [scanBlocked, setScanBlocked] = useState(false);
  const [manualSeeds, setManualSeeds] = useState("");
  const [urlListInput, setUrlListInput] = useState("");
  const [urlExtractedTerms, setUrlExtractedTerms] = useState<string[]>([]);
  const [uploadedSeedFiles, setUploadedSeedFiles] = useState<{ name: string; keywords: string[] }[]>([]);
  const seedFileInputRef = useRef<HTMLInputElement | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [semanticMap, setSemanticMap] = useState<SemanticMap | null>(null);
  const [legacyResults, setLegacyResults] = useState<LegacyResult | null>(null);
  const [currentTopic, setCurrentTopic] = useState("");
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());

  const [savedResearch, setSavedResearch] = useState<SavedResearch[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [clusteringProjects, setClusteringProjects] = useState<{ id: string; name: string | null; created_at: string; silo_count: number; kw_count: number; client_tag: string | null }[]>([]);
  const [dedupResults, setDedupResults] = useState<{ id: string; name: string; original_count: number; deduplicated_count: number; created_at: string }[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const clusteringSectionRef = useRef<HTMLDivElement | null>(null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isClusteringOpen, setIsClusteringOpen] = useState(() => hasClusteringStateInUrl);
  const [isDedupOpen, setIsDedupOpen] = useState(false);

  // Refine state
  const [isRefineOpen, setIsRefineOpen] = useState(false);
  const [isSuggestingModifiers, setIsSuggestingModifiers] = useState(false);
  const [suggestedDimensions, setSuggestedDimensions] = useState<{ dimension_name: string; modifiers: string[]; covered?: string[] }[]>([]);
  const [selectedSuggestedModifiers, setSelectedSuggestedModifiers] = useState<Set<string>>(new Set());
  const [manualRefineInput, setManualRefineInput] = useState("");
  const [isExpanding, setIsExpanding] = useState(false);

  // Array of normalised scanned+URL-extracted terms for substring matching in results
  const scannedTermsList = useMemo(() => {
    const set = new Set<string>();
    for (const t of scannedTerms) set.add(t.toLowerCase().trim());
    for (const t of urlExtractedTerms) set.add(t.toLowerCase().trim());
    return [...set].filter(t => t.length >= 3); // only meaningful terms
  }, [scannedTerms, urlExtractedTerms]);

  const isFromScan = useMemo(() => {
    return (kw: string) => {
      const lower = kw.toLowerCase().trim();
      return scannedTermsList.some(term => lower.includes(term) || term.includes(lower));
    };
  }, [scannedTermsList]);

  useEffect(() => {
    loadSavedResearch();
    loadClusteringProjects();
    loadDedupResults();
  }, []);

  const loadClusteringProjects = async () => {
    const { data } = await supabase
      .from("keyword_clustering_results")
      .select("id, name, created_at, result, client_tag")
      .order("created_at", { ascending: false })
;
    if (data) {
      setClusteringProjects(data.map((d: any) => {
        const r = d.result as any;
        return {
          id: d.id,
          name: d.name,
          created_at: d.created_at,
          silo_count: r?.clusters?.length || 0,
          kw_count: r?.total_keywords_clustered || 0,
          client_tag: d.client_tag || null,
        };
      }));
    }
  };

  const loadDedupResults = async () => {
    const { data } = await supabase
      .from("keyword_dedup_results")
      .select("id, name, original_count, deduplicated_count, created_at")
      .order("created_at", { ascending: false })
      ;
    if (data) setDedupResults(data as any);
  };

  useEffect(() => {
    if (!hasClusteringStateInUrl) return;

    setIsClusteringOpen(true);
    setIsGeneratorOpen(false);

    const frame = window.requestAnimationFrame(() => {
      clusteringSectionRef.current?.scrollIntoView({ block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasClusteringStateInUrl]);

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
        results: d.results,
        created_at: d.created_at,
      })));
    }
    setIsLoadingSaved(false);
  };

  // Parse URLs into keyword terms
  const stopTerms = new Set([
    "uk", "en", "en-gb", "en-us", "de", "de-de", "fr", "fr-fr", "es", "es-es", "it", "it-it",
    "c", "p", "s", "search", "brand", "shop", "category", "categories",
    "home", "index", "page", "about", "contact", "privacy", "terms",
    "cookie", "cookies", "login", "signup", "help", "support", "careers",
    "returns", "shipping-and-delivery", "cookies-policy", "privacy-policy",
    "terms-and-policies", "accessibility", "transparency-statement",
    "storefinder", "giftcardtype", "about-us", "in-store-events",
    "charity-partners", "request-a-catalogue", "gift-finder-hub",
  ]);

  const extractTermsFromUrls = (urlText: string): string[] => {
    const lines = urlText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    const terms = new Set<string>();

    for (const line of lines) {
      try {
        const url = new URL(line.startsWith("http") ? line : `https://${line}`);
        const segments = url.pathname.split("/").filter(Boolean);

        for (const seg of segments) {
          // Skip category/product IDs like SM060101, p/245602
          if (/^(SM|sm)\d+$/i.test(seg)) continue;
          if (/^\d+$/.test(seg)) continue;

          const cleaned = seg
            .replace(/[-_]/g, " ")
            .replace(/\.(html|htm|php|aspx|jsp)$/i, "")
            .replace(/\?.*$/, "")
            .trim()
            .toLowerCase();

          if (cleaned.length >= 3 && cleaned.length <= 60 && !stopTerms.has(cleaned)) {
            terms.add(cleaned);
          }
        }
      } catch {
        // Not a valid URL, skip
      }
    }

    return [...terms].sort();
  };

  const parseUrlList = () => {
    if (!urlListInput.trim()) return;
    const terms = extractTermsFromUrls(urlListInput);
    setUrlExtractedTerms(terms);
    toast({
      title: "URLs parsed!",
      description: `Extracted ${terms.length} keyword terms from URL paths`,
    });
  };

  // Combine scanned terms + manual seeds + URL-extracted terms
  const getAllSeeds = (): string[] => {
    const manual = manualSeeds.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(s => s.length >= 2);
    const fileKeywords = uploadedSeedFiles.flatMap(f => f.keywords);
    const combined = new Set([...scannedTerms, ...manual, ...urlExtractedTerms, ...fileKeywords]);
    return [...combined];
  };

  // Parse Ahrefs CSV and extract keywords
  const handleSeedFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const maxFiles = 3 - uploadedSeedFiles.length;
    const filesToProcess = Array.from(files).slice(0, maxFiles);

    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (!text) return;
        const lines = text.split("\n");
        if (lines.length < 2) return;

        // Find the "Keyword" column index from header
        const header = lines[0];
        // Handle quoted CSV fields
        const headerCols = header.split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        let kwIndex = headerCols.findIndex(h => h.toLowerCase() === "keyword");
        if (kwIndex === -1) kwIndex = 1; // Ahrefs default: column 2

        const keywords: string[] = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          // Simple CSV split (handles quoted fields with commas)
          const cols: string[] = [];
          let current = "";
          let inQuotes = false;
          for (const ch of line) {
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ""; continue; }
            current += ch;
          }
          cols.push(current.trim());

          const kw = cols[kwIndex]?.toLowerCase().trim();
          if (kw && kw.length >= 2) keywords.push(kw);
        }

        setUploadedSeedFiles(prev => [...prev, { name: file.name, keywords }]);
        toast({ title: `Loaded ${keywords.length} keywords`, description: file.name });
      };
      reader.readAsText(file);
    });
    // Reset input so same file can be re-uploaded
    e.target.value = "";
  };

  // Website scan — scan all sites with URLs
  const scanWebsites = async () => {
    const sitesToScan = scanSites.filter(s => s.url.trim());
    if (sitesToScan.length === 0) return;
    setIsScanning(true);
    try {
      const results: ScanResult[] = [];
      const allTerms: string[] = [];

      await Promise.all(sitesToScan.map(async (site) => {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-website-keywords`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ url: site.url.trim(), urlFilters: site.filter.trim() || undefined }),
          }
        );
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Scan failed for ${site.url}: ${response.status}`);
        }
        const data = await response.json();
        results.push({
          url: data.url,
          terms: data.extracted_terms || [],
          urlCount: data.total_urls_found,
          filteredCount: data.filtered_urls_count,
          blocked: data.likely_blocked || false,
        });
        allTerms.push(...(data.extracted_terms || []));
      }));

      const uniqueTerms = [...new Set(allTerms)];
      setScanResults(results);
      setScannedTerms(uniqueTerms);
      setScanBlocked(results.some(r => r.blocked));

      const blockedSites = results.filter(r => r.blocked);
      if (blockedSites.length > 0) {
        toast({
          title: "Some sites may be blocking crawlers",
          description: `${blockedSites.length} site(s) returned very few terms.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Websites scanned!",
          description: `Found ${uniqueTerms.length} keyword ideas from ${results.length} site(s)`,
        });
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  };

  const generate = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    setSemanticMap(null);
    setLegacyResults(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-keyword-universe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            topic: topic.trim(),
            audience: audience.trim() || undefined,
            country: country.trim() || undefined,
            websiteTerms: getAllSeeds().length > 0 ? getAllSeeds() : undefined,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      const data = await response.json();
      const map = data.results as SemanticMap;
      // Persist scanned terms alongside the results
      map.scanned_terms = [...scannedTerms];
      map.url_extracted_terms = [...urlExtractedTerms];
      map.scan_results = [...scanResults];
      setSemanticMap(map);
      setCurrentTopic(topic.trim());
      setOpenClusters(new Set(map.clusters.map(c => c.cluster_name)));

      // Save to database
      await supabase
        .from("keyword_research" as any)
        .insert({
          topic: topic.trim(),
          context: [audience.trim(), country.trim()].filter(Boolean).join(" | ") || null,
          results: map as any,
        });
      loadSavedResearch();

      const totalSeeds = map.clusters.reduce((s, c) => s + c.seed_keywords.length, 0);
      toast({
        title: "Semantic map generated!",
        description: `${map.clusters.length} clusters, ${totalSeeds} seed keywords`,
      });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err: any) {
      if (err.name === "AbortError") {
        toast({ title: "Generation stopped" });
      } else {
        console.error(err);
        toast({ title: "Generation failed", description: err.message, variant: "destructive" });
      }
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  };

  const stopOperation = () => abortControllerRef.current?.abort();

  const suggestModifiers = async () => {
    if (!semanticMap) return;
    setIsSuggestingModifiers(true);
    setSuggestedDimensions([]);
    setSelectedSuggestedModifiers(new Set());
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refine-keyword-universe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            mode: "suggest_modifiers",
            topic: semanticMap.topic,
            definition: semanticMap.definition,
            existingClusters: semanticMap.clusters,
            existingModifiers: semanticMap.cross_cutting_modifiers,
            audience: audience.trim() || undefined,
            country: country.trim() || undefined,
          }),
        }
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }
      const data = await response.json();
      setSuggestedDimensions(data.suggestions?.dimensions || []);
      toast({ title: "Modifier suggestions ready!", description: "Select the ones you want to add" });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Failed to suggest modifiers", description: err.message, variant: "destructive" });
    } finally {
      setIsSuggestingModifiers(false);
    }
  };

  const toggleSuggestedModifier = (mod: string) => {
    setSelectedSuggestedModifiers(prev => {
      const next = new Set(prev);
      next.has(mod) ? next.delete(mod) : next.add(mod);
      return next;
    });
  };

  const selectAllInDimension = (mods: string[]) => {
    setSelectedSuggestedModifiers(prev => {
      const next = new Set(prev);
      const allSelected = mods.every(m => next.has(m));
      if (allSelected) { mods.forEach(m => next.delete(m)); }
      else { mods.forEach(m => next.add(m)); }
      return next;
    });
  };

  const expandWithModifiers = async () => {
    if (!semanticMap) return;
    const manualItems = manualRefineInput.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length >= 2);
    const selectedMods = [...selectedSuggestedModifiers];
    if (manualItems.length === 0 && selectedMods.length === 0) {
      toast({ title: "Nothing to add", description: "Select suggested modifiers or type your own", variant: "destructive" });
      return;
    }
    setIsExpanding(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refine-keyword-universe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            mode: "expand",
            topic: semanticMap.topic,
            definition: semanticMap.definition,
            existingClusters: semanticMap.clusters,
            newModifiers: selectedMods,
            newSeeds: manualItems,
            audience: audience.trim() || undefined,
            country: country.trim() || undefined,
          }),
        }
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }
      const data = await response.json();
      const expansion = data.expansion;
      if (!expansion) throw new Error("No expansion data returned");

      // Merge expansion into existing semanticMap
      const updatedMap = { ...semanticMap };
      const clusterMap = new Map(updatedMap.clusters.map(c => [c.cluster_name, { ...c }]));

      let totalAdded = 0;
      for (const exp of expansion.expansions || []) {
        const existing = clusterMap.get(exp.cluster_name);
        if (existing) {
          const existingSet = new Set(existing.seed_keywords.map((k: string) => k.toLowerCase()));
          const newKws = (exp.new_seed_keywords || []).filter((k: string) => !existingSet.has(k.toLowerCase()));
          existing.seed_keywords = [...existing.seed_keywords, ...newKws];
          totalAdded += newKws.length;

          const existingQs = new Set(existing.questions.map((q: string) => q.toLowerCase()));
          const newQs = (exp.new_questions || []).filter((q: string) => !existingQs.has(q.toLowerCase()));
          existing.questions = [...existing.questions, ...newQs];

          const existingMods = new Set(existing.modifiers.map((m: string) => m.toLowerCase()));
          const newMods = (exp.new_modifiers || []).filter((m: string) => !existingMods.has(m.toLowerCase()));
          existing.modifiers = [...existing.modifiers, ...newMods];

          clusterMap.set(exp.cluster_name, existing);
        } else {
          // New cluster
          clusterMap.set(exp.cluster_name, {
            cluster_name: exp.cluster_name,
            seed_keywords: exp.new_seed_keywords || [],
            questions: exp.new_questions || [],
            modifiers: exp.new_modifiers || [],
            example_entities: [],
          });
          totalAdded += (exp.new_seed_keywords || []).length;
        }
      }

      // Add new cross-cutting modifiers
      if (expansion.new_cross_cutting_modifiers?.length) {
        const existingCCM = new Set(updatedMap.cross_cutting_modifiers.map(m => m.toLowerCase()));
        const newCCM = expansion.new_cross_cutting_modifiers.filter((m: string) => !existingCCM.has(m.toLowerCase()));
        updatedMap.cross_cutting_modifiers = [...updatedMap.cross_cutting_modifiers, ...newCCM];
      }

      updatedMap.clusters = [...clusterMap.values()];
      setSemanticMap(updatedMap);
      setOpenClusters(new Set(updatedMap.clusters.map(c => c.cluster_name)));

      // Clear refine inputs
      setManualRefineInput("");
      setSelectedSuggestedModifiers(new Set());
      setSuggestedDimensions([]);

      toast({ title: "Keywords expanded!", description: `Added ${totalAdded} new seed keywords` });

      // Update saved research
      await supabase
        .from("keyword_research" as any)
        .update({ results: updatedMap as any })
        .eq("topic", updatedMap.topic);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Expansion failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExpanding(false);
    }
  };

  const toggleCluster = (name: string) => {
    setOpenClusters(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const copyItems = (items: string[], label: string) => {
    navigator.clipboard.writeText(items.join("\n"));
    toast({ title: "Copied!", description: `${items.length} ${label} copied` });
  };

  const copyAllSeeds = () => {
    if (!semanticMap) return;
    const all = semanticMap.clusters.flatMap(c => c.seed_keywords);
    copyItems(all, "seed keywords");
  };

  const exportCSV = () => {
    if (!semanticMap) return;
    const rows = [["Cluster", "Type", "Item"]];
    for (const c of semanticMap.clusters) {
      c.seed_keywords.forEach(k => rows.push([c.cluster_name, "seed_keyword", k]));
      (c.example_entities || []).forEach(e => rows.push([c.cluster_name, "entity", e]));
      c.questions.forEach(q => rows.push([c.cluster_name, "question", q]));
      c.modifiers.forEach(m => rows.push([c.cluster_name, "modifier", m]));
    }
    semanticMap.negative_keywords.forEach(k => rows.push(["_negative", "negative", k]));
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `semantic-map-${currentTopic.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadResearch = (saved: SavedResearch) => {
    setCurrentTopic(saved.topic);
    setTopic(saved.topic);
    setAudience("");
    setCountry("");
    if (isSemanticMap(saved.results)) {
      setSemanticMap(saved.results);
      setLegacyResults(null);
      setOpenClusters(new Set(saved.results.clusters.map(c => c.cluster_name)));
      // Restore scanned terms from saved data
      setScannedTerms(saved.results.scanned_terms || []);
      setUrlExtractedTerms(saved.results.url_extracted_terms || []);
      setScanResults(saved.results.scan_results || []);
    } else if (isLegacy(saved.results)) {
      setLegacyResults(saved.results);
      setSemanticMap(null);
      setOpenClusters(new Set(saved.results.categories.map(c => c.name)));
      setScannedTerms([]);
      setUrlExtractedTerms([]);
      setScanResults([]);
    }
  };

  const deleteResearch = async (id: string) => {
    const { error } = await supabase.from("keyword_research" as any).delete().eq("id", id);
    if (!error) {
      setSavedResearch(prev => prev.filter(r => r.id !== id));
      toast({ title: "Deleted" });
    }
  };

  const getResearchStats = (r: SavedResearch) => {
    if (isSemanticMap(r.results)) {
      const seeds = r.results.clusters.reduce((s, c) => s + c.seed_keywords.length, 0);
      return `${seeds} seeds · ${r.results.clusters.length} clusters`;
    }
    if (isLegacy(r.results)) {
      const terms = r.results.categories.reduce((s, c) => s + c.terms.length, 0);
      return `${terms} terms · ${r.results.categories.length} categories`;
    }
    return "";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <button
            onClick={() => {
              setSearchParams({});
              setIsGeneratorOpen(false);
              setIsClusteringOpen(false);
              setIsDedupOpen(false);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex items-center gap-2 hover:opacity-70 transition-opacity"
          >
            <Search className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Keyword Research</h1>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4 keyword-research-page">
        {/* Semantic Keyword Universe */}
        <Collapsible open={isGeneratorOpen} onOpenChange={setIsGeneratorOpen}>
          <Card className="border-[3px] border-primary/30">
            <CollapsibleTrigger className="w-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-primary" />
                    Semantic Keyword Universe
                    {!isGeneratorOpen && savedResearch.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">{savedResearch.length} saved</Badge>
                    )}
                  </CardTitle>
                  {isGeneratorOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
                {!isGeneratorOpen && savedResearch.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 text-left" onClick={e => e.stopPropagation()}>
                    {savedResearch.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { loadResearch(r); setIsGeneratorOpen(true); }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-accent/30 hover:bg-accent text-xs font-medium transition-colors"
                      >
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate max-w-[180px]">{r.topic}</span>
                        <span className="text-muted-foreground">{getResearchStats(r)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                {/* Saved research — at the top when section is open */}
                {savedResearch.length > 0 && (
                  <Card className="border-dashed">
                    <CardContent className="py-3 px-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Your Projects ({savedResearch.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {savedResearch.map(r => (
                          <div key={r.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-accent/30 hover:bg-accent text-xs font-medium transition-colors">
                            <button
                              className="flex items-center gap-1.5"
                              onClick={() => loadResearch(r)}
                            >
                              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="truncate max-w-[180px]">{r.topic}</span>
                              <span className="text-muted-foreground">{getResearchStats(r)}</span>
                            </button>
                            <button
                              className="text-muted-foreground hover:text-destructive ml-1"
                              onClick={(e) => { e.stopPropagation(); deleteResearch(r.id); }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                <div>
                  <label className="text-sm font-medium mb-1 block">Topic *</label>
                  <Input
                    placeholder="e.g. toys, meeting new people, dental tourism..."
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !isGenerating && generate()}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Audience (optional)</label>
                    <Input
                      placeholder="e.g. parents, expats, professionals over 40..."
                      value={audience}
                      onChange={e => setAudience(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Country (optional)</label>
                    <Input
                      placeholder="e.g. UK, Germany, USA..."
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                    />
                  </div>
                </div>

                {/* Website Scanner — up to 3 sites */}
                <div>
                  <label className="text-sm font-medium mb-1 block">Scan Websites (optional — up to 3)</label>
                  <div className="space-y-2">
                    {scanSites.map((site, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="flex-1 space-y-1">
                          <Input
                            placeholder="e.g. https://example.com"
                            value={site.url}
                            onChange={e => {
                              const updated = [...scanSites];
                              updated[idx] = { ...updated[idx], url: e.target.value };
                              setScanSites(updated);
                            }}
                          />
                          <Input
                            placeholder="URL must contain (optional) — e.g. track, field"
                            value={site.filter}
                            onChange={e => {
                              const updated = [...scanSites];
                              updated[idx] = { ...updated[idx], filter: e.target.value };
                              setScanSites(updated);
                            }}
                            className="text-sm"
                          />
                        </div>
                        {scanSites.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 mt-1"
                            onClick={() => setScanSites(scanSites.filter((_, i) => i !== idx))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {scanSites.length < 3 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => setScanSites([...scanSites, { url: "", filter: "" }])}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add site
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={scanWebsites}
                      disabled={!scanSites.some(s => s.url.trim()) || isScanning}
                      className="gap-2 shrink-0 ml-auto"
                    >
                      {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                      {isScanning ? "Scanning..." : "Scan"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Filter field: only scan URLs containing these keywords (comma-separated). Leave blank to scan all pages.
                  </p>
                </div>

                {/* Scanned terms preview */}
                {scannedTerms.length > 0 && (
                  <div className={`p-3 rounded-md border ${scanBlocked ? 'bg-destructive/10 border-destructive/30' : 'bg-accent/20'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-primary" />
                        {scannedTerms.length} terms from {scanResults.length} site(s)
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setScannedTerms([]); setScanResults([]); setScanBlocked(false); }}>
                        <X className="h-3 w-3 mr-1" /> Clear
                      </Button>
                    </div>
                    {scanResults.map((r, i) => (
                      <div key={i} className="text-xs text-muted-foreground mb-1">
                        {r.url}: {r.terms.length} terms
                        ({r.filteredCount != null && r.filteredCount !== r.urlCount
                          ? `${r.filteredCount} of ${r.urlCount} URLs matched filter`
                          : `${r.urlCount} pages found`})
                        {r.blocked && <span className="text-destructive ml-1">⚠️ may be blocked</span>}
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto mt-2">
                      {scannedTerms.slice(0, 80).map((t, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] font-normal">{t}</Badge>
                      ))}
                      {scannedTerms.length > 80 && (
                        <Badge variant="outline" className="text-[10px] font-normal">+{scannedTerms.length - 80} more</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* URL list parser */}
                <div>
                  <label className="text-sm font-medium mb-1 block flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    Extract Terms from URLs (optional)
                  </label>
                  <div className="flex gap-2 items-start">
                    <Textarea
                      placeholder="Paste a list of URLs — one per line. Terms will be extracted from the URL paths automatically.&#10;&#10;e.g.&#10;https://www.smythstoys.com/uk/en-gb/toys/action-figures-and-playsets/c/SM060101&#10;https://www.smythstoys.com/uk/en-gb/toys/fashion-and-dolls/barbie/c/SM06010403"
                      value={urlListInput}
                      onChange={e => setUrlListInput(e.target.value)}
                      rows={4}
                      className="text-sm font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      onClick={parseUrlList}
                      disabled={!urlListInput.trim()}
                      className="shrink-0 gap-1.5"
                    >
                      <Link2 className="h-4 w-4" />
                      Extract
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Extracts category names, brand names, and product types from URL path segments. Great when site crawling is blocked.
                  </p>
                </div>

                {/* URL-extracted terms preview */}
                {urlExtractedTerms.length > 0 && (
                  <div className="p-3 rounded-md border bg-accent/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Link2 className="h-3.5 w-3.5 text-primary" />
                        {urlExtractedTerms.length} terms extracted from URLs
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setUrlExtractedTerms([]); setUrlListInput(""); }}>
                        <X className="h-3 w-3 mr-1" /> Clear
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                      {urlExtractedTerms.slice(0, 100).map((t, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] font-normal">{t}</Badge>
                      ))}
                      {urlExtractedTerms.length > 100 && (
                        <Badge variant="outline" className="text-[10px] font-normal">+{urlExtractedTerms.length - 100} more</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Upload CSV seed files */}
                <div>
                  <label className="text-sm font-medium mb-1 block flex items-center gap-1.5">
                    <Upload className="h-3.5 w-3.5" />
                    Upload Keyword CSV (up to 3)
                    {uploadedSeedFiles.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">
                        {uploadedSeedFiles.reduce((s, f) => s + f.keywords.length, 0)} keywords ready
                      </Badge>
                    )}
                  </label>
                  <input
                    ref={seedFileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    multiple
                    className="hidden"
                    onChange={handleSeedFileUpload}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    {uploadedSeedFiles.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-xs gap-1 py-1">
                        {f.name} ({f.keywords.length})
                        <button onClick={() => setUploadedSeedFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-1 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {uploadedSeedFiles.length < 3 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => seedFileInputRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {uploadedSeedFiles.length === 0 ? "Upload CSV" : "Add file"}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ahrefs CSV format supported. Keywords are extracted from the "Keyword" column.
                  </p>
                </div>

                {/* Manual keyword seeds */}
                <div>
                  <label className="text-sm font-medium mb-1 block">Additional Keyword Seeds (optional)</label>
                  <Textarea
                    placeholder="Paste category names, brand names, or product types — one per line or comma-separated. e.g.&#10;Lego&#10;Barbie&#10;outdoor toys, board games, action figures"
                    value={manualSeeds}
                    onChange={e => setManualSeeds(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    These will be combined with any scanned/extracted/uploaded terms and fed into the semantic generator.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={generate} disabled={!topic.trim() || isGenerating} className="gap-2">
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isGenerating ? "Generating..." : "Generate Semantic Map"}
                  </Button>
                  {isGenerating && (
                    <Button variant="destructive" size="sm" onClick={stopOperation} className="gap-2">
                      <Square className="h-3.5 w-3.5" />
                      Stop
                    </Button>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Loading */}
        {isGenerating && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {/* Semantic Map Results */}
        <div ref={resultsRef}>
          {semanticMap && !isGenerating && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-semibold">"{semanticMap.topic}"</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{semanticMap.definition}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyAllSeeds} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    Copy All Seeds
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary">
                  {semanticMap.clusters.length} clusters
                </Badge>
                <Badge variant="secondary">
                  {semanticMap.clusters.reduce((s, c) => s + c.seed_keywords.length, 0)} seed keywords
                </Badge>
                <Badge variant="secondary">
                  {semanticMap.clusters.reduce((s, c) => s + c.questions.length, 0)} questions
                </Badge>
                <Badge variant="secondary">
                  {semanticMap.clusters.reduce((s, c) => s + (c.example_entities?.length || 0), 0)} entities
                </Badge>
              </div>

              {/* Refine Results Panel */}
              <Collapsible open={isRefineOpen} onOpenChange={setIsRefineOpen}>
                <Card className="border-dashed border-primary/40">
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <SlidersHorizontal className="h-4 w-4 text-primary" />
                          Refine Results
                        </CardTitle>
                        {isRefineOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4 px-4 space-y-4">
                      {/* Suggest Modifiers */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium">AI Modifier Suggestions</label>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={suggestModifiers}
                            disabled={isSuggestingModifiers}
                          >
                            {isSuggestingModifiers ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                             {isSuggestingModifiers ? "Analysing gaps..." : "Analyse Modifier Gaps"}
                           </Button>
                         </div>
                         <p className="text-xs text-muted-foreground mb-3">
                           AI will review ALL your generated keywords, identify which modifier dimensions are already covered, and show you exactly what's missing.
                         </p>

                        {isSuggestingModifiers && (
                          <div className="space-y-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                              <Skeleton key={i} className="h-8 w-full" />
                            ))}
                          </div>
                        )}

                        {suggestedDimensions.length > 0 && (
                          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                            {suggestedDimensions.map((dim, di) => {
                              const allSelected = dim.modifiers.every(m => selectedSuggestedModifiers.has(m));
                              return (
                                <div key={di} className="border rounded-md p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">{dim.dimension_name}</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-xs"
                                      onClick={() => selectAllInDimension(dim.modifiers)}
                                    >
                                      {allSelected ? "Deselect all" : "Select all"}
                                    </Button>
                                  </div>
                                  {dim.covered && dim.covered.length > 0 && (
                                    <div className="mb-2">
                                      <span className="text-xs text-muted-foreground font-medium">✓ Already covered:</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {dim.covered.map((c, ci) => (
                                          <Badge key={ci} variant="secondary" className="text-xs opacity-60">{c}</Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-xs text-destructive font-medium">✗ Missing — click to select:</span>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                      {dim.modifiers.map((mod, mi) => (
                                        <Badge
                                          key={mi}
                                          variant={selectedSuggestedModifiers.has(mod) ? "default" : "outline"}
                                          className="cursor-pointer text-xs transition-colors"
                                          onClick={() => toggleSuggestedModifier(mod)}
                                        >
                                          {mod}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {selectedSuggestedModifiers.size > 0 && (
                              <p className="text-xs text-primary font-medium">
                                {selectedSuggestedModifiers.size} modifier{selectedSuggestedModifiers.size !== 1 ? 's' : ''} selected
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Manual seeds/modifiers */}
                      <div>
                        <label className="text-sm font-medium mb-1 block">Add Your Own Seeds / Modifiers</label>
                        <Textarea
                          placeholder="Type additional keywords or modifiers — one per line or comma-separated.&#10;e.g. 1 year old, 2 year old, 3-6 years, wooden, Montessori-certified"
                          value={manualRefineInput}
                          onChange={e => setManualRefineInput(e.target.value)}
                          rows={3}
                          className="text-sm"
                        />
                      </div>

                      {/* Expand button */}
                      <Button
                        onClick={expandWithModifiers}
                        disabled={isExpanding || (selectedSuggestedModifiers.size === 0 && !manualRefineInput.trim())}
                        className="gap-2"
                      >
                        {isExpanding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {isExpanding ? "Expanding keywords..." : "Expand Keywords with Selected Modifiers"}
                      </Button>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Clusters */}
              <div className="space-y-2">
                {semanticMap.clusters.map(cluster => (
                  <Collapsible
                    key={cluster.cluster_name}
                    open={openClusters.has(cluster.cluster_name)}
                    onOpenChange={() => toggleCluster(cluster.cluster_name)}
                  >
                    <Card>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {openClusters.has(cluster.cluster_name) ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-medium text-sm">{cluster.cluster_name}</span>
                            </div>
                            <div className="flex gap-1.5">
                              <Badge variant="outline" className="text-xs gap-1">
                                <Tag className="h-3 w-3" />
                                {cluster.seed_keywords.length}
                              </Badge>
                              <Badge variant="outline" className="text-xs gap-1">
                                <HelpCircle className="h-3 w-3" />
                                {cluster.questions.length}
                              </Badge>
                              {cluster.example_entities && cluster.example_entities.length > 0 && (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {cluster.example_entities.length}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-4 px-4">
                          <Tabs defaultValue="seeds" className="w-full">
                            <TabsList className="mb-3">
                              <TabsTrigger value="seeds" className="gap-1 text-xs">
                                <Tag className="h-3 w-3" />
                                Seeds ({cluster.seed_keywords.length})
                              </TabsTrigger>
                              <TabsTrigger value="questions" className="gap-1 text-xs">
                                <HelpCircle className="h-3 w-3" />
                                Questions ({cluster.questions.length})
                              </TabsTrigger>
                              {cluster.example_entities && cluster.example_entities.length > 0 && (
                                <TabsTrigger value="entities" className="gap-1 text-xs">
                                  <Building2 className="h-3 w-3" />
                                  Entities ({cluster.example_entities.length})
                                </TabsTrigger>
                              )}
                              <TabsTrigger value="modifiers" className="gap-1 text-xs">
                                <SlidersHorizontal className="h-3 w-3" />
                                Modifiers ({cluster.modifiers.length})
                              </TabsTrigger>
                            </TabsList>

                            <TabsContent value="seeds">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground">Click to copy individual · button to copy all</span>
                                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copyItems(cluster.seed_keywords, "seed keywords")}>
                                  <Copy className="h-3 w-3" /> Copy all
                                </Button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {cluster.seed_keywords.map((kw, i) => {
                                  const fromScan = isFromScan(kw);
                                  return (
                                    <Badge
                                      key={i}
                                      variant="secondary"
                                      className={`cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs ${fromScan ? 'ring-1 ring-primary/50 bg-primary/10' : ''}`}
                                      onClick={() => {
                                        navigator.clipboard.writeText(kw);
                                        toast({ title: "Copied", description: kw });
                                      }}
                                    >
                                      {fromScan && <Globe className="h-3 w-3 mr-1 text-primary" />}
                                      {kw}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </TabsContent>

                            <TabsContent value="questions">
                              <div className="flex items-center justify-end mb-2">
                                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copyItems(cluster.questions, "questions")}>
                                  <Copy className="h-3 w-3" /> Copy all
                                </Button>
                              </div>
                              <div className="space-y-1">
                                {cluster.questions.map((q, i) => (
                                  <div
                                    key={i}
                                    className="text-sm py-1 px-2 rounded hover:bg-accent/50 cursor-pointer transition-colors"
                                    onClick={() => {
                                      navigator.clipboard.writeText(q);
                                      toast({ title: "Copied", description: q });
                                    }}
                                  >
                                    {q}
                                  </div>
                                ))}
                              </div>
                            </TabsContent>

                            {cluster.example_entities && cluster.example_entities.length > 0 && (
                              <TabsContent value="entities">
                                <div className="flex items-center justify-end mb-2">
                                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copyItems(cluster.example_entities!, "entities")}>
                                    <Copy className="h-3 w-3" /> Copy all
                                  </Button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {cluster.example_entities.map((e, i) => (
                                    <Badge
                                      key={i}
                                      variant="outline"
                                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs"
                                      onClick={() => {
                                        navigator.clipboard.writeText(e);
                                        toast({ title: "Copied", description: e });
                                      }}
                                    >
                                      {e}
                                    </Badge>
                                  ))}
                                </div>
                              </TabsContent>
                            )}

                            <TabsContent value="modifiers">
                              <div className="flex items-center justify-end mb-2">
                                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copyItems(cluster.modifiers, "modifiers")}>
                                  <Copy className="h-3 w-3" /> Copy all
                                </Button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {cluster.modifiers.map((m, i) => (
                                  <Badge
                                    key={i}
                                    variant="secondary"
                                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs bg-muted"
                                    onClick={() => {
                                      navigator.clipboard.writeText(m);
                                      toast({ title: "Copied", description: m });
                                    }}
                                  >
                                    {m}
                                  </Badge>
                                ))}
                              </div>
                            </TabsContent>
                          </Tabs>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                ))}
              </div>

              {/* Cross-cutting & Negative */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {semanticMap.cross_cutting_modifiers.length > 0 && (
                  <Card>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-primary" />
                        Cross-Cutting Modifiers
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 pb-4 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {semanticMap.cross_cutting_modifiers.map((m, i) => (
                          <Badge key={i} variant="secondary" className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground" onClick={() => {
                            navigator.clipboard.writeText(m);
                            toast({ title: "Copied", description: m });
                          }}>
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {semanticMap.negative_keywords.length > 0 && (
                  <Card>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Ban className="h-4 w-4 text-destructive" />
                        Negative Keywords
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 pb-4 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {semanticMap.negative_keywords.map((k, i) => (
                          <Badge key={i} variant="outline" className="text-xs border-destructive/30 text-destructive cursor-pointer" onClick={() => {
                            navigator.clipboard.writeText(k);
                            toast({ title: "Copied", description: k });
                          }}>
                            {k}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Notes */}
              {semanticMap.notes && (
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-sm text-muted-foreground">{semanticMap.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Legacy results (backward compat) */}
          {legacyResults && !isGenerating && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">"{currentTopic}"</h2>
                  <Badge variant="secondary">
                    {legacyResults.categories.reduce((s, c) => s + c.terms.length, 0)} terms · {legacyResults.categories.length} categories
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                {legacyResults.categories.map(category => (
                  <Collapsible
                    key={category.name}
                    open={openClusters.has(category.name)}
                    onOpenChange={() => toggleCluster(category.name)}
                  >
                    <Card>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {openClusters.has(category.name) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              <span className="font-medium text-sm">{category.name}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">{category.terms.length} terms</Badge>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-4 px-4">
                          <div className="flex flex-wrap gap-1.5">
                            {category.terms.map((term, idx) => (
                              <Badge key={idx} variant="secondary" className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs" onClick={() => {
                                navigator.clipboard.writeText(term);
                                toast({ title: "Copied", description: term });
                              }}>
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
        </div>

        {/* Keyword Clustering — collapsible */}
        <div ref={clusteringSectionRef}>
        <Collapsible open={isClusteringOpen} onOpenChange={setIsClusteringOpen}>
          <Card className="border-[3px] border-primary/30">
            <CollapsibleTrigger className="w-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    Keyword Clustering & Topic Silos
                    {!isClusteringOpen && clusteringProjects.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">{clusteringProjects.length} project{clusteringProjects.length !== 1 ? "s" : ""}</Badge>
                    )}
                  </CardTitle>
                  {isClusteringOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
                {!isClusteringOpen && clusteringProjects.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 text-left" onClick={e => e.stopPropagation()}>
                    {clusteringProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSearchParams(prev => {
                            const params = new URLSearchParams(prev);
                            params.set("project", p.id);
                            params.set("view", "results");
                            return params;
                          });
                          setIsClusteringOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-accent/30 hover:bg-accent text-xs font-medium transition-colors"
                      >
                        <Layers className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate max-w-[180px]">{p.name || "Untitled"}</span>
                        <span className="text-muted-foreground">{p.silo_count} silos · {p.kw_count} kw</span>
                        {p.client_tag && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.client_tag}</Badge>}
                      </button>
                    ))}
                  </div>
                )}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <KeywordClustering />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
        </div>

        {/* Keyword Deduplicator — collapsible */}
        <Collapsible open={isDedupOpen} onOpenChange={setIsDedupOpen}>
          <Card className="border-[3px] border-primary/30">
            <CollapsibleTrigger className="w-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    Keyword Deduplicator
                    {!isDedupOpen && dedupResults.length > 0 && (
                      <Badge variant="secondary" className="text-xs ml-1">{dedupResults.length} saved</Badge>
                    )}
                  </CardTitle>
                  {isDedupOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
                {!isDedupOpen && dedupResults.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 text-left" onClick={e => e.stopPropagation()}>
                    {dedupResults.map(d => (
                      <button
                        key={d.id}
                        onClick={() => setIsDedupOpen(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-accent/30 hover:bg-accent text-xs font-medium transition-colors"
                      >
                        <Filter className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate max-w-[180px]">{d.name}</span>
                        <span className="text-muted-foreground">{d.original_count}→{d.deduplicated_count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <KeywordDeduplicator />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {isLoadingSaved && !savedResearch.length && (
          <Skeleton className="h-24 w-full" />
        )}
      </main>
    </div>
  );
};

export default KeywordResearch;
