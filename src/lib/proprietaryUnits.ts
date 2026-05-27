// Shared constants for Proprietary Mode.
// Kept in lib/ so it's reachable from both pages and components.

export const UNIT_TYPES = ["case", "outcome", "failure", "tradeoff", "contrarian"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const MANDATORY_UNIT_TYPES: UnitType[] = ["case", "outcome"];
export const MIN_WORDS_PER_MANDATORY_UNIT = 80;

export const UNIT_TYPE_LABEL: Record<UnitType | "legacy", string> = {
  case: "Case",
  outcome: "Outcome",
  failure: "Failure",
  tradeoff: "Tradeoff",
  contrarian: "Contrarian",
  legacy: "Legacy",
};

export const UNIT_TYPE_DESCRIPTION: Record<UnitType, string> = {
  case: "A real situation: who, what happened, when.",
  outcome: "A specific number, timeline, or measurable result tied to a case.",
  failure: "Something that went wrong and the reason.",
  tradeoff: "An honest limitation accepted in exchange for something else.",
  contrarian: "An opinion that contradicts conventional wisdom, backed by experience.",
};

export const BUSINESS_TYPES = [
  { value: "service_business", label: "Service business" },
  { value: "ecommerce", label: "Ecommerce" },
  { value: "saas", label: "SaaS" },
  { value: "healthcare_clinical", label: "Healthcare / clinical" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "publisher", label: "Publisher" },
  { value: "other", label: "Other" },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["value"];

export const PUBLICATION_DESTINATIONS = [
  { value: "ai_search", label: "AI search (ChatGPT, Perplexity, AI overviews)" },
  { value: "human_blog", label: "Human blog readers" },
  { value: "both", label: "Both" },
] as const;

// Staleness defaults (kept here so callers stay consistent).
export const STALENESS_MONTHS = 6;
export const OVERUSE_THRESHOLD = 4;

export function unitWordCount(text: string | null | undefined): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

export function isMandatory(type: UnitType): boolean {
  return MANDATORY_UNIT_TYPES.includes(type);
}
