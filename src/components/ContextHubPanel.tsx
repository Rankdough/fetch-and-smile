import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FolderOpen,
  Plus,
  Loader2,
  FileText,
  Trash2,
  Save,
  BookOpen,
  X,
} from "lucide-react";

interface ContextFile {
  name: string;
  content: string;
}

interface ContextTopic {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface ContextDocument {
  id: string;
  topic_id: string;
  file_name: string;
  content: string;
  summary: string | null;
  created_at: string;
}

interface ContextHubPanelProps {
  contextFiles: ContextFile[];
  onLoadTopicFiles: (files: ContextFile[]) => void;
}

const ContextHubPanel = ({ contextFiles, onLoadTopicFiles }: ContextHubPanelProps) => {
  const { toast } = useToast();
  const [topics, setTopics] = useState<ContextTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [topicDocuments, setTopicDocuments] = useState<ContextDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [excludedDocIds, setExcludedDocIds] = useState<Set<string>>(new Set());

  // Load topics on mount
  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    const { data, error } = await supabase
      .from("context_topics")
      .select("*")
      .order("name");
    if (!error && data) {
      setTopics(data);
    }
  };

  // Load documents when topic selected
  useEffect(() => {
    if (selectedTopicId) {
      loadTopicDocuments(selectedTopicId);
      setExcludedDocIds(new Set()); // Reset exclusions when switching topics
    } else {
      setTopicDocuments([]);
    }
  }, [selectedTopicId]);

  const loadTopicDocuments = async (topicId: string) => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("context_documents")
      .select("*")
      .eq("topic_id", topicId)
      .order("created_at");
    if (!error && data) {
      setTopicDocuments(data);
    }
    setIsLoading(false);
  };

  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) return;
    const { data, error } = await supabase
      .from("context_topics")
      .insert({ name: newTopicName.trim() })
      .select()
      .single();
    if (error) {
      toast({ title: "Failed to create topic", variant: "destructive" });
      return;
    }
    setTopics((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedTopicId(data.id);
    setNewTopicName("");
    setShowNewTopic(false);
    toast({ title: "Topic created", description: data.name });
  };

  const handleDeleteTopic = async (topicId: string) => {
    const { error } = await supabase.from("context_topics").delete().eq("id", topicId);
    if (error) {
      toast({ title: "Failed to delete topic", variant: "destructive" });
      return;
    }
    setTopics((prev) => prev.filter((t) => t.id !== topicId));
    if (selectedTopicId === topicId) {
      setSelectedTopicId("");
      setTopicDocuments([]);
    }
    toast({ title: "Topic deleted" });
  };

  const handleExcludeDocument = (docId: string) => {
    setExcludedDocIds((prev) => new Set([...prev, docId]));
    toast({ title: "Document excluded from this article" });
  };

  const handleSaveCurrentFiles = async () => {
    if (!selectedTopicId || contextFiles.length === 0) return;
    setIsSaving(true);
    try {
      const existingNames = topicDocuments.map((d) => d.file_name);
      const newFiles = contextFiles.filter((f) => !existingNames.includes(f.name));
      if (newFiles.length === 0) {
        toast({ title: "All files already saved", description: "No new files to add to this topic." });
        setIsSaving(false);
        return;
      }
      const rows = newFiles.map((f) => ({
        topic_id: selectedTopicId,
        file_name: f.name,
        content: f.content,
      }));
      const { data, error } = await supabase.from("context_documents").insert(rows).select();
      if (error) throw error;
      setTopicDocuments((prev) => [...prev, ...(data || [])]);
      toast({
        title: "Files saved to topic",
        description: `${newFiles.length} file(s) added`,
      });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadTopicFiles = () => {
    const visibleDocs = topicDocuments.filter((d) => !excludedDocIds.has(d.id));
    if (visibleDocs.length === 0) return;
    const files: ContextFile[] = visibleDocs.map((d) => ({
      name: d.file_name,
      content: d.content,
    }));
    onLoadTopicFiles(files);
    toast({
      title: "Topic files loaded",
      description: `${files.length} file(s) loaded from knowledge hub`,
    });
  };

  const selectedTopic = topics.find((t) => t.id === selectedTopicId);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium">Context Knowledge Hub</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Save and reuse research files across articles. Select a topic to load its context files automatically.
      </p>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
            <SelectTrigger className="bg-input border-2 border-input-border">
              <SelectValue placeholder="Select a topic..." />
            </SelectTrigger>
            <SelectContent>
              {topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowNewTopic(!showNewTopic)}
          title="Create new topic"
        >
          <Plus className="h-4 w-4" />
        </Button>
        {topics.length > 0 && (
          <Dialog open={manageOpen} onOpenChange={setManageOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />
                Manage
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Manage Topics</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {topics.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-md bg-muted p-2">
                      <span className="text-sm font-medium">{t.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDeleteTopic(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {showNewTopic && (
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Bali Property"
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateTopic()}
            className="bg-input border-2 border-input-border"
          />
          <Button size="sm" onClick={handleCreateTopic} disabled={!newTopicName.trim()}>
            Create
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { setShowNewTopic(false); setNewTopicName(""); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {selectedTopicId && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading documents...
            </div>
          ) : (
            <>
              {(() => {
                const visibleDocs = topicDocuments.filter((d) => !excludedDocIds.has(d.id));
                return visibleDocs.length > 0 ? (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {visibleDocs.length} document(s) in "{selectedTopic?.name}"
                    {excludedDocIds.size > 0 && ` (${excludedDocIds.size} excluded for this article)`}
                  </Label>
                  {visibleDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-md bg-muted p-1.5 text-xs">
                      <div className="flex items-center gap-1.5 truncate">
                        <FileText className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{doc.file_name}</span>
                        <Badge variant="secondary" className="text-[10px] px-1">
                          {(doc.content.length / 1024).toFixed(1)}KB
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleExcludeDocument(doc.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {topicDocuments.length > 0 
                    ? `All documents excluded for this article. Switch topics or reload to restore.`
                    : "No documents yet. Upload context files above, then save them to this topic."}
                </p>
              );
              })()}

              <div className="flex gap-2">
                {topicDocuments.filter((d) => !excludedDocIds.has(d.id)).length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleLoadTopicFiles}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Load into Article
                  </Button>
                )}
                {contextFiles.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleSaveCurrentFiles}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save Current Files to Topic
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ContextHubPanel;
