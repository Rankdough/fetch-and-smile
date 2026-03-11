import { useState, useCallback, useEffect, useMemo, useRef } from "react"; // v2 - 3-step pipeline

import { markdownToStyledHtml } from "@/utils/markdownToStyledHtml";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, CheckCircle2, XCircle, ArrowLeft, Play, Eye, Trash2, Copy, Check, Palette, Settings2, ChevronDown, ChevronUp, Pencil, Save } from "lucide-react";
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
  const [previewEntryIndex, setPreviewEntryIndex] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedResult, setEditedResult] = useState<MigrationResult | null>(null);
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
  const [targetWordCount, setTargetWordCount] = useState<number>(() => {
    const saved = localStorage.getItem("migration-word-count");
    return saved ? parseInt(saved, 10) : 2000;
  });
  const [selectedToneProfileId, setSelectedToneProfileId] = useState<string | null>(() => {
    return localStorage.getItem("migration-tone-profile") || null;
  });
  const [toneProfiles, setToneProfiles] = useState<Array<{ id: string; name: string }>>([]);

  // Load tone profiles
  useEffect(() => {
    const loadProfiles = async () => {
      const { data } = await supabase.from("tone_profiles").select("id, name").order("name");
      if (data) setToneProfiles(data);
    };
    loadProfiles();
  }, []);

  // Load saved jobs on mount
  useEffect(() => {
    const loadJobs = async () => {
      const { data, error } = await supabase
        .from("migration_jobs")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        const palette = selectedColorPalette || undefined;
        const convertOpts = { skipNavigation, skipQuickTips, skipFaqs, skipSources };
        
        const loaded: UrlEntry[] = data.map((row: any) => {
          let result = row.result ? sanitizeResult(row.result as MigrationResult) : undefined;
          
          // Convert any stale markdown content to styled HTML
          if (result && result.content && !result.content.trim().startsWith("<")) {
            result = {
              ...result,
              content: markdownToStyledHtml(result.content, palette, convertOpts),
              contentNL: result.contentNL ? markdownToStyledHtml(result.contentNL, palette, convertOpts) : "",
              contentDE: result.contentDE ? markdownToStyledHtml(result.contentDE, palette, convertOpts) : "",
            };
          }
          
          return {
            id: row.id,
            url: row.url,
            type: row.type || "",
            status: row.status as UrlEntry["status"],
            result,
            error: row.error || undefined,
          };
        });
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
      // === STEP 1: Scrape URL ===
      console.log("[Migration] Step 1: Scraping", entry.url);
      const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke("scrape-format", {
        body: { url: entry.url },
      });
      if (scrapeError) throw new Error(`Scrape failed: ${scrapeError.message}`);

      const sourceMarkdown = scrapeData.markdown || "";
      const sourceHtml = scrapeData.html || "";
      const pageTitle = scrapeData.title || "";

      if (!sourceMarkdown.trim()) {
        throw new Error("No content could be extracted from the URL");
      }
      console.log("[Migration] Scraped", sourceMarkdown.length, "chars, title:", pageTitle);

      // === STEP 2: Generate article via SEO Content Generator ===
      console.log("[Migration] Step 2: Generating article via generate-content");

      const topicMatch = sourceMarkdown.match(/^#\s+(.+)$/m) || sourceMarkdown.match(/^(.{10,80})/);
      const topic = topicMatch ? topicMatch[1].trim() : "Article";

      const instructions = `CONTENT MIGRATION: The following content has been scraped from a web page. Use it as the source material to create a full SEO-optimised article following all standard article rules.

IMPORTANT GUIDELINES:
- Preserve ALL factual content and data from the source - do not invent new facts
- Preserve ALL hyperlinks from the source content - cross-reference the HTML source below
- Keep the original topic and key sections from the source, but expand with additional SEO sections (comparison tables, "Which Option Should You Choose?", "How Do They Compare Side by Side?", etc.)
- Add comparison tables where relevant - any lists of items/products/options should be in table format
- Do NOT add a "Link" or "Product Link" column to tables
- Do NOT include expert quotes or blockquote citations from named individuals

HTML SOURCE FOR LINK REFERENCE:
${sourceHtml.substring(0, 8000)}`;

      const { data: contentData, error: contentError } = await supabase.functions.invoke("generate-content", {
        body: {
          topic,
          length: "long",
          wordCount: targetWordCount,
          instructions,
          contextFiles: [{ name: "source-content", content: sourceMarkdown.substring(0, 12000) }],
          toneProfileId: selectedToneProfileId || undefined,
          skipFaqs,
          skipQuickTips,
          skipSources,
        },
      });
      if (contentError) throw new Error(`Content generation failed: ${contentError.message}`);

      const generatedMarkdown = contentData.content || contentData.generatedContent || "";
      if (!generatedMarkdown.trim()) throw new Error("No content returned from generation");
      console.log("[Migration] Generated", generatedMarkdown.length, "chars markdown");

      // Extract SEO metadata from generated content
      const h1Match = generatedMarkdown.match(/^#\s+(.+)$/m);
      const title = h1Match ? h1Match[1].trim() : pageTitle;
      const firstParagraph = generatedMarkdown.match(/^(?!#)(?!>)(?!\|)(?!-)(.{20,200})/m);
      const subtitle = firstParagraph ? firstParagraph[1].trim() : "";
      const seoTitle = title.length > 60 ? title.substring(0, 57) + "..." : title;
      const seoDescription = subtitle.length > 160 ? subtitle.substring(0, 157) + "..." : subtitle;

      // === STEP 3: Translate to NL and DE ===
      console.log("[Migration] Step 3: Translating to NL + DE");
      const { data: translationData, error: translationError } = await supabase.functions.invoke("translate-content", {
        body: { title, subtitle, seoTitle, seoDescription, content: generatedMarkdown },
      });
      if (translationError) {
        console.error("[Migration] Translation failed, continuing with EN only:", translationError);
      }

      const nl = translationData?.nl || { title: "", subtitle: "", seoTitle: "", seoDescription: "", content: "" };
      const de = translationData?.de || { title: "", subtitle: "", seoTitle: "", seoDescription: "", content: "" };

      // === STEP 4: Convert Markdown → styled HTML ===
      console.log("[Migration] Step 4: Converting markdown to styled HTML");
      const palette = selectedColorPalette || undefined;
      const convertOpts = { skipNavigation, skipQuickTips, skipFaqs, skipSources };

      const data: MigrationResult = {
        url: entry.url,
        type: entry.type,
        title,
        subtitle,
        seoTitle,
        seoDescription,
        content: markdownToStyledHtml(generatedMarkdown, palette, convertOpts),
        titleNL: nl.title,
        subtitleNL: nl.subtitle,
        seoTitleNL: nl.seoTitle,
        seoDescriptionNL: nl.seoDescription,
        contentNL: markdownToStyledHtml(nl.content || "", palette, convertOpts),
        titleDE: de.title,
        subtitleDE: de.subtitle,
        seoTitleDE: de.seoTitle,
        seoDescriptionDE: de.seoDescription,
        contentDE: markdownToStyledHtml(de.content || "", palette, convertOpts),
      };

      console.log("[Migration] Complete. HTML starts with '<':", data.content.startsWith("<"));

      // Save result to DB
      if (entry.id) {
        await supabase
          .from("migration_jobs")
          .update({ status: "done", result: data as any })
          .eq("id", entry.id);
      }

      return { ...entry, status: "done", result: sanitizeResult(data) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[Migration] Error processing", entry.url, msg);

      if (entry.id) {
        await supabase
          .from("migration_jobs")
          .update({ status: "error", error: msg })
          .eq("id", entry.id);
      }

      return { ...entry, status: "error", error: msg };
    }
  }, [selectedColorPalette, skipNavigation, skipQuickTips, skipFaqs, skipSources, targetWordCount, selectedToneProfileId]);

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

  // Fix doubled quotes that come from AI output or JSON double-serialization
  const fixDoubledQuotes = (s: string): string => {
    if (!s) return s;
    // Replace "" with " but not at string boundaries
    return s.replace(/""/g, '"');
  };

  // Sanitize all string fields in a migration result
  const sanitizeResult = (r: any): MigrationResult => ({
    ...r,
    content: fixDoubledQuotes(r.content || ""),
    contentNL: fixDoubledQuotes(r.contentNL || ""),
    contentDE: fixDoubledQuotes(r.contentDE || ""),
    title: fixDoubledQuotes(r.title || ""),
    titleNL: fixDoubledQuotes(r.titleNL || ""),
    titleDE: fixDoubledQuotes(r.titleDE || ""),
    subtitle: fixDoubledQuotes(r.subtitle || ""),
    subtitleNL: fixDoubledQuotes(r.subtitleNL || ""),
    subtitleDE: fixDoubledQuotes(r.subtitleDE || ""),
    seoTitle: fixDoubledQuotes(r.seoTitle || ""),
    seoTitleNL: fixDoubledQuotes(r.seoTitleNL || ""),
    seoTitleDE: fixDoubledQuotes(r.seoTitleDE || ""),
    seoDescription: fixDoubledQuotes(r.seoDescription || ""),
    seoDescriptionNL: fixDoubledQuotes(r.seoDescriptionNL || ""),
    seoDescriptionDE: fixDoubledQuotes(r.seoDescriptionDE || ""),
  });

  const downloadXLSX = () => {
    const headers = [
      "Type", "image", "Old url", "New url",
      "Title", "Title (EN)", "Title (NL)", "Title (DE)",
      "subtitle", "subtitle (NL)", "subtitle (DE)",
      "Content", "Content (EN)", "Content (NL)", "Content (DE)",
      "SEO Title", "SEO Title (EN)", "SEO Title (NL)", "SEO Title (DE)",
      "SEO Description", "SEO Description (EN)", "SEO Description (NL)", "SEO Description (DE)",
    ];

    const rows = entries.filter(e => e.status === "done" && e.result).map(e => {
      const r = e.result!;
      return [
        r.type ?? "", "", r.url ?? "", "",
        r.title ?? "", r.title ?? "", r.titleNL ?? "", r.titleDE ?? "",
        r.subtitle ?? "", r.subtitleNL ?? "", r.subtitleDE ?? "",
        r.content ?? "", r.content ?? "", r.contentNL ?? "", r.contentDE ?? "",
        r.seoTitle ?? "", r.seoTitle ?? "", r.seoTitleNL ?? "", r.seoTitleDE ?? "",
        r.seoDescription ?? "", r.seoDescription ?? "", r.seoDescriptionNL ?? "", r.seoDescriptionDE ?? "",
      ];
    });

    // Build an HTML table that Excel opens natively — no character limits, no escaping issues
    const escapeHtmlForCell = (val: string) => {
      // Excel HTML table cells: encode < > & but preserve the actual HTML content as text
      return val
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    const headerRow = headers.map(h => `<th>${escapeHtmlForCell(h)}</th>`).join('');
    const dataRows = rows.map(row =>
      '<tr>' + row.map(cell => `<td>${escapeHtmlForCell(cell)}</td>`).join('') + '</tr>'
    ).join('\n');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Migration</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body><table border="1"><thead><tr>${headerRow}</tr></thead><tbody>${dataRows}</tbody></table></body></html>`;

    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `content_migration_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
    toast({ title: "Excel file downloaded" });
  };

  const downloadJSON = () => {
    const data = entries.filter(e => e.status === "done" && e.result).map(e => {
      const r = e.result!;
      return {
        type: r.type ?? "",
        oldUrl: r.url ?? "",
        title: { en: r.title ?? "", nl: r.titleNL ?? "", de: r.titleDE ?? "" },
        subtitle: { en: r.subtitle ?? "", nl: r.subtitleNL ?? "", de: r.subtitleDE ?? "" },
        content: { en: r.content ?? "", nl: r.contentNL ?? "", de: r.contentDE ?? "" },
        seoTitle: { en: r.seoTitle ?? "", nl: r.seoTitleNL ?? "", de: r.seoTitleDE ?? "" },
        seoDescription: { en: r.seoDescription ?? "", nl: r.seoDescriptionNL ?? "", de: r.seoDescriptionDE ?? "" },
      };
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `content_migration_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    toast({ title: "JSON file downloaded" });
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
        {/* Color Scheme */}
        <div
          className="rounded-lg border bg-card cursor-pointer"
          onClick={() => setColorOpen(!colorOpen)}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            {selectedColorPalette && (
              <div
                className="h-6 w-6 rounded-full border-2 border-background shadow-sm flex-shrink-0"
                style={{ background: selectedColorPalette.primary }}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Color Scheme</p>
              <p className="text-xs text-muted-foreground">{selectedColorPalette?.name || "Default"}</p>
            </div>
            {colorOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
          {colorOpen && (
            <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
              <ColorPaletteSelector
                selectedPalette={selectedColorPalette}
                onSelectPalette={(p) => {
                  setSelectedColorPalette(p);
                  localStorage.setItem("migration-color-palette", JSON.stringify(p));
                }}
              />
            </div>
          )}
        </div>

        {/* Output Options */}
        <div
          className="rounded-lg border bg-card cursor-pointer"
          onClick={() => setOutputOpen(!outputOpen)}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <Settings2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Output Options</p>
              <p className="text-xs text-muted-foreground">
                {[skipNavigation && "Navigation", skipQuickTips && "Quick Tips", skipFaqs && "FAQs", skipSources && "Sources"].filter(Boolean).join(", ") || "All sections included"}
                {[skipNavigation, skipQuickTips, skipFaqs, skipSources].some(Boolean) ? " skipped" : ""}
              </p>
            </div>
            {outputOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
          {outputOpen && (
            <div className="px-4 pb-4 space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <Label htmlFor="skip-nav" className="text-sm cursor-pointer">Skip "In This Article" Navigation</Label>
                <Switch id="skip-nav" checked={skipNavigation} onCheckedChange={(v) => { setSkipNavigation(v); localStorage.setItem("migration-skip-nav", String(v)); }} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="skip-tips" className="text-sm cursor-pointer">Skip Quick Tips</Label>
                <Switch id="skip-tips" checked={skipQuickTips} onCheckedChange={(v) => { setSkipQuickTips(v); localStorage.setItem("migration-skip-tips", String(v)); }} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="skip-faqs" className="text-sm cursor-pointer">Skip FAQs</Label>
                <Switch id="skip-faqs" checked={skipFaqs} onCheckedChange={(v) => { setSkipFaqs(v); localStorage.setItem("migration-skip-faqs", String(v)); }} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="skip-sources" className="text-sm cursor-pointer">Skip Sources & References</Label>
                <Switch id="skip-sources" checked={skipSources} onCheckedChange={(v) => { setSkipSources(v); localStorage.setItem("migration-skip-sources", String(v)); }} />
              </div>
            </div>
          )}
        </div>

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
                    <>
                      <Button variant="outline" onClick={downloadXLSX} className="gap-2">
                        <Download className="h-4 w-4" /> Download Excel ({doneCount})
                      </Button>
                      <Button variant="outline" onClick={downloadJSON} className="gap-2">
                        <Download className="h-4 w-4" /> Download JSON ({doneCount})
                      </Button>
                    </>
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
                    onClick={() => {
                      setPreviewResult(entry.result!);
                      setPreviewEntryIndex(idx);
                      setEditedResult(null);
                      setIsEditing(false);
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
      <Dialog open={!!previewResult} onOpenChange={(open) => {
        if (!open) {
          setPreviewResult(null);
          setPreviewEntryIndex(null);
          setIsEditing(false);
          setEditedResult(null);
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle>{(isEditing && editedResult ? editedResult : previewResult)?.title}</DialogTitle>
              <div className="flex items-center gap-2 shrink-0">
                {isEditing ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => { setIsEditing(false); setEditedResult(null); }}>
                      Cancel
                    </Button>
                    <Button size="sm" className="gap-1" onClick={async () => {
                      if (!editedResult || previewEntryIndex === null) return;
                      const updated = [...entries];
                      updated[previewEntryIndex] = { ...updated[previewEntryIndex], result: editedResult };
                      setEntries(updated);
                      setPreviewResult(editedResult);

                      // Persist to DB
                      const entryId = updated[previewEntryIndex].id;
                      if (entryId) {
                        await supabase
                          .from("migration_jobs")
                          .update({ result: editedResult as any })
                          .eq("id", entryId);
                      }

                      setIsEditing(false);
                      setEditedResult(null);
                      toast({ title: "Changes saved" });
                    }}>
                      <Save className="h-4 w-4" /> Save
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                    setIsEditing(true);
                    setEditedResult({ ...previewResult! });
                  }}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          {previewResult && (
            <PreviewContent
              result={isEditing && editedResult ? editedResult : previewResult}
              copiedField={copiedField}
              isEditing={isEditing}
              onCopy={(field, value) => {
                navigator.clipboard.writeText(value);
                setCopiedField(field);
                setTimeout(() => setCopiedField(null), 2000);
              }}
              onFieldChange={(field, value) => {
                if (!editedResult) return;
                setEditedResult({ ...editedResult, [field]: value });
              }}
            />
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

function EditableMetadataField({ label, value, field, copiedField, isEditing, onCopy, onChange }: {
  label: string; value: string; field: string; copiedField: string | null; isEditing: boolean;
  onCopy: (f: string, v: string) => void; onChange?: (value: string) => void;
}) {
  if (!value && !isEditing) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <CopyButton field={field} value={value} copiedField={copiedField} onCopy={onCopy} />
      </div>
      {isEditing ? (
        <input
          className="text-sm border rounded-md p-2 bg-background w-full"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : (
        <p className="text-sm border rounded-md p-2 bg-muted/50">{value}</p>
      )}
    </div>
  );
}

function ContentBlock({ content, field, copiedField, isEditing, onCopy, onChange, label }: {
  content: string; field: string; copiedField: string | null; isEditing: boolean; label: string;
  onCopy: (f: string, v: string) => void; onChange?: (value: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <CopyButton field={field} value={isEditing && contentRef.current ? contentRef.current.innerHTML : content} copiedField={copiedField} onCopy={onCopy} />
        {isEditing && <span className="text-xs text-muted-foreground italic">Click content below to edit directly</span>}
      </div>
      <div
        ref={contentRef}
        className={`border rounded-md p-4 bg-white ${isEditing ? "ring-2 ring-primary/20 focus-within:ring-primary/40 cursor-text" : ""}`}
        contentEditable={isEditing}
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: content }}
        onBlur={() => {
          if (isEditing && contentRef.current && onChange) {
            onChange(contentRef.current.innerHTML);
          }
        }}
      />
    </div>
  );
}

function PreviewContent({ result, copiedField, isEditing, onCopy, onFieldChange }: {
  result: MigrationResult; copiedField: string | null; isEditing: boolean;
  onCopy: (f: string, v: string) => void;
  onFieldChange?: (field: string, value: string) => void;
}) {
  return (
    <Tabs defaultValue="en" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="en">English</TabsTrigger>
        <TabsTrigger value="nl">Dutch (NL)</TabsTrigger>
        <TabsTrigger value="de">German (DE)</TabsTrigger>
      </TabsList>

      <TabsContent value="en" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableMetadataField label="Title" value={result.title} field="title-en" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("title", v)} />
          <EditableMetadataField label="SEO Title" value={result.seoTitle} field="seoTitle-en" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("seoTitle", v)} />
          <EditableMetadataField label="Subtitle" value={result.subtitle} field="subtitle-en" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("subtitle", v)} />
          <EditableMetadataField label="SEO Description" value={result.seoDescription} field="seoDesc-en" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("seoDescription", v)} />
        </div>
        <ContentBlock label="Content" content={result.content} field="content-en" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("content", v)} />
      </TabsContent>

      <TabsContent value="nl" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableMetadataField label="Title (NL)" value={result.titleNL} field="title-nl" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("titleNL", v)} />
          <EditableMetadataField label="SEO Title (NL)" value={result.seoTitleNL} field="seoTitle-nl" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("seoTitleNL", v)} />
          <EditableMetadataField label="Subtitle (NL)" value={result.subtitleNL} field="subtitle-nl" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("subtitleNL", v)} />
          <EditableMetadataField label="SEO Description (NL)" value={result.seoDescriptionNL} field="seoDesc-nl" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("seoDescriptionNL", v)} />
        </div>
        <ContentBlock label="Content (NL)" content={result.contentNL} field="content-nl" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("contentNL", v)} />
      </TabsContent>

      <TabsContent value="de" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditableMetadataField label="Title (DE)" value={result.titleDE} field="title-de" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("titleDE", v)} />
          <EditableMetadataField label="SEO Title (DE)" value={result.seoTitleDE} field="seoTitle-de" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("seoTitleDE", v)} />
          <EditableMetadataField label="Subtitle (DE)" value={result.subtitleDE} field="subtitle-de" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("subtitleDE", v)} />
          <EditableMetadataField label="SEO Description (DE)" value={result.seoDescriptionDE} field="seoDesc-de" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("seoDescriptionDE", v)} />
        </div>
        <ContentBlock label="Content (DE)" content={result.contentDE} field="content-de" copiedField={copiedField} isEditing={isEditing} onCopy={onCopy} onChange={(v) => onFieldChange?.("contentDE", v)} />
      </TabsContent>
    </Tabs>
  );
}
