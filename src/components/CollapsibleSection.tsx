import { useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  number: number;
  title: string;
  isComplete: boolean;
  summary?: string;
  icon?: ReactNode;
  required?: boolean;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export const CollapsibleSection = ({
  number,
  title,
  isComplete,
  summary,
  icon,
  required,
  children,
  defaultOpen,
  className,
}: CollapsibleSectionProps) => {
  // Default: open if not complete, collapsed if complete (unless explicitly set)
  const [isOpen, setIsOpen] = useState(defaultOpen ?? !isComplete);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  // Truncate summary for display
  const displaySummary = summary && summary.length > 80 
    ? summary.slice(0, 80) + "..." 
    : summary;

  return (
    <div className={cn("space-y-0 border-b border-border pb-4", className)}>
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group",
          isComplete && !isOpen
            ? "bg-primary/10 border-2 border-primary/30 hover:bg-primary/15"
            : isOpen
            ? "bg-muted/50 rounded-b-none border-2 border-primary/15 border-b-0"
            : "hover:bg-muted/50 border-2 border-transparent"
        )}
      >
        {/* Section indicator */}
        <div
          className={cn(
            "flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all",
            isComplete
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-primary/15 text-primary border-2 border-primary/40"
          )}
        >
          {isComplete ? <Check className="h-3.5 w-3.5" /> : number}
        </div>

        {/* Title and summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {icon && <span className="text-primary/70">{icon}</span>}
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {required && !isComplete && (
              <span className="text-xs font-semibold text-destructive">*Required</span>
            )}
          </div>
          
          {/* Show summary when collapsed and complete */}
          {!isOpen && isComplete && displaySummary && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {displaySummary}
            </p>
          )}
        </div>

        {/* Toggle indicator */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isComplete && !isOpen && (
            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="pl-9 pr-3 pb-4 pt-3 space-y-3 bg-muted/40 rounded-b-lg border-2 border-t-0 border-primary/15">
          {children}
        </div>
      )}
    </div>
  );
};
