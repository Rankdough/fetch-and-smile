import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, FileSearch, Loader2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ContextFile {
  name: string;
  content: string;
}

interface SourceGroundingCheckerProps {
  content: string;
  contextFiles?: ContextFile[];
  transcriptText?: string;
  transcriptTitle?: string;
  onContentUpdate?: (newContent: string) => void;
  useFirstPerson?: boolean;
  /** Minimum combined (context + transcript) attribution percentage required. Default 50. */
  benchmarkPct?: number;
}

// Grounding scorer — designed to recognise paraphrased content, not just
// verbatim copies. A sentence is "grounded" when a meaningful share of its
// content tokens (unigrams) AND at least one bigram appear in the source
// corpus. Pure 5-word shingle matching was far too strict and scored real
// paraphrased articles at near-zero.
const UNIGRAM_RECALL_THRESHOLD = 0.55; // ≥55% of content tokens must exist in sources
const MIN_BIGRAM_HITS = 1;             // and at least one shared bigram
const MIN_SENTENCE_WORDS = 6;

const SKIP_H2 =
  /^\s*(tl;?dr|quick tips|in this article|how to choose|frequently asked questions|faq|final thoughts|references|sources?|methodology)\s*$/i;

const STOPWORDS = new Set(
  "a an the and or but if then so of in on at to for from by with as is are was were be been being it its this that these those you your we our they their he she his her i me my do does did has have had can could should would will shall may might must about into over under more most than such also very just only because while when where which what who whom whose how why".split(
    /\s+/,
  ),
);

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Light stemmer: strips common English suffixes so "implants" matches "implant".
function stem(w: string): string {
  if (w.length <= 4) return w;
  for (const suf of ["ingly", "edly", "ies", "ing", "ed", "es", "ly", "s"]) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
  }
  return w;
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter(w => w && !STOPWORDS.has(w) && w.length > 2)
    .map(stem);
}

function buildVocab(text: string): { unigrams: Set<string>; bigrams: Set<string> } {
  const toks = tokens(text);
  const unigrams = new Set(toks);
  const bigrams = new Set<string>();
  for (let i = 0; i < toks.length - 1; i++) bigrams.add(toks[i] + " " + toks[i + 1]);
  return { unigrams, bigrams };
}

/** Strip structural / utility sections so we only score actual body prose. */
function extractProseSentences(content: string): string[] {
  const text = content || "";
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let skip = false;
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      skip = SKIP_H2.test(h[1]);
      continue;
    }
    if (/^#\s+/.test(line)) continue; // H1
    if (skip) continue;
    if (/^\s*\|/.test(line)) continue; // tables
    if (/^\s*[-*+]\s+/.test(line)) continue; // bullets
    if (/^\s*\d+\.\s+/.test(line)) continue; // numbered lists
    if (/^\s*!?\[/.test(line)) continue; // images / link-only
    kept.push(line);
  }
  const prose = kept.join(" ").replace(/<[^>]+>/g, " ");
  // Split on sentence boundaries.
  const raw = prose.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  return raw
    .map(s => s.trim())
    .filter(s => s && tokens(s).length >= MIN_SENTENCE_WORDS);
}

interface GroundingStats {
  totalSentences: number;
  contextOnly: number;
  transcriptOnly: number;
  both: number;
  unattributed: number;
  contextPct: number;
  transcriptPct: number;
  combinedPct: number;
  hasTranscript: boolean;
  hasContext: boolean;
  ungroundedSamples: string[];
}

