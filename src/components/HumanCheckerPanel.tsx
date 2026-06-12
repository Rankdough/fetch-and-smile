import { useState } from "react";
import { diffWords } from "diff";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, GitCompare, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const PANEL_BUILD = "BUILD-2026-06-12-review-fix-diff-v1";

interface ReviewResult {
  correctedArticle: string;
  summary: string;
}

interface Props {
  content: string;
  topic: string;
  onContentUpdate?: (content: string) => void;
}

function WordDiff({ original, corrected }: { original: string; corrected: string }) {
  const parts = diffWords(original, corrected);
  let addCount = 0;
  let removeCount = 0;
  parts.forEach(p => {
    if (p.added) addCount += (p.value.match(/\S+/g) || []).length;
    if (p.removed) removeCount += (p.value.match(/\S+/g) || []).length;
  });

  return (
    <div>
      <div className="flex gap-3 text-[11px] mb-2">
        <span className="text-emerald-600 dark:text-emerald-400">+{addCount} added</span>
        <span className="text-destructive">−{removeCount} removed</span>
      </div>
      <div className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap overflow-auto max-h-80 rounded-md border p-3 bg-muted/20">
        {parts.map((part, i) => {
          if (part.added) {
            return (
              <mark key={i} className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 rounded-sm">
                {part.value}
              </mark>
            );
          }
          if (part.removed) {
            return (
              <del key={i} className="bg-red-100 dark:bg-red-900/30 text-destructive rounded-sm">
                {part.value}
              </del>
            );
          }
          return <span key={i} className="text-muted-foreground">{part.value}</span>;
        })}
      </div>
    </div>
  );
}

export function HumanCheckerPanel({ content, topic, onContentUpdate }: Props) {
  console.log(PANEL_BUILD);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function runFlow() {
    if (!content?.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAccepted(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("run-review-pass", {
        body: { content, topic },
      });
      console.log("run-review-pass response", data);
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
    if (!result?.correctedArticle || !onContentUpdate) {
      if (!onContentUpdate) {
        setError("Accept is not wired to the article editor — onContentUpdate is undefined. This is a configuration issue.");
      }
      return;
    }
    console.log("[Accept] applying corrected article, length=", result.correctedArticle.length);
    onContentUpdate(result.correctedArticle);
    setAccepted(true);
    const diffParts = diffWords(content, result.correctedArticle);
    const addCount = diffParts.filter(p => p.added).reduce((n, p) => n + (p.value.match(/\S+/g) || []).length, 0);
    const removeCount = diffParts.filter(p => p.removed).reduce((n, p) => n + (p.value.match(/\S+/g) || []).length, 0);
    toast({
      title: "Flow review applied",
      description: `+${addCount} words added, −${removeCount} removed.`,
    });
  }

  function handleDiscard() {
    setResult(null);
    setError(null);
    setAccepted(false);
  }

  // Evaluate result state
  const corrected = result?.correctedArticle ?? "";
  const isUnchanged = !!result && corrected.trim() === content.trim();
  const lengthRatio = corrected.length > 0 ? corrected.length / content.length : null;
  const isTruncated = lengthRatio !== null && lengthRatio < 0.7;
  const hasFix = !!corrected && !isUnchanged && !isTruncated;

  return (
    <div className="mt-4 space-y-2">
      <Button
        variant="outline"
        className="w-full"
        disabled={loading || !content?.trim()}
        onClick={runFlow}
      >
        {loading ? (
          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Reviewing…</>
        ) : (
          <><GitCompare className="h-3.5 w-3.5 mr-1.5" />Review & Fix Flow</>
        )}
      </Button>

      {error && (
        <p className="text-xs text-destructive leading-snug border border-destructive/30 rounded p-2 bg-destructive/5">
          {error}
        </p>
      )}

      {result && !accepted && (
        <div className="rounded-md border p-3 space-y-3">

          {/* Summary — always above the diff */}
          <div className="text-sm leading-relaxed text-foreground border-l-2 border-primary/50 pl-3">
            {result.summary
              ? result.summary
              : <span className="text-muted-foreground italic">Model returned no summary.</span>
            }
          </div>

          {/* No changes */}
          {isUnchanged && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 text-center">
              Review complete — no changes recommended.
            </div>
          )}

          {/* Truncation warning — shown before Accept, not after */}
          {isTruncated && (
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Corrected article is {Math.round(lengthRatio * 100)}% of original length — model likely truncated. Accept disabled. Discard and try again.
              </span>
            </div>
          )}

          {/* Diff */}
          {hasFix && (
            <WordDiff original={content} corrected={corrected} />
          )}

          {/* Empty correctedArticle (no fix, no unchanged, no truncation) */}
          {!isUnchanged && !hasFix && !isTruncated && (
            <p className="text-xs text-muted-foreground">
              Model returned no corrected article — no changes to apply.
            </p>
          )}

          {/* Accept / Discard */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleAccept}
              disabled={!hasFix || !onContentUpdate}
              className="flex-1"
            >
              Accept & apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDiscard}
              className="flex-1"
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      {accepted && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
          <Check className="h-3.5 w-3.5 shrink-0" />
          Flow review applied — article updated.
        </div>
      )}
    </div>
  );
}
