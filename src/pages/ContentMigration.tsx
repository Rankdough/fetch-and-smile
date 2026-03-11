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

interface QualityCheck {
  label: string;
  passed: boolean;
  detail: string;
}

interface UrlEntry {
  id?: string; // DB id
  url: string;
  type: string;
  status: "pending" | "processing" | "done" | "error";
  result?: MigrationResult;
  error?: string;
  qualityChecks?: QualityCheck[];
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

  const runQualityChecks = useCallback((result: MigrationResult, markdown: string, targetWc: number): QualityCheck[] => {
    const checks: QualityCheck[] = [];
    const htmlContent = result.content || "";
    const mdLower = markdown.toLowerCase();

    // 1. Structure check - same sections as Import URL / SEO Generator
    const hasTldr = /##\s.*tl;?\s?dr/i.test(markdown);
    const hasQuickTips = skipQuickTips || /##\s.*quick\s*tips/i.test(markdown);
    const hasFaq = skipFaqs || /##\s.*frequently\s*asked|##\s.*faq/i.test(markdown);
    const hasFinalThoughts = /##\s.*final\s*thoughts|##\s.*conclusion/i.test(markdown);
    const hasReferences = skipSources || /##\s.*references/i.test(markdown);
    const hasTable = /\|.+\|/.test(markdown);
    const structureParts = [
      hasTldr && "TL;DR",
      hasQuickTips && "Quick Tips",
      hasTable && "Tables",
      hasFaq && "FAQ",
      hasFinalThoughts && "Final Thoughts",
      hasReferences && "References",
    ].filter(Boolean) as string[];
    const requiredCount = [true, !skipQuickTips, true, !skipFaqs, true, !skipSources].filter(Boolean).length;
    const allPresent = structureParts.length === requiredCount;
    checks.push({
      label: "Article Structure",
      passed: allPresent,
      detail: allPresent ? `All sections present: ${structureParts.join(", ")}` : `Missing: ${[
        !hasTldr && "TL;DR",
        !hasQuickTips && !skipQuickTips && "Quick Tips",
        !hasTable && "Tables",
        !hasFaq && !skipFaqs && "FAQ",
        !hasFinalThoughts && "Final Thoughts",
        !hasReferences && !skipSources && "References",
      ].filter(Boolean).join(", ")}`,
    });

    // 2. Word count check (±20% tolerance)
    const wordCount = markdown.split(/\s+/).filter(Boolean).length;
    const floor = Math.round(targetWc * 0.8);
    const ceiling = Math.round(targetWc * 1.2);
    const wcPassed = wordCount >= floor && wordCount <= ceiling;
    checks.push({
      label: "Word Count",
      passed: wcPassed,
      detail: `${wordCount} words (target: ${targetWc}, range: ${floor}-${ceiling})`,
    });

    // 3. HTML formatting check
    const hasStyledHtml = htmlContent.startsWith("<");
    const hasInlineStyles = htmlContent.includes("style=");
    const hasH2Tags = /<h2/i.test(htmlContent);
    const htmlPassed = hasStyledHtml && hasInlineStyles && hasH2Tags;
    checks.push({
      label: "HTML Formatting",
      passed: htmlPassed,
      detail: htmlPassed ? "Styled HTML with inline CSS, headings intact" : `Issues: ${[
        !hasStyledHtml && "Not HTML",
        !hasInlineStyles && "No inline styles",
        !hasH2Tags && "No H2 tags",
      ].filter(Boolean).join(", ")}`,
    });

    // 4. Export readiness check
    const hasTitle = !!result.title?.trim();
    const hasSeoTitle = !!result.seoTitle?.trim();
    const hasSeoDesc = !!result.seoDescription?.trim();
    const hasContent = htmlContent.length > 100;
    const hasNL = !!result.contentNL?.trim();
    const hasDE = !!result.contentDE?.trim();
    const exportPassed = hasTitle && hasSeoTitle && hasSeoDesc && hasContent && hasNL && hasDE;
    checks.push({
      label: "Excel Export Ready",
      passed: exportPassed,
      detail: exportPassed ? "All fields populated (EN, NL, DE)" : `Missing: ${[
        !hasTitle && "Title",
        !hasSeoTitle && "SEO Title",
        !hasSeoDesc && "SEO Description",
        !hasContent && "Content",
        !hasNL && "NL Translation",
        !hasDE && "DE Translation",
      ].filter(Boolean).join(", ")}`,
    });

    return checks;
  }, [skipQuickTips, skipFaqs, skipSources]);

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

