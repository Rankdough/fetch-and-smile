import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { markdownToStyledHtml } from "@/utils/markdownToStyledHtml";


interface ArticleData {
  h1: string;
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

function buildBodyHtml(a: ArticleData): string {
  const p = (txt: string) =>
    `<p style="margin: 0 0 16px 0; line-height: 1.7; color: #374151;">${escapeHtml(txt)}</p>`;

  const h2 = (txt: string) =>
    `<h2 style="background: #f8f4ff; color: #1f2937; border-left: 4px solid ${ACCENT}; padding: 12px 16px; margin: 24px 0 16px 0; border-radius: 0 8px 0 0;">${escapeHtml(txt)}</h2>`;

  const tipBlock = (n: number, txt: string) =>
    `<blockquote style="display: flex; align-items: center; background: linear-gradient(135deg, ${ACCENT}10 0%, ${ACCENT}20 100%); border: 1px solid ${ACCENT}33; border-radius: 12px; padding: 16px 20px; margin: 12px 0; font-style: normal;"><span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: ${ACCENT}; border-radius: 50%; color: white; font-weight: bold; font-size: 14px; margin-right: 12px; flex-shrink: 0;">${n}</span><p style="margin: 0; line-height: 1.7; color: #374151;">${escapeHtml(txt)}</p></blockquote>`;

  const ul = (items: string[]) =>
    `<ul style="margin: 0 0 16px 20px; padding: 0; line-height: 1.7; color: #374151;">${items
      .map((i) => `<li style="margin: 0 0 8px 0;">${escapeHtml(i)}</li>`)
      .join("")}</ul>`;

  const tableHtml = (() => {
    const head = a.table.headers
      .map(
        (h) =>
          `<th style="text-align:left; padding:10px 12px; background:${ACCENT}; color:white; font-weight:600; border:1px solid ${ACCENT};">${escapeHtml(h)}</th>`
      )
      .join("");
    const body = a.table.rows
      .map(
        (r) =>
          `<tr>${r
            .map(
              (c) =>
                `<td style="padding:10px 12px; border:1px solid #e5e7eb; color:#374151;">${escapeHtml(c)}</td>`
            )
            .join("")}</tr>`
      )
      .join("");
    return `<div style="margin: 16px 0 24px 0; overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:14px;"><caption style="caption-side:top; text-align:left; padding:8px 0; font-weight:600; color:#1f2937;">${escapeHtml(a.table.caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  })();

  const faqHtml = a.faqs
    .map(
      (f) =>
        `<details style="margin: 8px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #ffffff;"><summary style="padding: 12px 16px; cursor: pointer; font-weight: 600; color: #1f2937;">${escapeHtml(f.q)}</summary><div style="padding: 0 16px 12px 16px; color:#374151; line-height:1.7;">${escapeHtml(f.a)}</div></details>`
    )
    .join("");

  return [
    `<h1 style="margin: 0 0 16px 0;">${escapeHtml(a.h1)}</h1>`,
    p(a.tldr),
    h2("TL;DR"),
    p(a.tldr),
    h2("Quick Tips"),
    a.quickTips.map((t, i) => tipBlock(i + 1, t)).join("\n"),
    ...a.sections.flatMap((s) => [h2(s.heading), p(s.paragraph), ul(s.bullets), p(s.paragraph2)]),
    tableHtml,
    h2("Frequently Asked Questions"),
    faqHtml,
  ].join("\n");
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
  "Metafield: custom.answer [rich_text_field]",
  "Metafield: custom.custom_answer_summary [rich_text_field]",
  "Metafield: custom.subheading [single_line_text_field]",
];

export default function ShopifyFaqBulk() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [questions, setQuestions] = useState("");
  const [author, setAuthor] = useState("Pro Player Team Inc.");
  const [sport, setSport] = useState("");
  const [blogHandle, setBlogHandle] = useState("faq");
  const [blogTitle, setBlogTitle] = useState("FAQ");
  const [templateSuffix, setTemplateSuffix] = useState("article-faq");
  const [handlePrefix, setHandlePrefix] = useState("faq");
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);

  const generate = async () => {
    const list = questions
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean);
    if (list.length === 0) {
      toast({ title: "Add at least one question", variant: "destructive" });
      return;
    }
    setRunning(true);
    setProgress(0);
    setRows([]);
    const out: Record<string, string>[] = [];
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      try {
        const { data, error } = await supabase.functions.invoke("generate-faq-article", {
          body: { question: q, sport },
        });
        if (error) throw error;
        const a = data.article as ArticleData;
        const body = buildBodyHtml(a);
        const handle = `${handlePrefix ? handlePrefix + "-" : ""}${slugify(q) || `q-${i + 1}`}`;
        out.push({
          Handle: handle,
          Title: q,
          Author: author,
          "Body HTML": body,
          "Summary HTML": `<p>${escapeHtml(a.summary)}</p>`,
          Tags: sport,
          Published: "TRUE",
          "Template Suffix": templateSuffix,
          "Blog: Handle": blogHandle,
          "Blog: Title": blogTitle,
          "Metafield: title_tag [string]": q,
          "Metafield: description_tag [string]": a.descriptionTag,
          "Metafield: custom.sport [single_line_text_field]": sport,
          "Metafield: custom.question [single_line_text_field]": q,
          "Metafield: custom.answer [rich_text_field]": "",
          "Metafield: custom.custom_answer_summary [rich_text_field]": `<p>${escapeHtml(a.summary)}</p>`,
          "Metafield: custom.subheading [single_line_text_field]": a.summary,
        });
      } catch (e: any) {
        console.error("Failed:", q, e);
        toast({ title: `Failed: ${q.slice(0, 40)}`, description: e?.message || "", variant: "destructive" });
      }
      setProgress(Math.round(((i + 1) / list.length) * 100));
      setRows([...out]);
    }
    setRunning(false);
    toast({ title: `Generated ${out.length}/${list.length} articles` });
  };

  const downloadXlsx = () => {
    if (rows.length === 0) return;
    const aoa = [COLUMNS, ...rows.map((r) => COLUMNS.map((c) => r[c] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Blog Posts");
    XLSX.writeFile(wb, `shopify-faq-${Date.now()}.xlsx`);
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
      <main className="container mx-auto px-6 py-6 grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>One question per line</Label>
              <Textarea
                rows={14}
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                placeholder={"How do I clean batting gloves?\nWhat is the best wood for a baseball bat?"}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={generate} disabled={running} className="gap-2">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate
              </Button>
              <Button variant="outline" onClick={downloadXlsx} disabled={rows.length === 0} className="gap-2">
                <Download className="h-4 w-4" /> Download XLSX ({rows.length})
              </Button>
            </div>
            {running && <Progress value={progress} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Author</Label><Input value={author} onChange={(e) => setAuthor(e.target.value)} /></div>
            <div><Label>Sport (optional)</Label><Input value={sport} onChange={(e) => setSport(e.target.value)} placeholder="baseball" /></div>
            <div><Label>Handle prefix</Label><Input value={handlePrefix} onChange={(e) => setHandlePrefix(e.target.value)} /></div>
            <div><Label>Blog: Handle</Label><Input value={blogHandle} onChange={(e) => setBlogHandle(e.target.value)} /></div>
            <div><Label>Blog: Title</Label><Input value={blogTitle} onChange={(e) => setBlogTitle(e.target.value)} /></div>
            <div><Label>Template Suffix</Label><Input value={templateSuffix} onChange={(e) => setTemplateSuffix(e.target.value)} /></div>
          </CardContent>
        </Card>
      </main>
      {rows.length > 0 && (
        <section className="container mx-auto px-6 pb-10">
          <Card>
            <CardHeader>
              <CardTitle>Generated rows ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((c) => (
                      <TableHead key={c} className="whitespace-nowrap text-xs">{c}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
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
