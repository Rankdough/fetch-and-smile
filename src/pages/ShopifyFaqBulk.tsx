import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Loader2, Sparkles, RefreshCw, Filter, Trash2, CheckCircle2, AlertTriangle, AlertCircle, FileText, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [globalTags, setGlobalTags] = useState<string>(init.globalTags ?? "");
  const [blogHandle, setBlogHandle] = useState<string>(init.blogHandle ?? "faq");
  const [blogTitle, setBlogTitle] = useState<string>(init.blogTitle ?? "FAQ");
  const [templateSuffix, setTemplateSuffix] = useState<string>(init.templateSuffix ?? "article-faq");
  const [handlePrefix, setHandlePrefix] = useState<string>(init.handlePrefix ?? "");
  const [siteBaseUrl, setSiteBaseUrl] = useState<string>(init.siteBaseUrl ?? "");
  const [wordCount, setWordCount] = useState<100 | 300 | 500 | 700>(init.wordCount ?? 500);
  const [includeFaqs, setIncludeFaqs] = useState<boolean>(init.includeFaqs ?? false);
  const [includeNav, setIncludeNav] = useState<boolean>(init.includeNav ?? false);
  const [skipQuickTips, setSkipQuickTips] = useState<boolean>(init.skipQuickTips ?? false);
  const [skipSources, setSkipSources] = useState<boolean>(init.skipSources ?? true);
  const [stripTitle, setStripTitle] = useState<boolean>(init.stripTitle ?? false);
  const [paletteId, setPaletteId] = useState<string | null>(init.paletteId ?? null);
  const [internalLinks, setInternalLinks] = useState<string[]>(
    Array.isArray(init.internalLinks) ? [...init.internalLinks, "", "", ""].slice(0, 3) : ["", "", ""]
  );
  const [internalLinkStatuses, setInternalLinkStatuses] = useState<Array<{ ok: boolean; status: number; reason?: string } | null>>([null, null, null]);
  const [internalLinkCheckLoading, setInternalLinkCheckLoading] = useState(false);
  const [contextFiles, setContextFiles] = useState<Array<{ name: string; content: string }>>(
    Array.isArray(init.contextFiles) ? init.contextFiles : []
  );
  const [contextParsing, setContextParsing] = useState(false);
  const contextFileInputRef = useRef<HTMLInputElement>(null);
  const [toneProfileId, setToneProfileId] = useState<string | null>(init.toneProfileId ?? null);
  const [toneProfiles, setToneProfiles] = useState<Array<{ id: string; name: string }>>([]);
  const [ctaEnabled, setCtaEnabled] = useState<boolean>(init.ctaEnabled ?? false);
  const [ctaUrl, setCtaUrl] = useState<string>(init.ctaUrl ?? "");
  const [ctaInstruction, setCtaInstruction] = useState<string>(init.ctaInstruction ?? "");
  const [rows, setRows] = useState<Record<string, string>[]>(init.rows ?? []);
  const [regenIdx, setRegenIdx] = useState<number | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const bulkCancelRef = useRef<boolean>(false);
  const [stopping, setStopping] = useState(false);

  // QA check results, keyed by row index
  type QaResult = { status: "ok" | "warning" | "error"; issues: string[]; answersTitle: boolean; wordCount: number; brokenLinks?: string[] };
  const [qa, setQa] = useState<Record<number, QaResult>>({});
  const [qaLoading, setQaLoading] = useState<Record<number, boolean>>({});
  // Track auto-retry attempts per row to avoid infinite loops on persistent QA errors
  const autoRetriedRef = useRef<Set<number>>(new Set());

  // Filter dialog state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterRules, setFilterRules] = useState<string>(init.filterRules ?? "");
  const [filterLoading, setFilterLoading] = useState(false);
  const [flagged, setFlagged] = useState<Array<{ index: number; reason: string; question: string; selected: boolean }>>([]);

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
        questions, author, sport, globalTags, blogHandle, blogTitle, templateSuffix, handlePrefix, siteBaseUrl, wordCount,
        includeFaqs, includeNav, skipQuickTips, skipSources, stripTitle, paletteId, toneProfileId, rows, filterRules,
        internalLinks,
        contextFiles,
        ctaEnabled, ctaUrl, ctaInstruction,
      }));
    } catch {}
  }, [questions, author, sport, globalTags, blogHandle, blogTitle, templateSuffix, handlePrefix, siteBaseUrl, wordCount,
      includeFaqs, includeNav, skipQuickTips, skipSources, stripTitle, paletteId, toneProfileId, rows, filterRules, internalLinks, contextFiles,
      ctaEnabled, ctaUrl, ctaInstruction]);

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
      Tags: [sport, globalTags].map((t) => (t || "").trim()).filter(Boolean).join(", "),
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

const isPricingQuestionTitle = (title: string) =>
  /\b(price|prices|pricing|cost|costs|how much|how many dollars|budget|cheap|expensive|afford|worth)\b/i.test(title || "");

const BLOCKED_THIRD_PARTY_BRANDS = [
  "New Balance", "Under Armour", "On Running", "Apple Watch", "Nike", "Saucony", "ASICS", "Adidas",
  "Brooks", "Hoka", "Puma", "Salomon", "Reebok", "Mizuno", "Altra", "Garmin", "Coros", "Polar",
  "Suunto", "Fitbit", "Wahoo", "Catamount", "Forerunner", "Pegasus", "Vaporfly", "Alphafly",
  "Endorphin", "Dragonfly", "ZoomX", "Clifton", "Speedgoat",
];

