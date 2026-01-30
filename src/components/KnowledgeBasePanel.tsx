import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  BookOpen, 
  Upload, 
  Trash2, 
  FileText, 
  Loader2, 
  ChevronDown, 
  ChevronRight,
  Lightbulb 
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface KnowledgeItem {
  id: string;
  file_name: string;
  summary: string | null;
  key_rules: string[] | null;
  created_at: string;
}

export const KnowledgeBasePanel = () => {
  const { toast } = useToast();
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchKnowledgeItems();
  }, []);

  const fetchKnowledgeItems = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("seo_knowledge")
        .select("id, file_name, summary, key_rules, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setKnowledgeItems(data || []);
    } catch (error) {
      console.error("Error fetching knowledge:", error);
      toast({
        title: "Error",
        description: "Failed to load knowledge base",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of Array.from(files)) {
      try {
        // Read file content
        let content = "";
        
        if (file.type === "application/pdf" || 
            file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            file.type === "application/msword") {
          // For PDF and Word files, upload to storage and use parse-context-file
          const filePath = `${Date.now()}-${file.name}`;
          
          const { error: uploadError } = await supabase.storage
            .from("seo-knowledge")
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          // Get public URL for parsing
          const { data: urlData } = supabase.storage
            .from("seo-knowledge")
            .getPublicUrl(filePath);

          // Parse the file
          const formData = new FormData();
          formData.append("file", file);

          const { data: parseResult, error: parseError } = await supabase.functions.invoke(
            "parse-context-file",
            { body: formData }
          );

          if (parseError) throw parseError;
          content = parseResult.content || "";
        } else {
          // For text files, read directly
          content = await file.text();
        }

        if (!content.trim()) {
          throw new Error("Empty file or parsing failed");
        }

        // Process with AI and store
        const { data, error } = await supabase.functions.invoke("process-knowledge", {
          body: {
            fileName: file.name,
            filePath: file.name,
            content: content,
          },
        });

        if (error) throw error;

        successCount++;
        toast({
          title: "Document processed",
          description: `${file.name}: ${data.keyRulesCount} rules extracted`,
        });
      } catch (error) {
        console.error("Error processing file:", file.name, error);
        failCount++;
        toast({
          title: "Processing failed",
          description: `${file.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
          variant: "destructive",
        });
      }
    }

    // Refresh the list
    await fetchKnowledgeItems();
    setIsUploading(false);
    
    // Reset the input
    e.target.value = "";

    if (successCount > 0) {
      toast({
        title: "Upload complete",
        description: `${successCount} document(s) processed successfully${failCount > 0 ? `, ${failCount} failed` : ""}`,
      });
    }
  };

  const handleDelete = async (id: string, fileName: string) => {
    try {
      const { error } = await supabase
        .from("seo_knowledge")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setKnowledgeItems((prev) => prev.filter((item) => item.id !== id));
      toast({
        title: "Deleted",
        description: `${fileName} removed from knowledge base`,
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

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const totalRules = knowledgeItems.reduce(
    (sum, item) => sum + (item.key_rules?.length || 0),
    0
  );

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">SEO Knowledge Base</h3>
        </div>
        <Badge variant="secondary">
          {knowledgeItems.length} docs / {totalRules} rules
        </Badge>
      </div>

      <div className="space-y-2">
        <Label htmlFor="knowledge-upload" className="text-sm text-muted-foreground">
          Upload PDF, Word, or text documents containing SEO knowledge
        </Label>
        <div className="flex gap-2">
          <Input
            id="knowledge-upload"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="flex-1"
          />
          {isUploading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </div>
          )}
        </div>
      </div>

      <ScrollArea className="h-[300px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : knowledgeItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No knowledge documents yet</p>
            <p className="text-sm">Upload your SEO guides and strategies</p>
          </div>
        ) : (
          <div className="space-y-2">
            {knowledgeItems.map((item) => (
              <Collapsible
                key={item.id}
                open={expandedItems.has(item.id)}
                onOpenChange={() => toggleExpanded(item.id)}
              >
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CollapsibleTrigger className="flex items-start gap-2 text-left flex-1">
                      {expandedItems.has(item.id) ? (
                        <ChevronDown className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{item.file_name}</p>
                        {item.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {item.summary}
                          </p>
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {item.key_rules?.length || 0} rules
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDelete(item.id, item.file_name)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <CollapsibleContent className="space-y-2">
                    {item.key_rules && item.key_rules.length > 0 && (
                      <div className="pl-6 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <Lightbulb className="h-3 w-3" />
                          Key Rules:
                        </p>
                        <ul className="text-xs space-y-1">
                          {item.key_rules.slice(0, 10).map((rule, idx) => (
                            <li key={idx} className="text-muted-foreground">
                              • {rule}
                            </li>
                          ))}
                          {item.key_rules.length > 10 && (
                            <li className="text-muted-foreground italic">
                              ...and {item.key_rules.length - 10} more rules
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
};
