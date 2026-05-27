import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  isExperienceGateEnabled,
  setExperienceGateEnabled,
} from "@/lib/experienceSignals";

export const SettingsPopover = () => {
  const [gateOn, setGateOn] = useState(false);

  useEffect(() => {
    setGateOn(isExperienceGateEnabled());
    const handler = () => setGateOn(isExperienceGateEnabled());
    window.addEventListener("experience-gate-changed", handler);
    return () => window.removeEventListener("experience-gate-changed", handler);
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
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
                Inject first-hand experience signals (cases, numbers, named
                outcomes) into article and blog idea generation, and tag outputs
                with a commodity badge. Never blocks generation.
              </p>
            </div>
            <Switch
              id="exp-gate"
              checked={gateOn}
              onCheckedChange={(v) => {
                setGateOn(v);
                setExperienceGateEnabled(v);
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
