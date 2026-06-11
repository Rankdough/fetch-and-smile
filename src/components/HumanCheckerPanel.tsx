import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

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

function Section({ title, body, defaultOpen = false }: { title: string; body: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!body) return null;
  return (
    <div className="border rounded mb-2">
      <button
        className="w-full flex justify-between items-center px-3 py-2 text-sm font-medium text-left"
        onClick={() => setOpen(o => !o)}
      >
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs whitespace-pre-wrap text-muted-foreground">
          {body}
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

  const hasfix = !!result?.correctedContent && !!onContentUpdate;

  return (
    <div className="border rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Human Check</h3>
        <div className="flex gap-2">
          {hasfix && (
            <Button size="sm" variant="outline" onClick={applyFix} disabled={applied}>
              {applied ? "Applied" : "Apply Fix"}
            </Button>
          )}
          <Button size="sm" onClick={runCheck} disabled={loading || !content?.trim()}>
            {loading ? "Analysing..." : "Run Human Check"}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {result && (
        <div>
          <Section title="Priority Actions"    body={result.priorityActions}  defaultOpen={true} />
          <Section title="Reader Profile"      body={result.readerProfile} />
          <Section title="Step 1 — Flags"      body={result.step1Flags} />
          <Section title="Step 2 — Quality"    body={result.step2Analysis} />
          <Section title="Step 3 — Structural" body={result.step3Flags} />
          {result.fixLog?.length > 0 && (
            <Section title={`Fix Log (${result.fixLog.length})`} body={result.fixLog.join("\n")} />
          )}
        </div>
      )}
    </div>
  );
}
