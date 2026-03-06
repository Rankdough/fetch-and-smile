import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  Globe, X, Link2, Plus, Layers
} from "lucide-react";
import KeywordClustering from "@/components/keyword-research/KeywordClustering";

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
}

function isSemanticMap(r: any): r is SemanticMap {
  return r && Array.isArray(r.clusters);
}

function isLegacy(r: any): r is LegacyResult {
  return r && Array.isArray(r.categories);
}

const KeywordResearch = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

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

  const [isGenerating, setIsGenerating] = useState(false);
  const [semanticMap, setSemanticMap] = useState<SemanticMap | null>(null);
  const [legacyResults, setLegacyResults] = useState<LegacyResult | null>(null);
  const [currentTopic, setCurrentTopic] = useState("");
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());

  const [savedResearch, setSavedResearch] = useState<SavedResearch[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(true);
  const [isClusteringOpen, setIsClusteringOpen] = useState(false);

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
    const combined = new Set([...scannedTerms, ...manual, ...urlExtractedTerms]);
    return [...combined];
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
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Keyword Research</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 keyword-research-page">
        {/* Input */}
        <Collapsible open={isGeneratorOpen} onOpenChange={setIsGeneratorOpen}>
          <Card className="border-[3px] border-primary/30">
            <CollapsibleTrigger className="w-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-primary" />
                    Semantic Keyword Universe
                  </CardTitle>
                  {isGeneratorOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
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
                    These will be combined with any scanned/extracted terms and fed into the semantic generator.
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
        <Collapsible open={isClusteringOpen} onOpenChange={setIsClusteringOpen}>
          <Card className="border-[3px] border-primary/30">
            <CollapsibleTrigger className="w-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    Keyword Clustering & Topic Silos
                  </CardTitle>
                  {isClusteringOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <KeywordClustering />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Previous Research — standalone */}
        {savedResearch.length > 0 && (
          <Collapsible>
            <Card>
              <CardHeader>
                <CollapsibleTrigger className="w-full flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Previous Research
                    <Badge variant="secondary" className="text-xs">{savedResearch.length}</Badge>
                  </CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <div className="space-y-2">
                    {savedResearch.map(saved => (
                      <div
                        key={saved.id}
                        className="flex items-center justify-between p-3 rounded-md border hover:bg-accent/50 transition-colors"
                      >
                        <button className="flex-1 text-left" onClick={() => loadResearch(saved)}>
                          <span className="font-medium text-sm">{saved.topic}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {getResearchStats(saved)} · {new Date(saved.created_at).toLocaleDateString()}
                          </span>
                        </button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); deleteResearch(saved.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {isLoadingSaved && !savedResearch.length && (
          <Skeleton className="h-24 w-full" />
        )}
      </main>
    </div>
  );
};

export default KeywordResearch;
