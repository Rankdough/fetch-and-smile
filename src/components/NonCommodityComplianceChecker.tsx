import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, ShieldCheck, Loader2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface NonCommodityComplianceCheckerProps {
  content: string;
  onContentUpdate?: (newContent: string) => void;
  useFirstPerson?: boolean;
}

interface RuleResult {
  id: number;
  title: string;
  description: string;
  pass: boolean;
  detail?: string;
  fixInstruction: string;
}

const HYPERBOLE = [
  "world-class", "world class", "affordable", "premium", "cutting-edge", "cutting edge",
  "state-of-the-art", "state of the art", "best-in-class", "best in class",
  "revolutionary", "game-changing", "game changing", "seamless", "unparalleled",
  "top-notch", "top notch",
];

const HEDGES = ["typically", "varies", "depends", "may vary", "generally", "often", "usually", "in some cases"];

function stripCodeAndHtml(s: string) {
  return s.replace(/```[\s\S]*?```/g, " ").replace(/<[^>]+>/g, " ");
}

function evaluate(content: string): RuleResult[] {
  const text = content || "";
  const plain = stripCodeAndHtml(text);
  const lines = text.split(/\r?\n/);

  let r1Pass = true;
  let r1Detail = "";
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,3}\s+/.test(lines[i])) {
      const block: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const ln = lines[j];
        if (/^#{1,6}\s+/.test(ln)) break;
        if (ln.trim()) block.push(ln);
        else if (block.length) break;
      }
      const wc = block.join(" ").split(/\s+/).filter(Boolean).length;
      if (wc > 45) {
        r1Pass = false;
        r1Detail = `"${lines[i].slice(0, 60)}" snippet has ${wc} words`;
        break;
      }
    }
  }

  const sentences = plain.split(/(?<=[.!?])\s+/).filter(Boolean);
  let chain = 0;
  let maxChain = 0;
  for (const s of sentences) {
    if (/^\s*(this|it|they|these|those)\b/i.test(s)) {
      chain++;
      maxChain = Math.max(maxChain, chain);
    } else chain = 0;
  }
  const r2Pass = maxChain < 3;

  const r3Pass = /\|[^\n]+\|\s*\n\s*\|?\s*:?-{2,}/.test(text) || /<table[\s>]/i.test(text);

  const numericMatches = (plain.match(/\b\d{1,3}(?:[.,]\d+)?\s?(?:%|percent|years?|months?|days?|hours?|mm|cm|kg|mg|usd|eur|£|\$)/gi) || []).length;
  const r4Pass = numericMatches >= 5;

  const foundHyperbole = HYPERBOLE.filter(w => new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(plain));
  const r5Pass = foundHyperbole.length === 0;

  const r6Pass = /\bmethodology\b/i.test(plain);

  const hedgeCount = HEDGES.reduce((acc, h) => acc + (plain.match(new RegExp(`\\b${h}\\b`, "gi")) || []).length, 0);
  const r7Pass = hedgeCount <= 2;

  const top = plain.slice(0, Math.max(400, Math.floor(plain.length * 0.3)));
  const topNumericMatches = (top.match(/\b\d{1,3}(?:[.,]\d+)?\s?(?:%|percent|years?|months?|days?|hours?|minutes?|weeks?|mm|cm|kg|mg|usd|eur|£|\$)/gi) || []).length;
  const r8Pass = topNumericMatches >= 3;

  const r9Pass = /\b(timeline|deadline|week\s*\d|day\s*\d|month\s*\d|within\s+\d+\s+(?:days|weeks|months|hours)|by\s+(?:day|week|month)\s*\d)\b/i.test(plain);

  let r10Pass = true;
  let r10Detail = "";
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) continue;
    if (/[A-Za-z]\s+\d+\s*$/.test(t) && !/[.!?:;)\]]\s*$/.test(t)) {
      r10Pass = false;
      r10Detail = `Trailing bare number: "${t.slice(-40)}"`;
      break;
    }
    if (/<[a-zA-Z][^>]*$/.test(t)) {
      r10Pass = false;
      r10Detail = `Unclosed tag: "${t.slice(-40)}"`;
      break;
    }
  }

  // Rule 11: Paragraph density — no paragraph > 60 words or > 3 sentences.
  // Strip headings, list items, blockquotes, table rows, code fences, and HTML/CTA blocks
  // so we only evaluate genuine prose paragraphs.
  const proseOnly = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<table[\s\S]*?<\/table>/gi, "")
    .replace(/<(?:ul|ol|blockquote|pre|figure|aside|nav|header|footer)[\s\S]*?<\/(?:ul|ol|blockquote|pre|figure|aside|nav|header|footer)>/gi, "")
    .replace(/<\/?(?:p|div|span|strong|em|a|br|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const paragraphs = proseOnly
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p =>
      p.length > 0 &&
      !/^#{1,6}\s/.test(p) &&
      !/^[-*+]\s/.test(p) &&
      !/^\d+\.\s/.test(p) &&
      !/^>\s/.test(p) &&
      !/^\|/.test(p)
    );
  let r11Pass = true;
  let r11Detail = "";
  let r11WorstWords = 0;
  for (const p of paragraphs) {
    const wc = p.split(/\s+/).filter(Boolean).length;
    const sc = (p.match(/[.!?]+(?:\s|$)/g) || []).length;
    if (wc > 60 || sc > 3) {
      if (wc > r11WorstWords) {
        r11WorstWords = wc;
        r11Detail = `${wc}w / ${sc} sentences: "${p.slice(0, 50)}…"`;
      }
      r11Pass = false;
    }
  }


  return [
    {
      id: 1, title: "Under-45-Word Snippet Blocks",
      description: "First block under each H2/H3 ≤ 45 words",
      pass: r1Pass, detail: r1Detail,
      fixInstruction: "For every H2 and H3 heading, condense the first paragraph immediately below it to 45 words or fewer. Keep all facts and data; only tighten the prose. Do not delete headings, tables, lists, links, images, CTAs, or any subsequent paragraphs. Return the full article.",
    },
    {
      id: 2, title: "Complete Conceptual Sentence Isolation",
      description: "No 3+ consecutive sentences leaning on this/it/they",
      pass: r2Pass, detail: maxChain >= 3 ? `${maxChain}-sentence pronoun chain` : "",
      fixInstruction: "Find any run of three or more consecutive sentences that begin with 'This', 'It', 'They', 'These', or 'Those' and rewrite each so the subject is named explicitly. Preserve meaning, headings, tables, lists, links, images, and CTAs. Return the full article.",
    },
    {
      id: 3, title: "Server-Rendered Table Layouts",
      description: "Hardcoded table syntax present",
      pass: r3Pass,
      fixInstruction: "Insert at least one markdown pipe table containing genuine structured data drawn from the article (criteria, options, prices, timelines, or similar). Place it where it adds the most clarity. Do not remove existing content, headings, lists, links, images, or CTAs. Return the full article.",
    },
    {
      id: 4, title: "Explicit Information-Gain Disclosures",
      description: "≥5 concrete data points (numbers/units)",
      pass: r4Pass, detail: `${numericMatches} data points`,
      fixInstruction: "Add at least five concrete, defensible data points with units (percentages, durations, counts, prices, measurements) drawn from the existing context. Integrate them into the prose; do not invent statistics. Preserve headings, tables, lists, links, images, and CTAs. Return the full article.",
    },
    {
      id: 5, title: "Zero Marketing Hyperbole",
      description: "No fluff adjectives",
      pass: r5Pass, detail: foundHyperbole.join(", "),
      fixInstruction: `Remove marketing hyperbole and fluff adjectives such as: ${foundHyperbole.join(", ") || "world-class, affordable, premium, seamless, cutting-edge"}. Replace each with a concrete, verifiable detail or delete it. Preserve headings, tables, lists, links, images, and CTAs. Return the full article.`,
    },
    {
      id: 6, title: "Hard Procedural Methodology Statements",
      description: "Contains a 'Methodology' description",
      pass: r6Pass,
      fixInstruction: "Add a short 'Methodology' paragraph (2-4 sentences) explaining how the recommendations were derived (sources reviewed, criteria applied, evaluation process). Place it near the top after the TL;DR or near the bottom before References. Preserve all other content. Return the full article.",
    },
    {
      id: 7, title: "Zero Defensive Hedging",
      description: "≤2 unquantified hedges (typically/varies/depends)",
      pass: r7Pass, detail: `${hedgeCount} hedges`,
      fixInstruction: "Remove unquantified hedging words such as 'typically', 'varies', 'depends', 'generally', 'often', 'usually', 'may vary', 'in some cases'. Replace each with a specific range, threshold, condition, or definite statement. Preserve headings, tables, lists, links, images, and CTAs. Return the full article.",
    },
    {
      id: 8, title: "Literal Intent Proximity",
      description: "Top 30% contains ≥3 concrete numeric data points",
      pass: r8Pass, detail: `${topNumericMatches} data points in top 30%`,
      fixInstruction: "Within the first 30% of the article (intro, TL;DR, and first one or two sections), surface at least THREE concrete numeric data points with units (percentages, durations, counts, prices, thresholds, measurements) drawn from the existing context. Integrate them naturally into the prose so the reader gets immediate quantified value. Do not invent statistics, add fluff, or remove existing structure. Preserve headings, tables, lists, links, images, and CTAs. Return the full article.",
    },
    {
      id: 9, title: "Chronological Risk Mitigation",
      description: "Maps timelines/deadlines/hurdles",
      pass: r9Pass,
      fixInstruction: "Add an explicit timeline section or inline timeline cues (e.g. 'within 7 days', 'Week 1', 'Day 30') that map out deadlines, sequencing, and operational hurdles the reader must navigate. Use a short ordered list or table if it improves clarity. Preserve all existing content. Return the full article.",
    },
    {
      id: 10, title: "Structural Terminus Guard",
      description: "No bare trailing numbers or unclosed tags",
      pass: r10Pass, detail: r10Detail,
      fixInstruction: "Find any sentence or list item that ends on a bare trailing number with no punctuation, or any unclosed HTML tag, and close it cleanly (add the missing word, punctuation, or closing tag). Preserve headings, tables, lists, links, images, and CTAs. Return the full article.",
    },
    {
      id: 11, title: "Paragraph Density (No Walls of Text)",
      description: "Every paragraph ≤ 60 words and ≤ 3 sentences",
      pass: r11Pass, detail: r11Detail,
      fixInstruction: "Find every prose paragraph longer than 60 words or 3 sentences and split it into multiple shorter paragraphs at logical pivots (new idea, contrast, example, evidence, consequence). Do not delete or reword facts, headings, tables, lists, links, images, or CTAs — only insert paragraph breaks so the reader can jump easily between paragraphs. Return the full article.",
    },
  ];
}

