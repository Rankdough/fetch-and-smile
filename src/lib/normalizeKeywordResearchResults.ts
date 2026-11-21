type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeEntries(value: unknown, required: string[], optional: string[] = []): RecordValue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(entry => {
    const normalized = { ...entry };
    for (const field of required) normalized[field] = stringList(entry[field]);
    for (const field of optional) {
      if (field in entry) normalized[field] = stringList(entry[field]);
    }
    return normalized;
  });
}

// Normalize at the display boundary, without mutating persisted research or inventing terms.
export function normalizeKeywordResearchResults<T>(value: T): T {
  if (!isRecord(value)) return value;
  const normalized: RecordValue = { ...value };
  if (Array.isArray(value.clusters)) {
    normalized.clusters = normalizeEntries(value.clusters, ["seed_keywords", "questions", "modifiers"], ["example_entities"]);
    normalized.cross_cutting_modifiers = stringList(value.cross_cutting_modifiers);
    normalized.negative_keywords = stringList(value.negative_keywords);
  }
  if (Array.isArray(value.categories)) {
    normalized.categories = normalizeEntries(value.categories, ["terms"]);
  }
  if ("scan_results" in value) normalized.scan_results = normalizeEntries(value.scan_results, ["terms"]);
  for (const field of ["scanned_terms", "url_extracted_terms"]) {
    if (field in value) normalized[field] = stringList(value[field]);
  }
  if ("dimensions" in value) {
    normalized.dimensions = normalizeEntries(value.dimensions, ["modifiers"], ["covered"]);
  }
  return normalized as T;
}