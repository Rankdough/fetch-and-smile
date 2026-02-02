import { useState, useCallback } from "react";

export interface CreditUsage {
  id: string;
  action: string;
  type: "voice_edit" | "quality_analysis" | "apply_improvements" | "humanise_brief" | "humanise_section" | "humanise_rewrite" | "humanise_gate";
  estimatedCredits: number;
  timestamp: Date;
  details?: string;
}

// Credit estimates based on typical AI token usage
// These are rough estimates - actual usage may vary based on content length
export const CREDIT_ESTIMATES = {
  voice_edit: 2, // ~1500 tokens input + 1000 tokens output
  quality_analysis: 3, // ~2000 tokens input + 500 tokens output (analysis)
  apply_improvements: 4, // ~2500 tokens input + 1500 tokens output (rewrite)
  // Human mode pipeline stages
  humanise_brief: 2, // Stage 1: Create structured brief
  humanise_section: 1, // Stage 2: Write single section (~1 per section)
  humanise_rewrite: 3, // Stage 3: Style transformation pass
  humanise_gate: 1, // Stage 4: Quality scoring (lightweight)
} as const;

export function useCreditTracking() {
  const [usageHistory, setUsageHistory] = useState<CreditUsage[]>([]);

  const trackUsage = useCallback((
    action: string,
    type: CreditUsage["type"],
    details?: string
  ) => {
    const usage: CreditUsage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      type,
      estimatedCredits: CREDIT_ESTIMATES[type],
      timestamp: new Date(),
      details,
    };

    setUsageHistory((prev) => [...prev, usage]);
    return usage;
  }, []);

  const getTotalCredits = useCallback(() => {
    return usageHistory.reduce((total, usage) => total + usage.estimatedCredits, 0);
  }, [usageHistory]);

  const getVoiceEditCredits = useCallback(() => {
    return usageHistory
      .filter((u) => u.type === "voice_edit")
      .reduce((total, u) => total + u.estimatedCredits, 0);
  }, [usageHistory]);

  const getQualityAnalysisCredits = useCallback(() => {
    return usageHistory
      .filter((u) => u.type === "quality_analysis" || u.type === "apply_improvements")
      .reduce((total, u) => total + u.estimatedCredits, 0);
  }, [usageHistory]);

  const getQualityAnalysisBreakdown = useCallback(() => {
    return usageHistory.filter(
      (u) => u.type === "quality_analysis" || u.type === "apply_improvements"
    );
  }, [usageHistory]);

  const clearHistory = useCallback(() => {
    setUsageHistory([]);
  }, []);

  return {
    usageHistory,
    trackUsage,
    getTotalCredits,
    getVoiceEditCredits,
    getQualityAnalysisCredits,
    getQualityAnalysisBreakdown,
    clearHistory,
  };
}
