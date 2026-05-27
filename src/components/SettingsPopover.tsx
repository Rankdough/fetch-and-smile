import { useEffect, useState } from "react";
import { Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  isExperienceGateEnabled,
  setExperienceGateEnabled,
  loadProjectSignals,
  type ExperienceSignal,
} from "@/lib/experienceSignals";

export const SettingsPopover = () => {
  const [gateOn, setGateOn] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSignals, setPreviewSignals] = useState<ExperienceSignal[] | null>(null);

  useEffect(() => {
    setGateOn(isExperienceGateEnabled());
    const handler = () => setGateOn(isExperienceGateEnabled());
    window.addEventListener("experience-gate-changed", handler);
    return () => window.removeEventListener("experience-gate-changed", handler);
  }, []);

  const runPreview = async () => {
    setPreviewLoading(true);
    try {
      const { signals } = await loadProjectSignals();
      setPreviewSignals(signals);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm">Settings</h4>
            <p className="text-xs text-muted-foreground">
              Optional global behaviour. Off by default.
            </p>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="exp-gate" className="text-sm">
                Non-commodity content gate
              </Label>
              <p className="text-xs text-muted-foreground leading-snug">
                Injects first-hand experience signals (cases, numbers, named
                outcomes, "we mandate" protocols) extracted from your brain
                insights and context documents into article generation, and tags
                the finished article with a commodity badge. Applies to article
                generation only — not blog idea generation. Never blocks output.
              </p>
            </div>
            <Switch
              id="exp-gate"
              checked={gateOn}
              onCheckedChange={(v) => {
                setGateOn(v);
                setExperienceGateEnabled(v);
                if (!v) setPreviewSignals(null);
              }}
            />
          </div>

          {gateOn && (
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Preview signals</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runPreview}
                  disabled={previewLoading}
                  className="h-7 text-xs"
                >
                  {previewLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Scan project"
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Runs the deterministic extractor over your brain insights and
                context docs. Shows what would be injected on the next
                generation. If this is empty, the toggle will do nothing —
                add concrete numbers, named people, prices, or protocols to your
                sources first.
              </p>
              {previewSignals && (
                <div className="rounded border bg-muted/40 p-2 max-h-60 overflow-auto">
                  {previewSignals.length === 0 ? (
                    <p className="text-xs text-destructive font-medium">
                      0 signals found. Toggle is effectively inactive.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      <li className="text-[11px] font-semibold text-foreground">
                        {previewSignals.length} signal
                        {previewSignals.length === 1 ? "" : "s"} ready to inject:
                      </li>
                      {previewSignals.map((s, i) => (
                        <li key={i} className="text-[11px] leading-snug">
                          <span className="font-mono text-[9px] uppercase rounded bg-primary/10 text-primary px-1 py-0.5 mr-1">
                            {s.type}
                          </span>
                          <span className="text-muted-foreground">
                            {s.snippet.slice(0, 140)}
                            {s.snippet.length > 140 ? "…" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
