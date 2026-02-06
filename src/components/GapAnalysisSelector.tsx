import { useState, useMemo } from "react";
import { Check, ChevronDown, ChevronUp, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface GapInsight {
  id: string;
  title: string;
  description: string;
  sectionTitle: string;
}

interface GapSection {
  title: string;
  insights: GapInsight[];
}

interface GapAnalysisSelectorProps {
  gapAnalysis: string;
  selectedInsights: string[];
  onInsightsChange: (insights: string[]) => void;
}

/**
 * Parses gap analysis markdown into structured sections and bullet points.
 * Expected format:
 * ## 1. Section Title
 * - **Point Title:** Description text...
 * - **Another Point:** More description...
 */
function parseGapAnalysis(text: string): GapSection[] {
  const sections: GapSection[] = [];
  if (!text.trim()) return sections;

  const lines = text.split("\n");
  let currentSection: GapSection | null = null;
  let currentBulletTitle = "";
  let currentBulletDesc = "";
  let insightCounter = 0;

  const flushBullet = () => {
    if (currentBulletTitle && currentSection) {
      insightCounter++;
      currentSection.insights.push({
        id: `gap-${insightCounter}`,
        title: currentBulletTitle.trim(),
        description: currentBulletDesc.trim(),
        sectionTitle: currentSection.title,
      });
    }
    currentBulletTitle = "";
    currentBulletDesc = "";
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Match section headers like "## 1. Key Topics..." or "1. Key Topics..." or "### Key Topics..."
    const sectionMatch = trimmed.match(
      /^(?:#{1,3}\s*)?(\d+)\.\s+(.+)/
    );
    if (sectionMatch) {
      flushBullet();
      currentSection = { title: sectionMatch[2].trim(), insights: [] };
      sections.push(currentSection);
      continue;
    }

    // Match bullet points: "- **Title:** Description" or "* **Title:** Description"
    const bulletMatch = trimmed.match(
      /^[-*•]\s+\*\*(.+?)\*\*[:\s]*(.*)$/
    );
    if (bulletMatch && currentSection) {
      flushBullet();
      currentBulletTitle = bulletMatch[1].replace(/[*:]+$/, "").trim();
      currentBulletDesc = bulletMatch[2].trim();
      continue;
    }

    // Match plain bullets without bold: "- Some text"
    const plainBulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (plainBulletMatch && currentSection && !currentBulletTitle) {
      flushBullet();
      // Use first ~6 words as title, rest as description
      const words = plainBulletMatch[1].split(/\s+/);
      if (words.length > 6) {
        currentBulletTitle = words.slice(0, 6).join(" ") + "...";
        currentBulletDesc = plainBulletMatch[1];
      } else {
        currentBulletTitle = plainBulletMatch[1];
        currentBulletDesc = "";
      }
      continue;
    }

    // Continuation lines (not empty, not a header, not a bullet) → append to current bullet description
    if (trimmed && currentBulletTitle) {
      currentBulletDesc += " " + trimmed;
    }

    // Skip "Actionable Insight for Strategy:" type summary lines — treat as section-level (not selectable)
    if (trimmed.match(/^(\*\*)?Actionable\s+Insight/i)) {
      flushBullet();
      continue;
    }
  }

  flushBullet();

  return sections.filter((s) => s.insights.length > 0);
}

export const GapAnalysisSelector = ({
  gapAnalysis,
  selectedInsights,
  onInsightsChange,
}: GapAnalysisSelectorProps) => {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const sections = useMemo(() => parseGapAnalysis(gapAnalysis), [gapAnalysis]);

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const toggleInsight = (insightTitle: string) => {
    if (selectedInsights.includes(insightTitle)) {
      onInsightsChange(selectedInsights.filter((i) => i !== insightTitle));
    } else {
      onInsightsChange([...selectedInsights, insightTitle]);
    }
  };

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Gap Analysis Results
          {selectedInsights.length > 0 && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
              {selectedInsights.length} selected
            </span>
          )}
        </p>
        {selectedInsights.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => onInsightsChange([])}
          >
            Clear all
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Pick specific insights to use as angles in your article:
      </p>

      <div className="space-y-2">
        {sections.map((section) => {
          const isCollapsed = collapsedSections.has(section.title);
          const selectedInSection = section.insights.filter((i) =>
            selectedInsights.includes(i.title)
          ).length;

          return (
            <div key={section.title} className="space-y-1">
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left group"
                onClick={() => toggleSection(section.title)}
              >
                {isCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
                  {section.title}
                </span>
                {selectedInSection > 0 && (
                  <span className="text-xs text-primary font-medium">
                    {selectedInSection}/{section.insights.length}
                  </span>
                )}
              </button>

              {!isCollapsed && (
                <div className="space-y-1.5 pl-1">
                  {section.insights.map((insight) => {
                    const isSelected = selectedInsights.includes(insight.title);
                    return (
                      <div
                        key={insight.id}
                        className={cn(
                          "rounded-lg border p-2.5 transition-all cursor-pointer",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:border-muted-foreground/40"
                        )}
                        onClick={() => toggleInsight(insight.title)}
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            className={cn(
                              "flex-shrink-0 w-4.5 h-4.5 rounded border flex items-center justify-center mt-0.5",
                              isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/30"
                            )}
                            style={{ width: "18px", height: "18px" }}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">
                              {insight.title}
                            </p>
                            {insight.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">
                                {insight.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
