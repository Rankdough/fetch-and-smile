import { useState, useCallback, useEffect, useRef } from "react";

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
import { Loader2, Download, CheckCircle2, XCircle, ArrowLeft, Play, Eye, Trash2, Copy, Check, Settings2, ChevronDown, ChevronUp, Pencil, Save } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { ColorPaletteSelector, COLOR_PALETTES, type ColorPalette } from "@/components/ColorPaletteSelector";
import { generateMigrationArticle } from "@/utils/generateMigrationArticle";
import { Input } from "@/components/ui/input";
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
  imageUrls?: string[];
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

const SHOPIFY_FAQ_COLUMNS = [
  "Handle",
  "Title",
  "Author",
  "Body HTML",
  "Summary HTML",
  "Tags",
  "Published",
  "Template Suffix",
  "Blog: Handle",
  "Blog: Title",
  "Metafield: title_tag [string]",
  "Metafield: description_tag [string]",
  "Metafield: custom.sport [single_line_text_field]",
  "Metafield: custom.question [single_line_text_field]",
  "Metafield: custom.custom_answer_summary [rich_text_field]",
  "Metafield: custom.subheading [single_line_text_field]",
];

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);

const formatQuestion = (q: string): string => {
  let s = q.trim().replace(/\s+/g, " ");
  if (!s) return s;
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.?!]$/.test(s)) s += "?";
  return s;
};

const truncate = (s: string, n: number) =>
  s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";

