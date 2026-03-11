import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, CheckCircle2, XCircle, ArrowLeft, Play, Eye } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MigrationResult {
  url: string;
  type: string;
  title: string;
  subtitle: string;
  seoTitle: string;
  seoDescription: string;
  content: string;
  titleNL: string;
  subtitleNL: string;
  seoTitleNL: string;
  seoDescriptionNL: string;
  contentNL: string;
  titleDE: string;
  subtitleDE: string;
  seoTitleDE: string;
  seoDescriptionDE: string;
  contentDE: string;
  error?: string;
}

interface UrlEntry {
  url: string;
  type: string;
  status: "pending" | "processing" | "done" | "error";
  result?: MigrationResult;
  error?: string;
}

export default function ContentMigration() {
  const { toast } = useToast();
  const [urlInput, setUrlInput] = useState("");
  const [entries, setEntries] = useState<UrlEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  const parseUrls = () => {
    const lines = urlInput.trim().split("\n").filter(l => l.trim());
    const parsed: UrlEntry[] = lines.map(line => ({
      url: line.trim(),
      type: "",
      status: "pending",
    }));
    setEntries(parsed);
  };

  const processUrl = useCallback(async (entry: UrlEntry): Promise<UrlEntry> => {
    try {
      const { data, error } = await supabase.functions.invoke("migrate-url", {
        body: { url: entry.url, type: entry.type },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return { ...entry, status: "done", result: data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { ...entry, status: "error", error: msg };
    }
  }, []);

  const startProcessing = async () => {
    setIsProcessing(true);
    const updated = [...entries];

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === "done") continue;

      updated[i] = { ...updated[i], status: "processing" };
      setEntries([...updated]);

      const result = await processUrl(updated[i]);
      updated[i] = result;
      setEntries([...updated]);

      // Small delay between URLs to avoid rate limits
      if (i < updated.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setIsProcessing(false);
    const done = updated.filter(e => e.status === "done").length;
    const failed = updated.filter(e => e.status === "error").length;
    toast({
      title: "Processing complete",
      description: `${done} succeeded, ${failed} failed out of ${updated.length} URLs.`,
    });
  };

  const escapeCSV = (val: string): string => {
    if (!val) return '""';
    const escaped = val.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const downloadCSV = () => {
    const headers = [
      "Type", "image", "Old url", "New url",
      "Title", "Title (EN)", "Title (NL)", "Title (DE)",
      "subtitle ", "subtitle (NL)", "subtitle (DE)",
      "Content", "Content (EN)", "Content (NL)", "Content (DE)",
      "SEO Title", "SEO Title (EN)", "SEO Title (NL)", "SEO Title (DE)",
      "SEO Description", "SEO Description (EN)", "SEO Description (NL)", "SEO Description (DE)",
    ];

    const rows = entries.filter(e => e.status === "done" && e.result).map(e => {
      const r = e.result!;
      return [
        r.type,           // Type
        "",               // image (keep empty)
        r.url,            // Old url
        "",               // New url (keep empty)
        r.title,          // Title
        r.title,          // Title (EN) - same as main
        r.titleNL,        // Title (NL)
        r.titleDE,        // Title (DE)
        r.subtitle,       // subtitle
        r.subtitleNL,     // subtitle (NL)
        r.subtitleDE,     // subtitle (DE)
        r.content,        // Content
        r.content,        // Content (EN) - same as main
        r.contentNL,      // Content (NL)
        r.contentDE,      // Content (DE)
        r.seoTitle,       // SEO Title
        r.seoTitle,       // SEO Title (EN) - same as main
        r.seoTitleNL,     // SEO Title (NL)
        r.seoTitleDE,     // SEO Title (DE)
        r.seoDescription, // SEO Description
        r.seoDescription, // SEO Description (EN)
        r.seoDescriptionNL, // SEO Description (NL)
        r.seoDescriptionDE, // SEO Description (DE)
      ].map(escapeCSV).join(",");
    });

    const bom = "\uFEFF";
    const csv = bom + headers.map(escapeCSV).join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `content_migration_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doneCount = entries.filter(e => e.status === "done").length;
  const errorCount = entries.filter(e => e.status === "error").length;
  const progress = entries.length > 0 ? ((doneCount + errorCount) / entries.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <NavLink to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </NavLink>
          <h1 className="text-xl font-bold">Content Migration</h1>
          <div className="flex-1" />
          <NavLink to="/">SEO Generator</NavLink>
          <NavLink to="/articles">Articles</NavLink>
          <NavLink to="/keyword-research">Keywords</NavLink>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Input */}
        <Card>
          <CardHeader>
            <CardTitle>URLs to Process</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Paste URLs, one per line..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              rows={6}
              disabled={isProcessing}
            />
            <div className="flex gap-2">
              <Button onClick={parseUrls} disabled={isProcessing || !urlInput.trim()}>
                Load URLs
              </Button>
              {entries.length > 0 && (
                <>
                  <Button onClick={startProcessing} disabled={isProcessing} className="gap-2">
                    {isProcessing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                      <><Play className="h-4 w-4" /> Start Processing ({entries.filter(e => e.status !== "done").length})</>
                    )}
                  </Button>
                  {doneCount > 0 && (
                    <Button variant="outline" onClick={downloadCSV} className="gap-2">
                      <Download className="h-4 w-4" /> Download CSV ({doneCount})
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        {entries.length > 0 && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span>{doneCount + errorCount} / {entries.length} processed</span>
                <span className="flex gap-2">
                  {doneCount > 0 && <Badge variant="default">{doneCount} done</Badge>}
                  {errorCount > 0 && <Badge variant="destructive">{errorCount} failed</Badge>}
                </span>
              </div>
              <Progress value={progress} />
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {entries.map((entry, idx) => (
          <Card key={idx} className="overflow-hidden">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                {entry.status === "pending" && <div className="h-5 w-5 rounded-full border-2 border-muted" />}
                {entry.status === "processing" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                {entry.status === "done" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                {entry.status === "error" && <XCircle className="h-5 w-5 text-destructive" />}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.url}</p>
                  {entry.status === "done" && entry.result && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {entry.result.title} · {entry.result.seoTitle}
                    </p>
                  )}
                  {entry.status === "error" && (
                    <p className="text-xs text-destructive mt-0.5">{entry.error}</p>
                  )}
                </div>

                {entry.status === "done" && entry.result && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setPreviewHtml(entry.result!.content);
                      setPreviewTitle(entry.result!.title);
                    }}
                  >
                    <Eye className="h-4 w-4" /> Preview
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </main>

      {/* Preview Dialog */}
      <Dialog open={!!previewHtml} onOpenChange={() => setPreviewHtml(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          <div dangerouslySetInnerHTML={{ __html: previewHtml || "" }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