const getAllowedBrandTerms = (urls: string[]) => {
  const normalisedLinks = urls.map((url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname} ${decodeURIComponent(parsed.pathname)}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    } catch {
      return url.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    }
  });
  return new Set(
    BLOCKED_THIRD_PARTY_BRANDS.filter((brand) => {
      const needle = brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return normalisedLinks.some((link) => link.includes(needle));
    }).map((brand) => brand.toLowerCase())
  );
};

const sanitizeGeneratedMarkdown = (markdown: string, title: string, urls: string[]) => {
  const allowedBrands = getAllowedBrandTerms(urls);
  const blockedBrands = BLOCKED_THIRD_PARTY_BRANDS.filter((brand) => !allowedBrands.has(brand.toLowerCase()));
  const brandRe = blockedBrands.length
    ? new RegExp(`\\b(?:${blockedBrands.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i")
    : null;
  const moneyRe = /(?:[$€£]\s?\d[\d,]*(?:\.\d{2})?(?:\s?[-–—]\s?[$€£]?\d[\d,]*(?:\.\d{2})?)?|\b\d[\d,]*(?:\.\d{2})?\s?(?:dollars|pounds|euros|usd|gbp|eur)\b)/i;
  const allowPricing = isPricingQuestionTitle(title);
  let removedBrands = 0;
  let removedPrices = 0;

  const cleaned = markdown.split(/\n{2,}/).map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (/^#{1,6}\s/.test(trimmed)) return block;
    if (/^\|/.test(trimmed)) {
      return block.split("\n").filter((line) => {
        const isSeparator = /^\|\s*:?-{3,}:?/.test(line.trim());
        const hasBlockedBrand = !!brandRe?.test(line);
        const hasBlockedPrice = !allowPricing && moneyRe.test(line);
        if (!isSeparator && (hasBlockedBrand || hasBlockedPrice)) {
          if (hasBlockedBrand) removedBrands++;
          if (hasBlockedPrice) removedPrices++;
          return false;
        }
        return true;
      }).join("\n");
    }
    const sentences = block.split(/(?<=[.!?])\s+/).filter(Boolean);
    const kept = sentences.filter((sentence) => {
      const hasBlockedBrand = !!brandRe?.test(sentence);
      const hasBlockedPrice = !allowPricing && moneyRe.test(sentence);
      if (hasBlockedBrand) removedBrands++;
      if (hasBlockedPrice) removedPrices++;
      return !hasBlockedBrand && !hasBlockedPrice;
    });
    return kept.join(" ").trim();
  }).filter(Boolean).join("\n\n");

  return { markdown: cleaned || markdown, removedBrands, removedPrices };
};

  const markdownWordCount = (md: string) => md
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#__>*`|\[\]()]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  const trimMarkdownWords = (text: string, maxWords: number) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return text.trim();
    const trimmed = words.slice(0, maxWords).join(" ").replace(/[,:;\-]$/, "").trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  };

  const enforceStrict300Markdown = (markdown: string, title: string): string => {
    const normalised = markdown.replace(/—|–/g, "-").replace(/^\s*[-*_]{3,}\s*$/gm, "").trim();
    const h1 = normalised.match(/^#\s+(.+)$/m)?.[1]?.trim() || title;
    const tableMatch = normalised.match(/(?:^|\n)((?:\|[^\n]+\|\n?){3,})/m);
    const table = tableMatch?.[1]
      ?.trim()
      .split("\n")
      .slice(0, 6)
      .join("\n") || `| Point | Short answer | Why it matters |\n| --- | --- | --- |\n| Main answer | See the summary above | Keeps the response direct |\n| Key caveat | Check current details | Avoids outdated assumptions |\n| Next step | Compare the practical options | Helps readers act confidently |`;
    const withoutTables = normalised.replace(/(?:^|\n)(?:\|[^\n]+\|\n?){3,}/gm, "\n").trim();
    const h2Regex = /^##\s+(.+)$/gm;
    const matches = [...withoutTables.matchAll(h2Regex)];
    const introBlock = matches.length ? withoutTables.slice(0, matches[0].index ?? 0) : withoutTables;
    const intro = trimMarkdownWords(
      introBlock.replace(/^#\s+.+$/m, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)[0] || "",
      35
    );
    const sections = matches.map((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? withoutTables.length) : withoutTables.length;
      return { heading: match[1].trim(), body: withoutTables.slice(start + match[0].length, end).trim() };
    });
    const isStructural = (heading: string) => /tl;?dr|quick tips|in this article|frequently asked|^faq$|final thoughts|conclusion|references|how to choose|how to pick|how to decide|how to find/i.test(heading);
    const tldr = sections.find((s) => /tl;?dr/i.test(s.heading));
    const quickTips = sections.find((s) => /quick tips/i.test(s.heading));
    const main = sections.find((s) => !isStructural(s.heading)) || sections.find((s) => !/tl;?dr|quick tips/i.test(s.heading));
    const allBodyText = sections
      .filter((s) => !/tl;?dr|quick tips/i.test(s.heading))
      .map((s) => s.body)
      .join("\n\n")
      .replace(/^#{1,6}\s+.+$/gm, "")
      .replace(/^[-*>\s]*\*\*Sources:\*\*[\s\S]*$/gim, "")
      .trim();
    const tips = (quickTips?.body || "")
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*>]|\d+[.)])\s*/, "").replace(/^\*\*Tip\s*\d+:\*\*\s*/i, "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((tip, i) => `${i + 1}. ${trimMarkdownWords(tip, 12)}`);

    const fixedBlocks = [
      `# ${h1}`,
      intro,
      `## TL;DR\n${trimMarkdownWords(tldr?.body || intro || allBodyText, 45)}`,
      table,
      !skipQuickTips && tips.length ? `## Quick Tips\n${tips.join("\n")}` : "",
      `## ${main?.heading || "What is the short answer?"}`,
    ].filter(Boolean);
    const fixedWords = markdownWordCount(`${fixedBlocks.join("\n\n")}`);
    const bodyBudget = Math.max(60, 325 - fixedWords);
    let body = trimMarkdownWords((main?.body || allBodyText).replace(table, "").trim(), bodyBudget);
    let output = `${fixedBlocks.join("\n\n")}\n\n${body}`.trim();

    if (markdownWordCount(output) > 325) {
      body = trimMarkdownWords(body, Math.max(35, bodyBudget - (markdownWordCount(output) - 325)));
      output = `${fixedBlocks.join("\n\n")}\n\n${body}`.trim();
    }
    if (markdownWordCount(output) < 275) {
      const fillers = [
        `For ${sport || "this topic"}, readers should use the answer as practical guidance, then check the latest rules, availability, or product details before acting.`,
        `That keeps the decision grounded in the current situation rather than a generic answer that may miss timing, league, or format changes.`,
        `If the question involves equipment, venues, schedules, or eligibility, confirm the details at the point of purchase or registration.`,
      ];
      for (const filler of fillers) {
        if (markdownWordCount(output) >= 275) break;
        body = `${body} ${filler}`.trim();
        output = `${fixedBlocks.join("\n\n")}\n\n${trimMarkdownWords(body, Math.max(35, 325 - fixedWords))}`.trim();
      }
    }
    return output;
  };

  // Move any markdown table to immediately after the TL;DR section
  const moveTableAfterTldr = (markdown: string): string => {
    const tableMatch = markdown.match(/(?:^|\n)((?:\|[^\n]+\|\n?){3,})/m);
    if (!tableMatch) return markdown;
    const tableBlock = tableMatch[1].trim();
    const withoutTable = markdown.replace(/(?:^|\n)(?:\|[^\n]+\|\n?){3,}/m, "\n").trim();
    // Find TL;DR section end (next H2 after it, or end of doc)
    const tldrRe = /^##\s+TL;?DR[^\n]*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/im;
    const m = withoutTable.match(tldrRe);
    if (!m) return `${withoutTable}\n\n${tableBlock}`.trim();
    const insertAt = (m.index ?? 0) + m[0].length;
    return `${withoutTable.slice(0, insertAt).trimEnd()}\n\n${tableBlock}\n\n${withoutTable.slice(insertAt).trimStart()}`.trim();
  };

  const handleContextFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (contextFiles.some((f) => f.name === file.name)) {
      toast({ title: "File already added", variant: "destructive" });
      if (contextFileInputRef.current) contextFileInputRef.current.value = "";
      return;
    }
    setContextParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data, error } = await supabase.functions.invoke("parse-context-file", { body: formData });
      if (error) throw error;
      const content = data?.content || "";
      if (!content || content.length < 20) throw new Error("Could not extract text from file.");
      setContextFiles((prev) => [...prev, { name: file.name, content }]);
      toast({ title: "Context file added", description: file.name });
    } catch (err: any) {
      toast({ title: "Failed to parse file", description: err?.message || "", variant: "destructive" });
    } finally {
      setContextParsing(false);
      if (contextFileInputRef.current) contextFileInputRef.current.value = "";
    }
  };

  const removeContextFile = (name: string) => {
    setContextFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const checkInternalLinks = async () => {
    const urls = internalLinks.map((u) => (u || "").trim());
    const nonEmpty = urls.filter(Boolean);
    if (nonEmpty.length === 0) {
      toast({ title: "No internal links to check" });
      return;
    }
    setInternalLinkCheckLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-links", { body: { urls: nonEmpty } });
      if (error) throw error;
      const results: Array<{ url: string; ok: boolean; status: number; reason?: string }> = data?.results || [];
      const next = urls.map((u) => {
        if (!u) return null;
        const r = results.find((x) => x.url === u);
        return r ? { ok: r.ok, status: r.status, reason: r.reason } : null;
      });
      setInternalLinkStatuses(next);
      const broken = results.filter((r) => !r.ok);
      if (broken.length === 0) {
        toast({ title: "All internal links OK" });
      } else {
        toast({
          title: `${broken.length} broken link${broken.length === 1 ? "" : "s"}`,
          description: broken.map((b) => b.url).slice(0, 2).join(" • "),
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Link check failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setInternalLinkCheckLoading(false);
    }
  };

  const extractHrefs = (html: string): string[] => {
    const urls = new Set<string>();
    const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const u = m[1].trim();
      if (u && !u.startsWith("#") && !/^javascript:/i.test(u) && !/^mailto:/i.test(u)) urls.add(u);
    }
    return Array.from(urls);
  };

  const runQaCheck = async (idx: number, title: string, body: string, targetWordCount: number) => {
    setQaLoading((p) => ({ ...p, [idx]: true }));
    try {
      const hrefs = extractHrefs(body);
      const [qaResp, linkResp] = await Promise.all([
        supabase.functions.invoke("verify-faq-answer", { body: { title, body, targetWordCount } }),
        hrefs.length > 0
          ? supabase.functions.invoke("verify-links", { body: { urls: hrefs } })
          : Promise.resolve({ data: { results: [] }, error: null }),
      ]);
      if (qaResp.error) throw qaResp.error;
      const data = qaResp.data;
      const linkResults: Array<{ url: string; ok: boolean; status: number; reason?: string }> =
        Array.isArray(linkResp?.data?.results) ? linkResp.data.results : [];
      let brokenUrls = linkResults.filter((r) => !r.ok).map((r) => r.url);

      // Auto-repair broken links: default to the domain root. Only unwrap if the URL is unparseable.
      let repairedBody = body;
      const stillBroken: string[] = [];
      let repairedToDomain = 0;
      if (brokenUrls.length > 0) {
        const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        for (const badUrl of brokenUrls) {
          let domainRoot = "";
          try {
            const p = new URL(badUrl);
            domainRoot = `${p.protocol}//${p.hostname}/`;
          } catch {}
          if (domainRoot) {
            // Always default broken/hallucinated URL to its domain root
            const re = new RegExp(`href=(["'])${escapeForRegex(badUrl)}\\1`, "g");
            repairedBody = repairedBody.replace(re, `href="${domainRoot}"`);
            repairedToDomain++;
          } else {
            // Unparseable URL: unwrap the anchor entirely
            const re = new RegExp(`<a\\b[^>]*href=(["'])${escapeForRegex(badUrl)}\\1[^>]*>([\\s\\S]*?)<\\/a>`, "gi");
            repairedBody = repairedBody.replace(re, "$2");
            stillBroken.push(badUrl);
          }
        }
        if (repairedBody !== body) {
          setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, "Body HTML": repairedBody } : r)));
        }
      }
      const broken = stillBroken;
      const baseStatus = data?.status ?? "warning";
      const status = broken.length > 0 && baseStatus === "ok" ? "warning" : baseStatus;
      const extraIssues: string[] = [];
      if (repairedToDomain > 0) {
        extraIssues.push(`${repairedToDomain} link${repairedToDomain === 1 ? "" : "s"} defaulted to domain root`);
      }
      if (broken.length > 0) {
        extraIssues.push(`${broken.length} broken link${broken.length === 1 ? "" : "s"} removed`);
      }
      const result: QaResult = {
        status,
        issues: [...(Array.isArray(data?.issues) ? data.issues : []), ...extraIssues],
        answersTitle: data?.answersTitle !== false,
        wordCount: data?.wordCount ?? 0,
        brokenLinks: broken,
      };
      setQa((p) => ({ ...p, [idx]: result }));
      if (result.status === "error") {
        const alreadyRetried = autoRetriedRef.current.has(idx);
        if (!alreadyRetried) {
          autoRetriedRef.current.add(idx);
          toast({
            title: "QA: regenerating to fix issues",
            description: result.issues.slice(0, 2).join(" • ") || "Body did not answer the title — retrying.",
          });
          // Fire-and-forget retry with the same target word count
          const wcGuess = (targetWordCount as 100 | 300 | 500 | 700) || 500;
          setTimeout(() => { regenerateRow(idx, wcGuess).catch(() => {}); }, 50);
        } else {
          toast({
            title: `QA: issues persist after retry`,
            description: result.issues.slice(0, 2).join(" • ") || "Body may not answer the title.",
            variant: "destructive",
          });
        }
      } else if (broken.length > 0) {
        autoRetriedRef.current.delete(idx);
        toast({ title: `QA: ${broken.length} broken link(s)`, description: broken.slice(0, 2).join(" • "), variant: "destructive" });
      } else if (result.status === "warning" && result.issues.length) {
        autoRetriedRef.current.delete(idx);
        toast({ title: `QA: minor issues`, description: result.issues.slice(0, 2).join(" • ") });
      }
    } catch (e: any) {
      console.warn("QA check failed", e);
    } finally {
      setQaLoading((p) => ({ ...p, [idx]: false }));
    }
  };

  const deleteRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setQa((prev) => {
      const next: Record<number, QaResult> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const n = Number(k);
        if (n === idx) return;
        next[n > idx ? n - 1 : n] = v;
      });
      return next;
    });
    setQaLoading((prev) => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const n = Number(k);
        if (n === idx) return;
        next[n > idx ? n - 1 : n] = v;
      });
      return next;
    });
  };

  const deleteAllErrorRows = () => {
    const errorIdxs = new Set(
      Object.entries(qa).filter(([, v]) => v?.status === "error").map(([k]) => Number(k))
    );
    if (errorIdxs.size === 0) return;
    if (!confirm(`Delete ${errorIdxs.size} row(s) flagged as Error?`)) return;
    const oldToNew: Record<number, number> = {};
    let cursor = 0;
    rows.forEach((_, i) => {
      if (!errorIdxs.has(i)) oldToNew[i] = cursor++;
    });
    const newQa: Record<number, QaResult> = {};
    Object.entries(qa).forEach(([k, v]) => {
      const n = Number(k);
      if (oldToNew[n] !== undefined) newQa[oldToNew[n]] = v;
    });
    setRows(rows.filter((_, i) => !errorIdxs.has(i)));
    setQa(newQa);
    setQaLoading({});
    toast({ title: `Deleted ${errorIdxs.size} error row(s)` });
  };

  const enforceStrict100Markdown = (markdown: string, title: string): string => {
    const normalised = markdown.replace(/—|–/g, "-").replace(/^\s*[-*_]{3,}\s*$/gm, "").trim();
    const h1 = normalised.match(/^#\s+(.+)$/m)?.[1]?.trim() || title;
    const tableMatch = normalised.match(/(?:^|\n)((?:\|[^\n]+\|\n?){3,})/m);
    const rawTable = tableMatch?.[1]?.trim().split("\n") || [];
    const table = rawTable.length >= 4
      ? rawTable.slice(0, 4).join("\n")
      : `| Point | Short answer |\n| --- | --- |\n| Direct answer | See section above |\n| Next step | Confirm details before acting |`;
    const withoutTables = normalised.replace(/(?:^|\n)(?:\|[^\n]+\|\n?){3,}/gm, "\n").trim();
    const h2Regex = /^##\s+(.+)$/gm;
    const matches = [...withoutTables.matchAll(h2Regex)];
    const introBlock = matches.length ? withoutTables.slice(0, matches[0].index ?? 0) : withoutTables;
    const intro = trimMarkdownWords(
      introBlock.replace(/^#\s+.+$/m, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)[0] || "",
      25
    );
    const isStructural = (heading: string) => /tl;?dr|quick tips|in this article|frequently asked|^faq$|final thoughts|conclusion|references|how to choose|how to pick|how to decide|how to find/i.test(heading);
    const sections = matches.map((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? withoutTables.length) : withoutTables.length;
      return { heading: match[1].trim(), body: withoutTables.slice(start + match[0].length, end).trim() };
    });
    const main = sections.find((s) => !isStructural(s.heading)) || sections[0];
    const heading = main?.heading || "What is the short answer?";
    const fixed = [`# ${h1}`, intro, `## ${heading}`].filter(Boolean).join("\n\n");
    const fixedWords = markdownWordCount(`${fixed}\n\n${table}`);
    const bodyBudget = Math.max(20, 115 - fixedWords);
    const bodyText = trimMarkdownWords((main?.body || "").replace(/(?:^|\n)(?:\|[^\n]+\|\n?){3,}/gm, "\n").replace(/^#{1,6}\s+.+$/gm, "").trim(), bodyBudget);
    let output = `${fixed}\n\n${bodyText}\n\n${table}`.trim();
    if (markdownWordCount(output) > 115) {
      const trimmed = trimMarkdownWords(bodyText, Math.max(15, bodyBudget - (markdownWordCount(output) - 115)));
      output = `${fixed}\n\n${trimmed}\n\n${table}`.trim();
    }
    return output;
  };

  const regenerateRow = async (idx: number, wc: 100 | 300 | 500 | 700) => {
    const row = rows[idx];
    if (!row) return;
    const q = row.Title;
    const title = formatTitle(q);
    setRegenIdx(idx);
    try {
      const strict100 = `STRICT LENGTH: The entire article (H1, opening, single H2 section, and table cells combined) MUST total between 85 and 115 words. Do NOT exceed 115 words under any circumstance. Be ruthlessly concise.

STRUCTURE FOR 100-WORD ARTICLE (exact):
- H1 title
- 1 short opening paragraph (max 25 words) that directly answers the question
- EXACTLY 1 H2 section with 1 short paragraph (25-40 words) and EXACTLY 1 small markdown table (2-3 data rows, 2 columns)
- Do NOT include TL;DR, Quick Tips, FAQ, References, Final Thoughts, How to Choose, or any other sections.`;
      const strict300 = `STRICT LENGTH: The entire article (including TL;DR, Quick Tips, the single H2 section, table cells, and FAQ if present) MUST total between 275 and 325 words. Do NOT exceed 325 words under any circumstance. Be ruthlessly concise.

STRUCTURE FOR 300-WORD ARTICLE (exact):
- H1 title
- 1 short opening paragraph (max 35 words)
- TL;DR (1 dense paragraph, 30-45 words)
- Quick Tips: exactly 3 short bullets (max 12 words each)
- EXACTLY 1 H2 section with 1 short paragraph (50-80 words) and EXACTLY 1 markdown table (3-4 rows, 2-3 columns)
- Do NOT add any additional H2 sections beyond that single one.
- Do NOT include Final Thoughts, FAQ, References, How to Choose, or any extra sections for this 300-word option.`;
      const titleLower = (title || "").toLowerCase();
      const isPricingQuestion = isPricingQuestionTitle(titleLower);
      const openingRule = `\n\nCRITICAL OPENING RULE: The VERY FIRST SENTENCE of the opening paragraph MUST be a complete, standalone, AI-quotable answer to the title question (max 30 words). No throat-clearing, no scene-setting, no context before the answer. Sentence 1 = the literal answer to "${title}".

NO THIRD-PARTY BRAND PROMOTION: Do NOT name, recommend, or reference any third-party brands, manufacturers, products, or models (e.g. Nike, Saucony, Asics, Adidas, New Balance, Brooks, Hoka, Puma, Under Armour, Salomon, Reebok, Mizuno, On, Altra, etc.). Use only generic descriptors ("track spikes", "racing flats", "lightweight trainers"). The ONLY brands that may appear are this store's own brands provided via internal links/context — never invent or insert outside brand names.

${isPricingQuestion
  ? `PRICING: This question is about cost, so concrete prices/ranges are appropriate where useful.`
  : `NO PRICING: Do NOT mention prices, price ranges, costs, dollar/pound/euro figures, "retailing around $X", "priced at", "$X-$Y", or any monetary values. The question is not about pricing — omit all monetary references entirely.`}`;
      const base = sport
        ? `This is a ${sport} FAQ article. Answer the question directly and concisely. Target ${wc} words total.${openingRule}`
        : `This is an FAQ-style article. Answer the question directly and concisely. Target ${wc} words total.${openingRule}`;
      const extra = wc === 100 ? `${base}\n\n${strict100}` : wc === 300 ? `${base}\n\n${strict300}` : base;

      // Underrequest for tight word counts so the deterministic enforcer can clean up
      const aiTarget = wc === 100 ? 90 : wc === 300 ? 240 : wc;

      const result = await generateMigrationArticle({
        topic: title,
        targetWordCount: aiTarget,
        palette: selectedPalette,
        convertOpts: {
          skipNavigation: !includeNav,
          skipQuickTips: wc === 100 ? true : skipQuickTips,
          skipFaqs: wc === 100 || wc === 300 ? true : !includeFaqs,
          skipSources: wc === 100 || wc === 300 ? true : skipSources,
        },
        toneProfileId,
        cta: ctaEnabled && ctaUrl.trim()
          ? { url: ctaUrl.trim(), instruction: ctaInstruction.trim() || undefined }
          : undefined,
        extraInstructions: extra + (contextFiles.length > 0
          ? `\n\nCONTEXT FILES PROVIDED: Treat the attached context files as the primary source of truth. Draw facts, statistics, brand details, and source URLs from them. If the context files contain URLs that are relevant references, use those exact URLs in the Sources/References section instead of inventing new ones. Do NOT contradict the context files.`
          : ""),
        contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
      });

      let finalMarkdown = wc === 100
        ? enforceStrict100Markdown(result.markdown, title)
        : wc === 300
          ? enforceStrict300Markdown(result.markdown, title)
          : moveTableAfterTldr(result.markdown);

      // Inject up to 3 user-provided internal links + cross-links to previously generated FAQs
      const userLinks = internalLinks.map((u) => u.trim()).filter(Boolean).slice(0, 3);
      const crossLinks: string[] = [];
      const baseUrl = (siteBaseUrl || "").trim().replace(/\/+$/, "");
      if (baseUrl) {
        rows.forEach((r, i) => {
          if (i === idx) return;
          const otherBody = (r?.["Body HTML"] || "").trim();
          const otherHandle = (r?.Handle || "").trim();
          const otherTitle = (r?.Title || "").trim();
          if (otherBody && otherHandle && otherTitle) {
            const url = `${baseUrl}/blogs/${blogHandle || "faq"}/${otherHandle}`;
            crossLinks.push(url);
          }
        });
      }
      // Cap total links to avoid clutter; prioritise user-provided links
      const linkUrls = [...userLinks, ...crossLinks].slice(0, Math.max(userLinks.length, Math.min(5, userLinks.length + 2)));
      const sanitized = sanitizeGeneratedMarkdown(finalMarkdown, title, userLinks);
      finalMarkdown = sanitized.markdown;
      if (linkUrls.length > 0) {
        try {
          const { data: linkData, error: linkError } = await supabase.functions.invoke("insert-internal-links", {
            body: { content: finalMarkdown, urls: linkUrls, articleTopic: title },
          });
          if (!linkError && linkData?.content) {
            finalMarkdown = linkData.content;
          } else if (linkError) {
            console.warn("insert-internal-links error", linkError);
          }
        } catch (e) {
          console.warn("insert-internal-links failed", e);
        }
      }

      const finalHtml = markdownToStyledHtml(finalMarkdown, selectedPalette || null, {
            skipNavigation: !includeNav,
            skipQuickTips: wc === 100 ? true : skipQuickTips,
            skipFaqs: wc === 100 || wc === 300 ? true : !includeFaqs,
            skipSources: wc === 100 || wc === 300 ? true : skipSources,
          });
      const baseHtml = stripTitle
        ? finalHtml.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, "").trim()
        : finalHtml;
      const body = (result.ctaHtml && result.ctaHtml.trim()) ? `${baseHtml}${result.ctaHtml}` : baseHtml;
      const summary = truncate(result.subtitle || extractSummary(finalMarkdown), 300);
      const descriptionTag = truncate(result.seoDescription || summary, 155);
      const handle = `${handlePrefix ? handlePrefix + "-" : ""}${slugify(q) || `q-${idx + 1}`}`;
      const newRow: Record<string, string> = {
        Handle: handle,
        Title: title,
        Author: author,
        "Body HTML": body,
        "Summary HTML": summary ? `<p>${escapeHtml(summary)}</p>` : "",
        Tags: [sport, globalTags].map((t) => (t || "").trim()).filter(Boolean).join(", "),
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
      // Run QA check (non-blocking)
      runQaCheck(idx, title, body, wc);
    } catch (e: any) {
      toast({ title: "Generation failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setRegenIdx(null);
    }
  };

  const regenerateAll = async (wc: 100 | 300 | 500 | 700) => {
    if (rows.length === 0) return;
    bulkCancelRef.current = false;
    setStopping(false);
    setBulkProgress({ current: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i++) {
        if (bulkCancelRef.current) break;
        setBulkProgress({ current: i + 1, total: rows.length });
        await regenerateRow(i, wc);
      }
      toast({ title: bulkCancelRef.current ? "Generation stopped" : `Bulk regeneration complete (${wc}w)` });
    } finally {
      setBulkProgress(null);
      bulkCancelRef.current = false;
      setStopping(false);
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

  const runFilter = async () => {
    const list = questions.split("\n").map((q) => q.trim()).filter(Boolean);
    if (list.length === 0) {
      toast({ title: "No questions to filter", variant: "destructive" });
      return;
    }
    if (!filterRules.trim()) {
      toast({ title: "Add filter rules first", variant: "destructive" });
      return;
    }
    setFilterLoading(true);
    setFlagged([]);
    try {
      const { data, error } = await supabase.functions.invoke("filter-faq-questions", {
        body: { questions: list, rules: filterRules },
      });
      if (error) throw error;
      const items: Array<{ index: number; reason: string; question: string }> = data?.flagged || [];
      if (items.length === 0) {
        toast({ title: "No questions matched the filter rules" });
        setFlagged([]);
      } else {
        setFlagged(items.map((f) => ({ ...f, selected: true })));
      }
    } catch (e: any) {
      toast({ title: "Filter failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setFilterLoading(false);
    }
  };

  const applyFilterRemoval = () => {
    const toRemove = new Set(flagged.filter((f) => f.selected).map((f) => f.question));
    if (toRemove.size === 0) {
      toast({ title: "Nothing selected to remove" });
      return;
    }
    const list = questions.split("\n").map((q) => q.trim()).filter(Boolean);
    const kept = list.filter((q) => !toRemove.has(q));
    setQuestions(kept.join("\n"));
    setFlagged([]);
    setFilterOpen(false);
    toast({ title: `Removed ${toRemove.size} question${toRemove.size === 1 ? "" : "s"}` });
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
            <div><Label>Global tags (optional)</Label><Input value={globalTags} onChange={(e) => setGlobalTags(e.target.value)} placeholder="faq, evergreen" /></div>
            <div>
              <Label>Default word count</Label>
              <Select value={String(wordCount)} onValueChange={(v) => setWordCount(Number(v) as 100 | 300 | 500 | 700)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 words (1 small table, 1 section)</SelectItem>
                  <SelectItem value="300">300 words (1 table, 1 section)</SelectItem>
                  <SelectItem value="500">500 words (1 table, 2 sections)</SelectItem>
                  <SelectItem value="700">700 words (1 table, 3 sections)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Handle prefix</Label><Input value={handlePrefix} onChange={(e) => setHandlePrefix(e.target.value)} /></div>
            <div><Label>Blog: Handle</Label><Input value={blogHandle} onChange={(e) => setBlogHandle(e.target.value)} /></div>
            <div><Label>Blog: Title</Label><Input value={blogTitle} onChange={(e) => setBlogTitle(e.target.value)} /></div>
            <div><Label>Template Suffix</Label><Input value={templateSuffix} onChange={(e) => setTemplateSuffix(e.target.value)} /></div>
            <div className="md:col-span-2">
              <Label>Site base URL (for cross-linking)</Label>
              <Input
                value={siteBaseUrl}
                onChange={(e) => setSiteBaseUrl(e.target.value)}
                placeholder="https://yourstore.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                When set, each generated FAQ may link to previously generated FAQs in this batch (e.g. {`{baseUrl}/blogs/${blogHandle || "faq"}/{handle}`}).
              </p>
            </div>
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
            <div className="md:col-span-3">
              <Label>Context files</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Upload reference docs (PDF, DOCX, TXT, MD). The AI will draw facts and source URLs from them instead of inventing them.
              </p>
              <input
                ref={contextFileInputRef}
                type="file"
                accept=".docx,.pdf,.txt,.md,.json"
                className="hidden"
                onChange={handleContextFileUpload}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={contextParsing}
                  onClick={() => contextFileInputRef.current?.click()}
                >
                  {contextParsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  {contextParsing ? "Parsing…" : "Add context file"}
                </Button>
                {contextFiles.map((f) => (
                  <Badge key={f.name} variant="secondary" className="gap-1 pr-1">
                    {f.name}
                    <button
                      type="button"
                      onClick={() => removeContextFile(f.name)}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
            <div className="md:col-span-3">
              <div className="flex items-center justify-between mb-1">
                <Label>Internal links (up to 3)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={internalLinkCheckLoading}
                  onClick={checkInternalLinks}
                >
                  {internalLinkCheckLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Check links
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                AI will insert each URL once into the Body HTML where the topic naturally fits. Leave blank to skip.
              </p>
              <div className="grid gap-2">
                {[0, 1, 2].map((i) => {
                  const status = internalLinkStatuses[i];
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={internalLinks[i] ?? ""}
                        onChange={(e) =>
                          setInternalLinks((prev) => {
                            const next = [...prev];
                            next[i] = e.target.value;
                            return next;
                          })
                        }
                        placeholder={`https://example.com/related-page-${i + 1}`}
                      />
                      {status ? (
                        <span
                          className={`text-[11px] whitespace-nowrap ${
                            status.ok ? "text-green-600" : "text-destructive"
                          }`}
                        >
                          {status.ok ? `OK ${status.status}` : `Broken${status.status ? ` ${status.status}` : ""}${status.reason ? ` (${status.reason})` : ""}`}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="md:col-span-3 border-t pt-4 mt-2">
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="cta-enabled">Call-to-action banner (optional)</Label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    id="cta-enabled"
                    type="checkbox"
                    checked={ctaEnabled}
                    onChange={(e) => setCtaEnabled(e.target.checked)}
                  />
                  <span>Enable CTA</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                When enabled, an end-of-article CTA banner is generated for each row, tailored to the article topic and pointing to the URL below. The CTA HTML is appended to the Body HTML and is excluded from the article word count.
              </p>
              {ctaEnabled && (
                <div className="grid gap-2">
                  <Input
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="https://your-website.com/booking"
                  />
                  <Textarea
                    rows={3}
                    value={ctaInstruction}
                    onChange={(e) => setCtaInstruction(e.target.value)}
                    placeholder="What should the CTA promote? e.g. 'Promote our personal training programmes; emphasise expert coaching and free consultation.'"
                  />
                </div>
              )}
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
            <div className="flex gap-2 flex-wrap">
              <Button onClick={generate} className="gap-2">
                <Sparkles className="h-4 w-4" /> Create rows
              </Button>
              <Button variant="outline" onClick={() => setFilterOpen(true)} className="gap-2">
                <Filter className="h-4 w-4" /> Filter questions
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
                  {(() => {
                    const errorCount = Object.values(qa).filter((q) => q?.status === "error").length;
                    return errorCount > 0 ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-xs gap-1"
                        disabled={!!bulkProgress || regenIdx !== null}
                        onClick={() => deleteAllErrorRows()}
                      >
                        Delete {errorCount} error row{errorCount === 1 ? "" : "s"}
                      </Button>
                    ) : null;
                  })()}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs gap-1"
                    disabled={!!bulkProgress || regenIdx !== null || !rows.some((r) => (r["Body HTML"] || "").trim().length > 0)}
                    onClick={() => {
                      if (!confirm("Clear all generated Body HTML from the table? This keeps the rows but removes the generated content.")) return;
                      setRows((prev) => prev.map((r) => ({ ...r, "Body HTML": "" })));
                      setQa({});
                      toast({ title: "Cleared generated content", description: "Body HTML has been removed from all rows." });
                    }}
                  >
                    Clear generated content
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 text-xs gap-1"
                    disabled={!!bulkProgress || regenIdx !== null}
                    onClick={() => {
                      if (!confirm("Remove all rows from the table? This cannot be undone.")) return;
                      setRows([]);
                      setQa({});
                      toast({ title: "Table cleared", description: "All rows have been removed." });
                    }}
                  >
                    Clear table
                  </Button>
                  <span className="text-xs text-muted-foreground">Regenerate all:</span>
                  {[100, 300, 500, 700].map((wc) => (
                    <Button
                      key={wc}
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1"
                      disabled={!!bulkProgress || regenIdx !== null}
                      onClick={() => regenerateAll(wc as 100 | 300 | 500 | 700)}
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
                        variant="destructive"
                        className="h-7 px-2 text-xs gap-1"
                        disabled={stopping}
                        onClick={() => {
                          bulkCancelRef.current = true;
                          setStopping(true);
                          toast({ title: "Stopping after current row…" });
                        }}
                      >
                        <X className="h-3 w-3" />
                        {stopping ? "Stopping…" : "Stop generation"}
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
                    <TableHead className="text-xs">QA</TableHead>
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
                          {[100, 300, 500, 700].map((wc) => (
                            <Button
                              key={wc}
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs gap-1"
                              disabled={regenIdx === i}
                              onClick={() => regenerateRow(i, wc as 100 | 300 | 500 | 700)}
                            >
                              {regenIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              {wc}w
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-xs max-w-[220px]">
                        {qaLoading[i] ? (
                          <div className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Checking…</div>
                        ) : qa[i] ? (
                          <div className="space-y-1">
                            <div className={`flex items-center gap-1 font-medium ${
                              qa[i].status === "ok" ? "text-green-600" :
                              qa[i].status === "warning" ? "text-amber-600" : "text-destructive"
                            }`}>
                              {qa[i].status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                               qa[i].status === "warning" ? <AlertTriangle className="h-3.5 w-3.5" /> :
                               <AlertCircle className="h-3.5 w-3.5" />}
                              {qa[i].status === "ok" ? "OK" : qa[i].status === "warning" ? "Warning" : "Error"}
                              <span className="text-muted-foreground font-normal">· {qa[i].wordCount}w</span>
                            </div>
                            {!qa[i].answersTitle && (
                              <div className="text-destructive text-[11px]">Doesn't answer title</div>
                            )}
                            {qa[i].issues.length > 0 && (
                              <ul className="list-disc pl-3 text-muted-foreground text-[11px] space-y-0.5">
                                {qa[i].issues.slice(0, 4).map((iss, k) => <li key={k}>{iss}</li>)}
                              </ul>
                            )}
                            {qa[i].brokenLinks && qa[i].brokenLinks!.length > 0 && (
                              <div className="text-destructive text-[11px]">
                                <div className="font-medium">Broken links:</div>
                                <ul className="list-disc pl-3 space-y-0.5 break-all">
                                  {qa[i].brokenLinks!.slice(0, 4).map((u, k) => <li key={k}>{u}</li>)}
                                </ul>
                              </div>
                            )}
                            {qa[i].status === "error" && (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-6 px-2 text-[11px] mt-1"
                                onClick={() => deleteRow(i)}
                              >
                                Delete row
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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

      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filter questions by rules</DialogTitle>
            <DialogDescription>
              Describe which questions to remove. AI will flag matches for your approval before removal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Removal rules</Label>
              <Textarea
                rows={5}
                value={filterRules}
                onChange={(e) => setFilterRules(e.target.value)}
                placeholder={"Examples:\n- Remove time-sensitive questions (where to watch tonight, tomorrow, this weekend, today)\n- Remove questions mentioning specific dates or scores\n- Remove anything containing the word 'live stream'"}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={runFilter} disabled={filterLoading} className="gap-2">
                {filterLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
                Find matches
              </Button>
              {flagged.length > 0 && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setFlagged((f) => f.map((x) => ({ ...x, selected: true })))}>
                    Select all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setFlagged((f) => f.map((x) => ({ ...x, selected: false })))}>
                    Deselect all
                  </Button>
                </>
              )}
            </div>
            {flagged.length > 0 && (
              <div className="border rounded-md divide-y max-h-96 overflow-y-auto">
                {flagged.map((f, i) => (
                  <label key={i} className="flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={f.selected}
                      onCheckedChange={(v) => setFlagged((prev) => prev.map((x, idx) => idx === i ? { ...x, selected: !!v } : x))}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium break-words">{f.question}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{f.reason}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFilterOpen(false)}>Close</Button>
            <Button
              variant="destructive"
              onClick={applyFilterRemoval}
              disabled={flagged.filter((f) => f.selected).length === 0}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Remove selected ({flagged.filter((f) => f.selected).length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
