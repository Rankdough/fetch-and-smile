import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";

interface HumanCheckResult {
  readerProfile: string;
  priorityActions: string;
  step1Flags: string;
  step2Analysis: string;
  step3Flags: string;
  correctedContent: string;
  fixLog: string[];
}

interface Props {
  content: string;
  topic: string;
  onContentUpdate?: (content: string) => void;
}

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function renderBody(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" = "ul";
  let k = 0;

  function flushList() {
    if (!listItems.length) return;
    const Tag = listType;
    out.push(
      <Tag key={k++} className={`${Tag === "ul" ? "list-disc" : "list-decimal"} list-inside space-y-1 mb-2 pl-1`}>
        {listItems.map((item, i) => (
          <li key={i} className="text-xs text-foreground leading-relaxed">
            {formatInline(item)}
          </li>
        ))}
      </Tag>
    );
    listItems = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushList(); continue; }

    const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);

    if (bulletMatch) {
      if (listType !== "ul" && listItems.length) flushList();
      listType = "ul";
      listItems.push(bulletMatch[1]);
    } else if (numberedMatch) {
      if (listType !== "ol" && listItems.length) flushList();
      listType = "ol";
      listItems.push(numberedMatch[2]);
    } else {
      flushList();
      // Bold label lines like "NON-COMMODITY: ..."
      const labelMatch = trimmed.match(/^([A-Z][A-Z\s]+):\s*(.*)/);
      if (labelMatch) {
        out.push(
          <p key={k++} className="text-xs mb-1 leading-relaxed">
            <strong>{labelMatch[1]}:</strong>{" "}
            <span className="text-muted-foreground">{formatInline(labelMatch[2])}</span>
          </p>
        );
      } else {
        out.push(
          <p key={k++} className="text-xs text-muted-foreground mb-1 leading-relaxed">
            {formatInline(trimmed)}
          </p>
        );
      }
    }
  }
  flushList();
  return <>{out}</>;
}

interface SectionProps {
  title: string;
  body: string;
  defaultOpen?: boolean;
  onFix?: () => void;
  fixApplied?: boolean;
  canFix?: boolean;
}

function Section({ title, body, defaultOpen = false, onFix, fixApplied, canFix }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (!body) return null;
  return (
    <div className="border rounded mb-2">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          className="flex-1 flex items-center gap-1 text-sm font-medium text-left"
          onClick={() => setOpen(o => !o)}
        >
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {title}
        </button>
        {canFix && onFix && (
          <Button
            size="sm"
            variant={fixApplied ? "secondary" : "outline"}
            className="h-6 px-2 text-xs ml-2"
            onClick={onFix}
            disabled={fixApplied}
          >
            <Wrench size={11} className="mr-1" />
            {fixApplied ? "Applied" : "Fix"}
          </Button>
        )}
      </div>
      {open && (
        <div className="px-3 pb-3 border-t pt-2">
          {renderBody(body)}
        </div>
      )}
    </div>
  );
}

export function HumanCheckerPanel({ content, topic, onContentUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HumanCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function runCheck() {
    if (!content?.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setApplied(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("run-review-pass", {
        body: { content, topic },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function applyFix() {
    if (!result?.correctedContent || !onContentUpdate) return;
    onContentUpdate(result.correctedContent);
    setApplied(true);
  }

  const canFix = !!result?.correctedContent && !!onContentUpdate;

  return (
    <div className="border rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Human Check</h3>
        <Button size="sm" onClick={runCheck} disabled={loading || !content?.trim()}>
          {loading ? "Analysing..." : "Run Human Check"}
        </Button>
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {result && (
        <div>
          <Section
            title="Priority Actions"
            body={result.priorityActions}
            defaultOpen={true}
            canFix={canFix}
            onFix={applyFix}
            fixApplied={applied}
          />
          <Section title="Reader Profile" body={result.readerProfile} />
          <Section
            title="Step 1 — Flags"
            body={result.step1Flags}
            canFix={canFix}
            onFix={applyFix}
            fixApplied={applied}
          />
          <Section
            title="Step 2 — Quality"
            body={result.step2Analysis}
            canFix={canFix}
            onFix={applyFix}
            fixApplied={applied}
          />
          <Section
            title="Step 3 — Structural"
            body={result.step3Flags}
            canFix={canFix}
            onFix={applyFix}
            fixApplied={applied}
          />
          {result.fixLog?.length > 0 && (
            <Section
              title={`Fix Log (${result.fixLog.length})`}
              body={result.fixLog.join("\n")}
            />
          )}
        </div>
      )}
    </div>
  );
}
