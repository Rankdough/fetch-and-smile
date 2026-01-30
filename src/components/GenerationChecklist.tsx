import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  required: boolean;
}

interface GenerationChecklistProps {
  items: ChecklistItem[];
}

export const GenerationChecklist = ({ items }: GenerationChecklistProps) => {
  const completedCount = items.filter((item) => item.completed).length;
  const requiredItems = items.filter((item) => item.required);
  const requiredCompleted = requiredItems.filter((item) => item.completed).length;
  const allRequiredComplete = requiredCompleted === requiredItems.length;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Pre-Generation Checklist</h4>
        <span
          className={cn(
            "text-xs font-medium px-2 py-1 rounded-full",
            allRequiredComplete
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          )}
        >
          {completedCount}/{items.length} Ready
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-2 text-sm",
              item.completed ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {item.completed ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : item.required ? (
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
            )}
            <span className={cn(item.completed && "line-through opacity-70")}>
              {item.label}
            </span>
            {item.required && !item.completed && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                (required)
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
