import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Loader2, Download, Copy, Trash2, ChevronDown, ChevronRight,
  FileText, Sparkles, X, Filter, Zap, BrainCircuit, Save, Clock, FolderOpen, Link2
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { Pencil } from "lucide-react";

const EditableName = ({ name, onSave }: { name: string; onSave: (newName: string) => void }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValue(name); }, [name]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== name) onSave(value.trim());
    else setValue(name);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(name); setEditing(false); } }}
        onClick={e => e.stopPropagation()}
        className="text-sm font-medium bg-transparent border-b border-primary outline-none w-full"
      />
    );
  }

  return (
    <span className="group/name inline-flex items-center gap-1 text-sm font-medium">
      <span className="cursor-pointer hover:underline decoration-dashed underline-offset-2" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>{name}</span>
      <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity cursor-pointer" onClick={(e) => { e.stopPropagation(); setEditing(true); }} />
    </span>
  );
};

interface DedupKeyword {
  keyword: string;
  volume: number;
  merged: boolean;
  variantCount: number;
  variants?: { keyword: string; volume: number }[];
}

interface DedupResult {
  originalCount: number;
  offTopicCount: number;
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
  // Detect delimiter: check first line for tabs or semicolons
  const firstLine = text.split(/\r?\n/)[0] || "";
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  
  // Use whichever delimiter appears most in the header
  const delimiter = tabCount >= commaCount && tabCount >= semiCount ? "\t" 
    : semiCount > commaCount ? ";" : ",";

  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
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
  const [topicFilter, setTopicFilter] = useState("");

  // Optional reference file (File B): keywords in File A that match (fuzzy or semantic) any
  // keyword in File B will be removed, leaving only the keywords unique to File A.
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const [referenceFileName, setReferenceFileName] = useState<string | null>(null);
  const [referenceKeywords, setReferenceKeywords] = useState<{ keyword: string; volume: number }[]>([]);
  const [referenceRemovedCount, setReferenceRemovedCount] = useState(0);

