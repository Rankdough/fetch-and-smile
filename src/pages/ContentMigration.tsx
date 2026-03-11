import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, CheckCircle2, XCircle, ArrowLeft, Play, Eye, Trash2, Copy, Check, Palette, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { ColorPaletteSelector, COLOR_PALETTES, type ColorPalette } from "@/components/ColorPaletteSelector";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  id?: string; // DB id
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
  const [previewResult, setPreviewResult] = useState<MigrationResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedColorPalette, setSelectedColorPalette] = useState<ColorPalette | null>(() => {
    const saved = localStorage.getItem("migration-color-palette");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch { return COLOR_PALETTES.find(p => p.id === "big-league") || null; }
    }
    return COLOR_PALETTES.find(p => p.id === "big-league") || null;
  });
  const [skipNavigation, setSkipNavigation] = useState(() => localStorage.getItem("migration-skip-nav") === "true");
  const [skipQuickTips, setSkipQuickTips] = useState(() => localStorage.getItem("migration-skip-tips") === "true");
  const [skipFaqs, setSkipFaqs] = useState(() => localStorage.getItem("migration-skip-faqs") === "true");
  const [skipSources, setSkipSources] = useState(() => localStorage.getItem("migration-skip-sources") === "true");
  const [colorOpen, setColorOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);

  // Load saved jobs on mount
  useEffect(() => {
    const loadJobs = async () => {
      const { data, error } = await supabase
        .from("migration_jobs")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        const loaded: UrlEntry[] = data.map((row: any) => ({
          id: row.id,
          url: row.url,
          type: row.type || "",
          status: row.status as UrlEntry["status"],
          result: row.result as MigrationResult | undefined,
          error: row.error || undefined,
        }));
        setEntries(loaded);
      }
      setIsLoading(false);
    };
    loadJobs();
  }, []);

  const parseUrls = async () => {
    const lines = urlInput.trim().split("\n").filter(l => l.trim());
    const newEntries: UrlEntry[] = [];

    for (const line of lines) {
      const url = line.trim();
      // Insert into DB
      const { data, error } = await supabase
        .from("migration_jobs")
        .insert({ url, type: "", status: "pending" })
        .select()
        .single();

      if (!error && data) {
        newEntries.push({
          id: data.id,
          url: data.url,
          type: data.type || "",
          status: "pending",
        });
      }
    }

    setEntries(prev => [...prev, ...newEntries]);
    setUrlInput("");
  };

  const processUrl = useCallback(async (entry: UrlEntry): Promise<UrlEntry> => {
    try {
      const { data, error } = await supabase.functions.invoke("migrate-url", {
        body: { url: entry.url, type: entry.type, colorPalette: selectedColorPalette, skipNavigation, skipQuickTips, skipFaqs, skipSources },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Save result to DB
      if (entry.id) {
        await supabase
          .from("migration_jobs")
          .update({ status: "done", result: data as any })
          .eq("id", entry.id);
      }

      return { ...entry, status: "done", result: data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";

      if (entry.id) {
        await supabase
          .from("migration_jobs")
          .update({ status: "error", error: msg })
          .eq("id", entry.id);
      }

      return { ...entry, status: "error", error: msg };
    }
  }, [selectedColorPalette]);

  const startProcessing = async () => {
    setIsProcessing(true);
    const updated = [...entries];

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === "done") continue;

      updated[i] = { ...updated[i], status: "processing" };
      setEntries([...updated]);

      // Update status in DB
      if (updated[i].id) {
        await supabase
          .from("migration_jobs")
          .update({ status: "processing" })
          .eq("id", updated[i].id);
      }

      const result = await processUrl(updated[i]);
      updated[i] = result;
      setEntries([...updated]);

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

  const clearAll = async () => {
    await supabase.from("migration_jobs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setEntries([]);
    toast({ title: "Cleared all migration jobs" });
  };

  const escapeTSV = (val: string): string => {
    if (!val) return '';
    // For TSV: replace tabs and newlines with spaces to keep single-cell integrity
    return val.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
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
        r.type, "", r.url, "",
        r.title, r.title, r.titleNL, r.titleDE,
        r.subtitle, r.subtitleNL, r.subtitleDE,
        r.content, r.content, r.contentNL, r.contentDE,
        r.seoTitle, r.seoTitle, r.seoTitleNL, r.seoTitleDE,
        r.seoDescription, r.seoDescription, r.seoDescriptionNL, r.seoDescriptionDE,
      ].map(escapeTSV).join("\t");
    });

    const bom = "\uFEFF";
    const tsv = bom + headers.join("\t") + "\n" + rows.join("\n");
    const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `content_migration_${new Date().toISOString().slice(0, 10)}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doneCount = entries.filter(e => e.status === "done").length;
  const errorCount = entries.filter(e => e.status === "error").length;
  const progress = entries.length > 0 ? ((doneCount + errorCount) / entries.length) * 100 : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
            <div>
              <label className="text-sm font-medium mb-2 block">Color Palette</label>
              <ColorPaletteSelector
                selectedPalette={selectedColorPalette}
                onSelectPalette={(p) => {
                  setSelectedColorPalette(p);
                  localStorage.setItem("migration-color-palette", JSON.stringify(p));
                }}
              />
            </div>
            <Textarea
              placeholder="Paste URLs, one per line..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              rows={6}
              disabled={isProcessing}
            />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={parseUrls} disabled={isProcessing || !urlInput.trim()}>
                Add URLs
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
                      <Download className="h-4 w-4" /> Download TSV ({doneCount})
                    </Button>
                  )}
                  <Button variant="ghost" onClick={clearAll} disabled={isProcessing} className="gap-2 text-destructive">
                    <Trash2 className="h-4 w-4" /> Clear All
                  </Button>
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
          <Card key={entry.id || idx} className="overflow-hidden">
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
                    onClick={() => setPreviewResult(entry.result!)}
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
      <Dialog open={!!previewResult} onOpenChange={() => setPreviewResult(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewResult?.title}</DialogTitle>
          </DialogHeader>
          {previewResult && (
            <PreviewContent result={previewResult} copiedField={copiedField} onCopy={(field, value) => {
              navigator.clipboard.writeText(value);
              setCopiedField(field);
              setTimeout(() => setCopiedField(null), 2000);
            }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CopyButton({ field, value, copiedField, onCopy }: { field: string; value: string; copiedField: string | null; onCopy: (f: string, v: string) => void }) {
  return (
    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => onCopy(field, value)}>
      {copiedField === field ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function MetadataField({ label, value, field, copiedField, onCopy }: { label: string; value: string; field: string; copiedField: string | null; onCopy: (f: string, v: string) => void }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <CopyButton field={field} value={value} copiedField={copiedField} onCopy={onCopy} />
      </div>
      <p className="text-sm border rounded-md p-2 bg-muted/50">{value}</p>
    </div>
  );
}

function PreviewContent({ result, copiedField, onCopy }: { result: MigrationResult; copiedField: string | null; onCopy: (f: string, v: string) => void }) {
  return (
    <Tabs defaultValue="en" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="en">English</TabsTrigger>
        <TabsTrigger value="nl">Dutch (NL)</TabsTrigger>
        <TabsTrigger value="de">German (DE)</TabsTrigger>
      </TabsList>

      <TabsContent value="en" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetadataField label="Title" value={result.title} field="title-en" copiedField={copiedField} onCopy={onCopy} />
          <MetadataField label="SEO Title" value={result.seoTitle} field="seoTitle-en" copiedField={copiedField} onCopy={onCopy} />
          <MetadataField label="Subtitle" value={result.subtitle} field="subtitle-en" copiedField={copiedField} onCopy={onCopy} />
          <MetadataField label="SEO Description" value={result.seoDescription} field="seoDesc-en" copiedField={copiedField} onCopy={onCopy} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Content</span>
            <CopyButton field="content-en" value={result.content} copiedField={copiedField} onCopy={onCopy} />
          </div>
          <div className="border rounded-md p-4 bg-white" dangerouslySetInnerHTML={{ __html: result.content }} />
        </div>
      </TabsContent>

      <TabsContent value="nl" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetadataField label="Title (NL)" value={result.titleNL} field="title-nl" copiedField={copiedField} onCopy={onCopy} />
          <MetadataField label="SEO Title (NL)" value={result.seoTitleNL} field="seoTitle-nl" copiedField={copiedField} onCopy={onCopy} />
          <MetadataField label="Subtitle (NL)" value={result.subtitleNL} field="subtitle-nl" copiedField={copiedField} onCopy={onCopy} />
          <MetadataField label="SEO Description (NL)" value={result.seoDescriptionNL} field="seoDesc-nl" copiedField={copiedField} onCopy={onCopy} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Content (NL)</span>
            <CopyButton field="content-nl" value={result.contentNL} copiedField={copiedField} onCopy={onCopy} />
          </div>
          <div className="border rounded-md p-4 bg-white" dangerouslySetInnerHTML={{ __html: result.contentNL }} />
        </div>
      </TabsContent>

      <TabsContent value="de" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetadataField label="Title (DE)" value={result.titleDE} field="title-de" copiedField={copiedField} onCopy={onCopy} />
          <MetadataField label="SEO Title (DE)" value={result.seoTitleDE} field="seoTitle-de" copiedField={copiedField} onCopy={onCopy} />
          <MetadataField label="Subtitle (DE)" value={result.subtitleDE} field="subtitle-de" copiedField={copiedField} onCopy={onCopy} />
          <MetadataField label="SEO Description (DE)" value={result.seoDescriptionDE} field="seoDesc-de" copiedField={copiedField} onCopy={onCopy} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Content (DE)</span>
            <CopyButton field="content-de" value={result.contentDE} copiedField={copiedField} onCopy={onCopy} />
          </div>
          <div className="border rounded-md p-4 bg-white" dangerouslySetInnerHTML={{ __html: result.contentDE }} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
