import { describe, expect, it } from "vitest";
import { normalizeKeywordResearchResults } from "@/lib/normalizeKeywordResearchResults";

describe("keyword research missing-list regression", () => {
  it("defaults missing modifiers to an empty list instead of throwing on length", () => {
    const result = normalizeKeywordResearchResults({ clusters: [{ cluster_name: "Rooms", seed_keywords: ["studio"], questions: ["What is included?"] }] }) as any;
    expect(result.clusters[0].modifiers.length).toBe(0);
    expect(result.clusters[0].seed_keywords).toEqual(["studio"]);
  });

  it("handles null or omitted sibling lists and scan terms", () => {
    const result = normalizeKeywordResearchResults({ clusters: [{ seed_keywords: null, modifiers: null }], negative_keywords: null, scan_results: [{}] }) as any;
    expect(result.clusters[0].seed_keywords).toEqual([]);
    expect(result.clusters[0].questions).toEqual([]);
    expect(result.clusters[0].modifiers).toEqual([]);
    expect(result.negative_keywords).toEqual([]);
    expect(result.cross_cutting_modifiers).toEqual([]);
    expect(result.scan_results[0].terms).toEqual([]);
  });

  it("preserves complete results, model metadata and original data without mutation", () => {
    const input = {
      topic: "Accommodation", model_used: "Claude Sonnet", unplaced_seeds: ["accessible room"],
      clusters: [{ cluster_name: "Rooms", seed_keywords: ["studio", "ensuite"], questions: ["What is included?"], modifiers: ["budget"], example_entities: ["studio"] }],
      cross_cutting_modifiers: ["UK"], negative_keywords: ["provider brands"],
    };
    const original = JSON.stringify(input);
    const result = normalizeKeywordResearchResults(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(JSON.stringify(input)).toBe(original);
    expect(result.clusters.flatMap(c => c.seed_keywords)).toEqual(["studio", "ensuite"]);
  });

  it("handles legacy categories and incomplete modifier suggestions", () => {
    expect(normalizeKeywordResearchResults({ categories: [{ name: "Rooms" }] })).toEqual({ categories: [{ name: "Rooms", terms: [] }] });
    expect(normalizeKeywordResearchResults({ dimensions: [{ dimension_name: "Budget", modifiers: null, covered: null }] })).toEqual({ dimensions: [{ dimension_name: "Budget", modifiers: [], covered: [] }] });
  });

  it("removes invalid list values without changing valid terms or mutating input", () => {
    const input = { clusters: [null, { seed_keywords: ["studio", null, 12] }] };
    const result = normalizeKeywordResearchResults(input) as any;
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].seed_keywords).toEqual(["studio"]);
    expect(input.clusters).toHaveLength(2);
    expect(input.clusters[1]?.seed_keywords).toEqual(["studio", null, 12]);
  });
});