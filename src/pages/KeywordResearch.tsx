import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Search, Sparkles, Copy, Download, Trash2,
  ChevronDown, ChevronRight, Clock, Loader2, Square, ChevronUp,
  Plus, X, Edit2, Check, BrainCircuit
} from "lucide-react";
import KeywordClustering from "@/components/keyword-research/KeywordClustering";

interface Subtopic {
  name: string;
  description: string;
  example_queries: string[];
  selected: boolean;
}

interface KeywordCategory {
  name: string;
  terms: string[];
}

interface KeywordResult {
  categories: KeywordCategory[];
}

interface SavedResearch {
  id: string;
  topic: string;
  context: string | null;
  results: KeywordResult;
  created_at: string;
}

const KeywordResearch = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Step 1: Input
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  
  // Step 2: Subtopics
  const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
  const [isExpandingTopics, setIsExpandingTopics] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [newSubtopicName, setNewSubtopicName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Step 3: Results
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<KeywordResult | null>(null);
  const [currentTopic, setCurrentTopic] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  
  // Saved
  const [savedResearch, setSavedResearch] = useState<SavedResearch[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const subtopicsRef = useRef<HTMLDivElement | null>(null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(true);

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
        results: d.results as KeywordResult,
        created_at: d.created_at,
      })));
    }
    setIsLoadingSaved(false);
  };

  // ═══════════════════════════════════════════════
  // STEP 1: Expand topic into subtopics
  // ═══════════════════════════════════════════════
  const expandTopics = async () => {
    if (!topic.trim()) return;
    setIsExpandingTopics(true);
    setSubtopics([]);
    setResults(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/expand-topics`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            topic: topic.trim(),
            context: context.trim() || undefined,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      const data = await response.json();
      const expanded = (data.subtopics || []).map((s: any) => ({
        ...s,
        selected: true,
      }));
      setSubtopics(expanded);
      toast({
        title: "Topics expanded!",
        description: `${expanded.length} subtopic territories identified. Review and edit, then generate keywords.`,
      });
      setTimeout(() => subtopicsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err: any) {
      if (err.name === "AbortError") {
        toast({ title: "Expansion stopped" });
      } else {
        console.error(err);
        toast({ title: "Expansion failed", description: err.message, variant: "destructive" });
      }
    } finally {
      abortControllerRef.current = null;
      setIsExpandingTopics(false);
    }
  };

  // ═══════════════════════════════════════════════
  // STEP 2: Generate keywords from selected subtopics
  // ═══════════════════════════════════════════════
  const generateKeywords = async () => {
    const selected = subtopics.filter(s => s.selected);
    if (selected.length === 0) {
      toast({ title: "No subtopics selected", description: "Select at least one subtopic territory", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setResults(null);
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
            context: context.trim() || undefined,
            subtopics: selected.map(s => ({
              name: s.name,
              description: s.description,
              example_queries: s.example_queries,
            })),
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      const data = await response.json();
      const keywordResults = data.results as KeywordResult;
      setResults(keywordResults);
      setCurrentTopic(topic.trim());
      setOpenCategories(new Set(keywordResults.categories.map(c => c.name)));

      // Save to database
      await supabase
        .from("keyword_research" as any)
        .insert({
          topic: topic.trim(),
          context: context.trim() || null,
          results: keywordResults as any,
        });
      loadSavedResearch();

      toast({
        title: "Keyword universe generated!",
        description: `${getTotalTerms(keywordResults)} terms across ${keywordResults.categories.length} categories`,
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

  const stopOperation = () => {
    abortControllerRef.current?.abort();
  };

  // ═══════════════════════════════════════════════
  // Subtopic management
  // ═══════════════════════════════════════════════
  const toggleSubtopic = (index: number) => {
    setSubtopics(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s));
  };

  const toggleAll = (selected: boolean) => {
    setSubtopics(prev => prev.map(s => ({ ...s, selected })));
  };

  const removeSubtopic = (index: number) => {
    setSubtopics(prev => prev.filter((_, i) => i !== index));
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditName(subtopics[index].name);
    setEditDescription(subtopics[index].description);
  };

  const saveEdit = () => {
    if (editingIndex === null || !editName.trim()) return;
    setSubtopics(prev => prev.map((s, i) => i === editingIndex ? { ...s, name: editName.trim(), description: editDescription.trim() } : s));
    setEditingIndex(null);
  };

  const addSubtopic = () => {
    if (!newSubtopicName.trim()) return;
    setSubtopics(prev => [...prev, {
      name: newSubtopicName.trim(),
      description: "",
      example_queries: [],
      selected: true,
    }]);
    setNewSubtopicName("");
    setShowAddForm(false);
  };

  // ═══════════════════════════════════════════════
  // Results helpers
  // ═══════════════════════════════════════════════
  const getTotalTerms = (r: KeywordResult) => r.categories.reduce((sum, c) => sum + c.terms.length, 0);

  const copyAll = () => {
    if (!results) return;
    navigator.clipboard.writeText(results.categories.flatMap(c => c.terms).join("\n"));
    toast({ title: "Copied!", description: "All terms copied to clipboard" });
  };

  const exportCSV = () => {
    if (!results) return;
    const rows = [["Category", "Term"]];
    results.categories.forEach(c => c.terms.forEach(t => rows.push([c.name, t])));
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-${currentTopic.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadResearch = (saved: SavedResearch) => {
    setResults(saved.results);
    setCurrentTopic(saved.topic);
    setTopic(saved.topic);
    setContext(saved.context || "");
    setOpenCategories(new Set(saved.results.categories.map(c => c.name)));
    setSubtopics([]);
  };

  const deleteResearch = async (id: string) => {
    const { error } = await supabase.from("keyword_research" as any).delete().eq("id", id);
    if (!error) {
      setSavedResearch(prev => prev.filter(r => r.id !== id));
      toast({ title: "Deleted" });
    }
  };

  const toggleCategory = (name: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectedCount = subtopics.filter(s => s.selected).length;

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

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Step 1: Topic Input */}
        <Collapsible open={isGeneratorOpen} onOpenChange={setIsGeneratorOpen}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-primary" />
                    Topic Universe Generator
                  </CardTitle>
                  {isGeneratorOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <div>
                  <label className="text-sm font-medium mb-1 block">Topic *</label>
                  <Input
                    placeholder="e.g. meeting new people, toys, dental tourism..."
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !isExpandingTopics && expandTopics()}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Context (optional)</label>
                  <Textarea
                    placeholder="Describe the brand, product, target audience, or paste website URLs for context..."
                    value={context}
                    onChange={e => setContext(e.target.value)}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Add brand info, audience details, competitor URLs, or any context to help the AI think broadly about related topics.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={expandTopics} disabled={!topic.trim() || isExpandingTopics} className="gap-2">
                    {isExpandingTopics ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                    {isExpandingTopics ? "Expanding..." : "Expand into Subtopics"}
                  </Button>
                  {isExpandingTopics && (
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

        {/* Loading skeleton for expansion */}
        {isExpandingTopics && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {/* Step 2: Subtopic Review */}
        {subtopics.length > 0 && !isExpandingTopics && (
          <div ref={subtopicsRef}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Subtopic Territories
                    <Badge variant="secondary">{selectedCount}/{subtopics.length} selected</Badge>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>Select All</Button>
                    <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>Deselect All</Button>
                    <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)} className="gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground mb-3">
                  Review the AI-identified subtopics. Toggle, edit, or add your own, then generate keywords for the selected ones.
                </p>

                {showAddForm && (
                  <div className="flex items-center gap-2 p-3 rounded-md border border-dashed border-primary/40 bg-primary/5 mb-3">
                    <Input
                      placeholder="New subtopic name..."
                      value={newSubtopicName}
                      onChange={e => setNewSubtopicName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addSubtopic()}
                      className="flex-1"
                      autoFocus
                    />
                    <Button size="sm" onClick={addSubtopic} disabled={!newSubtopicName.trim()}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setNewSubtopicName(""); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                {subtopics.map((subtopic, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
                      subtopic.selected ? "bg-accent/30 border-primary/20" : "bg-muted/30 border-border opacity-60"
                    }`}
                  >
                    <Checkbox
                      checked={subtopic.selected}
                      onCheckedChange={() => toggleSubtopic(index)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      {editingIndex === index ? (
                        <div className="space-y-2">
                          <Input value={editName} onChange={e => setEditName(e.target.value)} className="text-sm font-medium" />
                          <Input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description..." className="text-xs" />
                          <div className="flex gap-1">
                            <Button size="sm" onClick={saveEdit}><Check className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingIndex(null)}><X className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="font-medium text-sm">{subtopic.name}</div>
                          {subtopic.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{subtopic.description}</div>
                          )}
                          {subtopic.example_queries.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {subtopic.example_queries.slice(0, 4).map((q, qi) => (
                                <Badge key={qi} variant="outline" className="text-[10px] font-normal">
                                  {q}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {editingIndex !== index && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditing(index)}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeSubtopic(index)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex items-center gap-3 pt-3">
                  <Button onClick={generateKeywords} disabled={selectedCount === 0 || isGenerating} className="gap-2">
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isGenerating ? "Generating..." : `Generate Keywords (${selectedCount} subtopics)`}
                  </Button>
                  {isGenerating && (
                    <Button variant="destructive" size="sm" onClick={stopOperation} className="gap-2">
                      <Square className="h-3.5 w-3.5" />
                      Stop
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Loading skeleton for generation */}
        {isGenerating && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {/* Step 3: Results */}
        <div ref={resultsRef}>
          {results && !isGenerating && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">"{currentTopic}"</h2>
                  <Badge variant="secondary">
                    {getTotalTerms(results)} terms · {results.categories.length} categories
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyAll} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    Copy All
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {results.categories.map(category => (
                  <Collapsible
                    key={category.name}
                    open={openCategories.has(category.name)}
                    onOpenChange={() => toggleCategory(category.name)}
                  >
                    <Card>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {openCategories.has(category.name) ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-medium text-sm">{category.name}</span>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {category.terms.length} terms
                            </Badge>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-4 px-4">
                          <div className="flex flex-wrap gap-1.5">
                            {category.terms.map((term, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs"
                                onClick={() => {
                                  navigator.clipboard.writeText(term);
                                  toast({ title: "Copied", description: term });
                                }}
                              >
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

        {/* Keyword Clustering */}
        <KeywordClustering />

        {/* Saved Research */}
        {savedResearch.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Previous Research
              </CardTitle>
            </CardHeader>
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
                        {getTotalTerms(saved.results)} terms · {new Date(saved.created_at).toLocaleDateString()}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={e => {
                        e.stopPropagation();
                        deleteResearch(saved.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoadingSaved && !savedResearch.length && (
          <Skeleton className="h-24 w-full" />
        )}
      </main>
    </div>
  );
};

export default KeywordResearch;
