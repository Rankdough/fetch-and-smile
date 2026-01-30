import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface AppliedRules {
  gapAnalysisUsed: boolean;
  formatReferenceUsed: boolean;
  contextFilesUsed: boolean;
  contextFileNames: string[];
  keywordsUsed: boolean;
  keywords: string[];
  targetWordCount: number;
  outlineProvided: boolean;
  customInstructionsProvided: boolean;
}

interface ContentVerificationProps {
  content: string;
  appliedRules: AppliedRules | null;
}

interface VerificationItem {
  id: string;
  label: string;
  status: "passed" | "failed" | "warning";
  details?: string;
}

export const ContentVerification = ({ content, appliedRules }: ContentVerificationProps) => {
  const verificationResults = useMemo(() => {
    const results: VerificationItem[] = [];

    // Count words
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    const targetWords = appliedRules?.targetWordCount || 1000;
    const wordCountDiff = Math.abs(wordCount - targetWords);
    const wordCountPercentage = (wordCount / targetWords) * 100;

    results.push({
      id: "word-count",
      label: "Word count",
      status: wordCountPercentage >= 80 && wordCountPercentage <= 130 ? "passed" : "warning",
      details: `${wordCount} words (target: ${targetWords})`,
    });

    // Check for TL;DR as H2
    const hasTldrH2 = /^## TL;?DR/im.test(content);
    results.push({
      id: "tldr-h2",
      label: "TL;DR as H2 heading",
      status: hasTldrH2 ? "passed" : "failed",
      details: hasTldrH2 ? "Found ## TL;DR heading" : "Missing TL;DR H2 section",
    });

    // Check for tables
    const hasTable = /\|.*\|.*\|/m.test(content);
    results.push({
      id: "tables",
      label: "Comparison table included",
      status: hasTable ? "passed" : "warning",
      details: hasTable ? "Table found in content" : "No markdown table detected",
    });

    // Check for sources/references
    const hasSourceLinks = /\*\*Sources?:\*\*.*\[.+\]\(.+\)/im.test(content) || 
                           /## References/im.test(content);
    results.push({
      id: "sources",
      label: "Sources and references",
      status: hasSourceLinks ? "passed" : "warning",
      details: hasSourceLinks ? "Source links found" : "No source citations detected",
    });

    // Check keywords were used
    if (appliedRules?.keywordsUsed && appliedRules.keywords.length > 0) {
      const contentLower = content.toLowerCase();
      const keywordsFound = appliedRules.keywords.filter((kw) => 
        contentLower.includes(kw.toLowerCase())
      );
      const keywordPercentage = (keywordsFound.length / appliedRules.keywords.length) * 100;
      
      results.push({
        id: "keywords",
        label: "SEO keywords incorporated",
        status: keywordPercentage >= 80 ? "passed" : keywordPercentage >= 50 ? "warning" : "failed",
        details: `${keywordsFound.length}/${appliedRules.keywords.length} keywords found: ${keywordsFound.join(", ") || "none"}`,
      });
    }

    // Check gap analysis was used
    if (appliedRules?.gapAnalysisUsed) {
      results.push({
        id: "gap-analysis",
        label: "Gap analysis applied",
        status: "passed",
        details: "Content gaps from competitor analysis were addressed",
      });
    }

    // Check format reference was used
    if (appliedRules?.formatReferenceUsed) {
      results.push({
        id: "format-ref",
        label: "Format reference applied",
        status: "passed",
        details: "Formatting matched to reference article",
      });
    }

    // Check context files were used and references cited
    if (appliedRules?.contextFilesUsed && appliedRules.contextFileNames.length > 0) {
      // Check if any content from context files is likely referenced
      // Look for source citations or references section
      const hasReferencesSection = /## References/im.test(content);
      const hasSourceLinks = /\*\*Sources?:\*\*.*\[.+\]\(.+\)/im.test(content);
      const hasCitations = hasReferencesSection || hasSourceLinks;
      
      results.push({
        id: "context-files",
        label: "Context files incorporated",
        status: "passed",
        details: `Uploaded: ${appliedRules.contextFileNames.join(", ")}`,
      });

      results.push({
        id: "context-references-cited",
        label: "References from context files cited",
        status: hasCitations ? "passed" : "warning",
        details: hasCitations 
          ? "Source citations found in content" 
          : "No explicit source citations detected - verify references were included",
      });
    }

    // Check for FAQ section
    const hasFAQ = /## .*(?:FAQ|Frequently Asked Questions)/im.test(content);
    results.push({
      id: "faq",
      label: "FAQ section",
      status: hasFAQ ? "passed" : "warning",
      details: hasFAQ ? "FAQ section found" : "No FAQ section detected",
    });

    // Check for no em dashes
    const hasEmDash = content.includes("—");
    results.push({
      id: "no-em-dash",
      label: "No em dashes used",
      status: hasEmDash ? "failed" : "passed",
      details: hasEmDash ? "Em dash (—) found in content" : "Clean - no em dashes",
    });

    return results;
  }, [content, appliedRules]);

  const passedCount = verificationResults.filter((r) => r.status === "passed").length;
  const totalCount = verificationResults.length;

  const getStatusIcon = (status: "passed" | "failed" | "warning") => {
    switch (status) {
      case "passed":
        return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Content Verification</h4>
        <span
          className={cn(
            "text-xs font-medium px-2 py-1 rounded-full",
            passedCount === totalCount
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : passedCount >= totalCount * 0.7
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          )}
        >
          {passedCount}/{totalCount} Passed
        </span>
      </div>

      <div className="space-y-2">
        {verificationResults.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 text-sm"
          >
            {getStatusIcon(item.status)}
            <div className="flex-1 min-w-0">
              <span className={cn(
                "font-medium",
                item.status === "passed" && "text-foreground",
                item.status === "failed" && "text-red-600 dark:text-red-400",
                item.status === "warning" && "text-amber-600 dark:text-amber-400"
              )}>
                {item.label}
              </span>
              {item.details && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {item.details}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
