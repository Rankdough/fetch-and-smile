import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain, FileText, BookOpen, MessageSquare, History, Trash2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface BrainOutput {
  id: string;
  title: string;
  output_type: string;
  generated_text: string;
  insight_ids: string[];
  created_at: string;
}

const BrainOutputs = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [outputs, setOutputs] = useState<BrainOutput[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOutputs = useCallback(async () => {
    const { data } = await supabase
      .from("brain_outputs")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setOutputs(data as any);
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchOutputs(); }, [fetchOutputs]);

  const handleDelete = async (id: string) => {
    await supabase.from("brain_outputs").delete().eq("id", id);
    setOutputs(prev => prev.filter(o => o.id !== id));
    toast({ title: "Output deleted" });
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
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
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/insights")} className="gap-2"><FileText className="h-4 w-4" />Insights</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/seo-brain/ask")} className="gap-2"><MessageSquare className="h-4 w-4" />Ask</Button>
            <Button variant="default" size="sm" className="gap-2"><History className="h-4 w-4" />Outputs</Button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Saved Outputs</h1>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : outputs.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No saved outputs yet. Use the Ask page to generate and save answers.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {outputs.map(output => (
              <Card key={output.id}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{output.output_type}</Badge>
                      <CardTitle className="text-base">{output.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{new Date(output.created_at).toLocaleDateString()}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy(output.generated_text)}><Copy className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(output.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4 px-4">
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{output.generated_text}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default BrainOutputs;
