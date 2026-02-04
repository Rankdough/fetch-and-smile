import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Loader2, Circle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FormatStep {
  id: string;
  label: string;
  status: 'pending' | 'checking' | 'missing' | 'generating' | 'done' | 'skipped' | 'error';
  detail?: string;
}

interface ApplyFormatProgressProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: FormatStep[];
  isComplete: boolean;
  error?: string | null;
}

export const ApplyFormatProgress = ({ 
  open, 
  onOpenChange, 
  steps, 
  isComplete,
  error 
}: ApplyFormatProgressProps) => {
  const getStepIcon = (status: FormatStep['status']) => {
    switch (status) {
      case 'pending':
        return <Circle className="h-5 w-5 text-muted-foreground" />;
      case 'checking':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'missing':
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case 'generating':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'done':
        return <Check className="h-5 w-5 text-green-600" />;
      case 'skipped':
        return <Check className="h-5 w-5 text-muted-foreground" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusText = (status: FormatStep['status']) => {
    switch (status) {
      case 'pending':
        return 'Waiting...';
      case 'checking':
        return 'Analyzing...';
      case 'missing':
        return 'Will generate';
      case 'generating':
        return 'Generating...';
      case 'done':
        return 'Added ✓';
      case 'skipped':
        return 'Already exists';
      case 'error':
        return 'Failed';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!isComplete && !error && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {isComplete && !error && <Check className="h-5 w-5 text-green-600" />}
            {error && <AlertCircle className="h-5 w-5 text-destructive" />}
            Apply Format Progress
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-1 py-4">
          {steps.map((step, index) => (
            <div 
              key={step.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg transition-colors",
                step.status === 'generating' && "bg-primary/5",
                step.status === 'done' && "bg-green-50 dark:bg-green-950/20",
                step.status === 'missing' && "bg-amber-50 dark:bg-amber-950/20",
                step.status === 'error' && "bg-destructive/10"
              )}
            >
              <div className="flex-shrink-0">
                {getStepIcon(step.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn(
                    "font-medium text-sm",
                    step.status === 'pending' && "text-muted-foreground",
                    step.status === 'done' && "text-green-700 dark:text-green-400",
                    step.status === 'skipped' && "text-muted-foreground"
                  )}>
                    {step.label}
                  </span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    step.status === 'pending' && "bg-muted text-muted-foreground",
                    step.status === 'checking' && "bg-primary/10 text-primary",
                    step.status === 'missing' && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    step.status === 'generating' && "bg-primary/10 text-primary",
                    step.status === 'done' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                    step.status === 'skipped' && "bg-muted text-muted-foreground",
                    step.status === 'error' && "bg-destructive/10 text-destructive"
                  )}>
                    {getStatusText(step.status)}
                  </span>
                </div>
                {step.detail && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {step.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {isComplete && !error && (
          <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-400 font-medium">
              ✓ Format applied successfully!
            </p>
            <p className="text-xs text-green-600 dark:text-green-500 mt-1">
              Check the preview to see your formatted article.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const DEFAULT_FORMAT_STEPS: FormatStep[] = [
  { id: 'analyze', label: '1. Analyze Content', status: 'pending' },
  { id: 'tldr', label: '2. TL;DR Section', status: 'pending' },
  { id: 'quicktips', label: '3. Quick Tips', status: 'pending' },
  { id: 'navigation', label: '4. In This Article', status: 'pending' },
  { id: 'faq', label: '5. FAQ Section', status: 'pending' },
  { id: 'ctas', label: '6. CTA Banners', status: 'pending' },
  { id: 'finalize', label: '7. Finalize & Style', status: 'pending' },
];
