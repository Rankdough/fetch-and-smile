import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectLabel, SelectGroup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Brain, FileText, BookOpen, MessageSquare, History, Search, Pencil, Trash2, Plus, AlertOctagon, Bookmark, Sparkles, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UnitTypeChip } from "@/components/proprietary/UnitTypeChip";

const INSIGHT_TYPES = ["principle", "tactic", "case_study", "framework", "client_note"] as const;
const MAX_TAGS_PER_TYPE = 15;
const TYPE_FILTERS = [
  { value: "ai", label: "AI" },
  { value: "content", label: "Content" },
  { value: "links", label: "Links" },
  { value: "strategy", label: "Strategy" },
] as const;

interface UnitContradiction {
  id: string;
  otherId: string;
  otherTitle: string;
  note: string | null;
  status: string;
}

interface Insight {
  id: string;
  title: string;
  insight_type: string;
  summary: string | null;
  full_text: string | null;
  created_at: string;
  is_bookmarked: boolean;
  unit_type?: string;
  word_count?: number;
  contributor_id?: string | null;
  business_type?: string | null;
  parent_unit_id?: string | null;
  is_stale?: boolean;
  stale_reason?: string | null;
  usage_count?: number;
  tags?: { id: string; name: string; tag_type: string }[];
  contradictions?: { relatedTitle: string; explanation: string }[];
  unit_contradictions?: UnitContradiction[];
}

interface Tag {
  id: string;
  name: string;
  tag_type: string;
}

const CATEGORY_KEYWORDS: Record<(typeof TYPE_FILTERS)[number]["value"], string[]> = {
  ai: ["ai", "llm", "llms", "aeo", "geo", "answer engine", "ai overview", "ai search", "agent"],
  content: ["content", "editorial", "writing", "topical", "page", "landing page", "content quality", "content strategy"],
  links: ["link", "links", "backlink", "backlinks", "anchor", "digital pr", "internal linking", "authority"],
  strategy: ["strategy", "measurement", "metrics", "kpi", "prioritisation", "prioritization", "framework", "process", "team"],
};

function getInsightCategory(insight: Insight): (typeof TYPE_FILTERS)[number]["value"] {
  const haystack = [
    insight.title,
    insight.summary || "",
    insight.full_text || "",
    ...(insight.tags || []).map((tag) => tag.name),
  ]
    .join(" ")
    .toLowerCase();

  for (const type of TYPE_FILTERS) {
    if (CATEGORY_KEYWORDS[type.value].some((keyword) => haystack.includes(keyword))) {
      return type.value;
    }
  }

  if (insight.insight_type === "tactic" || insight.insight_type === "framework") return "strategy";
  return "content";
}

