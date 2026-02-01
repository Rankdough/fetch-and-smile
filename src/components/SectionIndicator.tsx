import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionIndicatorProps {
  number: number;
  isComplete: boolean;
}

export const SectionIndicator = ({ number, isComplete }: SectionIndicatorProps) => {
  return (
    <span
      className={cn(
        "flex items-center justify-center w-6 h-6 rounded-full text-sm font-semibold transition-colors",
        isComplete
          ? "bg-green-600 text-white"
          : "bg-primary text-primary-foreground"
      )}
    >
      {isComplete ? <Check className="h-3.5 w-3.5" /> : number}
    </span>
  );
};
