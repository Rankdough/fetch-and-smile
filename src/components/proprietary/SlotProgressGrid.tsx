// Sidebar that shows the 5 typed-slot grid filling in real time during the interview.
// MVE floor (1 case + 1 outcome, each ≥80 words) is the unlock signal for Generate.

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, CircleDashed } from "lucide-react";
import {
  UNIT_TYPES,
  UNIT_TYPE_LABEL,
  UNIT_TYPE_DESCRIPTION,
  MIN_WORDS_PER_MANDATORY_UNIT,
  isMandatory,
  type UnitType,
} from "@/lib/proprietaryUnits";

export interface SlotState {
  type: UnitType;
  words: number;       // best-known word count across user turns relevant to this type
  satisfied: boolean;  // determined by parent (heuristic during chat, authoritative after extract)
}

interface Props {
  slots: SlotState[];
  mveSatisfied: boolean;
}

export const SlotProgressGrid = ({ slots, mveSatisfied }: Props) => {
  const slotMap = Object.fromEntries(slots.map(s => [s.type, s]));

  return (
    <Card className="p-4 space-y-3 sticky top-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Knowledge captured</h3>
        <Badge variant={mveSatisfied ? "default" : "outline"} className="text-xs">
          {mveSatisfied ? "Ready to generate" : "Keep going"}
        </Badge>
      </div>

      <div className="space-y-2.5">
        {UNIT_TYPES.map((type) => {
          const s: SlotState | undefined = slotMap[type];
          const words = s?.words ?? 0;
          const satisfied = !!s?.satisfied;
          const mandatory = isMandatory(type as UnitType);
          const pct = mandatory
            ? Math.min(100, Math.round((words / MIN_WORDS_PER_MANDATORY_UNIT) * 100))
            : satisfied ? 100 : Math.min(100, words > 0 ? 60 : 0);

          return (
            <div key={type} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  {satisfied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className={satisfied ? "font-medium" : ""}>{UNIT_TYPE_LABEL[type as UnitType]}</span>
                  {mandatory && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1">Required</Badge>
                  )}
                </span>
                <span className="text-muted-foreground">
                  {mandatory ? `${words} / ${MIN_WORDS_PER_MANDATORY_UNIT}w` : satisfied ? "captured" : `${words}w`}
                </span>
              </div>
              <Progress value={pct} className="h-1" />
              <p className="text-[11px] text-muted-foreground leading-tight">{UNIT_TYPE_DESCRIPTION[type as UnitType]}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
