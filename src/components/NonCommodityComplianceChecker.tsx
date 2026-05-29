import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, ShieldCheck } from "lucide-react";

interface NonCommodityComplianceCheckerProps {
  content: string;
}

interface RuleResult {
  id: number;
  title: string;
  description: string;
  pass: boolean;
  detail?: string;
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
  const totalWords = plain.split(/\s+/).filter(Boolean).length;

  // 1. Under-45-word snippet blocks immediately below H2/H3
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

  // 2. Heavy relative-pronoun chains (this/it/they) starting consecutive sentences
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

  // 3. Server-rendered table syntax (markdown pipe table or <table>)
  const r3Pass = /\|[^\n]+\|\s*\n\s*\|?\s*:?-{2,}/.test(text) || /<table[\s>]/i.test(text);

  // 4. Information-gain disclosures: at least one number/statistic/data point
  const numericMatches = (plain.match(/\b\d{1,3}(?:[.,]\d+)?\s?(?:%|percent|years?|months?|days?|hours?|mm|cm|kg|mg|usd|eur|£|\$)/gi) || []).length;
  const r4Pass = numericMatches >= 3;

  // 5. Zero marketing hyperbole
  const foundHyperbole = HYPERBOLE.filter(w => new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(plain));
  const r5Pass = foundHyperbole.length === 0;

  // 6. Methodology statement
  const r6Pass = /\bmethodology\b/i.test(plain);

  // 7. Defensive hedging (count unquantified hedges)
  const hedgeCount = HEDGES.reduce((acc, h) => acc + (plain.match(new RegExp(`\\b${h}\\b`, "gi")) || []).length, 0);
  const r7Pass = hedgeCount <= 2;

  // 8. Literal intent proximity: numeric data within top 30%
  const top = plain.slice(0, Math.max(400, Math.floor(plain.length * 0.3)));
  const r8Pass = /\b\d/.test(top);

  // 9. Chronological risk mitigation: timelines/deadlines language
  const r9Pass = /\b(timeline|deadline|week\s*\d|day\s*\d|month\s*\d|within\s+\d+\s+(?:days|weeks|months|hours)|by\s+(?:day|week|month)\s*\d)\b/i.test(plain);

  // 10. Structural terminus guard: bare trailing number or unclosed tag at line end
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

  return [
    { id: 1, title: "Under-45-Word Snippet Blocks", description: "First block under each H2/H3 ≤ 45 words", pass: r1Pass, detail: r1Detail },
    { id: 2, title: "Complete Conceptual Sentence Isolation", description: "No 3+ consecutive sentences leaning on this/it/they", pass: r2Pass, detail: maxChain >= 3 ? `${maxChain}-sentence pronoun chain` : "" },
    { id: 3, title: "Server-Rendered Table Layouts", description: "Hardcoded table syntax present", pass: r3Pass },
    { id: 4, title: "Explicit Information-Gain Disclosures", description: "≥3 concrete data points (numbers/units)", pass: r4Pass, detail: `${numericMatches} data points` },
    { id: 5, title: "Zero Marketing Hyperbole", description: "No fluff adjectives", pass: r5Pass, detail: foundHyperbole.join(", ") },
    { id: 6, title: "Hard Procedural Methodology Statements", description: "Contains a 'Methodology' description", pass: r6Pass },
    { id: 7, title: "Zero Defensive Hedging", description: "≤2 unquantified hedges (typically/varies/depends)", pass: r7Pass, detail: `${hedgeCount} hedges` },
    { id: 8, title: "Literal Intent Proximity", description: "Top 30% contains immediate data", pass: r8Pass },
    { id: 9, title: "Chronological Risk Mitigation", description: "Maps timelines/deadlines/hurdles", pass: r9Pass },
    { id: 10, title: "Structural Terminus Guard", description: "No bare trailing numbers or unclosed tags", pass: r10Pass, detail: r10Detail },
  ];
}

export function NonCommodityComplianceChecker({ content }: NonCommodityComplianceCheckerProps) {
  const results = useMemo(() => evaluate(content || ""), [content]);
  const passed = results.filter(r => r.pass).length;

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
        {results.map(r => (
          <div
            key={r.id}
            className="flex items-start gap-2 rounded-md border border-border/60 bg-card/50 p-2"
          >
            <div className="mt-0.5">
              {r.pass ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <X className="h-4 w-4 text-destructive" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium leading-tight">
                Rule {r.id}: {r.title}
              </div>
              <div className="text-[11px] text-muted-foreground leading-snug">
                {r.description}
              </div>
              {!r.pass && r.detail && (
                <div className="mt-1 text-[11px] text-destructive/80 truncate">
                  {r.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default NonCommodityComplianceChecker;
