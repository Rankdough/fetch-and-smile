import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GitCompare, Loader2 } from "lucide-react";

interface ReviewResult {
  correctedArticle: string;
  summary: string;
}

interface Props {
  content: string;
  topic: string;
  onContentUpdate?: (content: string) => void;
}

export function HumanCheckerPanel({ content, topic, onContentUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runFlow() {
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

  function handleAccept() {
    if (!result?.correctedArticle || !onContentUpdate) return;
    // Guard: block if corrected article is less than 70% of original length.
    if (result.correctedArticle.length < content.length * 0.7) {
      setError(
        `Blocked: corrected article is ${Math.round((result.correctedArticle.length / content.length) * 100)}% of original length — model may have truncated. Discard and try again.`
      );
      return;
    }
    onContentUpdate(result.correctedArticle);
    setResult(null);
    setError(null);
  }

  function handleDiscard() {
    setResult(null);
    setError(null);
  }

  return (
    <div className="mt-4">
      <Button
        variant="outline"
        className="w-full"
        disabled={loading || !content?.trim()}
        onClick={runFlow}
      >
        {loading
          ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Reviewing…</>
          : <><GitCompare className="h-3.5 w-3.5 mr-1.5" />Review & Fix Flow</>
        }
      </Button>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Original</div>
              <div className="border rounded-md p-3 text-[11px] font-mono leading-relaxed overflow-auto max-h-96 whitespace-pre-wrap bg-muted/30">
                {content}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Corrected</div>
              <div className="border rounded-md border-emerald-500/40 p-3 text-[11px] font-mono leading-relaxed overflow-auto max-h-96 whitespace-pre-wrap bg-emerald-500/5">
                {result.correctedArticle}
              </div>
            </div>
          </div>

          {result.summary && (
            <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/40 pl-3">
              {result.summary}
            </p>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={handleAccept} disabled={!onContentUpdate} className="flex-1">
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={handleDiscard} className="flex-1">
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
