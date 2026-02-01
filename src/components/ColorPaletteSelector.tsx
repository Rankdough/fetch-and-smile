import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ColorPalette {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

// Predefined color palettes with multiple shades
export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "purple",
    name: "Purple",
    primary: "#6B21A8",
    secondary: "#7C3AED",
    accent: "#A855F7",
    background: "#3B0764",
    text: "#FFFFFF",
  },
  {
    id: "blue",
    name: "Blue",
    primary: "#1E40AF",
    secondary: "#2563EB",
    accent: "#3B82F6",
    background: "#1E3A5F",
    text: "#FFFFFF",
  },
  {
    id: "teal",
    name: "Teal",
    primary: "#0D9488",
    secondary: "#14B8A6",
    accent: "#2DD4BF",
    background: "#134E4A",
    text: "#FFFFFF",
  },
  {
    id: "green",
    name: "Green",
    primary: "#15803D",
    secondary: "#16A34A",
    accent: "#22C55E",
    background: "#14532D",
    text: "#FFFFFF",
  },
  {
    id: "orange",
    name: "Orange",
    primary: "#C2410C",
    secondary: "#EA580C",
    accent: "#F97316",
    background: "#7C2D12",
    text: "#FFFFFF",
  },
  {
    id: "red",
    name: "Red",
    primary: "#B91C1C",
    secondary: "#DC2626",
    accent: "#EF4444",
    background: "#7F1D1D",
    text: "#FFFFFF",
  },
  {
    id: "pink",
    name: "Pink",
    primary: "#BE185D",
    secondary: "#DB2777",
    accent: "#EC4899",
    background: "#831843",
    text: "#FFFFFF",
  },
  {
    id: "slate",
    name: "Slate",
    primary: "#334155",
    secondary: "#475569",
    accent: "#64748B",
    background: "#1E293B",
    text: "#FFFFFF",
  },
];

interface ColorPaletteSelectorProps {
  selectedPalette: ColorPalette | null;
  onSelectPalette: (palette: ColorPalette | null) => void;
}

export const ColorPaletteSelector = ({
  selectedPalette,
  onSelectPalette,
}: ColorPaletteSelectorProps) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {COLOR_PALETTES.map((palette) => {
          const isSelected = selectedPalette?.id === palette.id;
          return (
            <button
              key={palette.id}
              type="button"
              onClick={() => onSelectPalette(isSelected ? null : palette)}
              className={cn(
                "relative flex items-center gap-2 rounded-lg border-2 px-3 py-2 transition-all hover:scale-105",
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border hover:border-primary/50"
              )}
            >
              {/* Color swatches */}
              <div className="flex -space-x-1">
                <div
                  className="h-5 w-5 rounded-full border-2 border-white shadow-sm"
                  style={{ background: palette.primary }}
                />
                <div
                  className="h-5 w-5 rounded-full border-2 border-white shadow-sm"
                  style={{ background: palette.secondary }}
                />
                <div
                  className="h-5 w-5 rounded-full border-2 border-white shadow-sm"
                  style={{ background: palette.accent }}
                />
              </div>
              <span className="text-sm font-medium">{palette.name}</span>
              {isSelected && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          );
        })}
      </div>
      
      {selectedPalette && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm text-muted-foreground">Selected:</span>
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded border shadow-sm"
              style={{ background: selectedPalette.background }}
              title="Background"
            />
            <div
              className="h-6 w-6 rounded border shadow-sm"
              style={{ background: selectedPalette.primary }}
              title="Primary"
            />
            <div
              className="h-6 w-6 rounded border shadow-sm"
              style={{ background: selectedPalette.secondary }}
              title="Secondary"
            />
            <div
              className="h-6 w-6 rounded border shadow-sm"
              style={{ background: selectedPalette.accent }}
              title="Accent"
            />
          </div>
          <span className="text-sm font-medium">{selectedPalette.name} palette</span>
          <button
            type="button"
            onClick={() => onSelectPalette(null)}
            className="ml-auto text-xs text-muted-foreground hover:text-destructive underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};
