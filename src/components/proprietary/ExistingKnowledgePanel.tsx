// Pre-interview panel: shows existing brain units relevant to the topic
// with use / refresh / skip toggles. Filled choices reduce what the interview has to cover.

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, Check, XCircle, Library } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UnitTypeChip } from "./UnitTypeChip";
import { UNIT_TYPES, type UnitType } from "@/lib/proprietaryUnits";

type Choice = "use" | "refresh" | "skip";

interface ExistingUnit {
  id: string;
  title: string;
  summary: string | null;
  full_text: string | null;
  unit_type: string;
  word_count: number;
  is_stale: boolean;
  stale_reason: string | null;
  usage_count: number;
  parent_unit_id: string | null;
  contributor_id: string | null;
  created_at: string;
  business_type: string | null;
}

interface Props {
  topic: string;
  businessType: string;
  onContinue: (selection: { useIds: string[]; refreshIds: string[]; filledTypes: UnitType[] }) => void;
}

function tokenise(s: string): string[] {
  return s.toLowerCase().split(/\W+/).filter(w => w.length > 3);
}

export const ExistingKnowledgePanel = ({ topic, businessType, onContinue }: Props) => {
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<ExistingUnit[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("brain_insights")
        .select("id, title, summary, full_text, unit_type, word_count, is_stale, stale_reason, usage_count, parent_unit_id, contributor_id, created_at, business_type")
        .neq("unit_type", "legacy")
        .order("created_at", { ascending: false });

      const all = (data || []) as ExistingUnit[];
      const topicWords = tokenise(topic);

      const scored = all
        .map(u => {
          const hay = `${u.title} ${u.summary || ""} ${u.full_text || ""}`.toLowerCase();
          const overlap = topicWords.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
          const sameBranch = u.business_type === businessType ? 1 : 0;
          return { unit: u, score: overlap * 2 + sameBranch };
        })
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(s => s.unit);

      setUnits(scored);
      // Default: stale units default to "refresh", others to "skip" (user explicitly opts in)
      const defaults: Record<string, Choice> = {};
      scored.forEach(u => { defaults[u.id] = u.is_stale ? "refresh" : "skip"; });
      setChoices(defaults);
      setLoading(false);
    })();
  }, [topic, businessType]);

  const summary = useMemo(() => {
    const useIds: string[] = [];
    const refreshIds: string[] = [];
    const filledTypes = new Set<UnitType>();
    units.forEach(u => {
      const c = choices[u.id];
      if (c === "use") {
        useIds.push(u.id);
        if (UNIT_TYPES.includes(u.unit_type as UnitType)) filledTypes.add(u.unit_type as UnitType);
      } else if (c === "refresh") {
        refreshIds.push(u.id);
      }
    });
    return { useIds, refreshIds, filledTypes: Array.from(filledTypes) };
  }, [units, choices]);

  const setChoice = (id: string, c: Choice) =>
    setChoices(prev => ({ ...prev, [id]: c }));

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (units.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Library className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No relevant knowledge units yet. The interview will start from scratch.</p>
          <Button className="mt-4" onClick={() => onContinue({ useIds: [], refreshIds: [], filledTypes: [] })}>
            Start interview
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {units.length} relevant knowledge unit{units.length === 1 ? "" : "s"} from your brain.
          Mark each as <strong>use</strong> (skip in interview), <strong>refresh</strong> (revisit during interview), or <strong>skip</strong> (ignore).
        </p>
      </div>

      <div className="space-y-2">
        {units.map(u => {
          const c = choices[u.id] || "skip";
          return (
            <Card key={u.id}>
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <UnitTypeChip
                      unitType={u.unit_type}
                      wordCount={u.word_count}
                      isStale={u.is_stale}
                      staleReason={u.stale_reason}
                      usageCount={u.usage_count}
                      isVersioned={!!u.parent_unit_id}
                    />
                    <span className="font-medium text-sm truncate">{u.title}</span>
                  </div>
                  {u.summary && <p className="text-xs text-muted-foreground line-clamp-2">{u.summary}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant={c === "use" ? "default" : "outline"}
                    onClick={() => setChoice(u.id, "use")}
                    className="h-7 px-2 text-xs"
                  >
                    <Check className="h-3 w-3 mr-1" /> Use
                  </Button>
                  <Button
                    size="sm"
                    variant={c === "refresh" ? "default" : "outline"}
                    onClick={() => setChoice(u.id, "refresh")}
                    className="h-7 px-2 text-xs"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Refresh
                  </Button>
                  <Button
                    size="sm"
                    variant={c === "skip" ? "default" : "outline"}
                    onClick={() => setChoice(u.id, "skip")}
                    className="h-7 px-2 text-xs"
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Skip
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-muted-foreground">
          {summary.useIds.length} use · {summary.refreshIds.length} refresh · {units.length - summary.useIds.length - summary.refreshIds.length} skip
          {summary.filledTypes.length > 0 && (
            <span className="ml-2">
              Types covered: {summary.filledTypes.map(t => <Badge key={t} variant="secondary" className="text-[10px] mr-1">{t}</Badge>)}
            </span>
          )}
        </div>
        <Button onClick={() => onContinue(summary)}>Start interview</Button>
      </div>
    </div>
  );
};
