import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, TrendingUp, CheckCircle2, AlertCircle, Lightbulb, Target, Sparkles, MessageSquare, Wand2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface QualityScores {
  scores: {
    actionability: { score: number; reasoning: string; improvement: string };
    specificity: { score: number; reasoning: string; improvement: string };
    uniqueness: { score: number; reasoning: string; improvement: string };
    engagement: { score: number; reasoning: string; improvement: string };
    humanness: { score: number; reasoning: string; improvement: string };
  };
  overallScore: number;
  valuePromiseDelivered: boolean;
  valuePromiseAnalysis: string;
  topStrength: string;
  criticalWeakness: string;
}

interface QualityScoringPanelProps {
  content: string;
  topic: string;
  valuePromise: string;
  useFirstPerson?: boolean;
  onContentUpdate?: (newContent: string) => void;
  onCreditUsed?: (action: string, type: "quality_analysis" | "apply_improvements", details?: string) => void;
}

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
};

const getScoreBgColor = (score: number) => {
  if (score >= 80) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 60) return "bg-amber-100 dark:bg-amber-900/30";
  return "bg-red-100 dark:bg-red-900/30";
};

const getScoreLabel = (score: number) => {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Needs Work";
  return "Poor";
};

const ScoreIcon = ({ dimension }: { dimension: string }) => {
  switch (dimension) {
    case "actionability": return <Target className="h-4 w-4" />;
    case "specificity": return <CheckCircle2 className="h-4 w-4" />;
    case "uniqueness": return <Sparkles className="h-4 w-4" />;
    case "engagement": return <MessageSquare className="h-4 w-4" />;
    case "humanness": return <User className="h-4 w-4" />;
    default: return <TrendingUp className="h-4 w-4" />;
  }
};

const DIMENSION_ORDER = ["humanness", "actionability", "specificity", "uniqueness", "engagement"] as const;

