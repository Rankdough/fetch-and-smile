import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Loader2, Download, Copy, Trash2, ChevronDown, ChevronRight,
  FileText, Sparkles, X, Filter
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<DedupResult | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showMergedOnly, setShowMergedOnly] = useState(false);

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
        toast({ title: `Loaded ${keywords.length} keywords`, description: file.name });
      } catch (err: any) {
        toast({ title: "Failed to parse CSV", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runDeduplication = async () => {
    if (rawKeywords.length === 0) return;
    setIsProcessing(true);
    setProgress(10);
    setProgressLabel("Uploading keywords...");

    try {
      setProgress(20);
      setProgressLabel("Running fuzzy matching & AI semantic grouping...");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deduplicate-keywords`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ keywords: rawKeywords }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      setProgress(90);
      setProgressLabel("Processing results...");

      const data: DedupResult = await response.json();
      setResult(data);
      setProgress(100);
      setProgressLabel("Done!");

      toast({
        title: "Deduplication complete!",
        description: `${data.originalCount} → ${data.deduplicatedCount} keywords (${data.removedCount} duplicates removed)`,
      });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Deduplication failed", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
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
        Upload a CSV with keywords and search volumes. The tool will identify duplicate and semantically
        identical keywords (e.g., "does root canal hurt" = "is root canal painful"), keep the highest-volume
        variant, and sum all volumes together.
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

        {fileName && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs gap-1.5">
              <FileText className="h-3 w-3" />
              {fileName} — {rawKeywords.length.toLocaleString()} keywords
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => { setFileName(null); setRawKeywords([]); setResult(null); }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Run button */}
      {rawKeywords.length > 0 && !result && (
        <Button
          onClick={runDeduplication}
          disabled={isProcessing}
          className="gap-2"
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isProcessing ? "Deduplicating..." : `Deduplicate ${rawKeywords.length.toLocaleString()} Keywords`}
        </Button>
      )}

      {/* Progress */}
      {isProcessing && (
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
                  Merged groups ({result.fuzzyMergedGroups} fuzzy + {result.aiMergedGroups} AI)
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
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

          {/* Re-run */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => { setResult(null); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Results
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeywordDeduplicator;
