import { Progress } from "@/components/ui/progress";
import { Check, Circle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface PipelineStage {
  id: string;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "error";
  substeps?: { name: string; status: "pending" | "running" | "completed" }[];
}

interface GenerationProgressProps {
  stages: PipelineStage[];
  currentStage: number;
  totalSections?: number;
  currentSection?: number;
  error?: string;
}

export function GenerationProgress({
  stages,
  currentStage,
  totalSections,
  currentSection,
  error
}: GenerationProgressProps) {
  // Calculate overall progress
  const completedStages = stages.filter(s => s.status === "completed").length;
  let progress = (completedStages / stages.length) * 100;
  
  // Add partial progress for section writing
  if (currentStage === 1 && totalSections && currentSection !== undefined) {
    const sectionProgress = (currentSection / totalSections) * (100 / stages.length);
    progress = (1 / stages.length) * 100 + sectionProgress;
  }

  const getStageIcon = (stage: PipelineStage) => {
    switch (stage.status) {
      case "completed":
        return <Check className="h-4 w-4 text-green-500" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "error":
        return <Circle className="h-4 w-4 text-destructive" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground/40" />;
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Generating Human-Like Content
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Stage list */}
        <div className="space-y-2">
          {stages.map((stage, index) => (
            <div
              key={stage.id}
              className={`flex items-start gap-3 p-2 rounded-md transition-colors ${
                stage.status === "running"
                  ? "bg-primary/10"
                  : stage.status === "completed"
                  ? "bg-green-500/10"
                  : ""
              }`}
            >
              <div className="mt-0.5">{getStageIcon(stage)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-medium text-sm ${
                      stage.status === "completed"
                        ? "text-green-600 dark:text-green-400"
                        : stage.status === "running"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    Stage {index + 1}: {stage.name}
                  </span>
                  {stage.status === "running" && stage.id === "sections" && totalSections && (
                    <span className="text-xs text-muted-foreground">
                      ({currentSection}/{totalSections})
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {stage.description}
                </p>
                {/* Section substeps */}
                {stage.substeps && stage.substeps.length > 0 && stage.status === "running" && (
                  <div className="mt-2 space-y-1 pl-2 border-l-2 border-primary/20">
                    {stage.substeps.slice(-3).map((substep, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {substep.status === "completed" ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : substep.status === "running" ? (
                          <Loader2 className="h-3 w-3 text-primary animate-spin" />
                        ) : (
                          <Circle className="h-3 w-3 text-muted-foreground/40" />
                        )}
                        <span className={substep.status === "completed" ? "text-muted-foreground" : ""}>
                          {substep.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Estimated time */}
        <p className="text-xs text-muted-foreground text-center">
          Human mode takes longer but produces significantly better content
        </p>
      </CardContent>
    </Card>
  );
}