function evaluateGrounding(
  content: string,
  contextFiles: ContextFile[],
  transcriptText: string,
): GroundingStats {
  const contextCorpus = (contextFiles || []).map(f => f.content || "").join("\n\n");
  const transcriptCorpus = transcriptText || "";

  const contextShingles = buildShingles(contextCorpus);
  const transcriptShingles = buildShingles(transcriptCorpus);

  const sentences = extractProseSentences(content);
  let contextOnly = 0;
  let transcriptOnly = 0;
  let both = 0;
  let unattributed = 0;
  const ungroundedSamples: string[] = [];

  for (const sent of sentences) {
    const sentShingles = buildShingles(sent);
    if (sentShingles.size === 0) continue;
    let ctxHits = 0;
    let trHits = 0;
    for (const sh of sentShingles) {
      if (contextShingles.has(sh)) ctxHits++;
      if (transcriptShingles.has(sh)) trHits++;
    }
    const ctxRatio = ctxHits / sentShingles.size;
    const trRatio = trHits / sentShingles.size;
    const inCtx = ctxRatio >= SENTENCE_MATCH_THRESHOLD;
    const inTr = trRatio >= SENTENCE_MATCH_THRESHOLD;
    if (inCtx && inTr) both++;
    else if (inCtx) contextOnly++;
    else if (inTr) transcriptOnly++;
    else {
      unattributed++;
      if (ungroundedSamples.length < 3) ungroundedSamples.push(sent.slice(0, 140));
    }
  }

  const total = sentences.length || 1;
  const contextPct = Math.round(((contextOnly + both) / total) * 100);
  const transcriptPct = Math.round(((transcriptOnly + both) / total) * 100);
  const combinedPct = Math.round(
    ((contextOnly + transcriptOnly + both) / total) * 100,
  );

  return {
    totalSentences: sentences.length,
    contextOnly,
    transcriptOnly,
    both,
    unattributed,
    contextPct,
    transcriptPct,
    combinedPct,
    hasTranscript: transcriptCorpus.trim().length > 0,
    hasContext: contextCorpus.trim().length > 0,
    ungroundedSamples,
  };
}

