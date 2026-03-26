import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Loader2, Download, Copy, Trash2, ChevronDown, ChevronRight,
  FileText, Sparkles, X, Filter, Zap, BrainCircuit, Save, Clock, FolderOpen
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";

interface DedupKeyword {
  keyword: string;
  volume: number;
  merged: boolean;
  variantCount: number;
  variants?: { keyword: string; volume: number }[];
}

interface DedupResult {
  originalCount: number;
  deduplicatedCount: number;
  removedCount: number;
  fuzzyMergedGroups: number;
  aiMergedGroups: number;
  keywords: DedupKeyword[];
}

interface UngroupedEntry {
  canonical: string;
  totalVolume: number;
}

interface SavedDedupResult {
  id: string;
  name: string;
  file_name: string | null;
  original_count: number;
  deduplicated_count: number;
  removed_count: number;
  fuzzy_merged_groups: number;
  ai_merged_groups: number;
  created_at: string;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(current.trim()); current = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (current || row.length) { row.push(current.trim()); rows.push(row); row = []; current = ""; }
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      current += ch;
    }
  }
  if (current || row.length) { row.push(current.trim()); rows.push(row); }
  return rows;
}

function parseVolume(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/,/g, "").trim().toLowerCase();
  if (cleaned.endsWith("k")) return Math.round(parseFloat(cleaned) * 1000);
  if (cleaned.endsWith("m")) return Math.round(parseFloat(cleaned) * 1000000);
  const num = parseInt(cleaned);
  return isNaN(num) ? 0 : num;
}