export default function ContentMigration() {
  const { toast } = useToast();
  const [urlInput, setUrlInput] = useState("");
  const [author, setAuthor] = useState(() => localStorage.getItem("migration-shopify-author") || "Pro Player Team Inc.");
  const [sport, setSport] = useState(() => localStorage.getItem("migration-shopify-sport") || "");
  const [blogHandle, setBlogHandle] = useState(() => localStorage.getItem("migration-shopify-blog-handle") || "faq");
  const [blogTitle, setBlogTitle] = useState(() => localStorage.getItem("migration-shopify-blog-title") || "FAQ");
  const [templateSuffix, setTemplateSuffix] = useState(() => localStorage.getItem("migration-shopify-template-suffix") || "article-faq");
  const [handlePrefix, setHandlePrefix] = useState(() => localStorage.getItem("migration-shopify-handle-prefix") || "faq");
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
  const [skipNavigation, setSkipNavigation] = useState(() => {
    const saved = localStorage.getItem("migration-skip-nav");
    return saved === null ? true : saved === "true";
  });
  const [skipQuickTips, setSkipQuickTips] = useState(() => localStorage.getItem("migration-skip-tips") === "true");
  const [skipFaqs, setSkipFaqs] = useState(() => {
    const saved = localStorage.getItem("migration-skip-faqs");
    return saved === null ? true : saved === "true";
  });
  const [skipSources, setSkipSources] = useState(() => {
    const saved = localStorage.getItem("migration-skip-sources");
    return saved === null ? true : saved === "true";
  });
  const [colorOpen, setColorOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [targetWordCount, setTargetWordCount] = useState<number>(() => {
    const saved = localStorage.getItem("migration-word-count");
    return saved ? parseInt(saved, 10) : 500;
  });
  const [selectedToneProfileId, setSelectedToneProfileId] = useState<string | null>(() => {
    return localStorage.getItem("migration-tone-profile") || null;
  });
  const [toneProfiles, setToneProfiles] = useState<Array<{ id: string; name: string }>>([]);

  const EXCEL_CELL_LIMIT = 32767;
  const minifyHtmlForExport = (html: string) =>
    (html || "")
      .replace(/>\s+</g, "><")
      .replace(/\s{2,}/g, " ")
      .replace(/;\s+/g, ";")
      .replace(/:\s+/g, ":")
      .trim();

  // Load tone profiles
  useEffect(() => {
    const loadProfiles = async () => {
      const { data } = await supabase.from("tone_profiles").select("id, name").order("name");
      if (data) setToneProfiles(data);
    };
    loadProfiles();
  }, []);

  // Re-run quality checks from stored HTML results (used when loading from DB)
  const runQualityChecksFromHtml = (result: MigrationResult): QualityCheck[] => {
    const checks: QualityCheck[] = [];
    const html = result.content || "";

    const hasTldr = /tl;?\s?dr/i.test(html);
    const hasQuickTips = skipQuickTips || /quick\s*tips/i.test(html);
    const hasFaq = skipFaqs || /frequently\s*asked|faq/i.test(html);
    const hasFinalThoughts = /final\s*thoughts|conclusion/i.test(html);
    const hasReferences = skipSources || /references/i.test(html);
    const hasTable = /<table/i.test(html);
    const missingParts = [
      !hasTldr && "TL;DR", !hasQuickTips && !skipQuickTips && "Quick Tips",
      !hasTable && "Tables", !hasFaq && !skipFaqs && "FAQ",
      !hasFinalThoughts && "Final Thoughts", !hasReferences && !skipSources && "References",
    ].filter(Boolean) as string[];
    checks.push({ label: "Article Structure", passed: missingParts.length === 0, detail: missingParts.length === 0 ? "All sections present" : `Missing: ${missingParts.join(", ")}` });

    const textContent = html.replace(/<[^>]*>/g, " ");
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;
    const floor = Math.round(targetWordCount * 0.8);
    const ceiling = Math.round(targetWordCount * 1.2);
    checks.push({ label: "Word Count", passed: wordCount >= floor && wordCount <= ceiling, detail: `${wordCount} words (target: ${targetWordCount}, range: ${floor}-${ceiling})` });

    const hasH2 = /<h2/i.test(html);
    const hasInline = html.includes("style=");
    checks.push({ label: "HTML Formatting", passed: hasH2 && hasInline, detail: hasH2 && hasInline ? "Styled HTML with inline CSS, headings intact" : "Issues detected" });

    const hasTitle = !!result.title?.trim();
    const hasSeoTitle = !!result.seoTitle?.trim();
    const hasSeoDesc = !!result.seoDescription?.trim();
    const hasContent = html.length > 100;
    const maxContentCellChars = (result.content || "").length;
    const cellLimitPassed = maxContentCellChars <= EXCEL_CELL_LIMIT;
    checks.push({
      label: "CSV Cell Limit",
      passed: cellLimitPassed,
      detail: `Max content cell: ${maxContentCellChars}/${EXCEL_CELL_LIMIT} chars`,
    });

    const exportPassed = hasTitle && hasSeoTitle && hasSeoDesc && hasContent && cellLimitPassed;
    checks.push({ label: "Shopify CSV Export Ready", passed: exportPassed, detail: exportPassed ? "All Shopify FAQ fields can be exported" : "Missing fields or over cell limit" });

    return checks;
  };

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
        
        const questionRows = data.filter((row: any) => !/^https?:\/\//i.test(row.url || ""));
        const loaded: UrlEntry[] = questionRows.map((row: any) => {
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
          
          // Re-run quality checks on loaded results
          let qualityChecks: QualityCheck[] | undefined;
          if (result && row.status === "done") {
            // We need the markdown for quality checks, but we only have HTML stored.
            // Run checks with what we have — structure checks will use HTML patterns.
            qualityChecks = runQualityChecksFromHtml(result);
          }

          return {
            id: row.id,
            url: row.url,
            type: row.type || "",
            status: row.status as UrlEntry["status"],
            result,
            error: row.error || undefined,
            qualityChecks,
          };
        });
        setEntries(loaded);
      }
      setIsLoading(false);
    };
    loadJobs();
  }, []);

  const parseUrls = async () => {
    const lines = urlInput.trim().split("\n").map(l => l.trim()).filter(Boolean);
    const newEntries: UrlEntry[] = [];

    for (const line of lines) {
      const question = formatQuestion(line);
      const { data, error } = await supabase
        .from("migration_jobs")
        .insert({ url: question, type: sport, status: "pending" })
        .select()
        .single();

      if (!error && data) {
        newEntries.push({
          id: data.id,
          url: data.url,
          type: data.type || sport,
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

    // 1. Structure check - same sections as the bulk FAQ generator output
    const hasTldr = /##\s.*tl;?\s?dr/i.test(markdown);
    const hasQuickTips = skipQuickTips || /##\s.*quick\s*tips/i.test(markdown);
    const hasFaq = skipFaqs || /##\s.*frequently\s*asked|##\s.*faq/i.test(markdown);
    const hasFinalThoughts = /##\s.*final\s*thoughts|##\s.*conclusion/i.test(markdown);
    const hasReferences = skipSources || /##\s.*references/i.test(markdown);
    const hasTable = /\|.+\|/.test(markdown);
    const missingParts = [
      !hasTldr && "TL;DR",
      !hasQuickTips && !skipQuickTips && "Quick Tips",
      !hasTable && "Tables",
      !hasFaq && !skipFaqs && "FAQ",
      !hasFinalThoughts && "Final Thoughts",
      !hasReferences && !skipSources && "References",
    ].filter(Boolean) as string[];
    const allPresent = missingParts.length === 0;
    const presentParts = [
      hasTldr && "TL;DR",
      (hasQuickTips && !skipQuickTips) && "Quick Tips",
      hasTable && "Tables",
      (hasFaq && !skipFaqs) && "FAQ",
      hasFinalThoughts && "Final Thoughts",
      (hasReferences && !skipSources) && "References",
    ].filter(Boolean) as string[];
    checks.push({
      label: "Article Structure",
      passed: allPresent,
      detail: allPresent ? `All sections present: ${presentParts.join(", ")}` : `Missing: ${missingParts.join(", ")}`,
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

    // 5. Export readiness check
    const hasTitle = !!result.title?.trim();
    const hasSeoTitle = !!result.seoTitle?.trim();
    const hasSeoDesc = !!result.seoDescription?.trim();
    const hasContent = htmlContent.length > 100;

    const maxContentCellChars = htmlContent.length;
    const cellLimitPassed = maxContentCellChars <= EXCEL_CELL_LIMIT;
    checks.push({
      label: "CSV Cell Limit",
      passed: cellLimitPassed,
      detail: `Max content cell: ${maxContentCellChars}/${EXCEL_CELL_LIMIT} chars`,
    });

    const exportPassed = hasTitle && hasSeoTitle && hasSeoDesc && hasContent && cellLimitPassed;
    checks.push({
      label: "Shopify CSV Export Ready",
      passed: exportPassed,
      detail: exportPassed ? "All Shopify FAQ fields can be exported" : `Missing: ${[
        !hasTitle && "Title",
        !hasSeoTitle && "SEO Title",
        !hasSeoDesc && "SEO Description",
        !hasContent && "Content",
        !cellLimitPassed && `Cell > ${EXCEL_CELL_LIMIT} chars`,
      ].filter(Boolean).join(", ")}`,
    });

    return checks;
  }, [skipQuickTips, skipFaqs, skipSources]);

  const processUrl = useCallback(async (entry: UrlEntry): Promise<UrlEntry> => {
    try {
      const question = formatQuestion(entry.url);
      const extra = sport
        ? `This is a ${sport} FAQ article. Answer the question directly and concisely. Keep the article close to ${targetWordCount} words.`
        : `This is an FAQ-style article. Answer the question directly and concisely. Keep the article close to ${targetWordCount} words.`;

      const result = await generateMigrationArticle({
        topic: question,
        targetWordCount,
        palette: selectedColorPalette,
        convertOpts: {
          skipNavigation,
          skipQuickTips,
          skipFaqs,
          skipSources,
        },
        toneProfileId: selectedToneProfileId,
        extraInstructions: extra,
      });

      const data: MigrationResult = {
        url: question,
        type: sport,
        title: result.title || question,
        subtitle: result.subtitle,
        seoTitle: result.seoTitle || question,
        seoDescription: result.seoDescription,
        content: result.html,
        titleNL: "",
        subtitleNL: "",
        seoTitleNL: "",
        seoDescriptionNL: "",
        contentNL: "",
        titleDE: "",
        subtitleDE: "",
        seoTitleDE: "",
        seoDescriptionDE: "",
        contentDE: "",
        imageUrls: [],
      };

      const qualityChecks = runQualityChecks(data, result.markdown, targetWordCount);

      if (entry.id) {
        await supabase
          .from("migration_jobs")
          .update({ status: "done", result: data as any, type: sport })
          .eq("id", entry.id);
      }

      return { ...entry, url: question, type: sport, status: "done", result: sanitizeResult(data), qualityChecks };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[Migration] Error processing question", entry.url, msg);

      if (entry.id) {
        await supabase
          .from("migration_jobs")
          .update({ status: "error", error: msg })
          .eq("id", entry.id);
      }

      return { ...entry, status: "error", error: msg };
    }
  }, [selectedColorPalette, skipNavigation, skipQuickTips, skipFaqs, skipSources, targetWordCount, selectedToneProfileId, runQualityChecks, sport]);

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
      description: `${done} succeeded, ${failed} failed out of ${updated.length} questions.`,
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

  const buildShopifyFaqRow = (entry: UrlEntry): Record<string, string> => {
    const r = entry.result!;
    const title = formatQuestion(r.title || entry.url);
    const summary = truncate(r.subtitle || r.seoDescription || "", 300);
    const handle = `${handlePrefix ? handlePrefix + "-" : ""}${slugify(title) || "question"}`;

    return {
      Handle: handle,
      Title: title,
      Author: author,
      "Body HTML": minifyHtmlForExport(r.content || ""),
      "Summary HTML": summary ? `<p>${escapeHtml(summary)}</p>` : "",
      Tags: sport,
      Published: "TRUE",
      "Template Suffix": templateSuffix,
      "Blog: Handle": blogHandle,
      "Blog: Title": blogTitle,
      "Metafield: title_tag [string]": r.seoTitle || title,
      "Metafield: description_tag [string]": truncate(r.seoDescription || summary, 155),
      "Metafield: custom.sport [single_line_text_field]": sport,
      "Metafield: custom.question [single_line_text_field]": title,
      "Metafield: custom.custom_answer_summary [rich_text_field]": summary ? `<p>${escapeHtml(summary)}</p>` : "",
      "Metafield: custom.subheading [single_line_text_field]": summary,
    };
  };

  const downloadShopifyCsv = () => {
    const doneEntries = entries.filter(e => e.status === "done" && e.result);
    if (doneEntries.length === 0) return;

    const rows = doneEntries.map(buildShopifyFaqRow);
    const maxContentCellChars = Math.max(...rows.map(r => (r["Body HTML"] || "").length), 0);

    if (maxContentCellChars > EXCEL_CELL_LIMIT) {
      toast({
        title: "Export warning: content exceeds Excel cell limit",
        description: `Max Body HTML cell is ${maxContentCellChars} chars (limit: ${EXCEL_CELL_LIMIT}). CSV will download, but Excel may reject that row.`,
        variant: "destructive",
      });
    }

    const escapeCsv = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      SHOPIFY_FAQ_COLUMNS.map(escapeCsv).join(","),
      ...rows.map(row => SHOPIFY_FAQ_COLUMNS.map(c => escapeCsv(row[c] ?? "")).join(",")),
    ];
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopify-faq-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
    toast({ title: "Shopify FAQ CSV downloaded" });
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

        <div className="rounded-lg border bg-card px-4 py-3 space-y-4">
          <Label className="text-sm font-semibold">Shopify FAQ Export Settings</Label>
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label>Author</Label><Input value={author} onChange={(e) => { setAuthor(e.target.value); localStorage.setItem("migration-shopify-author", e.target.value); }} /></div>
            <div><Label>Sport (optional)</Label><Input value={sport} onChange={(e) => { setSport(e.target.value); localStorage.setItem("migration-shopify-sport", e.target.value); }} placeholder="baseball" /></div>
            <div><Label>Handle prefix</Label><Input value={handlePrefix} onChange={(e) => { setHandlePrefix(e.target.value); localStorage.setItem("migration-shopify-handle-prefix", e.target.value); }} /></div>
            <div><Label>Blog: Handle</Label><Input value={blogHandle} onChange={(e) => { setBlogHandle(e.target.value); localStorage.setItem("migration-shopify-blog-handle", e.target.value); }} /></div>
            <div><Label>Blog: Title</Label><Input value={blogTitle} onChange={(e) => { setBlogTitle(e.target.value); localStorage.setItem("migration-shopify-blog-title", e.target.value); }} /></div>
            <div><Label>Template Suffix</Label><Input value={templateSuffix} onChange={(e) => { setTemplateSuffix(e.target.value); localStorage.setItem("migration-shopify-template-suffix", e.target.value); }} /></div>
          </div>
        </div>

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
                <SelectItem value="300">Brief (~300 words)</SelectItem>
                <SelectItem value="500">Short (~500 words)</SelectItem>
                <SelectItem value="700">Standard (~700 words)</SelectItem>
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
            <CardTitle>Questions to Process</CardTitle>
            <p className="text-sm text-muted-foreground">One question per line. These generate the same Shopify FAQ CSV columns as the bulk generator.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={"How long does a professional baseball game last?\nWhat is the best wood for a baseball bat?"}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              rows={6}
              disabled={isProcessing}
            />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={parseUrls} disabled={isProcessing || !urlInput.trim()}>
                Add Questions
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
                      <Button variant="outline" onClick={downloadShopifyCsv} className="gap-2">
                        <Download className="h-4 w-4" /> Download Shopify CSV ({doneCount})
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
        <TabsTrigger value="en">Shopify FAQ Row</TabsTrigger>
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
    </Tabs>
  );
}
