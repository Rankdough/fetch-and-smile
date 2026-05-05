import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { markdownToStyledHtml } from "@/utils/markdownToStyledHtml";
import { generateMigrationArticle } from "@/utils/generateMigrationArticle";
import { ColorPaletteSelector, COLOR_PALETTES, type ColorPalette } from "@/components/ColorPaletteSelector";


interface ArticleData {
  h1: string;
  opening?: string;
  tldr: string;
  quickTips: string[];
  sections: { heading: string; paragraph: string; bullets: string[]; paragraph2: string }[];
  table: { caption: string; headers: string[]; rows: string[][] };
  faqs: { q: string; a: string }[];
  summary: string;
  titleTag: string;
  descriptionTag: string;
  tags: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);

function buildMarkdown(a: ArticleData, opts: { skipFaqs?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`# ${a.h1}`, "");
  if (a.opening && a.opening.trim()) {
    lines.push(a.opening.trim(), "");
  }
  lines.push(`## TL;DR`, "", a.tldr, "");
  lines.push(`## Quick Tips`, "");
  a.quickTips.forEach((t, i) => lines.push(`${i + 1}. ${t.replace(/^\s*\d+[.)]\s*/, "").trim()}`));
  lines.push("");
  for (const s of a.sections) {
    lines.push(`## ${s.heading}`, "", s.paragraph, "");
    if (s.bullets?.length) {
      s.bullets.forEach(b => lines.push(`- ${b}`));
      lines.push("");
    }
    if (s.paragraph2) lines.push(s.paragraph2, "");
  }
  if (a.table?.headers?.length && a.table.rows?.length) {
    if (a.table.caption) lines.push(`**${a.table.caption}**`, "");
    lines.push(`| ${a.table.headers.join(" | ")} |`);
    lines.push(`| ${a.table.headers.map(() => "---").join(" | ")} |`);
    for (const r of a.table.rows) lines.push(`| ${r.join(" | ")} |`);
    lines.push("");
  }
  if (!opts.skipFaqs && a.faqs?.length) {
    lines.push(`## Frequently Asked Questions`, "");
    for (const f of a.faqs) {
      lines.push(`### ${f.q}`, "", f.a, "");
    }
  }
  return lines.join("\n");
}

function buildBodyHtml(a: ArticleData, opts: { skipFaqs?: boolean } = {}): string {
  return markdownToStyledHtml(buildMarkdown(a, opts), null, {
    skipNavigation: true,
    skipFaqs: opts.skipFaqs,
  });
}


const COLUMNS = [
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

const LS_KEY = "shopify-faq-bulk-state-v1";
const loadLS = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
};

