import { Check, X, AlertTriangle } from "lucide-react";
import type { ValidationReport, RepairResult } from "@/utils/articleValidator";

interface Props {
  report: ValidationReport;
  repair?: RepairResult;
  compact?: boolean;
}

/**
 * Visible QA panel surfaced before export. Every check is shown so silent
 * failures become impossible.
 */
export const ArticleQAPanel = ({ report, repair, compact }: Props) => {
  const { checks, stats, hardFailures, warnings, passed } = report;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold flex items-center gap-2">
          {passed ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <X className="h-4 w-4 text-destructive" />
          )}
          Article QA
          <span className="text-muted-foreground font-normal">
            {hardFailures.length} blocking · {warnings.length} warning
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {stats.wordCount} words · {stats.tables} tables · {stats.h2} H2 · {stats.ctas} CTAs · {stats.quickTips} tips
        </div>
      </div>

      {repair && repair.applied.length > 0 && (
        <div className="text-xs text-muted-foreground border-l-2 border-primary pl-2">
          Auto-repaired: {repair.applied.join(", ")}
        </div>
      )}

      <ul className={`grid gap-1 ${compact ? "" : "sm:grid-cols-2"}`}>
        {checks.map((c) => {
          const ok = c.status === "pass";
          const Icon = ok ? Check : c.severity === "hard" ? X : AlertTriangle;
          const color = ok
            ? "text-green-600"
            : c.severity === "hard"
              ? "text-destructive"
              : "text-yellow-600";
          return (
            <li key={c.id} className="flex items-start gap-2">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
              <span>
                <span className={ok ? "" : "font-medium"}>{c.label}</span>
                {c.detail && (
                  <span className="text-xs text-muted-foreground ml-1">— {c.detail}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
