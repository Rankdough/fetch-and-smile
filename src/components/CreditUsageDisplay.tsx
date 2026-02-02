import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Coins, ChevronDown, Volume2, TrendingUp, Wand2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CreditUsage } from "@/hooks/useCreditTracking";
import { CREDIT_ESTIMATES } from "@/hooks/useCreditTracking";

interface CreditUsageDisplayProps {
  voiceEditCredits: number;
  qualityAnalysisCredits: number;
  qualityBreakdown: CreditUsage[];
  onClear?: () => void;
}

const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const getActionIcon = (type: CreditUsage["type"]) => {
  switch (type) {
    case "voice_edit":
      return <Volume2 className="h-3 w-3" />;
    case "quality_analysis":
      return <TrendingUp className="h-3 w-3" />;
    case "apply_improvements":
      return <Wand2 className="h-3 w-3" />;
  }
};

const getActionLabel = (type: CreditUsage["type"]) => {
  switch (type) {
    case "voice_edit":
      return "Voice Edit";
    case "quality_analysis":
      return "Quality Analysis";
    case "apply_improvements":
      return "Apply Improvements";
  }
};

export function CreditUsageDisplay({
  voiceEditCredits,
  qualityAnalysisCredits,
  qualityBreakdown,
  onClear,
}: CreditUsageDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const totalCredits = voiceEditCredits + qualityAnalysisCredits;

  if (totalCredits === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 p-3 space-y-3">
      {/* Header with total */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium">Estimated Credit Usage</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
            ~{totalCredits} credits
          </Badge>
          {onClear && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={onClear}
              title="Clear usage history"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center justify-between p-2 rounded bg-background/50">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Volume2 className="h-3 w-3" />
            Voice Edits
          </span>
          <span className="font-medium">~{voiceEditCredits} credits</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded bg-background/50">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            Quality Analysis
          </span>
          <span className="font-medium">~{qualityAnalysisCredits} credits</span>
        </div>
      </div>

      {/* Detailed breakdown (collapsible) */}
      {qualityBreakdown.length > 0 && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-xs">
              <span>View action breakdown ({qualityBreakdown.length} actions)</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {qualityBreakdown.map((usage) => (
                <div
                  key={usage.id}
                  className="flex items-center justify-between text-xs p-1.5 rounded bg-background/50"
                >
                  <div className="flex items-center gap-2">
                    {getActionIcon(usage.type)}
                    <span className="text-muted-foreground">{formatTime(usage.timestamp)}</span>
                    <span>{getActionLabel(usage.type)}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5">
                    ~{usage.estimatedCredits} credits
                  </Badge>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Credit cost reference */}
      <div className="text-[10px] text-muted-foreground border-t pt-2 mt-2">
        <span className="font-medium">Est. per action:</span>{" "}
        Voice Edit ~{CREDIT_ESTIMATES.voice_edit} • 
        Quality Analysis ~{CREDIT_ESTIMATES.quality_analysis} • 
        Apply Improvements ~{CREDIT_ESTIMATES.apply_improvements}
      </div>
    </div>
  );
}