export function NonCommodityComplianceChecker({ content, onContentUpdate, useFirstPerson = false }: NonCommodityComplianceCheckerProps) {
  const results = useMemo(() => evaluate(content || ""), [content]);
  const passed = results.filter(r => r.pass).length;
  const failing = results.filter(r => !r.pass);
  const [fixingId, setFixingId] = useState<number | null>(null);
  const [fixingAll, setFixingAll] = useState(false);

  const runFix = async (rules: RuleResult[], label: string) => {
    if (!onContentUpdate) {
      toast({ title: "Cannot apply fix", description: "Content updater unavailable in this view.", variant: "destructive" });
      return;
    }
    if (!content.trim()) {
      toast({ title: "No content", description: "Generate an article first.", variant: "destructive" });
      return;
    }
    const instruction = `Apply the following Non-Commodity Compliance fixes to the article. Do not rewrite anything that already passes. Preserve markdown structure, headings, tables, lists, links, images, and CTA blocks unless a rule explicitly requires changing them.\n\n${rules.map(r => `• Rule ${r.id} — ${r.title}: ${r.fixInstruction}`).join("\n\n")}`;
    try {
      const { data, error } = await supabase.functions.invoke("voice-edit-content", {
        body: { content, instruction, useFirstPerson },
      });
      if (error) throw new Error(error.message || "Edge function failed");
      if (data?.error) throw new Error(data.error);
      if (!data?.content) throw new Error("No content returned");
      onContentUpdate(data.content);
      toast({ title: "Fix applied", description: `${label} rewritten.` });
    } catch (err) {
      console.error("NonCommodity fix error:", err);
      toast({ title: "Fix failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleFixOne = async (rule: RuleResult) => {
    setFixingId(rule.id);
    try { await runFix([rule], `Rule ${rule.id}`); } finally { setFixingId(null); }
  };

  const handleFixAll = async () => {
    if (failing.length === 0) return;
    setFixingAll(true);
    try { await runFix(failing, `${failing.length} failing rule${failing.length === 1 ? "" : "s"}`); } finally { setFixingAll(false); }
  };

  const busy = fixingId !== null || fixingAll;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Non-Commodity Compliance Guard
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {passed}/{results.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {onContentUpdate && failing.length > 0 && (
          <Button
            size="sm"
            variant="default"
            className="w-full"
            disabled={busy}
            onClick={handleFixAll}
          >
            {fixingAll ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
            Fix all {failing.length} failing rule{failing.length === 1 ? "" : "s"}
          </Button>
        )}
        {results.map(r => (
          <div
            key={r.id}
            className={`flex items-start gap-2 rounded-md border p-2 transition-colors ${
              r.pass
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-border/60 bg-card/50"
            }`}
          >
            <div className="mt-0.5">
              {r.pass ? (
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                </div>
              ) : (
                <X className="h-4 w-4 text-destructive" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-medium leading-tight ${r.pass ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                Rule {r.id}: {r.title}
                {r.pass && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">✓ Fixed</span>}
              </div>
              <div className="text-[11px] text-muted-foreground leading-snug">
                {r.description}
              </div>
              {!r.pass && r.detail && (
                <div className="mt-1 text-[11px] text-destructive/80 truncate">
                  {r.detail}
                </div>
              )}
              {!r.pass && onContentUpdate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 mt-1.5 px-2 text-[11px]"
                  disabled={busy}
                  onClick={() => handleFixOne(r)}
                >
                  {fixingId === r.id ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Fixing…</>
                  ) : (
                    <><Wand2 className="h-3 w-3 mr-1" /> Fix this</>
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default NonCommodityComplianceChecker;