export function SourceGroundingChecker({
  content,
  contextFiles = [],
  transcriptText = "",
  transcriptTitle = "",
  onContentUpdate,
  useFirstPerson = false,
  benchmarkPct = 50,
}: SourceGroundingCheckerProps) {
  const stats = useMemo(
    () => evaluateGrounding(content || "", contextFiles, transcriptText),
    [content, contextFiles, transcriptText],
  );

  const [fixing, setFixing] = useState(false);
  const passes = stats.combinedPct >= benchmarkPct;

  const runFix = async () => {
    if (!onContentUpdate) {
      toast({ title: "Cannot apply fix", description: "Content updater unavailable.", variant: "destructive" });
      return;
    }
    if (!content.trim()) {
      toast({ title: "No content", description: "Generate an article first.", variant: "destructive" });
      return;
    }
    if (!stats.hasContext && !stats.hasTranscript) {
      toast({ title: "No sources", description: "Upload at least one context file before grounding.", variant: "destructive" });
      return;
    }

    setFixing(true);
    let working = content;
    let last = stats;
    const MAX_ATTEMPTS = 3;
    let attempt = 0;

    try {
      while (attempt < MAX_ATTEMPTS) {
        attempt++;
        const current = evaluateGrounding(working, contextFiles, transcriptText);
        last = current;
        if (current.combinedPct >= benchmarkPct) break;

        const retryPreamble =
          attempt > 1
            ? `RETRY ${attempt - 1}/${MAX_ATTEMPTS - 1} — grounding is still ${current.combinedPct}% (target ≥${benchmarkPct}%). Rewrite more ungrounded sentences using ONLY material present in the provided sources.\n\n`
            : "";

        const sourceList = [
          stats.hasContext ? "the uploaded CONTEXT FILES" : null,
          stats.hasTranscript ? `the pasted TRANSCRIPT${transcriptTitle ? ` ("${transcriptTitle}")` : ""}` : null,
        ]
          .filter(Boolean)
          .join(" and ");

        const sampleBlock = current.ungroundedSamples.length
          ? `\n\nExamples of ungrounded sentences currently in the article (rewrite or remove these first):\n${current.ungroundedSamples.map(s => `  – "${s}…"`).join("\n")}`
          : "";

        const instruction = `${retryPreamble}SOURCE GROUNDING REWRITE. At least ${benchmarkPct}% of the body prose sentences must be substantively derived from ${sourceList}. Current grounding: ${current.combinedPct}% (context ${current.contextPct}%, transcript ${current.transcriptPct}%, unattributed ${current.unattributed}/${current.totalSentences} sentences).

Rules:
- Rewrite ungrounded body-prose sentences so they restate, quote, or paraphrase specific facts, numbers, names, examples, or arguments that actually appear in the provided sources.
- Do NOT invent new statistics, studies, names, dates, or quotes that are not present in the sources.
- Preserve ALL existing headings, tables, lists, links, images, CTA blocks, References, FAQ, How to Choose, TL;DR, and Quick Tips exactly.
- Preserve paragraph density: every paragraph ≤60 words and ≤3 sentences.
- Keep the article roughly the same length.
- Return the FULL article in markdown.${sampleBlock}`;

        const { data, error } = await supabase.functions.invoke("voice-edit-content", {
          body: { content: working, instruction, useFirstPerson },
        });
        if (error) throw new Error(error.message || "Edge function failed");
        if (data?.error) throw new Error(data.error);
        if (!data?.content) throw new Error("No content returned");
        working = data.content;
      }

      onContentUpdate(working);
      const finalStats = evaluateGrounding(working, contextFiles, transcriptText);
      if (finalStats.combinedPct >= benchmarkPct) {
        toast({
          title: "Grounding fixed",
          description: `Now ${finalStats.combinedPct}% sourced (≥${benchmarkPct}%)${attempt > 1 ? ` · ${attempt} attempts` : ""}.`,
        });
      } else {
        toast({
          title: "Partial fix",
          description: `Reached ${finalStats.combinedPct}% after ${attempt} attempts (target ≥${benchmarkPct}%). Try again or add more context.`,
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Grounding fix error:", err);
      toast({ title: "Fix failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setFixing(false);
    }
  };

  const Bar = ({ pct, color }: { pct: number; color: string }) => (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-primary" />
            Source Grounding Validator
          </span>
          <span
            className={`flex items-center gap-1 text-xs font-medium ${
              passes ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
            }`}
          >
            {passes ? (
              <>
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                </div>
                {stats.combinedPct}% / ≥{benchmarkPct}%
              </>
            ) : (
              <>
                <X className="h-4 w-4" />
                {stats.combinedPct}% / ≥{benchmarkPct}%
              </>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={`rounded-md border p-2.5 ${
            passes
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-destructive/40 bg-destructive/5"
          }`}
        >
          <div className="text-[11px] text-muted-foreground mb-2">
            Benchmark: ≥{benchmarkPct}% of body-prose sentences must derive from context files{stats.hasTranscript ? " or transcript" : ""}.
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className="font-medium">Context files</span>
                <span className="tabular-nums">{stats.contextPct}%</span>
              </div>
              <Bar pct={stats.contextPct} color="bg-primary" />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className="font-medium">
                  Transcript {stats.hasTranscript ? "" : <span className="text-muted-foreground font-normal">(not provided)</span>}
                </span>
                <span className="tabular-nums">{stats.transcriptPct}%</span>
              </div>
              <Bar pct={stats.transcriptPct} color="bg-blue-500" />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className="font-medium">Unattributed (model-invented)</span>
                <span className="tabular-nums">{Math.max(0, 100 - stats.combinedPct)}%</span>
              </div>
              <Bar pct={Math.max(0, 100 - stats.combinedPct)} color="bg-destructive" />
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[10px] text-muted-foreground">
            <div>Sentences scored: <span className="font-medium text-foreground tabular-nums">{stats.totalSentences}</span></div>
            <div>Combined: <span className={`font-medium tabular-nums ${passes ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{stats.combinedPct}%</span></div>
            <div>From context: <span className="font-medium text-foreground tabular-nums">{stats.contextOnly + stats.both}</span></div>
            <div>From transcript: <span className="font-medium text-foreground tabular-nums">{stats.transcriptOnly + stats.both}</span></div>
            <div className="col-span-2">Ungrounded sentences: <span className="font-medium text-destructive tabular-nums">{stats.unattributed}</span></div>
          </div>
        </div>

        {!passes && stats.ungroundedSamples.length > 0 && (
          <div className="rounded-md border border-border/60 bg-card/50 p-2">
            <div className="text-[11px] font-medium mb-1">Examples of ungrounded sentences:</div>
            <ul className="space-y-1">
              {stats.ungroundedSamples.map((s, i) => (
                <li key={i} className="text-[11px] text-muted-foreground italic leading-snug">
                  "{s}…"
                </li>
              ))}
            </ul>
          </div>
        )}

        {!passes && onContentUpdate && (
          <Button size="sm" variant="default" className="w-full" disabled={fixing} onClick={runFix}>
            {fixing ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Re-grounding…</>
            ) : (
              <><Wand2 className="h-3.5 w-3.5 mr-1.5" /> Re-ground article to ≥{benchmarkPct}%</>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default SourceGroundingChecker;