      const instructions = `REFORMAT ONLY: The following content has been scraped from a web page. Restructure it into the standard article format (TL;DR, Quick Tips, question-based H2 headings, FAQ, References) but preserve the original text, facts, and voice as closely as possible. Do not invent new information. Only reorganise and add the required structural elements.

CRITICAL - PRESERVE ORIGINAL TITLES: Keep the original H1 title and all H2/H3 section headings from the source content EXACTLY as they are. Do NOT rename, rephrase, or convert them into questions. The heading text must remain unchanged - only add the required structural sections (TL;DR, Quick Tips, FAQ, References) around the existing content.

CRITICAL - PRESERVE ALL HYPERLINKS: Cross-reference the HTML source below and include EVERY hyperlink found in the source content. Embed them naturally in the text where they originally appeared.

CRITICAL - USE TABLES FOR LISTS: When the source lists products, brands, options, or items (e.g. "safe calendars", "unsafe calendars"), ALWAYS present them as markdown tables with relevant columns (Name, Key Feature, Status, etc.) instead of numbered or bullet lists. Do NOT add a "Link" or "Product Link" column to tables.

CRITICAL - DO NOT INCLUDE "In This Article" SECTION: Do NOT generate any "In This Article" navigation section, bullet list, or table of contents. This is handled automatically by the system. If you include one, it will create duplicates. Skip it entirely - go straight from Quick Tips to the first content section.

CRITICAL - H2 SUBTITLES MUST ANSWER THE HEADING: Every H2 heading that is phrased as a question MUST be immediately followed by a short paragraph (roughly 30 words) that directly answers that question. This answer paragraph comes before any supporting points, lists, or tables under that section.

ADDITIONAL RULES:
- Add comparison sections where relevant: "Which Option Should You Choose?", "How Do They Compare Side by Side?" with comparison tables
- Do NOT include expert quotes or blockquote citations from named individuals
- Do NOT duplicate any section - each structural element should appear exactly once

STRICT WORD COUNT LIMIT: The final article MUST NOT exceed ${targetWordCount} words. If the source content is longer, condense and summarise less important details to fit. Aim for exactly ${targetWordCount} words.

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
          migrationMode: true,
        },
      });
      if (contentError) throw new Error(`Content generation failed: ${contentError.message}`);

      let generatedMarkdown = contentData.content || contentData.generatedContent || "";
      if (!generatedMarkdown.trim()) throw new Error("No content returned from generation");
      console.log("[Migration] Generated", generatedMarkdown.length, "chars markdown");

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

      // === STEP 5: Quality checks ===
      const qualityChecks = runQualityChecks(data, generatedMarkdown, targetWordCount);
      const passCount = qualityChecks.filter(c => c.passed).length;
      console.log(`[Migration] Quality: ${passCount}/${qualityChecks.length} checks passed`);

      // Save result to DB
      if (entry.id) {
        await supabase
          .from("migration_jobs")
          .update({ status: "done", result: data as any })
          .eq("id", entry.id);
      }

      return { ...entry, status: "done", result: sanitizeResult(data), qualityChecks };
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
  }, [selectedColorPalette, skipNavigation, skipQuickTips, skipFaqs, skipSources, targetWordCount, selectedToneProfileId, runQualityChecks]);

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

    // Build Excel XML (SpreadsheetML) to keep raw HTML in single cells without row-splitting
    const escapeXml = (val: string): string =>
      String(val ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""); // strip control chars

    const buildRow = (cells: string[]) =>
      "<Row>" + cells.map(c => `<Cell><Data ss:Type="String">${escapeXml(c)}</Data></Cell>`).join("") + "</Row>";

    const xmlRows = [buildRow(headers), ...rows.map(buildRow)].join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Migration">
<Table>
${xmlRows}
</Table>
</Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
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

        {/* Word Count & Tone of Voice */}
        <div className="rounded-lg border bg-card px-4 py-3 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Target Word Count</Label>
            <Select
              value={String(targetWordCount)}
              onValueChange={(v) => {
                const wc = parseInt(v, 10);
                setTargetWordCount(wc);
                localStorage.setItem("migration-word-count", String(wc));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="500">Short (~500 words)</SelectItem>
                <SelectItem value="1000">Medium (~1,000 words)</SelectItem>
                <SelectItem value="1500">Medium-Long (~1,500 words)</SelectItem>
                <SelectItem value="2000">Long (~2,000 words)</SelectItem>
                <SelectItem value="3000">Extended (~3,000 words)</SelectItem>
                <SelectItem value="3500">Comprehensive (~3,500 words)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Tone of Voice</Label>
            <Select
              value={selectedToneProfileId || "none"}
              onValueChange={(v) => {
                const val = v === "none" ? null : v;
                setSelectedToneProfileId(val);
                localStorage.setItem("migration-tone-profile", val || "");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No tone profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tone profile</SelectItem>
                {toneProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              {/* Quality Checklist */}
              {entry.status === "done" && entry.qualityChecks && entry.qualityChecks.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Quality Checks</p>
                  {entry.qualityChecks.map((check, ci) => (
                    <div key={ci} className="flex items-start gap-2 text-xs">
                      {check.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />
                      )}
                      <span>
                        <span className="font-medium">{check.label}:</span>{" "}
                        <span className="text-muted-foreground">{check.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
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