  // URL Coverage mode: derive keywords/phrases from existing page URLs and find
  // which target keywords are covered vs which are gaps (no semantic match on any URL).
  const urlsFileInputRef = useRef<HTMLInputElement>(null);
  const [urlsInput, setUrlsInput] = useState("");
  const [urlSources, setUrlSources] = useState<{ url: string; phrases: string[] }[]>([]);
  const [isDerivingUrls, setIsDerivingUrls] = useState(false);
  const [urlProgress, setUrlProgress] = useState(0);
  const [urlProgressLabel, setUrlProgressLabel] = useState("");
  const [coverage, setCoverage] = useState<{
    covered: { keyword: string; volume: number; urls: string[] }[];
    gaps: { keyword: string; volume: number }[];
  } | null>(null);

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
        offTopicCount: 0,
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

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error("Reference file has no data rows");
        const headers = rows[0].map(h => h.toLowerCase().replace(/^"|"$/g, ""));
        let kwIdx = headers.findIndex(h => h === "keyword" || h === "term");
        if (kwIdx === -1) kwIdx = headers.findIndex(h => h.includes("keyword") || h.includes("term"));
        if (kwIdx === -1) kwIdx = 0;
        let volIdx = headers.findIndex(h => h === "volume" || h === "search volume");
        if (volIdx === -1) volIdx = headers.findIndex(h => h.includes("volume"));
        const kws: { keyword: string; volume: number }[] = [];
        for (let i = 1; i < rows.length; i++) {
          const kw = rows[i][kwIdx]?.trim();
          if (!kw || kw.length < 2) continue;
          const vol = volIdx >= 0 ? parseVolume(rows[i][volIdx] || "0") : 0;
          kws.push({ keyword: kw.toLowerCase(), volume: vol });
        }
        setReferenceKeywords(kws);
        setReferenceFileName(file.name);
        setResult(null);
        setUngroupedForAI([]);
        setReferenceRemovedCount(0);
        toast({ title: `Reference loaded: ${kws.length} keywords`, description: file.name });
      } catch (err: any) {
        toast({ title: "Failed to parse reference CSV", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (referenceFileInputRef.current) referenceFileInputRef.current.value = "";
  };

  // === URL Coverage mode ===
  const parseUrlsFromText = (text: string): string[] => {
    return text
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s) || /\./.test(s));
  };

  const handleUrlsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        // Accept CSV (one URL per row, first column) OR plain text
        const rows = parseCSV(text);
        let urls: string[] = [];
        if (rows.length && rows[0].length) {
          // If header looks like url/link, skip it
          const headerLooksLikeHeader = /url|link|address/i.test(rows[0][0]);
          const start = headerLooksLikeHeader ? 1 : 0;
          urls = rows.slice(start).map((r) => (r[0] || "").trim()).filter(Boolean);
        }
        if (urls.length === 0) urls = parseUrlsFromText(text);
        if (urls.length === 0) throw new Error("No URLs found in file");
        setUrlsInput(urls.join("\n"));
        toast({ title: `Loaded ${urls.length} URLs`, description: file.name });
      } catch (err: any) {
        toast({ title: "Failed to parse URLs file", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsText(file);
    if (urlsFileInputRef.current) urlsFileInputRef.current.value = "";
  };

  const deriveKeywordsFromUrls = async () => {
    const urls = [...new Set(parseUrlsFromText(urlsInput))];
    if (urls.length === 0) {
      toast({ title: "No URLs", description: "Paste or upload URLs first.", variant: "destructive" });
      return;
    }
    setIsDerivingUrls(true);
    setUrlProgress(2);
    setUrlProgressLabel(`Scraping ${urls.length} URLs...`);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/derive-keywords-from-urls`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ urls }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buf = "";
      let finalResults: { url: string; phrases: string[] }[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const msg = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of msg.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === "progress") {
                setUrlProgress(Math.round((ev.done / ev.total) * 90));
                setUrlProgressLabel(ev.message);
              } else if (ev.type === "complete") {
                finalResults = (ev.results || []).map((r: any) => ({
                  url: r.url,
                  phrases: r.phrases || [],
                }));
                setUrlProgress(100);
              }
            } catch { /* ignore */ }
          }
        }
      }

      setUrlSources(finalResults);
      // Feed the flat list of derived phrases into referenceKeywords so the existing
      // dedup engine (fuzzy + AI semantic) groups them with target keywords.
      const flatPhrases = [...new Set(finalResults.flatMap((r) => r.phrases))]
        .map((p) => ({ keyword: p.toLowerCase(), volume: 0 }));
      setReferenceKeywords(flatPhrases);
      setReferenceFileName(`${finalResults.length} URLs (derived)`);
      setCoverage(null);
      toast({
        title: "Keywords derived",
        description: `${finalResults.length} URLs → ${flatPhrases.length} unique terms. Now run Step 1 to compute coverage.`,
      });
    } catch (err: any) {
      toast({ title: "URL derivation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDerivingUrls(false);
    }
  };

  const clearUrlMode = () => {
    setUrlSources([]);
    setUrlsInput("");
    setCoverage(null);
    // Only clear reference if it was set by URL mode
    if (referenceFileName?.endsWith("(derived)")) {
      setReferenceKeywords([]);
      setReferenceFileName(null);
    }
  };

  // Compute coverage tables: for each original target keyword, find the group it
  // landed in across the merged A+B dedup output; if that group contains any
  // URL-derived phrase, it's covered (mapped to that URL). Otherwise it's a gap.
  const computeCoverage = (groups: DedupKeyword[]) => {
    const targetVolumes = new Map<string, number>();
    for (const k of rawKeywords) targetVolumes.set(k.keyword.toLowerCase(), k.volume);

    // phrase → urls
    const phraseToUrls = new Map<string, Set<string>>();
    for (const src of urlSources) {
      for (const p of src.phrases) {
        const key = p.toLowerCase();
        if (!phraseToUrls.has(key)) phraseToUrls.set(key, new Set());
        phraseToUrls.get(key)!.add(src.url);
      }
    }

    const coveredMap = new Map<string, Set<string>>(); // target kw → urls
    for (const g of groups) {
      const members = [g.keyword.toLowerCase(), ...(g.variants || []).map((v) => v.keyword.toLowerCase())];
      const targetMembers = members.filter((m) => targetVolumes.has(m));
      if (targetMembers.length === 0) continue;
      const urlsHit = new Set<string>();
      for (const m of members) {
        const urls = phraseToUrls.get(m);
        if (urls) for (const u of urls) urlsHit.add(u);
      }
      if (urlsHit.size > 0) {
        for (const t of targetMembers) {
          if (!coveredMap.has(t)) coveredMap.set(t, new Set());
          for (const u of urlsHit) coveredMap.get(t)!.add(u);
        }
      }
    }

    const covered = [...coveredMap.entries()]
      .map(([keyword, urls]) => ({
        keyword,
        volume: targetVolumes.get(keyword) || 0,
        urls: [...urls],
      }))
      .sort((a, b) => b.volume - a.volume);

    const coveredSet = new Set(covered.map((c) => c.keyword));
    const gaps = rawKeywords
      .filter((k) => !coveredSet.has(k.keyword.toLowerCase()))
      .map((k) => ({ keyword: k.keyword.toLowerCase(), volume: k.volume }))
      .sort((a, b) => b.volume - a.volume);

    setCoverage({ covered, gaps });
  };

  const exportCoverageCSV = (which: "covered" | "gaps") => {
    if (!coverage) return;
    let rows: string[][];
    if (which === "covered") {
      rows = [["Keyword", "Volume", "Covered By URL(s)"]];
      for (const c of coverage.covered) rows.push([c.keyword, String(c.volume), c.urls.join(" | ")]);
    } else {
      rows = [["Keyword", "Volume"]];
      for (const g of coverage.gaps) rows.push([g.keyword, String(g.volume)]);
    }
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${which}-keywords-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Helper: return true if a dedup group "touches" any reference (File B) keyword.
  // A group touches B if its canonical OR any variant matches (case-insensitive) a B keyword.
  const groupTouchesReference = (kw: DedupKeyword, refSet: Set<string>): boolean => {
    if (refSet.has(kw.keyword.toLowerCase())) return true;
    if (kw.variants) {
      for (const v of kw.variants) {
        if (refSet.has(v.keyword.toLowerCase())) return true;
      }
    }
    return false;
  };

  const runFuzzyDedup = async () => {
    if (rawKeywords.length === 0) return;
    setIsProcessing(true);
    setProgress(10);
    setProgressLabel(topicFilter ? "Filtering off-topic keywords..." : "Running fuzzy matching...");

    try {
      // If topic filter is set, first filter off-topic keywords via AI
      // If a reference (File B) is provided, combine A + B so the dedup engine groups
      // semantically similar pairs across both lists. We filter out any group touching B
      // from the final output, leaving only keywords unique to File A.
      const refSet = new Set(referenceKeywords.map(k => k.keyword.toLowerCase()));
      const hasReference = referenceKeywords.length > 0;
      let keywordsToDedup = hasReference
        ? [...rawKeywords, ...referenceKeywords]
        : rawKeywords;
      let removedOffTopic: { keyword: string; volume: number }[] = [];

      if (topicFilter.trim()) {
        console.log(`Topic filter active: "${topicFilter.trim()}", filtering ${rawKeywords.length} keywords...`);
        const filterResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deduplicate-keywords`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ keywords: rawKeywords, mode: "topic-filter", topic: topicFilter.trim() }),
          }
        );

        if (!filterResponse.ok) {
          const errData = await filterResponse.json().catch(() => ({}));
          throw new Error(errData.error || `Topic filter failed: ${filterResponse.status}`);
        }

        // SSE streaming for topic filter
        const reader = filterResponse.body?.getReader();
        if (!reader) throw new Error("No response stream");
        const decoder = new TextDecoder();
        let buffer = "";

        let sseBuffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE messages (delimited by double newline)
          let doubleNewline: number;
          while ((doubleNewline = sseBuffer.indexOf("\n\n")) !== -1) {
            const message = sseBuffer.slice(0, doubleNewline);
            sseBuffer = sseBuffer.slice(doubleNewline + 2);
            
            for (const line of message.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === "progress") {
                  setProgress(Math.round(event.progress * 30));
                  setProgressLabel(event.message);
                } else if (event.type === "complete") {
                  keywordsToDedup = event.onTopicKeywords;
                  removedOffTopic = event.offTopicKeywords;
                  setProgress(30);
                  setProgressLabel(`Removed ${removedOffTopic.length} off-topic keywords. Running fuzzy matching...`);
                } else if (event.type === "error") {
                  throw new Error(event.message);
                }
              } catch (parseErr: any) {
                if (parseErr.message && !parseErr.message.includes("Unexpected")) throw parseErr;
              }
            }
          }
        }
        
        // Process any remaining data in buffer
        if (sseBuffer.trim()) {
          for (const line of sseBuffer.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "complete") {
                keywordsToDedup = event.onTopicKeywords;
                removedOffTopic = event.offTopicKeywords;
              } else if (event.type === "error") {
                throw new Error(event.message);
              }
            } catch { /* ignore partial */ }
          }
        }

        if (removedOffTopic.length > 0) {
          toast({
            title: `${removedOffTopic.length} off-topic keywords removed`,
            description: `Kept ${keywordsToDedup.length} keywords related to "${topicFilter}"`,
          });
        }
      }

      // Re-combine with reference (File B) after topic-filter trimmed A. This way the
      // dedup engine sees both lists and can match A keywords against B variants.
      if (hasReference && topicFilter.trim()) {
        keywordsToDedup = [...keywordsToDedup, ...referenceKeywords];
      }

      setProgress(40);
      setProgressLabel(hasReference ? "Running fuzzy matching across both files..." : "Running fuzzy matching...");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deduplicate-keywords`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ keywords: keywordsToDedup, mode: "fuzzy" }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      setProgress(100);
      const data = await response.json();

      const offTopicCount = rawKeywords.length - (hasReference
        ? (keywordsToDedup.length - referenceKeywords.length)
        : keywordsToDedup.length);

      // URL Coverage mode: keep all groups visible; compute coverage tables instead of stripping.
      // Plain reference mode (CSV File B): strip any group that touches a B keyword.
      let finalKeywords: DedupKeyword[] = data.keywords;
      let finalUngrouped: UngroupedEntry[] = data.ungroupedForAI || [];
      let refRemoved = 0;
      const urlMode = urlSources.length > 0;
      if (hasReference && !urlMode) {
        const beforeCount = finalKeywords.length;
        finalKeywords = finalKeywords.filter(k => !groupTouchesReference(k, refSet));
        refRemoved += beforeCount - finalKeywords.length;
        finalUngrouped = finalUngrouped.filter(u => !refSet.has(u.canonical.toLowerCase()));
      }
      setReferenceRemovedCount(refRemoved);
      if (urlMode) computeCoverage(data.keywords);

      const deduplicatedCount = finalKeywords.length;
      setResult({
        originalCount: rawKeywords.length,
        offTopicCount,
        deduplicatedCount,
        removedCount: rawKeywords.length - deduplicatedCount,
        fuzzyMergedGroups: data.fuzzyMergedGroups,
        aiMergedGroups: 0,
        keywords: finalKeywords,
      });
      setUngroupedForAI(finalUngrouped);
      setLoadedResultId(null);

      toast({
        title: "Fuzzy deduplication complete!",
        description: hasReference
          ? `${refRemoved} keywords matched the reference list and were removed.`
          : `${data.removedCount} exact duplicates merged. Starting AI semantic pass...`,
      });

      // Auto-run AI semantic pass if there are ungrouped keywords
      if (finalUngrouped.length > 0) {
        setIsProcessing(false);
        await runAISemanticPassWithKeywords(finalUngrouped);
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
          body: JSON.stringify({ mode: "semantic", ungroupedKeywords: keywords }),
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

                // Filter out AI-merged groups that touch the reference (File B) set.
                const refSetLocal = new Set(referenceKeywords.map(k => k.keyword.toLowerCase()));
                const hasRef = refSetLocal.size > 0;
                const aiMerged = hasRef
                  ? (event.aiMergedKeywords as DedupKeyword[]).filter(k => !groupTouchesReference(k, refSetLocal))
                  : (event.aiMergedKeywords as DedupKeyword[]);
                const aiRefRemoved = hasRef ? event.aiMergedKeywords.length - aiMerged.length : 0;

                const allKeywords = [...filteredKeywords, ...aiMerged]
                  .sort((a: DedupKeyword, b: DedupKeyword) => b.volume - a.volume);

                if (hasRef && aiRefRemoved > 0) {
                  setReferenceRemovedCount(c => c + aiRefRemoved);
                }

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

  const removeKeyword = (keyword: string) => {
    setResult(prev => prev ? {
      ...prev,
      keywords: prev.keywords.filter(k => k.keyword !== keyword),
      deduplicatedCount: prev.deduplicatedCount - 1,
      removedCount: prev.removedCount + 1,
    } : prev);
  };

  const removeVariant = (canonical: string, variantKeyword: string) => {
    setResult(prev => prev ? {
      ...prev,
      keywords: prev.keywords.map(k => {
        if (k.keyword !== canonical) return k;
        const variants = (k.variants || []).filter(v => v.keyword !== variantKeyword);
        return { ...k, variants, variantCount: variants.length, merged: variants.length > 0 };
      }),
      removedCount: prev.removedCount + 1,
    } : prev);
  };

  const displayedKeywords = showMergedOnly
    ? result?.keywords.filter(k => k.merged) || []
    : result?.keywords || [];

  const renameResult = async (id: string, newName: string) => {
    try {
      const { error } = await supabase
        .from("keyword_dedup_results")
        .update({ name: newName })
        .eq("id", id);
      if (error) throw error;
      setSavedResults(prev => prev.map(r => r.id === id ? { ...r, name: newName } : r));
      toast({ title: "Renamed" });
    } catch (err: any) {
      toast({ title: "Rename failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Saved projects — at the top */}
      {savedResults.length > 0 && !result && (
        <Card className="border-dashed">
          <CardContent className="py-3 px-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Your Projects ({savedResults.length})
            </p>
            <div className="space-y-1.5">
              {savedResults.map((saved) => (
                <div
                  key={saved.id}
                  className={`flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent/30 transition-colors group ${loadedResultId === saved.id ? "border border-primary bg-primary/5" : ""}`}
                >
                  <button
                    className="flex-1 text-left flex items-center gap-3"
                    onClick={() => loadResult(saved.id)}
                    disabled={isLoadingResults}
                  >
                    <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <EditableName
                        name={saved.name}
                        onSave={(newName) => renameResult(saved.id, newName)}
                      />
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
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Optional reference file (File B) */}
      {rawKeywords.length > 0 && !result && (
        <div className="border border-dashed rounded-md p-3 space-y-2 bg-muted/20">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            Reference list (optional) — keep only keywords unique to File A
          </p>
          <p className="text-xs text-muted-foreground">
            Upload a second CSV (File B) of keywords you already have. Any keyword in File A that
            fuzzy- or semantically-matches a keyword in File B will be removed.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={referenceFileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleReferenceUpload}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => referenceFileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Reference CSV (File B)
            </Button>
            {referenceFileName && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs gap-1.5">
                  <FileText className="h-3 w-3" />
                  {referenceFileName} — {referenceKeywords.length.toLocaleString()} keywords
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => { setReferenceFileName(null); setReferenceKeywords([]); setReferenceRemovedCount(0); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Topic filter + Step 1 button */}
      {rawKeywords.length > 0 && !result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Input
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              placeholder="Topic filter (optional) — e.g. 'dental fillings' to remove off-topic keywords"
              className="max-w-lg h-8 text-sm"
            />
            {topicFilter && (
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setTopicFilter("")}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          {topicFilter && (
            <p className="text-xs text-muted-foreground ml-6">
              Keywords not related to <strong>"{topicFilter}"</strong> will be removed before deduplication.
            </p>
          )}
          <Button
            onClick={runFuzzyDedup}
            disabled={isProcessing}
            className="gap-2"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {isProcessing ? "Matching..." : referenceKeywords.length > 0
              ? `Find ${rawKeywords.length.toLocaleString()} Unique Keywords (vs ${referenceKeywords.length.toLocaleString()} in File B)`
              : `Step 1: Fuzzy Deduplicate ${rawKeywords.length.toLocaleString()} Keywords`}
          </Button>
        </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="border-muted">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold">{result.originalCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Original</p>
              </CardContent>
            </Card>
            {result.offTopicCount > 0 && (
              <Card className="border-orange-300/50">
                <CardContent className="py-3 px-4 text-center">
                  <p className="text-2xl font-bold text-orange-600">{result.offTopicCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Off-topic removed</p>
                </CardContent>
              </Card>
            )}
            {referenceRemovedCount > 0 && (
              <Card className="border-blue-300/50">
                <CardContent className="py-3 px-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{referenceRemovedCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Matched reference (removed)</p>
                </CardContent>
              </Card>
            )}
            <Card className="border-primary/30">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-primary">{result.deduplicatedCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">After dedup</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/30">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-destructive">{(result.removedCount).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total removed</p>
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
                  <Button onClick={() => runAISemanticPassWithKeywords(ungroupedForAI)} className="gap-2">
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
                            <div className="flex items-center justify-end gap-1.5">
                              {kw.merged && (
                                <Badge variant="secondary" className="text-xs">
                                  +{kw.variantCount} merged
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); removeKeyword(kw.keyword); }}
                                title="Remove this keyword"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
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
                                <td className="py-1 px-3 text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => { e.stopPropagation(); removeVariant(kw.keyword, v.keyword); }}
                                    title="Remove this variant"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </td>
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

    </div>
  );
};

export default KeywordDeduplicator;
