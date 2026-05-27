import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TwoPassReport } from "@/lib/experienceSignals";

interface Props {
  report: TwoPassReport;
  /** True when there are no mapped knowledge units at all (cold project). */
  hasBrain: boolean;
  className?: string;
}

const PILL: Record<"green" | "amber" | "red", string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300",
  red: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300",
};

type VerificationState = "no-brain" | "brain-no-overlap" | "partial-overlap" | "verified";

function getVerificationState(report: TwoPassReport, hasBrain: boolean): VerificationState {
  if (!hasBrain) return "no-brain";
  const { verifiedCount, unverifiedCount } = report.verification;
  const total = verifiedCount + unverifiedCount;
  if (total === 0 || verifiedCount === 0) return "brain-no-overlap";
  if (unverifiedCount > 0) return "partial-overlap";
  return "verified";
}

const VERIFICATION_LABEL: Record<VerificationState, string> = {
  "no-brain": "No brain uploaded",
  "brain-no-overlap": "Brain doesn't cover this article",
  "partial-overlap": "Partially verified",
  verified: "Verified against brain",
};

const VERIFICATION_HELP: Record<VerificationState, string> = {
  "no-brain":
    "Upload typed knowledge units (cases, outcomes, failures, tradeoffs, contrarian claims) in the brain panel to enable verification. Structural signals are still scored on their own.",
  "brain-no-overlap":
    "Your brain has units, but none of this article's signals anchor to them. Either the wrong units were mapped, or the article was generated without proprietary input.",
  "partial-overlap":
    "Some signals match mapped units; others don't. Unverified high-weight signals (studies, comparative stats, failure claims) are the highest fabrication risk — review them first.",
  verified:
    "Every signal in this article anchors to text in a mapped knowledge unit.",
};

export const VerificationReport = ({ report, hasBrain, className }: Props) => {
  const state = getVerificationState(report, hasBrain);
  const structuralBadge = report.structural.badge;
  // When there's no brain, soften the verification pill to amber (honest:
  // article can't be verified, not that it failed).
  const verificationBadge: "green" | "amber" | "red" =
    state === "no-brain" || state === "brain-no-overlap" ? "amber" : report.verification.badge;

  return (
    <TooltipProvider>
      <div className={cn("inline-flex items-center gap-1.5", className)}>
        {/* Structural pill */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0 cursor-help",
                PILL[structuralBadge],
              )}
            >
              Signal {report.structural.score}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="text-xs space-y-1">
              <div className="font-semibold">
                Structural signal density: {report.structural.score}/100
              </div>
              <div className="text-muted-foreground">
                Cold, brain-independent. Scores the article on signals it carries
                in its own text.
              </div>
              <ul className="list-disc pl-4">
                {report.structural.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Verification pill */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0 cursor-help",
                PILL[verificationBadge],
              )}
            >
              {state === "no-brain"
                ? "Verify: no brain"
                : `Verify ${report.verification.verifiedCount}/${report.verification.verifiedCount + report.verification.unverifiedCount}`}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="text-xs space-y-1">
              <div className="font-semibold">{VERIFICATION_LABEL[state]}</div>
              <div className="text-muted-foreground">{VERIFICATION_HELP[state]}</div>
              {state !== "no-brain" && report.verification.reasons.length > 0 && (
                <ul className="list-disc pl-4">
                  {report.verification.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};
