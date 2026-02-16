import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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

const Articles = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [articles, setArticles] = useState<SavedArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const handleLoad = (article: SavedArticle) => {
    // Store all settings in localStorage so the generator picks them up
    localStorage.setItem("seo-generator-generatedContent", article.generated_content);
    localStorage.setItem("seo-generator-originalContent", article.original_content || article.generated_content);
    
    localStorage.setItem("seo-generator-formData", JSON.stringify({
      topic: article.topic,
      length: article.target_length || "medium",
      outline: article.outline || "",
      instructions: article.instructions || "",
    }));

    if (article.value_promise) localStorage.setItem("seo-generator-valuePromise", article.value_promise);
    else localStorage.removeItem("seo-generator-valuePromise");

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

    // Context files - we store names only, content won't be restored
    if (article.context_file_names?.length) {
      localStorage.setItem("seo-generator-contextFiles", JSON.stringify(
        article.context_file_names.map(name => ({ name, content: "[Previously uploaded]" }))
      ));
    } else {
      localStorage.setItem("seo-generator-contextFiles", JSON.stringify([]));
    }

    toast({
      title: "Article loaded",
      description: `"${article.title}" settings restored. Navigating to generator...`,
    });

    // Navigate to generator - it will pick up from localStorage
    navigate("/");
    // Force a page reload to reinitialize state from localStorage
    window.location.href = "/";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getWordCount = (content: string) => {
    return content.split(/\s+/).filter(Boolean).length;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Saved Articles</h1>
              <p className="text-sm text-muted-foreground">
                {articles.length} article{articles.length !== 1 ? "s" : ""} saved
              </p>
            </div>
          </div>
        </div>

        {/* Articles List */}
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
            <Button onClick={() => navigate("/")}>
              Go to Generator
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <Card key={article.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <h3 className="font-semibold text-lg truncate">{article.title}</h3>
                    <p className="text-sm text-muted-foreground truncate">
                      Topic: {article.topic}
                    </p>
                    
                    {/* Metadata badges */}
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

                    {/* Content preview */}
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {article.generated_content
                        .replace(/[#*_\[\]()]/g, "")
                        .replace(/\n+/g, " ")
                        .slice(0, 200)}
                      ...
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleLoad(article)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Load & Rerun
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
    </div>
  );
};

export default Articles;
