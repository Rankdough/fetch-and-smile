import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Brain, FileText, BookOpen, MessageSquare, History, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface BrainFile {
  id: string;
  title: string;
  file_url: string;
  file_type: string;
  status: string;
  uploaded_at: string;
  file_summary: string | null;
}

interface BrainInsight {
  id: string;
  title: string;
  insight_type: string;
  summary: string | null;
  source_file_id: string | null;
}

const BrainLibrary = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [files, setFiles] = useState<BrainFile[]>([]);
  const [insightsByFile, setInsightsByFile] = useState<Record<string, BrainInsight[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const fetchFiles = useCallback(async () => {
    const { data, error } = await supabase
      .from("brain_files")
      .select("*")
      .order("uploaded_at", { ascending: false });
    if (!error && data) setFiles(data);
    setIsLoading(false);
  }, []);

  const fetchInsightsForFile = useCallback(async (fileId: string) => {
    if (insightsByFile[fileId]) return;
    const { data } = await supabase
      .from("brain_insights")
      .select("id, title, insight_type, summary, source_file_id")
      .eq("source_file_id", fileId);
    if (data) setInsightsByFile(prev => ({ ...prev, [fileId]: data }));
  }, [insightsByFile]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);

    try {
      const filePath = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("brain-files")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: fileRecord, error: insertError } = await supabase
        .from("brain_files")
        .insert({ title: file.name, file_url: filePath, file_type: file.type || "text/plain", status: "pending" })
        .select()
        .single();
      if (insertError) throw insertError;

      // Read file content and send to analyze
      const text = await file.text();
      const { error: fnError } = await supabase.functions.invoke("analyze-brain-file", {
        body: { fileId: fileRecord.id, fileName: file.name, content: text },
      });

      if (fnError) {
        await supabase.from("brain_files").update({ status: "error" }).eq("id", fileRecord.id);
        throw fnError;
      }

      toast({ title: "File processed", description: `Extracted insights from ${file.name}` });
      fetchFiles();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (fileId: string) => {
    await supabase.from("brain_insights").delete().eq("source_file_id", fileId);
    await supabase.from("brain_files").delete().eq("id", fileId);
    setFiles(prev => prev.filter(f => f.id !== fileId));
    toast({ title: "File deleted" });
  };

  const toggleExpanded = (fileId: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else { next.add(fileId); fetchInsightsForFile(fileId); }
      return next;
    });
  };

  const statusColor = (s: string) =>
    s === "processed" ? "bg-green-100 text-green-800" :
    s === "error" ? "bg-red-100 text-red-800" :
    "bg-yellow-100 text-yellow-800";

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
            <Button variant="default" size="sm" className="gap-2"><BookOpen className="h-4 w-4" />Library</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/insights")} className="gap-2"><FileText className="h-4 w-4" />Insights</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/ask")} className="gap-2"><MessageSquare className="h-4 w-4" />Ask</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/outputs")} className="gap-2"><History className="h-4 w-4" />Outputs</Button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Knowledge Library</h1>
            <p className="text-muted-foreground">Upload documents and extract structured SEO insights.</p>
          </div>
          <label>
            <Input type="file" className="hidden" accept=".txt,.md,.pdf,.docx,.csv" onChange={handleUpload} disabled={isUploading} />
            <Button asChild disabled={isUploading}>
              <span className="cursor-pointer gap-2">
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isUploading ? "Processing..." : "Upload File"}
              </span>
            </Button>
          </label>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : files.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No files uploaded yet. Upload your first SEO document to get started.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {files.map(file => (
              <Collapsible key={file.id} open={expandedFiles.has(file.id)} onOpenChange={() => toggleExpanded(file.id)}>
                <Card>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <CollapsibleTrigger className="flex items-center gap-3 hover:opacity-80">
                        {expandedFiles.has(file.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="font-medium">{file.title}</span>
                        <Badge variant="secondary" className={statusColor(file.status)}>{file.status}</Badge>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{new Date(file.uploaded_at).toLocaleDateString()}</span>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(file.id)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4 px-4 space-y-4">
                      {/* File Summary */}
                      {file.file_summary && (
                        <div className="bg-muted/50 rounded-lg p-4 border">
                          <div className="text-sm text-muted-foreground prose prose-sm max-w-none dark:prose-invert [&_strong]:text-foreground">
                            <ReactMarkdown>{file.file_summary}</ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {/* Extracted Insights */}
                      {insightsByFile[file.id]?.length ? (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Extracted Insights ({insightsByFile[file.id].length})</h4>
                          <div className="space-y-2">
                            {insightsByFile[file.id].map(insight => (
                              <div key={insight.id} className="border rounded-md p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">{insight.insight_type}</Badge>
                                  <span className="font-medium text-sm">{insight.title}</span>
                                </div>
                                {insight.summary && <p className="text-sm text-muted-foreground">{insight.summary}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No insights extracted yet.</p>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default BrainLibrary;
