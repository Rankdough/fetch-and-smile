import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CommodityGrade } from "@/lib/experienceSignals";

interface Props {
  grade: CommodityGrade;
  className?: string;
}

const STYLES: Record<CommodityGrade["badge"], string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300",
  red: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300",
};

const LABELS: Record<CommodityGrade["badge"], string> = {
  green: "Non-commodity",
  amber: "Thin experience",
  red: "Commodity",
};

export const CommodityBadge = ({ grade, className }: Props) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0 cursor-help",
              STYLES[grade.badge],
              className
            )}
          >
            {LABELS[grade.badge]} · {grade.score}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="text-xs space-y-1">
            <div className="font-semibold">Commodity grade: {LABELS[grade.badge]}</div>
            <ul className="list-disc pl-4">
              {grade.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