export default function ShopifyFaqBulk() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const init = loadLS();
  const [questions, setQuestions] = useState<string>(init.questions ?? "");
  const [author, setAuthor] = useState<string>(init.author ?? "Pro Player Team Inc.");
  const [sport, setSport] = useState<string>(init.sport ?? "");
  const [blogHandle, setBlogHandle] = useState<string>(init.blogHandle ?? "faq");
  const [blogTitle, setBlogTitle] = useState<string>(init.blogTitle ?? "FAQ");
  const [templateSuffix, setTemplateSuffix] = useState<string>(init.templateSuffix ?? "article-faq");
  const [handlePrefix, setHandlePrefix] = useState<string>(init.handlePrefix ?? "");
  const [wordCount, setWordCount] = useState<300 | 500 | 700>(init.wordCount ?? 500);
  const [includeFaqs, setIncludeFaqs] = useState<boolean>(init.includeFaqs ?? false);
  const [includeNav, setIncludeNav] = useState<boolean>(init.includeNav ?? false);
  const [skipQuickTips, setSkipQuickTips] = useState<boolean>(init.skipQuickTips ?? false);
  const [skipSources, setSkipSources] = useState<boolean>(init.skipSources ?? true);
  const [stripTitle, setStripTitle] = useState<boolean>(init.stripTitle ?? false);
  const [paletteId, setPaletteId] = useState<string | null>(init.paletteId ?? null);
  const [toneProfileId, setToneProfileId] = useState<string | null>(init.toneProfileId ?? null);
  const [toneProfiles, setToneProfiles] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<Record<string, string>[]>(init.rows ?? []);
  const [regenIdx, setRegenIdx] = useState<number | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const bulkCancelRef = useRef<boolean>(false);

  const selectedPalette: ColorPalette | null = paletteId
    ? COLOR_PALETTES.find((p) => p.id === paletteId) || null
    : null;

  const EXCEL_CELL_LIMIT = 32767;

  // Load tone profiles
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("tone_profiles").select("id, name").order("name");
        if (Array.isArray(data)) setToneProfiles(data as Array<{ id: string; name: string }>);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        questions, author, sport, blogHandle, blogTitle, templateSuffix, handlePrefix, wordCount,
        includeFaqs, includeNav, skipQuickTips, skipSources, stripTitle, paletteId, toneProfileId, rows,
      }));
    } catch {}
  }, [questions, author, sport, blogHandle, blogTitle, templateSuffix, handlePrefix, wordCount,
      includeFaqs, includeNav, skipQuickTips, skipSources, stripTitle, paletteId, toneProfileId, rows]);

  const formatTitle = (q: string): string => {
    let s = q.trim().replace(/\s+/g, " ");
    if (!s) return s;
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!/[.?!]$/.test(s)) s += "?";
    return s;
  };

  const buildSkeletonRow = (q: string, i: number): Record<string, string> => {
    const title = formatTitle(q);
    const handle = `${handlePrefix ? handlePrefix + "-" : ""}${slugify(q) || `q-${i + 1}`}`;
    return {
      Handle: handle,
      Title: title,
      Author: author,
      "Body HTML": "",
      "Summary HTML": "",
      Tags: sport,
      Published: "TRUE",
      "Template Suffix": templateSuffix,
      "Blog: Handle": blogHandle,
      "Blog: Title": blogTitle,
      "Metafield: title_tag [string]": title,
      "Metafield: description_tag [string]": "",
      "Metafield: custom.sport [single_line_text_field]": sport,
      "Metafield: custom.question [single_line_text_field]": title,
      "Metafield: custom.custom_answer_summary [rich_text_field]": "",
      "Metafield: custom.subheading [single_line_text_field]": "",
    };
  };

  // Extract a short summary (first body paragraph after H1) from generated markdown
  const extractSummary = (md: string): string => {
    const lines = md.split("\n");
    let i = 0;
    // Skip leading H1
    while (i < lines.length && !lines[i].trim()) i++;
    if (lines[i]?.startsWith("# ")) i++;
    // Find first non-empty, non-heading paragraph
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || t.startsWith("#") || t.startsWith(">") || t.startsWith("|") || t.startsWith("-") || /^\d+\./.test(t) || t.startsWith("![")) {
        i++;
        continue;
      }
      // Collect consecutive non-empty lines as the paragraph
      const buf: string[] = [t];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && !lines[j].startsWith("#")) {
        buf.push(lines[j].trim());
        j++;
      }
      return buf.join(" ").replace(/\*\*/g, "").replace(/[*_`]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
    }
    return "";
  };

  const truncate = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

  const regenerateRow = async (idx: number, wc: 300 | 500 | 700) => {
    const row = rows[idx];
    if (!row) return;
    const q = row.Title;
    const title = formatTitle(q);
    setRegenIdx(idx);
    try {
      const extra = sport
        ? `This is a ${sport} FAQ article. Answer the question directly and concisely. Keep the article close to ${wc} words.`
        : `This is an FAQ-style article. Answer the question directly and concisely. Keep the article close to ${wc} words.`;

      const result = await generateMigrationArticle({
        topic: title,
        targetWordCount: wc,
        palette: selectedPalette,
        convertOpts: {
          skipNavigation: !includeNav,
          skipQuickTips,
          skipFaqs: !includeFaqs,
          skipSources,
        },
        toneProfileId,
        extraInstructions: extra,
      });

      const body = stripTitle
        ? result.html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, "").trim()
        : result.html;
      const summary = truncate(result.subtitle || extractSummary(result.markdown), 300);
      const descriptionTag = truncate(result.seoDescription || summary, 155);
      const handle = `${handlePrefix ? handlePrefix + "-" : ""}${slugify(q) || `q-${idx + 1}`}`;
      const newRow: Record<string, string> = {
        Handle: handle,
        Title: title,
        Author: author,
        "Body HTML": body,
        "Summary HTML": summary ? `<p>${escapeHtml(summary)}</p>` : "",
        Tags: sport,
        Published: "TRUE",
        "Template Suffix": templateSuffix,
        "Blog: Handle": blogHandle,
        "Blog: Title": blogTitle,
        "Metafield: title_tag [string]": result.seoTitle || title,
        "Metafield: description_tag [string]": descriptionTag,
        "Metafield: custom.sport [single_line_text_field]": sport,
        "Metafield: custom.question [single_line_text_field]": title,
        "Metafield: custom.custom_answer_summary [rich_text_field]": summary ? `<p>${escapeHtml(summary)}</p>` : "",
        "Metafield: custom.subheading [single_line_text_field]": summary,
      };
      setRows((prev) => prev.map((r, i) => (i === idx ? newRow : r)));
      if (body.length > EXCEL_CELL_LIMIT) {
        toast({
          title: `Generated (${wc} words) — over Excel cell limit`,
          description: `Body HTML is ${body.length} chars (limit ${EXCEL_CELL_LIMIT}). CSV will still download but Excel may reject this row.`,
          variant: "destructive",
        });
      } else {
        toast({ title: `Generated (${wc} words)` });
      }
    } catch (e: any) {
      toast({ title: "Generation failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setRegenIdx(null);
    }
  };

  const regenerateAll = async (wc: 300 | 500 | 700) => {
    if (rows.length === 0) return;
    bulkCancelRef.current = false;
    setBulkProgress({ current: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i++) {
        if (bulkCancelRef.current) break;
        setBulkProgress({ current: i + 1, total: rows.length });
        await regenerateRow(i, wc);
      }
      toast({ title: bulkCancelRef.current ? "Bulk regeneration cancelled" : `Bulk regeneration complete (${wc}w)` });
    } finally {
      setBulkProgress(null);
      bulkCancelRef.current = false;
    }
  };

  const generate = () => {
    const list = questions
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean);
    if (list.length === 0) {
      toast({ title: "Add at least one question", variant: "destructive" });
      return;
    }
    const out = list.map((q, i) => buildSkeletonRow(q, i));
    setRows(out);
    toast({ title: `Created ${out.length} rows`, description: "Click 300w / 500w / 700w on each row to generate body content." });
  };

  const downloadCsv = () => {
    if (rows.length === 0) return;
    const escapeCsv = (v: string) => {
      const s = (v ?? "").toString();
      // Always quote and escape internal quotes by doubling them. Preserve newlines inside quoted fields.
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines: string[] = [];
    lines.push(COLUMNS.map(escapeCsv).join(","));
    for (const r of rows) {
      lines.push(COLUMNS.map((c) => escapeCsv(r[c] ?? "")).join(","));
    }
    // CRLF line endings + UTF-8 BOM for maximum spreadsheet compatibility
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopify-faq-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-lg font-semibold">Shopify FAQ Bulk Generator</h1>
        </div>
      </header>
      <main className="container mx-auto px-6 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div><Label>Author</Label><Input value={author} onChange={(e) => setAuthor(e.target.value)} /></div>
            <div><Label>Sport (optional)</Label><Input value={sport} onChange={(e) => setSport(e.target.value)} placeholder="baseball" /></div>
            <div>
              <Label>Default word count</Label>
              <Select value={String(wordCount)} onValueChange={(v) => setWordCount(Number(v) as 300 | 500 | 700)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="300">300 words (compact, no table)</SelectItem>
                  <SelectItem value="500">500 words (1 table, 2 sections)</SelectItem>
                  <SelectItem value="700">700 words (1 table, 3 sections)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Handle prefix</Label><Input value={handlePrefix} onChange={(e) => setHandlePrefix(e.target.value)} /></div>
            <div><Label>Blog: Handle</Label><Input value={blogHandle} onChange={(e) => setBlogHandle(e.target.value)} /></div>
            <div><Label>Blog: Title</Label><Input value={blogTitle} onChange={(e) => setBlogTitle(e.target.value)} /></div>
            <div><Label>Template Suffix</Label><Input value={templateSuffix} onChange={(e) => setTemplateSuffix(e.target.value)} /></div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="include-faqs"
                type="checkbox"
                checked={includeFaqs}
                onChange={(e) => setIncludeFaqs(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="include-faqs" className="cursor-pointer">Include FAQ section in body HTML</Label>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="include-nav"
                type="checkbox"
                checked={includeNav}
                onChange={(e) => setIncludeNav(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="include-nav" className="cursor-pointer">Include "In This Article" section</Label>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="skip-tips"
                type="checkbox"
                checked={skipQuickTips}
                onChange={(e) => setSkipQuickTips(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="skip-tips" className="cursor-pointer">Skip Quick Tips</Label>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="skip-sources"
                type="checkbox"
                checked={skipSources}
                onChange={(e) => setSkipSources(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="skip-sources" className="cursor-pointer">Skip References / Sources</Label>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="strip-title"
                type="checkbox"
                checked={stripTitle}
                onChange={(e) => setStripTitle(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="strip-title" className="cursor-pointer">Remove title (H1) from Body HTML</Label>
            </div>
            <div>
              <Label>Tone profile (optional)</Label>
              <Select value={toneProfileId ?? "none"} onValueChange={(v) => setToneProfileId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {toneProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label>Color palette</Label>
              <ColorPaletteSelector
                selectedPalette={selectedPalette}
                onSelectPalette={(p) => setPaletteId(p?.id ?? null)}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>One question per line</Label>
              <Textarea
                rows={10}
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                placeholder={"How do I clean batting gloves?\nWhat is the best wood for a baseball bat?"}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={generate} className="gap-2">
                <Sparkles className="h-4 w-4" /> Create rows
              </Button>
              <Button variant="outline" onClick={downloadCsv} disabled={rows.length === 0} className="gap-2">
                <Download className="h-4 w-4" /> Download CSV ({rows.length})
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Body HTML is generated per row. Click 300w / 500w / 700w on each row to generate the article content using the content generator pipeline.
            </p>
          </CardContent>
        </Card>
      </main>
      {rows.length > 0 && (
        <section className="container mx-auto px-6 pb-10">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle>Generated rows ({rows.length})</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Regenerate all:</span>
                  {[300, 500, 700].map((wc) => (
                    <Button
                      key={wc}
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1"
                      disabled={!!bulkProgress || regenIdx !== null}
                      onClick={() => regenerateAll(wc as 300 | 500 | 700)}
                    >
                      {bulkProgress ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      All {wc}w
                    </Button>
                  ))}
                  {bulkProgress && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {bulkProgress.current}/{bulkProgress.total}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => { bulkCancelRef.current = true; }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sticky left-0 bg-background z-10">Regenerate</TableHead>
                    {COLUMNS.map((c) => (
                      <TableHead key={c} className="whitespace-nowrap text-xs">{c}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="align-top sticky left-0 bg-background z-10">
                        <div className="flex flex-col gap-1">
                          {[300, 500, 700].map((wc) => (
                            <Button
                              key={wc}
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs gap-1"
                              disabled={regenIdx === i}
                              onClick={() => regenerateRow(i, wc as 300 | 500 | 700)}
                            >
                              {regenIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              {wc}w
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                      {COLUMNS.map((c) => {
                        const v = r[c] ?? "";
                        const isHtml = c === "Body HTML" || c.includes("rich_text_field");
                        return (
                          <TableCell key={c} className="align-top text-xs max-w-[260px]">
                            <div className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
                              {isHtml ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400) + (v.length > 400 ? "…" : "") : v}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
