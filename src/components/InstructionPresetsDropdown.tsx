import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { Save, FolderOpen, Trash2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Preset = {
  id: string;
  name: string;
  instructions: string;
};

interface InstructionPresetsDropdownProps {
  currentInstructions: string;
  onLoad: (instructions: string) => void;
}

const InstructionPresetsDropdown = ({
  currentInstructions,
  onLoad,
}: InstructionPresetsDropdownProps) => {
  const { toast } = useToast();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    const { data } = await supabase
      .from("instruction_presets" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setPresets(data as any as Preset[]);
  };

  const savePreset = async () => {
    if (!newName.trim() || !currentInstructions.trim()) {
      toast({ title: "Enter a name and instructions first", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("instruction_presets" as any)
      .insert({ name: newName.trim(), instructions: currentInstructions } as any);
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save", variant: "destructive" });
      return;
    }
    setNewName("");
    toast({ title: "Preset saved" });
    loadPresets();
  };

  const deletePreset = async (id: string) => {
    await supabase.from("instruction_presets" as any).delete().eq("id", id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
    toast({ title: "Preset deleted" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
          <FolderOpen className="h-3.5 w-3.5" />
          Presets
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 bg-popover z-50" align="start">
        <div className="space-y-3">
          {/* Save current */}
          <div className="flex gap-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Preset name..."
              className="text-xs h-8"
              onKeyDown={(e) => e.key === "Enter" && savePreset()}
            />
            <Button
              size="sm"
              className="h-8 px-2 shrink-0"
              onClick={savePreset}
              disabled={saving || !currentInstructions.trim()}
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* List */}
          {presets.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">No presets saved yet</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-1 group"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 justify-start text-xs h-8 truncate"
                    onClick={() => {
                      onLoad(preset.instructions);
                      setOpen(false);
                      toast({ title: `Loaded: ${preset.name}` });
                    }}
                  >
                    {preset.name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={() => deletePreset(preset.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default InstructionPresetsDropdown;
