import { useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, Target, ChevronDown, ChevronUp, Lightbulb, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SectionEvidence {
  heading: string;
  excerpt: string;
  relevance: "strong" | "partial" | "weak";
  explanation: string;
}

interface VerificationResult {
  fulfilled: boolean;
  overallScore: number;
  summary: string;
  sections: SectionEvidence[];
  missingElements: string[];
  suggestions: string[];
}

interface ValuePromiseVerificationProps {
  content: string;
  valuePromise: string;
  onVerificationComplete?: (result: VerificationResult) => void;
}

export const ValuePromiseVerification = ({ 
  content, 
  valuePromise,
  onVerificationComplete
}: ValuePromiseVerificationProps) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [isOpen, setIsOpen] = useState(true);

  const handleVerify = async () => {
    if (!content || !valuePromise) {
      toast.error("Content and value promise are required");
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-value-promise", {
        body: { content, valuePromise }
      });

      if (error) throw error;

      setResult(data);
      onVerificationComplete?.(data);
      
      if (data.fulfilled) {
        toast.success(`Value promise fulfilled! Score: ${data.overallScore}/100`);
      } else {
        toast.warning(`Value promise needs improvement. Score: ${data.overallScore}/100`);
      }
    } catch (error) {
      console.error("Verification error:", error);
      toast.error("Failed to verify value promise");
    } finally {
      setIsVerifying(false);
    }
  };

  const getRelevanceColor = (relevance: "strong" | "partial" | "weak") => {
    switch (relevance) {
      case "strong":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
      case "partial":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
      case "weak":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
    }
  };

  const getRelevanceIcon = (relevance: "strong" | "partial" | "weak") => {
    switch (relevance) {
      case "strong":
        return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case "partial":
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case "weak":
        return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  if (!valuePromise) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-t-lg">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Value Promise Verification</span>
          {result && (
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              result.fulfilled 
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}>
              {result.overallScore}/100
            </span>
          )}
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </CollapsibleTrigger>
      
      <CollapsibleContent className="p-4 pt-0 space-y-4">
        {/* Value Promise Display */}
        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
          <p className="text-sm font-medium text-primary mb-1">Your Value Promise:</p>
          <p className="text-sm text-muted-foreground">{valuePromise}</p>
        </div>

        {/* Verify Button */}
        {!result && (
          <Button 
            onClick={handleVerify} 
            disabled={isVerifying || !content}
            className="w-full"
            variant="outline"
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing content...
              </>
            ) : (
              <>
                <Target className="h-4 w-4 mr-2" />
                Verify Value Promise Fulfillment
              </>
            )}
          </Button>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className={cn(
              "p-3 rounded-lg border",
              result.fulfilled 
                ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                : "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {result.fulfilled ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  )}
                  <span className="font-medium">
                    {result.fulfilled ? "Promise Fulfilled" : "Needs Improvement"}
                  </span>
                </div>
                <span className={cn("text-2xl font-bold", getScoreColor(result.overallScore))}>
                  {result.overallScore}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
            </div>

            {/* Toggle Details */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full" 
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Hide Evidence
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Show Evidence ({result.sections.length} sections)
                </>
              )}
            </Button>

            {showDetails && (
              <>
                {/* Section Evidence */}
                {result.sections.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Sections Addressing the Promise
                    </h4>
                    {result.sections.map((section, index) => (
                      <div 
                        key={index} 
                        className={cn(
                          "p-3 rounded-lg border",
                          getRelevanceColor(section.relevance)
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {getRelevanceIcon(section.relevance)}
                          <span className="font-medium text-sm">{section.heading}</span>
                          <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-background/50">
                            {section.relevance}
                          </span>
                        </div>
                        <blockquote className="text-sm italic border-l-2 pl-3 mb-2 opacity-90">
                          "{section.excerpt}"
                        </blockquote>
                        <p className="text-xs opacity-80">{section.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Missing Elements */}
                {result.missingElements.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      Missing Elements
                    </h4>
                    <ul className="text-sm space-y-1">
                      {result.missingElements.map((element, index) => (
                        <li key={index} className="flex items-start gap-2 text-muted-foreground">
                          <span className="text-amber-500">•</span>
                          {element}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggestions */}
                {result.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2 text-primary">
                      <Lightbulb className="h-4 w-4" />
                      Suggestions to Improve
                    </h4>
                    <ul className="text-sm space-y-1">
                      {result.suggestions.map((suggestion, index) => (
                        <li key={index} className="flex items-start gap-2 text-muted-foreground">
                          <span className="text-primary">→</span>
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* Re-verify Button */}
            <Button 
              onClick={handleVerify} 
              disabled={isVerifying}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Re-analyzing...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Re-verify After Edits
                </>
              )}
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
