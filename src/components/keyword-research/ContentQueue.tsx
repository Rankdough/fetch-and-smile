import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { ContentQueueState } from "./KeywordClustering";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronDown, TrendingUp, ArrowRight, Search, Bookmark, FileText, Download, CheckCircle2, Plus, Loader2, Lightbulb, Pencil, Star, CalendarIcon, StickyNote, Trash2, X, FilePlus2, RefreshCw,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { buildDeepResearchPrompt } from "@/lib/deepResearchPrompt";


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
  onAddKeywordToIdea?: (clusterTopic: string, ideaTitle: string, keyword: string, sourceClusterTopic: string) => void;
  queueState: ContentQueueState;
  onUpdateQueueState: (updater: (prev: ContentQueueState) => ContentQueueState) => void;
  onAddCustomIdea?: (clusterTopic: string, title: string, hint?: string) => void | Promise<void>;
  isCreatingCustomIdea?: boolean;
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

const ContentQueue = ({ queuedIdeas, onUseForArticle, onRemoveFromQueue, formatVolume, projectName, allClusters, onReassignKeyword, onCreateIdeaFromKeyword, generatingIdeaForKw, onEditIdeaTitle, onAddKeywordToIdea, queueState, onUpdateQueueState, onAddCustomIdea, isCreatingCustomIdea }: ContentQueueProps) => {
  // Returns YYYY-MM-DD in local timezone (avoids UTC shifting dates)
  const localDateStr = () => {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  };

  // Format a stored date string for display:
  const formatStoredDate = (dateStr: string, opts: Intl.DateTimeFormatOptions) => {
    if (!dateStr) return "";
    const ymd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) {
      const d = new Date(+ymd[1], +ymd[2] - 1, +ymd[3]);
      return d.toLocaleDateString("en-GB", opts);
    }
    return new Date(dateStr).toLocaleDateString("en-GB", opts);
  };

  const { toast } = useToast();
  const [fallbackDownload, setFallbackDownload] = useState<{ url: string; filename: string } | null>(null);

  // Derive done/favorites/notes from queueState prop
  const doneIdeas = useMemo(() => new Map(Object.entries(queueState.done)), [queueState.done]);
  const favoriteIdeas = useMemo(() => new Set(queueState.favorites), [queueState.favorites]);
  const notes = queueState.notes;

  const [expandedDone, setExpandedDone] = useState<Set<string>>(new Set());
  const [completedSectionOpen, setCompletedSectionOpen] = useState(true);
  const [completedSort, setCompletedSort] = useState<"date-desc" | "date-asc" | "month">("date-desc");
  const [cqKwSearch, setCqKwSearch] = useState("");

  // Add Custom Article dialog state
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customHint, setCustomHint] = useState("");
  const [customSilo, setCustomSilo] = useState<string>("");
  const siloOptions = useMemo(() => (allClusters || []).map(c => c.topic).filter(t => t && t !== "Other"), [allClusters]);
  useEffect(() => {
    if (customDialogOpen && !customSilo && siloOptions.length > 0) setCustomSilo(siloOptions[0]);
  }, [customDialogOpen, customSilo, siloOptions]);

  const submitCustomIdea = useCallback(async () => {
    if (!onAddCustomIdea || !customTitle.trim() || !customSilo) return;
    await onAddCustomIdea(customSilo, customTitle.trim(), customHint.trim() || undefined);
    setCustomDialogOpen(false);
    setCustomTitle("");
    setCustomHint("");
  }, [onAddCustomIdea, customTitle, customSilo, customHint]);

  interface NoteItem {
    text: string;
    createdAt: string;
  }

  const [newNote, setNewNote] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [editingNoteIdx, setEditingNoteIdx] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const saveNotes = useCallback((updated: NoteItem[]) => {
    onUpdateQueueState(prev => ({ ...prev, notes: updated }));
  }, [onUpdateQueueState]);

  const addNote = useCallback(() => {
    if (!newNote.trim()) return;
    const updated: NoteItem[] = [{ text: newNote.trim(), createdAt: new Date().toISOString() }, ...notes];
    saveNotes(updated);
    setNewNote("");
  }, [newNote, notes, saveNotes]);

  const removeNote = useCallback((idx: number) => {
    const updated = notes.filter((_, i) => i !== idx);
    saveNotes(updated);
    if (editingNoteIdx === idx) setEditingNoteIdx(null);
  }, [notes, saveNotes, editingNoteIdx]);

  const startEditNote = useCallback((idx: number) => {
    setEditingNoteIdx(idx);
    setEditingNoteText(notes[idx].text);
    setTimeout(() => editTextareaRef.current?.focus(), 50);
  }, [notes]);

  const saveEditNote = useCallback(() => {
    if (editingNoteIdx === null) return;
    if (!editingNoteText.trim()) {
      removeNote(editingNoteIdx);
      return;
    }
    const updated = [...notes];
    updated[editingNoteIdx] = { ...updated[editingNoteIdx], text: editingNoteText.trim() };
    saveNotes(updated);
    setEditingNoteIdx(null);
  }, [editingNoteIdx, editingNoteText, notes, saveNotes, removeNote]);

  const formatNoteDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  // Build a flat list of all keywords across all silos for the "Add keyword" search
  const allSiloKeywords = useMemo(() => {
    if (!allClusters) return [];
    const results: { kw: string; vol: number; siloTopic: string }[] = [];
    for (const c of allClusters) {
      for (const kw of c.keywords) {
        const vol = c.keyword_volumes?.[kw] ?? c.keyword_volumes?.[kw.toLowerCase()] ?? 0;
        results.push({ kw, vol, siloTopic: c.topic });
      }
    }
    return results;
  }, [allClusters]);

  const renderAddKeywordPopover = (cluster: KeywordCluster, idea: BlogIdea) => {
    if (!onAddKeywordToIdea || !allClusters) return null;
    const existingKws = new Set((idea.target_keywords || []).map(k => k.toLowerCase()));
    const filtered = cqKwSearch.length >= 2
      ? allSiloKeywords.filter(m => m.kw.toLowerCase().includes(cqKwSearch.toLowerCase()) && !existingKws.has(m.kw.toLowerCase()))
      : [];
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-dashed border-primary/30 text-primary hover:bg-primary/10 transition-colors"
            onClick={e => { e.stopPropagation(); setCqKwSearch(""); }}
          >
            <Plus className="h-2.5 w-2.5" /> Add keyword
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-80 p-3" onClick={e => e.stopPropagation()}>
          <Input
            placeholder="Search all siloed keywords..."
            value={cqKwSearch}
            onChange={e => setCqKwSearch(e.target.value)}
            className="h-8 text-xs mb-2"
            autoFocus
          />
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {cqKwSearch.length < 2 && <p className="text-[10px] text-muted-foreground py-2 text-center">Type 2+ characters to search</p>}
            {cqKwSearch.length >= 2 && filtered.length === 0 && <p className="text-[10px] text-muted-foreground py-2 text-center">No matching keywords</p>}
            {filtered.slice(0, 30).map((m, mi) => (
              <button
                key={mi}
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2"
                onClick={() => {
                  onAddKeywordToIdea(cluster.topic, idea.title, m.kw, m.siloTopic);
                  setCqKwSearch("");
                }}
              >
                <span className="truncate">{m.kw}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {m.vol > 0 && <span className="text-primary/70 font-semibold text-[10px]">{m.vol.toLocaleString()}</span>}
                  {m.siloTopic !== cluster.topic && <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded">from: {m.siloTopic}</span>}
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const toggleExpanded = useCallback((ideaKey: string) => {
    setExpandedDone(prev => {
      const next = new Set(prev);
      if (next.has(ideaKey)) next.delete(ideaKey);
      else next.add(ideaKey);
      return next;
    });
  }, []);

  const toggleDone = useCallback((ideaKey: string) => {
    onUpdateQueueState(prev => {
      const newDone = { ...prev.done };
      if (newDone[ideaKey] !== undefined) {
        delete newDone[ideaKey];
      } else {
        newDone[ideaKey] = localDateStr();
      }
      return { ...prev, done: newDone };
    });
  }, [onUpdateQueueState]);

  const updateDoneDate = useCallback((ideaKey: string, date: Date) => {
    const off = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - off * 60000).toISOString().slice(0, 10);
    onUpdateQueueState(prev => {
      if (prev.done[ideaKey] === undefined) return prev;
      return { ...prev, done: { ...prev.done, [ideaKey]: localDate } };
    });
  }, [onUpdateQueueState]);

  const toggleFavorite = useCallback((ideaKey: string) => {
    onUpdateQueueState(prev => {
      const has = prev.favorites.includes(ideaKey);
      return { ...prev, favorites: has ? prev.favorites.filter(k => k !== ideaKey) : [...prev.favorites, ideaKey] };
    });
  }, [onUpdateQueueState]);

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

  const customIdeaDialog = onAddCustomIdea ? (
    <Dialog open={customDialogOpen} onOpenChange={(open) => { setCustomDialogOpen(open); if (!open) { setCustomTitle(""); setCustomHint(""); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Custom Article to Content Queue</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Give a title and any angle/edge you have in mind. We'll generate the description, value promises, and pick the most relevant keywords from the chosen silo. The article is added to the queue automatically.
          </p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Title</Label>
            <Input
              placeholder="e.g. The Ultimate Drop Physics: A Data-Driven Guide to Baseball Bat Performance"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Silo</Label>
            <Select value={customSilo} onValueChange={setCustomSilo}>
              <SelectTrigger><SelectValue placeholder="Select silo" /></SelectTrigger>
              <SelectContent>
                {siloOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Angle / Edge / Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              rows={5}
              placeholder="e.g. A data study comparing swing speed, exit velocity, and barrel control across -13, -10, and -5 drop bats. Includes lab testing and expert teardown of popular models."
              value={customHint}
              onChange={e => setCustomHint(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">Used to shape the angle, value promises, and keyword selection. Title is preserved exactly.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setCustomDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={submitCustomIdea}
            disabled={!customTitle.trim() || !customSilo || !!isCreatingCustomIdea}
            className="gap-1.5"
          >
            {isCreatingCustomIdea ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
            {isCreatingCustomIdea ? "Generating..." : "Generate & Add to Queue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  if (queuedIdeas.length === 0) return (
    <>
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="py-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Content Queue is empty</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Bookmark blog ideas using the <Bookmark className="h-3 w-3 inline" /> icon to add them here</p>
          {onAddCustomIdea && siloOptions.length > 0 && (
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => setCustomDialogOpen(true)}>
              <FilePlus2 className="h-3.5 w-3.5" />
              Add Custom Article
            </Button>
          )}
        </CardContent>
      </Card>
      {customIdeaDialog}
    </>
  );



  const copyDeepResearch = (cluster: KeywordCluster, idea: BlogIdea) => {
    const prompt = buildDeepResearchPrompt({
      title: idea.title,
      topic: cluster.topic,
      topicDescription: cluster.description,
      ideaDescription: idea.description,
      strategicAngle: idea.reason,
      targetKeywords: idea.target_keywords,
      valuePromises: idea.value_promises,
    });
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
      const formattedDate = doneDate ? formatStoredDate(doneDate, { day: "2-digit", month: "short", year: "numeric" }) : "";
      const monthYear = doneDate ? formatStoredDate(doneDate, { month: "long", year: "numeric" }) : "";

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
    <>
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
              {onAddCustomIdea && siloOptions.length > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5 text-xs h-7 px-2"
                  onClick={() => setCustomDialogOpen(true)}
                >
                  <FilePlus2 className="h-3 w-3" />
                  Add Custom Article
                </Button>
              )}
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
            {/* Notes section */}
            <div className="border rounded-lg border-border bg-muted/30">
              <button
                onClick={() => setNotesOpen(prev => !prev)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <StickyNote className="h-3.5 w-3.5" />
                  Notes & Ideas
                  {notes.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{notes.length}</Badge>}
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !notesOpen && "-rotate-90")} />
              </button>
              {notesOpen && (
                <div className="px-3 pb-3 space-y-2.5">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a note, idea, or reminder..."
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                      className="min-h-[40px] text-sm resize-none"
                      rows={2}
                    />
                    <Button size="sm" className="h-10 px-3 shrink-0" onClick={addNote} disabled={!newNote.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {notes.length > 0 && (
                    <div className="space-y-2">
                      {notes.map((note, idx) => (
                        <div key={idx} className="group rounded-lg bg-background border p-3 transition-colors hover:border-primary/30">
                          {editingNoteIdx === idx ? (
                            <div className="space-y-2">
                              <Textarea
                                ref={editTextareaRef}
                                value={editingNoteText}
                                onChange={e => setEditingNoteText(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEditNote(); } if (e.key === "Escape") setEditingNoteIdx(null); }}
                                className="text-sm resize-none"
                                rows={3}
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNoteIdx(null)}>Cancel</Button>
                                <Button size="sm" className="h-7 text-xs" onClick={saveEditNote}>Save</Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{note.text}</p>
                              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/50">
                                <span className="text-[11px] text-muted-foreground">{formatNoteDate(note.createdAt)}</span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => startEditNote(idx)}
                                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    title="Edit note"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => removeNote(idx)}
                                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    title="Delete note"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Done items at the very top */}
            {doneItems.length > 0 && (() => {
              const grandTotalVol = doneItems.reduce((sum, { cluster, idea }) => {
                const vl = cluster.keyword_volumes || {};
                return sum + (idea.target_keywords || []).reduce((s, kw) => s + (vl[kw] ?? vl[kw.toLowerCase()] ?? 0), 0);
              }, 0);
              return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
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
                  {completedSectionOpen && (
                    <select
                      value={completedSort}
                      onChange={e => setCompletedSort(e.target.value as typeof completedSort)}
                      className="text-[10px] h-6 px-1.5 rounded border border-border bg-background text-foreground cursor-pointer"
                    >
                      <option value="date-desc">Newest first</option>
                      <option value="date-asc">Oldest first</option>
                      <option value="month">Group by month</option>
                    </select>
                  )}
                </div>
                {completedSectionOpen && [...doneItems].sort((a, b) => {
                  const da = doneIdeas.get(a.ideaKey) || "";
                  const db = doneIdeas.get(b.ideaKey) || "";
                  return completedSort === "date-asc" ? da.localeCompare(db) : db.localeCompare(da);
                }).reduce<{ elements: React.ReactNode[]; lastMonth: string }>((acc, { cluster, idea, ideaKey }, idx) => {
                  const doneDate = doneIdeas.get(ideaKey);
                  if (completedSort === "month" && doneDate) {
                    const monthLabel = formatStoredDate(doneDate, { month: "long", year: "numeric" });
                    if (monthLabel !== acc.lastMonth) {
                      acc.elements.push(
                        <div key={`month-${monthLabel}`} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-2 pb-0.5 border-b border-border/50">
                          📅 {monthLabel}
                        </div>
                      );
                      acc.lastMonth = monthLabel;
                    }
                  }
                  acc.elements.push((() => {
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
                        <div className="flex items-center gap-3 px-4 py-3">
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
                            <ChevronDown className={cn(
                              "h-4 w-4 text-green-600 dark:text-green-400 transition-transform shrink-0",
                              isExpanded && "rotate-180"
                            )} />
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                className="text-xs text-muted-foreground shrink-0 w-[90px] text-right tabular-nums whitespace-nowrap hover:text-foreground hover:underline decoration-dashed underline-offset-2 transition-colors"
                                title="Click to change date"
                                onClick={e => e.stopPropagation()}
                              >
                                {doneDate ? formatStoredDate(doneDate, { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end" onClick={e => e.stopPropagation()}>
                              <Calendar
                                mode="single"
                                selected={doneDate ? (() => {
                                  const ymd = doneDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                                  return ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]) : new Date(doneDate);
                                })() : undefined}
                                onSelect={(date) => date && updateDoneDate(ideaKey, date)}
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-green-700 dark:text-green-400" onClick={() => toggleDone(ideaKey)}>
                              <CheckCircle2 className="h-3 w-3 fill-current" /> Undo
                            </Button>
                            <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-primary" onClick={() => onUseForArticle(cluster, idea)}>
                              <RefreshCw className="h-3 w-3" /> Regenerate
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
                                  {renderAddKeywordPopover(cluster, idea)}
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
                  })());
                  return acc;
                }, { elements: [] as React.ReactNode[], lastMonth: "" }).elements}
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
                          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-primary" onClick={() => onUseForArticle(cluster, idea)}>
                            <RefreshCw className="h-3 w-3" /> Regenerate
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
                                {renderAddKeywordPopover(cluster, idea)}
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
                          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 text-primary" onClick={() => onUseForArticle(cluster, idea)}>
                            <RefreshCw className="h-3 w-3" /> Regenerate
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
                                {renderAddKeywordPopover(cluster, idea)}
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
    {customIdeaDialog}
    </>
  );
};

export default ContentQueue;