const BrainInsights = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [editingInsight, setEditingInsight] = useState<Insight | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newInsight, setNewInsight] = useState({ title: "", insight_type: "principle", summary: "", full_text: "" });

  const fetchData = useCallback(async () => {
    const [insightsRes, tagsRes, junctionRes, contradictionsRes, unitContraRes] = await Promise.all([
      supabase.from("brain_insights").select("*").order("created_at", { ascending: false }),
      supabase.from("brain_tags").select("*"),
      supabase.from("brain_insight_tags").select("insight_id, tag_id"),
      supabase.from("brain_connections").select("source_insight_id, related_insight_id, explanation").eq("relationship_type", "contradicts"),
      supabase.from("brain_unit_contradictions").select("id, unit_a_id, unit_b_id, note, status").neq("status", "resolved_deleted"),
    ]);

    const tagMap: Record<string, Tag> = {};
    (tagsRes.data || []).forEach((t) => {
      tagMap[t.id] = t;
    });

    const insightTagMap: Record<string, Tag[]> = {};
    (junctionRes.data || []).forEach((j) => {
      if (!insightTagMap[j.insight_id]) insightTagMap[j.insight_id] = [];
      if (tagMap[j.tag_id]) insightTagMap[j.insight_id].push(tagMap[j.tag_id]);
    });

    const insightTitleMap: Record<string, string> = {};
    (insightsRes.data || []).forEach((i: any) => {
      insightTitleMap[i.id] = i.title;
    });

    const contradictionMap: Record<string, { relatedTitle: string; explanation: string }[]> = {};
    (contradictionsRes.data || []).forEach((c: any) => {
      if (!contradictionMap[c.source_insight_id]) contradictionMap[c.source_insight_id] = [];
      contradictionMap[c.source_insight_id].push({
        relatedTitle: insightTitleMap[c.related_insight_id] || "Unknown",
        explanation: c.explanation || "",
      });

      if (!contradictionMap[c.related_insight_id]) contradictionMap[c.related_insight_id] = [];
      contradictionMap[c.related_insight_id].push({
        relatedTitle: insightTitleMap[c.source_insight_id] || "Unknown",
        explanation: c.explanation || "",
      });
    });

    const unitContraMap: Record<string, UnitContradiction[]> = {};
    (unitContraRes.data || []).forEach((c: any) => {
      const a = c.unit_a_id;
      const b = c.unit_b_id;
      if (!unitContraMap[a]) unitContraMap[a] = [];
      unitContraMap[a].push({ id: c.id, otherId: b, otherTitle: insightTitleMap[b] || "Unknown", note: c.note, status: c.status });
      if (!unitContraMap[b]) unitContraMap[b] = [];
      unitContraMap[b].push({ id: c.id, otherId: a, otherTitle: insightTitleMap[a] || "Unknown", note: c.note, status: c.status });
    });

    const enriched = (insightsRes.data || []).map((i) => ({
      ...i,
      tags: insightTagMap[i.id] || [],
      contradictions: contradictionMap[i.id] || [],
      unit_contradictions: unitContraMap[i.id] || [],
    }));

    setInsights(enriched);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tagsByType = useMemo(() => {
    const grouped: Record<string, { id: string; name: string; count: number }[]> = {};

    for (const type of TYPE_FILTERS) {
      const counts = new Map<string, { id: string; name: string; count: number }>();
      insights
        .filter((insight) => getInsightCategory(insight) === type.value)
        .forEach((insight) => {
          (insight.tags || []).forEach((tag) => {
            const existing = counts.get(tag.id);
            if (existing) {
              existing.count += 1;
            } else {
              counts.set(tag.id, { id: tag.id, name: tag.name, count: 1 });
            }
          });
        });

      grouped[type.value] = Array.from(counts.values())
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, MAX_TAGS_PER_TYPE);
    }

    return grouped;
  }, [insights]);

  const visibleTagOptions = useMemo(() => {
    if (typeFilter !== "all") {
      return TYPE_FILTERS.filter((type) => type.value === typeFilter).map((type) => ({
        ...type,
        tags: tagsByType[type.value] || [],
      }));
    }

    return TYPE_FILTERS.map((type) => ({
      ...type,
      tags: tagsByType[type.value] || [],
    })).filter((type) => type.tags.length > 0);
  }, [tagsByType, typeFilter]);

  useEffect(() => {
    if (tagFilter === "all") return;
    const stillVisible = visibleTagOptions.some((group) => group.tags.some((tag) => tag.id === tagFilter));
    if (!stillVisible) setTagFilter("all");
  }, [tagFilter, visibleTagOptions]);

  const filtered = insights.filter((insight) => {
    const category = getInsightCategory(insight);
    if (typeFilter !== "all" && category !== typeFilter) return false;
    if (tagFilter !== "all" && !insight.tags?.some((tag) => tag.id === tagFilter)) return false;
    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    return [insight.title, insight.summary || "", insight.full_text || "", ...(insight.tags || []).map((tag) => tag.name)]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const handleSaveEdit = async () => {
    if (!editingInsight) return;
    await supabase
      .from("brain_insights")
      .update({
        title: editingInsight.title,
        insight_type: editingInsight.insight_type,
        summary: editingInsight.summary,
        full_text: editingInsight.full_text,
      })
      .eq("id", editingInsight.id);
    setEditingInsight(null);
    fetchData();
    toast({ title: "Insight updated" });
  };

  const handleCreate = async () => {
    await supabase.from("brain_insights").insert({
      title: newInsight.title,
      insight_type: newInsight.insight_type,
      summary: newInsight.summary || null,
      full_text: newInsight.full_text || null,
    });
    setIsCreating(false);
    setNewInsight({ title: "", insight_type: "principle", summary: "", full_text: "" });
    fetchData();
    toast({ title: "Insight created" });
  };

  const handleDelete = async (id: string) => {
    await supabase.from("brain_insight_tags").delete().eq("insight_id", id);
    await supabase.from("brain_insights").delete().eq("id", id);
    setInsights((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Insight deleted" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <FileText className="h-4 w-4" /> Content Generator
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <Brain className="h-5 w-5 text-primary" />
            <span className="font-semibold text-lg">SEO Brain</span>
          </div>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/library")} className="gap-2"><BookOpen className="h-4 w-4" />Library</Button>
            <Button variant="default" size="sm" className="gap-2"><FileText className="h-4 w-4" />Insights</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/ask")} className="gap-2"><MessageSquare className="h-4 w-4" />Ask</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/outputs")} className="gap-2"><History className="h-4 w-4" />Outputs</Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/proprietary/extract")} className="gap-2"><Sparkles className="h-4 w-4" />Proprietary Mode</Button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Insights</h1>
          <Button onClick={() => setIsCreating(true)} className="gap-2"><Plus className="h-4 w-4" />Add Insight</Button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search insights..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={(value) => { setTypeFilter(value); setTagFilter("all"); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPE_FILTERS.map((type) => (
                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="All tags" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {visibleTagOptions.map((group) => (
                <SelectGroup key={group.value}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.tags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No insights found.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((insight) => {
              const category = TYPE_FILTERS.find((type) => type.value === getInsightCategory(insight));
              return (
                <Card key={insight.id}>
                  <CardContent className="py-4 px-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">{category?.label || "Content"}</Badge>
                          <span className="font-medium">{insight.title}</span>
                        </div>
                        {insight.summary && <p className="text-sm text-muted-foreground mb-2">{insight.summary}</p>}
                        {insight.tags && insight.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {insight.tags.map((tag) => <Badge key={tag.id} variant="secondary" className="text-xs">{tag.name}</Badge>)}
                          </div>
                        )}
                        {insight.contradictions && insight.contradictions.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {insight.contradictions.map((c, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-2.5 py-1.5">
                                <AlertOctagon className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                                <span><strong className="text-red-600 dark:text-red-400">Contradicts:</strong> {c.relatedTitle} — {c.explanation}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${insight.is_bookmarked ? "text-primary" : ""}`}
                          onClick={async () => {
                            const newVal = !insight.is_bookmarked;
                            await supabase.from("brain_insights").update({ is_bookmarked: newVal }).eq("id", insight.id);
                            setInsights(prev => prev.map(i => i.id === insight.id ? { ...i, is_bookmarked: newVal } : i));
                            toast({ title: newVal ? "Insight bookmarked" : "Bookmark removed" });
                          }}
                        >
                          <Bookmark className={`h-3.5 w-3.5 ${insight.is_bookmarked ? "fill-primary" : ""}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingInsight(insight)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(insight.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!editingInsight} onOpenChange={() => setEditingInsight(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Insight</DialogTitle></DialogHeader>
          {editingInsight && (
            <div className="space-y-4">
              <div><Label>Title</Label><Input value={editingInsight.title} onChange={(e) => setEditingInsight({ ...editingInsight, title: e.target.value })} /></div>
              <div><Label>Type</Label>
                <Select value={editingInsight.insight_type} onValueChange={(v) => setEditingInsight({ ...editingInsight, insight_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INSIGHT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Summary</Label><Textarea value={editingInsight.summary || ""} onChange={(e) => setEditingInsight({ ...editingInsight, summary: e.target.value })} rows={3} /></div>
              <div><Label>Full Text</Label><Textarea value={editingInsight.full_text || ""} onChange={(e) => setEditingInsight({ ...editingInsight, full_text: e.target.value })} rows={6} /></div>
            </div>
          )}
          <DialogFooter><Button onClick={handleSaveEdit}>Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Insight</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={newInsight.title} onChange={(e) => setNewInsight({ ...newInsight, title: e.target.value })} /></div>
            <div><Label>Type</Label>
              <Select value={newInsight.insight_type} onValueChange={(v) => setNewInsight({ ...newInsight, insight_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INSIGHT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Summary</Label><Textarea value={newInsight.summary} onChange={(e) => setNewInsight({ ...newInsight, summary: e.target.value })} rows={3} /></div>
            <div><Label>Full Text</Label><Textarea value={newInsight.full_text} onChange={(e) => setNewInsight({ ...newInsight, full_text: e.target.value })} rows={6} /></div>
          </div>
          <DialogFooter><Button onClick={handleCreate} disabled={!newInsight.title}>Create Insight</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BrainInsights;
