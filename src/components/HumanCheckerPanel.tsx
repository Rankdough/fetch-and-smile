import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, ClipboardCheck, Loader2, Wand2, ChevronDown, ChevronUp } from "lucide-react";

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

// Parse a raw text block from the backend into individual flag strings.
// Handles newline-separated lines, bullet lists, numbered lists, and
// paragraph runs where the model returned one long block without newlines.
function parseFlags(text: string): string[] {
  if (!text?.trim()) return [];

  // Try newline split first; fall back to sentence split for prose blocks
  const raw = text.split("\n").map(l => l.trim()).filter(l => l.length > 4);
  const candidates = raw.length > 1
    ? raw
    : text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 4);

  return candidates
    .map(l =>
      l
        .replace(/^[-*•]\s*/, "")
        .replace(/^\d+[.)]\s*/, "")
        .replace(/^\[(FLAG|ISSUE|ACTION|FINDING|FIX|STEP\s*\d)\]\s*/i, "")
        .replace(/^\*\*(.+)\*\*$/, "$1")
        .trim()
    )
    .filter(l => l.length > 4);
}

// Split "Title: description text" at first ": " within 70 chars.
// Falls back to first 6 words as title if no colon found.
function splitFlag(text: string): { title: string; description: string } {
  const colonIdx = text.indexOf(": ");
  if (colonIdx > 0 && colonIdx < 70) {
    return { title: text.slice(0, colonIdx), description: text.slice(colonIdx + 2) };
  }
  const words = text.split(" ");
  return {
    title: words.slice(0, 6).join(" "),
    description: words.slice(6).join(" "),
  };
}

interface FlagRowProps {
  text: string;
  onFix?: () => void;
  fixApplied: boolean;
  fixing: boolean;
  canFix: boolean;
}

function FlagRow({ text, onFix, fixApplied, fixing, canFix }: FlagRowProps) {
  const { title, description } = splitFlag(text);
  return (
    <div className={`flex items-start gap-2 rounded-md border p-2 transition-colors ${
      fixApplied
        ? "border-emerald-500/40 bg-emerald-500/10"
        : "border-border/60 bg-card/50"
    }`}>
      <div className="mt-0.5">
        {fixApplied ? (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </div>
        ) : (
          <X className="h-4 w-4 text-destructive" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium leading-tight ${fixApplied ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
          {title}
        </div>
        {description && (
          <div className="text-[11px] text-muted-foreground leading-snug">
            {description}
          </div>
        )}
        {canFix && !fixApplied && onFix && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 mt-1.5 px-2 text-[11px]"
            disabled={fixing}
            onClick={onFix}
          >
            {fixing ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Fixing…</>
            ) : (
              <><Wand2 className="h-3 w-3 mr-1" />Fix this</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

interface StepSectionProps {
  title: string;
  text: string;
  canFix: boolean;
  onFix: () => void;
  fixApplied: boolean;
  fixing: boolean;
  defaultOpen?: boolean;
}

function StepSection({ title, text, canFix, onFix, fixApplied, fixing, defaultOpen = false }: StepSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const flags = parseFlags(text);
  if (flags.length === 0) return null;

  return (
    <div className="border rounded-md">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {flags.length} flag{flags.length !== 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 border-t pt-2">
          {flags.map((flag, i) => (
            <FlagRow
              key={i}
              text={flag}
              canFix={canFix}
              onFix={onFix}
              fixApplied={fixApplied}
              fixing={fixing}
            />
          ))}
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
  const [fixing, setFixing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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

  async function applyFix() {
    if (!result?.correctedContent || !onContentUpdate) return;
    // Guard: reject if corrected content is less than 70% of original length —
    // indicates the LLM truncated the article instead of correcting it.
    if (result.correctedContent.length < content.length * 0.7) {
      setError(
        `Fix blocked: corrected content is ${Math.round((result.correctedContent.length / content.length) * 100)}% of original length — the model likely truncated the article. Run Human Check again or apply fixes manually.`
      );
      return;
    }
    setFixing(true);
    try {
      onContentUpdate(result.correctedContent);
      setApplied(true);
    } finally {
      setFixing(false);
    }
  }

  const canFix = !!result?.correctedContent && !!onContentUpdate && !applied;

  const totalFlags =
    parseFlags(result?.priorityActions ?? "").length +
    parseFlags(result?.step1Flags ?? "").length +
    parseFlags(result?.step2Analysis ?? "").length +
    parseFlags(result?.step3Flags ?? "").length;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Human Check
          </span>
          <div className="flex items-center gap-2">
            {result && (
              <span className="text-xs font-medium text-muted-foreground">
                {totalFlags} flag{totalFlags !== 1 ? "s" : ""}
              </span>
            )}
            <Button size="sm" onClick={runCheck} disabled={loading || !content?.trim()}>
              {loading
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analysing…</>
                : "Run Human Check"
              }
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {(error || result) && (
        <CardContent className="space-y-2">
          {error && <p className="text-xs text-red-500">{error}</p>}

          {result && (
            <>
              {canFix && (
                <Button
                  size="sm"
                  variant="default"
                  className="w-full"
                  disabled={fixing}
                  onClick={applyFix}
                >
                  {fixing
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Applying…</>
                    : <><Wand2 className="h-3.5 w-3.5 mr-1.5" />Apply all fixes</>
                  }
                </Button>
              )}

              {applied && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  Fix applied to article.
                </div>
              )}

              {result.readerProfile && (
                <div className="border rounded-md">
                  <button
                    className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-left"
                    onClick={() => setProfileOpen(o => !o)}
                  >
                    {profileOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    Reader Profile
                  </button>
                  {profileOpen && (
                    <div className="px-3 pb-3 border-t pt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                      {result.readerProfile}
                    </div>
                  )}
                </div>
              )}

              <StepSection
                title="Priority Actions"
                text={result.priorityActions}
                canFix={canFix}
                onFix={applyFix}
                fixApplied={applied}
                fixing={fixing}
                defaultOpen={true}
              />
              <StepSection
                title="Step 1 — Reader Flags"
                text={result.step1Flags}
                canFix={canFix}
                onFix={applyFix}
                fixApplied={applied}
                fixing={fixing}
              />
              <StepSection
                title="Step 2 — Quality"
                text={result.step2Analysis}
                canFix={canFix}
                onFix={applyFix}
                fixApplied={applied}
                fixing={fixing}
              />
              <StepSection
                title="Step 3 — Structural"
                text={result.step3Flags}
                canFix={canFix}
                onFix={applyFix}
                fixApplied={applied}
                fixing={fixing}
              />

              {result.fixLog?.length > 0 && (
                <div className="border rounded-md">
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                    Fix Log ({result.fixLog.length})
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    {result.fixLog.map((line, i) => (
                      <p key={i} className="text-[11px] text-muted-foreground leading-snug">{line}</p>
                    ))}
                  </div>
                </div>
              )}

              {!canFix && !applied && totalFlags === 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  No flags found — article may already be optimal.
                </p>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