const KeywordDeduplicator = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawKeywords, setRawKeywords] = useState<{ keyword: string; volume: number }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<DedupResult | null>(null);
  const [ungroupedForAI, setUngroupedForAI] = useState<UngroupedEntry[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showMergedOnly, setShowMergedOnly] = useState(false);

  // Save/load state
  const [savedResults, setSavedResults] = useState<SavedDedupResult[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [loadedResultId, setLoadedResultId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  // Load saved results on mount
  useEffect(() => {
    loadSavedResults();
  }, []);

  const loadSavedResults = async () => {
    try {
      const { data, error } = await supabase
        .from("keyword_dedup_results")
        .select("id, name, file_name, original_count, deduplicated_count, removed_count, fuzzy_merged_groups, ai_merged_groups, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSavedResults((data as SavedDedupResult[]) || []);
    } catch (err: any) {
      console.error("Failed to load saved dedup results:", err);
    }
  };

  const saveResult = async () => {
    if (!result || !saveName.trim()) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from("keyword_dedup_results")
        .insert({
          name: saveName.trim(),
          file_name: fileName,
          original_count: result.originalCount,
          deduplicated_count: result.deduplicatedCount,
          removed_count: result.removedCount,
          fuzzy_merged_groups: result.fuzzyMergedGroups,
          ai_merged_groups: result.aiMergedGroups,
          keywords: result.keywords as any,
          ungrouped_for_ai: ungroupedForAI as any,
        })
        .select("id")
        .single();
      if (error) throw error;
      setLoadedResultId(data.id);
      setShowSaveInput(false);
      setSaveName("");
      toast({ title: "Saved!", description: `"${saveName.trim()}" saved successfully.` });
      loadSavedResults();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const loadResult = async (id: string) => {
    setIsLoadingResults(true);
    try {
      const { data, error } = await supabase
        .from("keyword_dedup_results")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;

      const keywords = (data.keywords as any) as DedupKeyword[];
      const ungrouped = (data.ungrouped_for_ai as any) as UngroupedEntry[];

      setResult({
        originalCount: data.original_count,
        deduplicatedCount: data.deduplicated_count,
        removedCount: data.removed_count,
        fuzzyMergedGroups: data.fuzzy_merged_groups,
        aiMergedGroups: data.ai_merged_groups,
        keywords,
      });
      setUngroupedForAI(ungrouped || []);
      setFileName(data.file_name);
      setLoadedResultId(id);
      setRawKeywords([]);
      toast({ title: "Loaded", description: `"${data.name}" loaded with ${keywords.length.toLocaleString()} keywords.` });
    } catch (err: any) {
      toast({ title: "Load failed", description: err.message, variant: "destructive" });
    } finally {
      setIsLoadingResults(false);
    }
  };

  const deleteResult = async (id: string) => {
    try {
      const { error } = await supabase
        .from("keyword_dedup_results")
        .delete()
        .eq("id", id);
      if (error) throw error;
      if (loadedResultId === id) {
        setResult(null);
        setUngroupedForAI([]);
        setLoadedResultId(null);
      }
      toast({ title: "Deleted" });
      loadSavedResults();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error("File has no data rows");

        const headers = rows[0].map(h => h.toLowerCase().replace(/^"|"$/g, ""));
        let kwIdx = headers.findIndex(h => h === "keyword");
        if (kwIdx === -1) kwIdx = headers.findIndex(h => h.includes("keyword"));
        if (kwIdx === -1) kwIdx = 0;

        let volIdx = headers.findIndex(h => h === "volume" || h === "search volume");
        if (volIdx === -1) volIdx = headers.findIndex(h => h.includes("volume"));

        const keywords: { keyword: string; volume: number }[] = [];
        for (let i = 1; i < rows.length; i++) {
          const kw = rows[i][kwIdx]?.trim();
          if (!kw || kw.length < 2) continue;
          const vol = volIdx >= 0 ? parseVolume(rows[i][volIdx] || "0") : 0;
          keywords.push({ keyword: kw.toLowerCase(), volume: vol });
        }

        setRawKeywords(keywords);
        setFileName(file.name);
        setResult(null);
        setUngroupedForAI([]);
        setLoadedResultId(null);
        toast({ title: `Loaded ${keywords.length} keywords`, description: file.name });
      } catch (err: any) {
        toast({ title: "Failed to parse CSV", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runFuzzyDedup = async () => {
    if (rawKeywords.length === 0) return;
    setIsProcessing(true);
    setProgress(30);
    setProgressLabel("Running fuzzy matching...");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deduplicate-keywords`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ keywords: rawKeywords, mode: "fuzzy" }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      setProgress(100);
      const data = await response.json();

      setResult({
        originalCount: data.originalCount,
        deduplicatedCount: data.deduplicatedCount,
        removedCount: data.removedCount,
        fuzzyMergedGroups: data.fuzzyMergedGroups,
        aiMergedGroups: 0,
        keywords: data.keywords,
      });
      setUngroupedForAI(data.ungroupedForAI || []);
      setLoadedResultId(null);

      toast({
        title: "Fuzzy deduplication complete!",
        description: `${data.removedCount} exact duplicates merged. Starting AI semantic pass...`,
      });

      // Auto-run AI semantic pass if there are ungrouped keywords
      if (data.ungroupedForAI && data.ungroupedForAI.length > 0) {
        setIsProcessing(false);
        await runAISemanticPassWithKeywords(data.ungroupedForAI);
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Deduplication failed", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const runAISemanticPassWithKeywords = async (keywords: UngroupedEntry[]) => {
    if (keywords.length === 0) return;
    setIsAIProcessing(true);
    setProgress(5);
    setProgressLabel("Starting AI semantic analysis...");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deduplicate-keywords`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ mode: "semantic", ungroupedKeywords: ungroupedForAI }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "progress") {
              const pct = Math.round((event.batch / event.totalBatches) * 80) + 10;
              setProgress(pct);
              setProgressLabel(event.message);
            } else if (event.type === "batch_complete") {
              setProgressLabel(`Batch ${event.batch} done — ${event.totalMergedSoFar} groups merged so far`);
            } else if (event.type === "complete") {
              setProgress(100);
              setProgressLabel("AI semantic pass complete!");

              setResult(prev => {
                if (!prev) return prev;

                const aiMergedCanonicals = new Set(event.aiMergedKeywords.map((k: DedupKeyword) => k.keyword.toLowerCase()));
                const aiVariantKeywords = new Set(
                  event.aiMergedKeywords.flatMap((k: DedupKeyword) =>
                    (k.variants || []).map((v: { keyword: string }) => v.keyword.toLowerCase())
                  )
                );
                const consumedByAI = new Set([...aiMergedCanonicals, ...aiVariantKeywords]);

                const filteredKeywords = prev.keywords.filter(k => {
                  if (k.merged) return true;
                  return !consumedByAI.has(k.keyword.toLowerCase());
                });

                const allKeywords = [...filteredKeywords, ...event.aiMergedKeywords, ...event.aiSingles]
                  .sort((a: DedupKeyword, b: DedupKeyword) => b.volume - a.volume);

                return {
                  ...prev,
                  aiMergedGroups: event.aiMergedGroups,
                  deduplicatedCount: allKeywords.length,
                  removedCount: prev.originalCount - allKeywords.length,
                  keywords: allKeywords,
                };
              });

              setUngroupedForAI([]);

              toast({
                title: "AI semantic pass complete!",
                description: `${event.aiMergedGroups} additional groups merged semantically.`,
              });
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          } catch (parseErr: any) {
            if (parseErr.message && !parseErr.message.includes("Unexpected")) {
              throw parseErr;
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "AI pass failed", description: err.message, variant: "destructive" });
    } finally {
      setIsAIProcessing(false);
    }
  };

  const toggleGroup = (kw: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(kw) ? next.delete(kw) : next.add(kw);
      return next;
    });
  };

  const exportCSV = () => {
    if (!result) return;
    const rows = [["Keyword", "Combined Volume", "Variants Merged", "Original Volume"]];
    for (const kw of result.keywords) {
      rows.push([kw.keyword, String(kw.volume), String(kw.variantCount), String(kw.volume - (kw.variants?.reduce((s, v) => s + v.volume, 0) || 0))]);
      if (kw.variants) {
        for (const v of kw.variants) {
          rows.push([`  → ${v.keyword}`, String(v.volume), "(merged into above)", ""]);
        }
      }
    }
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deduplicated-keywords-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCleanCSV = () => {
    if (!result) return;
    const rows = [["Keyword", "Volume"]];
    for (const kw of result.keywords) {
      rows.push([kw.keyword, String(kw.volume)]);
    }
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clean-keywords-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyKeywords = () => {
    if (!result) return;
    const text = result.keywords.map(k => `${k.keyword}\t${k.volume}`).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${result.keywords.length} keywords copied` });
  };

  const displayedKeywords = showMergedOnly
    ? result?.keywords.filter(k => k.merged) || []
    : result?.keywords || [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload a CSV with keywords and search volumes. <strong>Step 1</strong> instantly merges exact duplicates
        (same words, different order). <strong>Step 2</strong> (optional) uses AI to find semantic duplicates
        (e.g., "does it hurt" = "is it painful").
      </p>

      {/* Upload */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileUpload}
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload CSV
        </Button>

        {fileName && !result && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs gap-1.5">
              <FileText className="h-3 w-3" />
              {fileName} — {rawKeywords.length.toLocaleString()} keywords
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => { setFileName(null); setRawKeywords([]); setResult(null); setUngroupedForAI([]); setLoadedResultId(null); }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Step 1 button */}
      {rawKeywords.length > 0 && !result && (
        <Button
          onClick={runFuzzyDedup}
          disabled={isProcessing}
          className="gap-2"
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {isProcessing ? "Matching..." : `Step 1: Fuzzy Deduplicate ${rawKeywords.length.toLocaleString()} Keywords`}
        </Button>
      )}

      {/* Progress */}
      {(isProcessing || isAIProcessing) && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">{progressLabel}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-muted">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold">{result.originalCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Original</p>
              </CardContent>
            </Card>
            <Card className="border-primary/30">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-primary">{result.deduplicatedCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">After dedup</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/30">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-destructive">{result.removedCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Duplicates removed</p>
              </CardContent>
            </Card>
            <Card className="border-muted">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold">{result.fuzzyMergedGroups + result.aiMergedGroups}</p>
                <p className="text-xs text-muted-foreground">
                  Groups ({result.fuzzyMergedGroups} fuzzy{result.aiMergedGroups > 0 ? ` + ${result.aiMergedGroups} AI` : ""})
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Step 2: AI pass */}
          {ungroupedForAI.length > 0 && !isAIProcessing && (
            <Card className="border-amber-300/50 bg-amber-50/50 dark:bg-amber-900/10">
              <CardContent className="py-4 px-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-amber-600" />
                      Step 2: AI Semantic Deduplication (optional)
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ungroupedForAI.length.toLocaleString()} unique keywords remaining — AI will find semantic duplicates
                      like "does it hurt" = "is it painful". Estimated: {Math.ceil(ungroupedForAI.length / 1500)} AI calls.
                    </p>
                  </div>
                  <Button onClick={runAISemanticPass} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Run AI Pass
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Save button */}
            {!loadedResultId && !showSaveInput && (
              <Button variant="default" size="sm" className="gap-1.5" onClick={() => { setShowSaveInput(true); setSaveName(fileName?.replace(/\.csv$/i, "") || ""); }}>
                <Save className="h-3.5 w-3.5" />
                Save Results
              </Button>
            )}
            {loadedResultId && (
              <Badge variant="outline" className="text-xs gap-1.5 py-1 px-2">
                <Save className="h-3 w-3" />
                Saved
              </Badge>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCleanCSV}>
              <Download className="h-3.5 w-3.5" />
              Export Clean CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5" />
              Export with Variants
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyKeywords}>
              <Copy className="h-3.5 w-3.5" />
              Copy All
            </Button>
            <Button
              variant={showMergedOnly ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setShowMergedOnly(!showMergedOnly)}
            >
              <Filter className="h-3.5 w-3.5" />
              {showMergedOnly ? "Show All" : "Show Merged Only"}
            </Button>
          </div>

          {/* Save input */}
          {showSaveInput && (
            <div className="flex items-center gap-2">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Name this dedup result..."
                className="max-w-xs h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && saveResult()}
                autoFocus
              />
              <Button size="sm" onClick={saveResult} disabled={isSaving || !saveName.trim()} className="gap-1.5">
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowSaveInput(false)}>
                Cancel
              </Button>
            </div>
          )}

          {/* Keyword list */}
          <div className="border rounded-md max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Keyword</th>
                  <th className="text-right py-2 px-3 font-medium w-28">Volume</th>
                  <th className="text-right py-2 px-3 font-medium w-28">Merged</th>
                </tr>
              </thead>
              <tbody>
                {displayedKeywords.map((kw) => (
                  <Collapsible key={kw.keyword} asChild open={expandedGroups.has(kw.keyword)} onOpenChange={() => kw.merged && toggleGroup(kw.keyword)}>
                    <>
                      <CollapsibleTrigger asChild disabled={!kw.merged}>
                        <tr
                          className={`border-b hover:bg-accent/30 transition-colors ${kw.merged ? "cursor-pointer bg-amber-50/50 dark:bg-amber-900/10" : ""}`}
                        >
                          <td className="py-1.5 px-3 flex items-center gap-2">
                            {kw.merged && (
                              expandedGroups.has(kw.keyword)
                                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            <span className={kw.merged ? "font-medium" : ""}>{kw.keyword}</span>
                          </td>
                          <td className="text-right py-1.5 px-3 font-mono text-xs">
                            {kw.volume.toLocaleString()}
                          </td>
                          <td className="text-right py-1.5 px-3">
                            {kw.merged && (
                              <Badge variant="secondary" className="text-xs">
                                +{kw.variantCount} merged
                              </Badge>
                            )}
                          </td>
                        </tr>
                      </CollapsibleTrigger>
                      {kw.merged && kw.variants && (
                        <CollapsibleContent asChild>
                          <>
                            {kw.variants.map((v, vi) => (
                              <tr key={vi} className="border-b bg-muted/30">
                                <td className="py-1 px-3 pl-10 text-muted-foreground text-xs">
                                  → {v.keyword}
                                </td>
                                <td className="text-right py-1 px-3 font-mono text-xs text-muted-foreground">
                                  {v.volume.toLocaleString()}
                                </td>
                                <td className="py-1 px-3"></td>
                              </tr>
                            ))}
                          </>
                        </CollapsibleContent>
                      )}
                    </>
                  </Collapsible>
                ))}
              </tbody>
            </table>
          </div>

          {/* Clear */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => { setResult(null); setUngroupedForAI([]); setLoadedResultId(null); setFileName(null); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Results
            </Button>
          </div>
        </div>
      )}

      {/* Previous Results */}
      {savedResults.length > 0 && !result && (
        <Collapsible defaultOpen={savedResults.length <= 5}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Previous Results ({savedResults.length})
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 px-4 pb-3 space-y-1.5">
                {savedResults.map((saved) => (
                  <div
                    key={saved.id}
                    className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent/30 transition-colors group"
                  >
                    <button
                      className="flex-1 text-left flex items-center gap-3"
                      onClick={() => loadResult(saved.id)}
                      disabled={isLoadingResults}
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{saved.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {saved.deduplicated_count.toLocaleString()} keywords · {saved.removed_count.toLocaleString()} removed
                          {saved.ai_merged_groups > 0 && ` · ${saved.ai_merged_groups} AI groups`}
                          {" · "}
                          {new Date(saved.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); deleteResult(saved.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
};

export default KeywordDeduplicator;
