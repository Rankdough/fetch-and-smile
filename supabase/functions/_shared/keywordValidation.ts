/** Count requirements describe generated ideas, never measured search demand. */
export function validateKeywordMap(value: unknown) {
  const issues: string[] = [];
  const map = value as Record<string, unknown> | null;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
  if (!map || !Array.isArray(map.clusters) ||
      !['topic', 'definition', 'notes'].every(k => typeof map[k] === 'string') ||
      !strings(map.cross_cutting_modifiers) || !strings(map.negative_keywords)) {
    throw new Error('Invalid semantic map structure');
  }
  if (map.clusters.length < 12 || map.clusters.length > 20) issues.push(`Expected 12–20 clusters; received ${map.clusters.length}.`);
  const counts = map.clusters.map((c, i) => {
    if (!c || typeof c.cluster_name !== 'string' || !strings(c.seed_keywords) || !strings(c.questions) || !strings(c.modifiers) || (c.example_entities !== undefined && !strings(c.example_entities))) {
      throw new Error(`Invalid structure in cluster ${i + 1}`);
    }
    const count = (items: string[]) => new Set(items.map(x => x.trim().replace(/\s+/g, ' ').toLowerCase()).filter(Boolean)).size;
    const seeds = count(c.seed_keywords), questions = count(c.questions);
    if (!c.cluster_name.trim()) issues.push(`Cluster ${i + 1} has no name.`);
    if (seeds < 20 || seeds > 50) issues.push(`${c.cluster_name}: ${seeds} unique seeds; expected 20–50.`);
    if (questions < 15 || questions > 30) issues.push(`${c.cluster_name}: ${questions} unique questions; expected 15–30.`);
    if (seeds !== c.seed_keywords.length || questions !== c.questions.length) issues.push(`${c.cluster_name}: duplicate or blank entries.`);
    return { cluster: c.cluster_name, seeds, questions };
  });
  return { status: issues.length ? 'incomplete' as const : 'complete' as const, issues, counts };
}
