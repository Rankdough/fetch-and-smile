// Small badge showing a knowledge unit's type, with staleness/usage/version flags.
// Used in the brain panel and the Proprietary Extract review step.

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AlertCircle, Clock, Layers, Repeat } from "lucide-react";
import { UNIT_TYPE_LABEL, type UnitType } from "@/lib/proprietaryUnits";

interface Props {
  unitType: UnitType | "legacy" | string;
  wordCount?: number;
  isStale?: boolean;
  staleReason?: string | null;
  usageCount?: number;
  isVersioned?: boolean; // has a parent_unit_id
  contributorId?: string | null;
  createdAt?: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  case: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border-blue-200",
  outcome: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200",
  failure: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200",
  tradeoff: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 border-purple-200",
  contrarian: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200 border-pink-200",
  legacy: "bg-muted text-muted-foreground border-border",
};

export const UnitTypeChip = ({
  unitType,
  wordCount,
  isStale,
  staleReason,
  usageCount,
  isVersioned,
  contributorId,
  createdAt,
}: Props) => {
  const label = UNIT_TYPE_LABEL[unitType as UnitType] || "Legacy";
  const color = TYPE_COLORS[unitType] || TYPE_COLORS.legacy;

  return (
    <TooltipProvider delayDuration={150}>
      <span className="inline-flex items-center gap-1">
        <Badge variant="outline" className={`text-xs ${color}`}>
          {label}
          {typeof wordCount === "number" && wordCount > 0 ? (
            <span className="ml-1 opacity-70">· {wordCount}w</span>
          ) : null}
        </Badge>

        {isStale && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200">
                  <Clock className="h-3 w-3 mr-1" /> Review
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>{staleReason || "Review recommended"}</TooltipContent>
          </Tooltip>
        )}

        {typeof usageCount === "number" && usageCount >= 4 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-200">
                  <Repeat className="h-3 w-3 mr-1" /> {usageCount}×
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>Used in {usageCount} articles — may be overused.</TooltipContent>
          </Tooltip>
        )}

        {isVersioned && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Badge variant="outline" className="text-xs">
                  <Layers className="h-3 w-3 mr-1" /> v
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>This is a refreshed version. Earlier versions are preserved.</TooltipContent>
          </Tooltip>
        )}

        {contributorId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3 mr-1" /> {contributorId.slice(0, 8)}
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Extracted by {contributorId}
              {createdAt ? ` · ${new Date(createdAt).toLocaleDateString()}` : ""}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </TooltipProvider>
  );
};
