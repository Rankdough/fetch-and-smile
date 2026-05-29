import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Gauge, Loader2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ContentUsefulnessCheckerProps {
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

const ACTIONABLE_VERBS = [
  "check", "verify", "confirm", "inspect", "ask", "request", "measure",
  "compare", "evaluate", "assess", "audit", "review", "test", "calculate",
  "select", "choose", "avoid", "ensure", "look for", "watch for", "demand",
  "require", "schedule", "document", "record",
];

const TEXTBOOK_OPENERS = [
  /\bwhat\s+is\s+(?:a|an|the)\b/i,
  /\b(?:is\s+defined\s+as|refers\s+to)\b/i,
  /\b(?:in\s+general|broadly\s+speaking|historically)\b/i,
];

const STORYTELLING = [
  /\bonce\s+upon\b/i,
  /\b(?:my|our)\s+(?:journey|story|experience)\b/i,
  /\b(?:back\s+in|years\s+ago|when\s+i\s+was)\b/i,
  /\b(?:let\s+me\s+tell\s+you|picture\s+this|imagine)\b/i,
];

function stripCodeAndHtml(s: string) {
  return s.replace(/```[\s\S]*?```/g, " ").replace(/<[^>]+>/g, " ");
}

function evaluate(content: string): RuleResult[] {
  const text = content || "";
  const plain = stripCodeAndHtml(text);

  // Rule 1: Actionable instructional verbs present, textbook openers minimised.
  const verbHits = ACTIONABLE_VERBS.reduce(
    (n, v) => n + (plain.match(new RegExp(`\\b${v}\\b`, "gi")) || []).length,
    0,
  );
  const textbookHits = TEXTBOOK_OPENERS.reduce(
    (n, re) => n + (plain.match(new RegExp(re.source, "gi")) || []).length,
    0,
  );
  const r1Pass = verbHits >= 6 && textbookHits <= 2;

  // Rule 2: Operational failure trap — quantified risk/failure metric.
  const failureMetric = /(\b\d{1,4}(?:[.,]\d+)?\s?(?:%|percent|implants?|cases?|patients?|years?|months?|weeks?|days?|hours?|mm|cm|mg|iu)\b[^.]{0,80}\b(?:risk|failure|complication|rejection|loss|infection|reaction|adverse|threshold|antibod(?:y|ies)|titer|titre|count|level|score))/i;
  const failureKeyword = /\b(?:antibod(?:y|ies)|titer|titre|biopsy|threshold\s+of|cut[- ]?off|adverse\s+event|failure\s+rate|complication\s+rate)\b/i;
  const r2Pass = failureMetric.test(plain) || failureKeyword.test(plain);

  // Rule 3: Structured data — at least one table OR a parameter bullet list (≥3 items).
  const hasTable = /\|[^\n]+\|\s*\n\s*\|?\s*:?-{2,}/.test(text) || /<table[\s>]/i.test(text);
  const bulletGroups = text.match(/(?:^[-*+]\s+.+\n){3,}/gm) || [];
  const r3Pass = hasTable || bulletGroups.length > 0;

  // Rule 4: Definitive Answer Proximity — top 30% must be data-dense, not storytelling.
  const top = plain.slice(0, Math.max(500, Math.floor(plain.length * 0.3)));
  const topData = (top.match(/\b\d{1,4}(?:[.,]\d+)?\s?(?:%|percent|years?|months?|weeks?|days?|hours?|mm|cm|kg|mg|usd|eur|£|\$)/gi) || []).length;
  const topStory = STORYTELLING.some(re => re.test(top));
  const r4Pass = topData >= 2 && !topStory;

  // Rule 5: Methodology disclosure.
  const methodology = /\b(methodology|how\s+(?:we|this\s+(?:guide|article))\s+(?:was\s+)?(?:compiled|researched|built)|auditing\s+primary\s+source|primary[- ]source\s+(?:records?|review)|sources?\s+reviewed|criteria\s+applied)\b/i;
  const r5Pass = methodology.test(plain);

  return [
    {
      id: 1,
      title: "High-Friction Actionable Manual",
      description: "Instructional verbs, no textbook definitions",
      pass: r1Pass,
      detail: `${verbHits} actionable verbs · ${textbookHits} textbook openers`,
      fixInstruction:
        "Rewrite the article so it reads as a step-by-step diagnostic manual the reader can act on. Replace generic textbook definitions (e.g. 'What is X', 'X is defined as…', 'broadly speaking…') with concrete instructional verbs the reader can perform — check, verify, ask, request, inspect, measure, compare, audit, document, schedule. Preserve headings, tables, lists, links, images, and CTAs. Return the full article.",
    },
    {
      id: 2,
      title: "Operational Failure Trap",
      description: "Quantified clinical failure metric or technical warning",
      pass: r2Pass,
      detail: r2Pass ? "" : "No quantified failure/risk metric detected",
      fixInstruction:
        "Add at least one un-googleable, quantified failure trap drawn from the existing context — e.g. a specific risk threshold ('fewer than 50 implants doubles failure risk'), a clinical antibody/titre cut-off, an adverse-event rate, or a measurable complication metric. Integrate it into the relevant body section as a warning, not a footnote. Do not invent statistics. Preserve headings, tables, lists, links, images, and CTAs. Return the full article.",
    },
    {
      id: 3,
      title: "Structural Data Layout",
      description: "Comparison data lives in tables or parameter bullets, not prose",
      pass: r3Pass,
      detail: hasTable ? "table present" : bulletGroups.length ? `${bulletGroups.length} bullet group(s)` : "buried in prose",
      fixInstruction:
        "Pull every comparison, metric set, criteria list, or workflow out of dense prose and surface it as either a markdown pipe table or a parameter bullet list of at least three items. Place each structured block where it adds the most clarity. Do not delete the surrounding prose facts — only restructure. Preserve headings, links, images, and CTAs. Return the full article.",
    },
    {
      id: 4,
      title: "Definitive Answer Proximity",
      description: "Top 30% is data-dense, not storytelling",
      pass: r4Pass,
      detail: `${topData} data points in top 30%${topStory ? " · storytelling detected" : ""}`,
      fixInstruction:
        "Rewrite the opening 30% of the article (intro, TL;DR, and first one or two sections) so it jumps straight into specifications, numbers, thresholds, or timelines drawn from the existing context. Remove personal anecdotes, historical preamble, or 'let me tell you a story' framing. Keep paragraphs short (≤60 words, ≤3 sentences). Preserve headings, tables, lists, links, images, and CTAs. Return the full article.",
    },
    {
      id: 5,
      title: "Methodology Disclosure",
      description: "Explicit research-friction statement present",
      pass: r5Pass,
      detail: r5Pass ? "" : "No methodology disclosure detected",
      fixInstruction:
        "Add a short, explicit methodology disclosure (2-4 sentences) describing the real-world research friction undertaken to compile the data — e.g. primary-source records audited, clinical studies reviewed, criteria applied, evaluation process used. Place it near the top after the TL;DR or near the bottom before References. Use the heading 'Methodology'. Preserve all other content. Return the full article.",
    },
  ];
}

export function ContentUsefulnessChecker({
  content,
  onContentUpdate,
  useFirstPerson = false,
}: ContentUsefulnessCheckerProps) {
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
    const instruction = `Apply the following Usefulness & Value-Gain fixes to the article. Do not rewrite anything that already passes. Preserve markdown structure, headings, tables, lists, links, images, and CTA blocks unless a rule explicitly requires changing them.\n\n${rules.map(r => `• Rule ${r.id} — ${r.title}: ${r.fixInstruction}`).join("\n\n")}`;
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
      console.error("Usefulness fix error:", err);
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
            <Gauge className="h-4 w-4 text-primary" />
            Usefulness & Value-Gain Guard
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
              {r.detail && (
                <div className={`mt-1 text-[11px] truncate ${r.pass ? "text-muted-foreground" : "text-destructive/80"}`}>
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

export default ContentUsefulnessChecker;