export const QualityScoringPanel = ({ content, topic, valuePromise, useFirstPerson = false, onContentUpdate, onCreditUsed }: QualityScoringPanelProps) => {
  const { toast } = useToast();
  const [isScoring, setIsScoring] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [scores, setScores] = useState<QualityScores | null>(null);
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);
  const [preImprovementContent, setPreImprovementContent] = useState<string | null>(null);
  const [selectedDimensions, setSelectedDimensions] = useState<Set<string>>(new Set());
  const [customInstruction, setCustomInstruction] = useState("");

  const toggleDimension = (dim: string) => {
    setSelectedDimensions(prev => {
      const next = new Set(prev);
      if (next.has(dim)) next.delete(dim);
      else next.add(dim);
      return next;
    });
  };

  const handleScoreContent = async () => {
    if (!content.trim()) return;
    setIsScoring(true);
    try {
      const { data, error } = await supabase.functions.invoke("score-content-quality", {
        body: { content, topic, valuePromise },
      });
      if (error) throw error;
      setScores(data);

      // Auto-select all dimensions that need work
      const autoSelect = new Set<string>();
      if (data?.scores) {
        Object.entries(data.scores).forEach(([dim, d]: [string, any]) => {
          if (d.score < 80) autoSelect.add(dim);
        });
      }
      setSelectedDimensions(autoSelect);

      onCreditUsed?.("Score Content", "quality_analysis", `Score: ${data.overallScore}/100`);
      toast({ title: "Quality analysis complete", description: `Overall score: ${data.overallScore}/100` });
    } catch (error) {
      console.error("Scoring error:", error);
      toast({ title: "Scoring failed", description: error instanceof Error ? error.message : "Failed to score content", variant: "destructive" });
    } finally {
      setIsScoring(false);
    }
  };

  const handleApplyImprovements = async () => {
    if (!scores || !onContentUpdate) return;
    if (selectedDimensions.size === 0 && !customInstruction.trim()) {
      toast({ title: "Nothing selected", description: "Select at least one dimension to improve, or add a custom instruction.", variant: "destructive" });
      return;
    }

    setPreImprovementContent(content);
    setIsApplying(true);
    try {
      const improvements: string[] = [];

      // Humanness first if selected
      if (selectedDimensions.has("humanness") && scores.scores.humanness?.improvement) {
        improvements.push(`HIGHEST PRIORITY — HUMANNESS FIX: ${scores.scores.humanness.improvement}. Make this content sound like a real human expert wrote it. Remove AI patterns: formal transitions (Moreover, Furthermore, Additionally), vague descriptors (various, numerous, significant), and uniform sentence structure. Add personality, contractions, rhetorical questions, and varied rhythm.`);
      }

      // Critical weakness if any dimension is selected
      if (scores.criticalWeakness && selectedDimensions.size > 0) {
        improvements.push(`CRITICAL FIX: ${scores.criticalWeakness}`);
      }

      // Other selected dimensions
      (["actionability", "specificity", "uniqueness", "engagement"] as const).forEach((dim) => {
        if (selectedDimensions.has(dim) && scores.scores[dim]?.improvement) {
          improvements.push(`Improve ${dim}: ${scores.scores[dim].improvement}`);
        }
      });

      // Custom instruction
      if (customInstruction.trim()) {
        improvements.push(`CUSTOM INSTRUCTION: ${customInstruction.trim()}`);
      }

      if (!scores.valuePromiseDelivered && scores.valuePromiseAnalysis && selectedDimensions.size > 0) {
        improvements.push(`Fix value promise delivery: ${scores.valuePromiseAnalysis}`);
      }

      const instruction = `Apply these improvements to make the content stronger:\n\n${improvements.join("\n\n")}`;

      const { data, error } = await supabase.functions.invoke("voice-edit-content", {
        body: { content, instruction, useFirstPerson },
      });

      if (error) throw new Error(error.message || "Failed to send a request to the Edge Function");
      if (data?.error) throw new Error(data.error);

      if (data?.content) {
        onContentUpdate(data.content);
        setScores(null);
        setSelectedDimensions(new Set());
        setCustomInstruction("");
        onCreditUsed?.("Apply Improvements", "apply_improvements", `${improvements.length} improvements applied`);
        toast({ title: "Improvements applied", description: "Content has been rewritten. Re-score to see the difference!" });
      } else {
        throw new Error("No content returned from the improvement process");
      }
    } catch (error) {
      console.error("Apply improvements error:", error);
      toast({ title: "Failed to apply improvements", description: error instanceof Error ? error.message : "Could not rewrite content", variant: "destructive" });
    } finally {
      setIsApplying(false);
    }
  };

  if (!scores) {
    return (
      <div className="rounded-lg border bg-gradient-to-r from-primary/5 to-primary/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Quality Analysis
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Score your content on humanness, actionability, specificity, uniqueness & engagement
            </p>
          </div>
          <Button size="sm" onClick={handleScoreContent} disabled={isScoring || !content.trim()}>
            {isScoring ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</> : <><TrendingUp className="h-4 w-4 mr-2" />Score Content</>}
          </Button>
        </div>
      </div>
    );
  }

  const totalSelected = selectedDimensions.size + (customInstruction.trim() ? 1 : 0);

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Quality Analysis
        </h4>
        <div className={cn("text-lg font-bold px-3 py-1 rounded-full", getScoreBgColor(scores.overallScore), getScoreColor(scores.overallScore))}>
          {scores.overallScore}/100
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Tick the dimensions you want to improve, then click Apply Improvements.
      </p>

      {/* Score Grid */}
      <div className="space-y-3">
        {/* Humanness — full width */}
        {scores.scores.humanness && (
          <div className={cn(
            "rounded-lg border transition-all",
            scores.scores.humanness.score < 60 ? "border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10" : "bg-background",
            selectedDimensions.has("humanness") ? "ring-2 ring-primary" : ""
          )}>
            <div className="flex items-start gap-3 p-3">
              <Checkbox
                id="dim-humanness"
                checked={selectedDimensions.has("humanness")}
                onCheckedChange={() => toggleDimension("humanness")}
                className="mt-0.5 flex-shrink-0"
              />
              <button className="flex-1 text-left" onClick={() => setExpandedDimension(expandedDimension === "humanness" ? null : "humanness")}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    <User className="h-4 w-4" />
                    Humanness
                    <span className="text-[10px] text-muted-foreground font-normal ml-1">(30% weight)</span>
                  </span>
                  <span className={cn("text-sm font-bold", getScoreColor(scores.scores.humanness.score))}>
                    {scores.scores.humanness.score}
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", scores.scores.humanness.score >= 80 ? "bg-green-500" : scores.scores.humanness.score >= 60 ? "bg-amber-500" : "bg-red-500")}
                    style={{ width: `${scores.scores.humanness.score}%` }}
                  />
                </div>
                <span className={cn("text-xs mt-1 inline-block", getScoreColor(scores.scores.humanness.score))}>
                  {getScoreLabel(scores.scores.humanness.score)}
                </span>
              </button>
            </div>
            {expandedDimension === "humanness" && (
              <div className="px-3 pb-3 pl-10 space-y-1 border-t pt-2">
                <p className="text-xs text-muted-foreground">{scores.scores.humanness.reasoning}</p>
                <p className="text-xs text-primary font-medium mt-1">{scores.scores.humanness.improvement}</p>
              </div>
            )}
          </div>
        )}

        {/* Other 4 dimensions in 2x2 grid */}
        <div className="grid grid-cols-2 gap-3">
          {DIMENSION_ORDER.filter(d => d !== "humanness").map((dimension) => {
            const data = scores.scores[dimension];
            if (!data) return null;
            const isSelected = selectedDimensions.has(dimension);
            return (
              <div key={dimension} className={cn("rounded-lg border bg-background transition-all", isSelected ? "ring-2 ring-primary" : "")}>
                <div className="flex items-start gap-2 p-3">
                  <Checkbox
                    id={`dim-${dimension}`}
                    checked={isSelected}
                    onCheckedChange={() => toggleDimension(dimension)}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <button className="flex-1 text-left min-w-0" onClick={() => setExpandedDimension(expandedDimension === dimension ? null : dimension)}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium capitalize flex items-center gap-1">
                        <ScoreIcon dimension={dimension} />
                        {dimension}
                      </span>
                      <span className={cn("text-sm font-bold", getScoreColor(data.score))}>{data.score}</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", data.score >= 80 ? "bg-green-500" : data.score >= 60 ? "bg-amber-500" : "bg-red-500")}
                        style={{ width: `${data.score}%` }}
                      />
                    </div>
                    <span className={cn("text-xs mt-1 inline-block", getScoreColor(data.score))}>{getScoreLabel(data.score)}</span>
                  </button>
                </div>
                {expandedDimension === dimension && (
                  <div className="px-3 pb-3 pl-9 border-t pt-2 space-y-1">
                    <p className="text-xs text-muted-foreground">{data.reasoning}</p>
                    <p className="text-xs text-primary font-medium mt-1">{data.improvement}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Value Promise Check */}
      <div className={cn(
        "p-3 rounded-lg border flex items-start gap-2",
        scores.valuePromiseDelivered ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
      )}>
        {scores.valuePromiseDelivered
          ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          : <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        }
        <div>
          <p className={cn("text-sm font-medium", scores.valuePromiseDelivered ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200")}>
            {scores.valuePromiseDelivered ? "Value Promise Delivered" : "Value Promise Not Met"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{scores.valuePromiseAnalysis}</p>
        </div>
      </div>

      {/* Strength & Weakness */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <p className="text-xs font-medium text-green-800 dark:text-green-200 flex items-center gap-1 mb-1">
            <Sparkles className="h-3 w-3" />Top Strength
          </p>
          <p className="text-xs text-green-700 dark:text-green-300">{scores.topStrength}</p>
        </div>
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1 mb-1">
            <Lightbulb className="h-3 w-3" />Critical Fix
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">{scores.criticalWeakness}</p>
        </div>
      </div>

      {/* Custom Instruction */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Custom improvement instruction (optional)</label>
        <Textarea
          placeholder="e.g. Add more statistics to the third section, shorten the introduction..."
          className="min-h-[60px] text-sm resize-none"
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {onContentUpdate && preImprovementContent && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onContentUpdate(preImprovementContent);
              setPreImprovementContent(null);
              setScores(null);
              toast({ title: "Reverted", description: "Content restored to pre-improvement version." });
            }}
            disabled={isApplying || isScoring}
          >
            Revert
          </Button>
        )}
        {onContentUpdate && (
          <Button
            size="sm"
            className="flex-1"
            onClick={handleApplyImprovements}
            disabled={isApplying || isScoring || totalSelected === 0}
          >
            {isApplying ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying...</>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Apply Improvements
                {totalSelected > 0 && (
                  <span className="ml-1.5 bg-white/20 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                    {totalSelected}
                  </span>
                )}
              </>
            )}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={onContentUpdate ? "" : "w-full"}
          onClick={handleScoreContent}
          disabled={isScoring || isApplying}
        >
          {isScoring ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Re-analyzing...</>
          ) : (
            <><TrendingUp className="h-4 w-4 mr-2" />Re-score</>
          )}
        </Button>
      </div>
    </div>
  );
};
