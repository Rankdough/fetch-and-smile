import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Loader2,
  ArrowLeft,
  Trash2,
  RotateCcw,
  Calendar,
  Hash,
  Tag,
  Eye,
  ChevronDown,
  ChevronRight,
  Folder,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SavedArticle {
  id: string;
  title: string;
  topic: string;
  generated_content: string;
  original_content: string | null;
  value_promise: string | null;
  gap_analysis: string | null;
  format_reference: string | null;
  outline: string | null;
  instructions: string | null;
  keywords: string[] | null;
  target_length: string | null;
  competitor_urls: string[] | null;
  selected_angles: string[] | null;
  selected_gap_insights: string[] | null;
  tone_profile_id: string | null;
  use_knowledge_base: boolean | null;
  context_file_names: string[] | null;
  cta_url: string | null;
  generated_ctas: any;
  color_palette: string | null;
  article_images: any;
  applied_rules: any;
  word_count: number | null;
  created_at: string;
  updated_at: string;
}

const UNASSIGNED = "Unassigned";

const brandFromUrl = (url: string | null | undefined): string => {
  if (!url || !url.trim()) return UNASSIGNED;
  try {
    const u = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`);
    const host = u.hostname.replace(/^www\./i, "");
    const parts = host.split(".");
    // take the registrable label (e.g. meet5 from meet5.com, shopify from shop.shopify.com)
    const label = parts.length >= 2 ? parts[parts.length - 2] : host;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return UNASSIGNED;
  }
};

const Articles = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [articles, setArticles] = useState<SavedArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeBrand, setActiveBrand] = useState<string | "ALL">("ALL");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await (supabase
        .from("saved_articles") as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setArticles((data as SavedArticle[]) || []);
    } catch (error) {
      console.error("Error fetching articles:", error);
      toast({
        title: "Error",
        description: "Failed to load saved articles",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    try {
      const { error } = await (supabase
        .from("saved_articles") as any)
        .delete()
        .eq("id", id);

      if (error) throw error;

      setArticles((prev) => prev.filter((a) => a.id !== id));
      toast({
        title: "Deleted",
        description: `"${title}" removed`,
      });
    } catch (error) {
      console.error("Error deleting:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const restoreSettings = (article: SavedArticle) => {
    localStorage.setItem("seo-generator-generatedContent", article.generated_content);
    localStorage.setItem("seo-generator-originalContent", article.original_content || article.generated_content);
    
    localStorage.setItem("seo-generator-formData", JSON.stringify({
      topic: article.topic,
      length: article.target_length || "medium",
      outline: article.outline || "",
      instructions: article.instructions || "",
    }));

    if (article.value_promise) {
      const claims = [article.value_promise, "", "", "", ""];
      localStorage.setItem("seo-generator-valuePromiseClaims", JSON.stringify(claims));
    } else {
      localStorage.removeItem("seo-generator-valuePromiseClaims");
    }

    if (article.gap_analysis) localStorage.setItem("seo-generator-gapAnalysis", article.gap_analysis);
    else localStorage.removeItem("seo-generator-gapAnalysis");

    if (article.format_reference) localStorage.setItem("seo-generator-formatReference", article.format_reference);
    else localStorage.removeItem("seo-generator-formatReference");

    if (article.competitor_urls?.length) localStorage.setItem("seo-generator-competitorUrls", JSON.stringify(article.competitor_urls));
    else localStorage.setItem("seo-generator-competitorUrls", JSON.stringify(["", "", ""]));

    if (article.keywords?.length) localStorage.setItem("seo-generator-keywords", JSON.stringify(article.keywords));
    else localStorage.setItem("seo-generator-keywords", JSON.stringify([]));

    if (article.selected_angles?.length) localStorage.setItem("seo-generator-selectedAngles", JSON.stringify(article.selected_angles));
    else localStorage.setItem("seo-generator-selectedAngles", JSON.stringify([]));

    if (article.selected_gap_insights?.length) localStorage.setItem("seo-generator-selectedGapInsights", JSON.stringify(article.selected_gap_insights));
    else localStorage.setItem("seo-generator-selectedGapInsights", JSON.stringify([]));

    if (article.tone_profile_id) localStorage.setItem("seo-generator-toneProfileId", article.tone_profile_id);
    else localStorage.removeItem("seo-generator-toneProfileId");

    localStorage.setItem("seo-generator-useKnowledgeBase", JSON.stringify(article.use_knowledge_base ?? true));

    if (article.cta_url) localStorage.setItem("seo-generator-ctaUrl", article.cta_url);
    else localStorage.removeItem("seo-generator-ctaUrl");

    if (article.generated_ctas) localStorage.setItem("seo-generator-generatedCTAs", JSON.stringify(article.generated_ctas));
    else localStorage.removeItem("seo-generator-generatedCTAs");

    if (article.color_palette) localStorage.setItem("seo-generator-colorPalette", JSON.stringify(article.color_palette));
    else localStorage.removeItem("seo-generator-colorPalette");

    if (article.article_images) localStorage.setItem("seo-generator-articleImages", JSON.stringify(article.article_images));
    else localStorage.setItem("seo-generator-articleImages", JSON.stringify([]));

    if (article.applied_rules) localStorage.setItem("seo-generator-appliedRules", JSON.stringify(article.applied_rules));
    else localStorage.removeItem("seo-generator-appliedRules");

    if (article.context_file_names?.length) {
      localStorage.setItem("seo-generator-contextFiles", JSON.stringify(
        article.context_file_names.map(name => ({ name, content: "[Previously uploaded]" }))
      ));
    } else {
      localStorage.setItem("seo-generator-contextFiles", JSON.stringify([]));
    }
  };

  const handleLoad = (article: SavedArticle) => {
    restoreSettings(article);
    localStorage.removeItem("seo-generator-autoRerun");
    toast({ title: "Article loaded", description: `"${article.title}" loaded with all settings.` });
    window.location.href = "/";
  };

  const handleRerun = (article: SavedArticle) => {
    restoreSettings(article);
    localStorage.setItem("seo-generator-autoRerun", "true");
    toast({ title: "Rerunning article", description: `"${article.title}" will regenerate.` });
    window.location.href = "/";
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

  const getWordCount = (content: string) => content.split(/\s+/).filter(Boolean).length;

  // Group by brand
  const grouped = useMemo(() => {
    const map = new Map<string, SavedArticle[]>();
    for (const a of articles) {
      const brand = brandFromUrl(a.cta_url);
      if (!map.has(brand)) map.set(brand, []);
      map.get(brand)!.push(a);
    }
    // Sort: brands by count desc, Unassigned last
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === UNASSIGNED) return 1;
      if (b[0] === UNASSIGNED) return -1;
      return b[1].length - a[1].length;
    });
  }, [articles]);

  const visibleGroups = activeBrand === "ALL" ? grouped : grouped.filter(([b]) => b === activeBrand);

  const toggle = (brand: string) =>
    setExpanded((prev) => ({ ...prev, [brand]: !(prev[brand] ?? true) }));

  const isOpen = (brand: string) => expanded[brand] ?? true;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Saved Articles</h1>
              <p className="text-sm text-muted-foreground">
                {articles.length} article{articles.length !== 1 ? "s" : ""} saved · {grouped.length} brand{grouped.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Brand filter chips */}
        {!isLoading && articles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={activeBrand === "ALL" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setActiveBrand("ALL")}
            >
              All ({articles.length})
            </Badge>
            {grouped.map(([brand, items]) => (
              <Badge
                key={brand}
                variant={activeBrand === brand ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setActiveBrand(brand)}
              >
                {brand} ({items.length})
              </Badge>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : articles.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h2 className="text-xl font-semibold mb-2">No saved articles yet</h2>
            <p className="text-muted-foreground mb-4">
              Generate an article and click "Save Article" to store it here
            </p>
            <Button onClick={() => navigate("/")}>Go to Generator</Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {visibleGroups.map(([brand, items]) => (
              <div key={brand} className="space-y-2">
                <button
                  onClick={() => toggle(brand)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted rounded-md transition-colors"
                >
                  {isOpen(brand) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Folder className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{brand}</span>
                  <Badge variant="secondary" className="ml-auto">
                    {items.length} article{items.length !== 1 ? "s" : ""}
                  </Badge>
                </button>

                {isOpen(brand) && (
                  <div className="space-y-3 pl-2">
                    {items.map((article) => (
                      <Card key={article.id} className="p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <h3 className="font-semibold text-lg truncate">{article.title}</h3>
                            <p className="text-sm text-muted-foreground truncate">
                              Topic: {article.topic}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="secondary" className="text-xs">
                                <Calendar className="h-3 w-3 mr-1" />
                                {formatDate(article.created_at)}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                <Hash className="h-3 w-3 mr-1" />
                                {article.word_count || getWordCount(article.generated_content)} words
                              </Badge>
                              {article.keywords && article.keywords.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  <Tag className="h-3 w-3 mr-1" />
                                  {article.keywords.slice(0, 3).join(", ")}
                                  {article.keywords.length > 3 ? ` +${article.keywords.length - 3}` : ""}
                                </Badge>
                              )}
                              {article.tone_profile_id && (
                                <Badge variant="outline" className="text-xs">Tone applied</Badge>
                              )}
                              {article.gap_analysis && (
                                <Badge variant="outline" className="text-xs">Gap analysis</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {article.generated_content
                                .replace(/[#*_\[\]()]/g, "")
                                .replace(/\n+/g, " ")
                                .slice(0, 200)}
                              ...
                            </p>
                          </div>

                          <div className="flex flex-col gap-2 flex-shrink-0">
                            <Button size="sm" variant="outline" onClick={() => handleLoad(article)}>
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Load
                            </Button>
                            <Button size="sm" onClick={() => handleRerun(article)}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Rerun
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete article?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete "{article.title}" and all its saved settings.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(article.id, article.title)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Articles;
