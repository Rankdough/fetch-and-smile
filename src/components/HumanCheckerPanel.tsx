import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

interface HumanCheckResult {
  readerProfile: string;
  step1Flags: string;
  step2Analysis: string;
  step3Flags: string;
}

interface Props {
  content: string;
  topic: string;
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

export function HumanCheckerPanel({ content, topic }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HumanCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    if (!content?.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
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
          <Section title="Reader Profile"    body={result.readerProfile}  defaultOpen={true} />
          <Section title="Step 1 — Flags"    body={result.step1Flags} />
          <Section title="Step 2 — Quality"  body={result.step2Analysis} />
          <Section title="Step 3 — Structural" body={result.step3Flags} />
        </div>
      )}
    </div>
  );
}
