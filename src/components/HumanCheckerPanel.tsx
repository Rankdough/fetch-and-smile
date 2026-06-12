import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, ClipboardCheck, Loader2, Wand2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface HumanCheckResult {
  readerProfile: string;
  priorityActions: string;
  step1Flags: string;
  step2Analysis: string;
  step3Flags: string;
  correctedContent: string;
  fixLog: string[];
}

interface Flag {
  id: string;
  step: string;
  text: string;
}

interface Props {
  content: string;
  topic: string;
  onContentUpdate?: (content: string) => void;
  useFirstPerson?: boolean;
}

// Parse a raw text block from the backend into individual flag strings.
function parseFlags(text: string): string[] {
  if (!text?.trim()) return [];
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

function splitFlag(text: string): { title: string; description: string } {
  const cleaned = text.replace(/\*\*/g, "");
  const colonIdx = cleaned.indexOf(": ");
  if (colonIdx > 0 && colonIdx < 80) {
    return { title: cleaned.slice(0, colonIdx), description: cleaned.slice(colonIdx + 2) };
  }
  const words = cleaned.split(" ");
  return {
    title: words.slice(0, 6).join(" "),
    description: words.slice(6).join(" "),
  };
}

function buildFlagInstruction(flag: Flag): string {
  return `A senior editor flagged the following issue under "${flag.step}". Apply a surgical fix that resolves ONLY this specific issue.

ISSUE:
${flag.text}

RULES:
- Preserve every other section character-for-character.
- Preserve all markdown structure: ## headings, lists, | tables, **bold**, _italic_.
- Preserve all HTML attributes (id=, itemscope, itemtype, itemprop, class=).
- Preserve all CTA blocks exactly — do not alter a word inside them.
- Preserve all source URLs and reference links exactly.
- Do not add, remove, or reorder H2/H3 headings unless the issue explicitly requires it.
- British English throughout.

Return the FULL article in markdown, not a diff or summary.`;
}

function buildBulkInstruction(flags: Flag[]): string {
  const list = flags
    .map((f, i) => `${i + 1}. [${f.step}] ${f.text}`)
    .join("\n\n");
  return `A senior editor flagged the following issues. Apply surgical fixes that resolve EACH of these issues. Do not rewrite sections that are not flagged.

ISSUES:
${list}

RULES:
- Preserve every unflagged section character-for-character.
- Preserve all markdown structure: ## headings, lists, | tables, **bold**, _italic_.
- Preserve all HTML attributes (id=, itemscope, itemtype, itemprop, class=).
- Preserve all CTA blocks exactly.
- Preserve all source URLs and reference links exactly.
- British English throughout.

Return the FULL article in markdown, not a diff or summary.`;
}

interface FlagRowProps {
  flag: Flag;
  onFix: (flag: Flag) => void;
  fixedIds: Set<string>;
  fixingId: string | null;
  canFix: boolean;
}

function FlagRow({ flag, onFix, fixedIds, fixingId, canFix }: FlagRowProps) {
  const { title, description } = splitFlag(flag.text);
  const fixed = fixedIds.has(flag.id);
  const fixing = fixingId === flag.id;
  return (
    <div className={`flex items-start gap-2 rounded-md border p-2 transition-colors ${
      fixed
        ? "border-emerald-500/40 bg-emerald-500/10"
        : "border-border/60 bg-card/50"
    }`}>
      <div className="mt-0.5">
        {fixed ? (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </div>
        ) : (
          <X className="h-4 w-4 text-destructive" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium leading-tight ${fixed ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
          {title}
          {fixed && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">✓ Fixed</span>}
        </div>
        {description && (
          <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            {description}
          </div>
        )}
        {canFix && !fixed && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 mt-1.5 px-2 text-[11px]"
            disabled={fixingId !== null}
            onClick={() => onFix(flag)}
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
  flags: Flag[];
  onFix: (flag: Flag) => void;
  fixedIds: Set<string>;
  fixingId: string | null;
  canFix: boolean;
  defaultOpen?: boolean;
}

function StepSection({ title, flags, onFix, fixedIds, fixingId, canFix, defaultOpen = false }: StepSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (flags.length === 0) return null;
  const remaining = flags.filter(f => !fixedIds.has(f.id)).length;

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
          {remaining}/{flags.length} flag{flags.length !== 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 border-t pt-2">
          {flags.map(flag => (
            <FlagRow
              key={flag.id}
              flag={flag}
              onFix={onFix}
              fixedIds={fixedIds}
              fixingId={fixingId}
              canFix={canFix}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HumanCheckerPanel({ content, topic, onContentUpdate, useFirstPerson = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HumanCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());
  const [profileOpen, setProfileOpen] = useState(false);

  async function runCheck() {
    if (!content?.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setFixedIds(new Set());
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

  const toFlags = (text: string, step: string, prefix: string): Flag[] =>
    parseFlags(text).map((t, i) => ({ id: `${prefix}-${i}`, step, text: t }));

  const priorityFlags = result ? toFlags(result.priorityActions, "Priority Actions", "p") : [];
  const step1FlagsArr = result ? toFlags(result.step1Flags, "Step 1 — Reader Flags", "s1") : [];
  const step2FlagsArr = result ? toFlags(result.step2Analysis, "Step 2 — Quality", "s2") : [];
  const step3FlagsArr = result ? toFlags(result.step3Flags, "Step 3 — Structural", "s3") : [];
  const allFlags = [...priorityFlags, ...step1FlagsArr, ...step2FlagsArr, ...step3FlagsArr];
  const remainingFlags = allFlags.filter(f => !fixedIds.has(f.id));

  async function runEdit(instruction: string): Promise<boolean> {
    if (!onContentUpdate) {
      toast({ title: "Cannot apply fix", description: "Content updater unavailable.", variant: "destructive" });
      return false;
    }
    if (!content.trim()) {
      toast({ title: "No content", description: "Generate an article first.", variant: "destructive" });
      return false;
    }
    try {
      const { data, error } = await supabase.functions.invoke("voice-edit-content", {
        body: { content, instruction, useFirstPerson },
      });
      if (error) throw new Error(error.message || "Edge function failed");
      if (data?.error) throw new Error(data.error);
      if (!data?.content) throw new Error("No content returned");
      // Guard: block if returned content is <70% of original — model truncated the article.
      if (data.content.length < content.length * 0.7) {
        throw new Error(
          `Fix blocked: result is ${Math.round((data.content.length / content.length) * 100)}% of original length — model may have truncated. Try again.`
        );
      }
      onContentUpdate(data.content);
      return true;
    } catch (err) {
      toast({
        title: "Fix failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      return false;
    }
  }

  async function handleFixOne(flag: Flag) {
    setFixingId(flag.id);
    try {
      const ok = await runEdit(buildFlagInstruction(flag));
      if (ok) {
        setFixedIds(prev => new Set(prev).add(flag.id));
        toast({ title: "Fix applied", description: `${flag.step} — resolved.` });
      }
    } finally {
      setFixingId(null);
    }
  }

  async function handleFixAll() {
    if (remainingFlags.length === 0) return;
    setFixingAll(true);
    try {
      const ok = await runEdit(buildBulkInstruction(remainingFlags));
      if (ok) {
        setFixedIds(prev => {
          const next = new Set(prev);
          remainingFlags.forEach(f => next.add(f.id));
          return next;
        });
        toast({ title: "Fix applied", description: `${remainingFlags.length} flag${remainingFlags.length === 1 ? "" : "s"} resolved.` });
      }
    } finally {
      setFixingAll(false);
    }
  }

  const canFix = !!onContentUpdate;
  const busy = fixingId !== null || fixingAll;

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
                {remainingFlags.length}/{allFlags.length} flag{allFlags.length !== 1 ? "s" : ""}
              </span>
            )}
            <Button size="sm" onClick={runCheck} disabled={loading || busy || !content?.trim()}>
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
              {canFix && remainingFlags.length > 0 && (
                <Button
                  size="sm"
                  variant="default"
                  className="w-full"
                  disabled={busy}
                  onClick={handleFixAll}
                >
                  {fixingAll
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Applying…</>
                    : <><Wand2 className="h-3.5 w-3.5 mr-1.5" />Fix all {remainingFlags.length} failing flag{remainingFlags.length === 1 ? "" : "s"}</>
                  }
                </Button>
              )}

              {allFlags.length > 0 && remainingFlags.length === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  All flags resolved.
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
                flags={priorityFlags}
                onFix={handleFixOne}
                fixedIds={fixedIds}
                fixingId={fixingId}
                canFix={canFix}
                defaultOpen={true}
              />
              <StepSection
                title="Step 1 — Reader Flags"
                flags={step1FlagsArr}
                onFix={handleFixOne}
                fixedIds={fixedIds}
                fixingId={fixingId}
                canFix={canFix}
              />
              <StepSection
                title="Step 2 — Quality"
                flags={step2FlagsArr}
                onFix={handleFixOne}
                fixedIds={fixedIds}
                fixingId={fixingId}
                canFix={canFix}
              />
              <StepSection
                title="Step 3 — Structural"
                flags={step3FlagsArr}
                onFix={handleFixOne}
                fixedIds={fixedIds}
                fixingId={fixingId}
                canFix={canFix}
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

              {allFlags.length === 0 && (
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
