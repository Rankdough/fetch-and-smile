import { describe, it, expect } from 'vitest';
import { validateKeywordMap } from '../../supabase/functions/_shared/keywordValidation';
import replay from './fixtures/keyword-replay.json';
const complete = () => ({ topic: 'Accommodation', definition: '', notes: '', cross_cutting_modifiers: [], negative_keywords: [],
  clusters: Array.from({ length: 12 }, (_, i) => ({ cluster_name: `Cluster ${i}`, modifiers: [],
    seed_keywords: Array.from({ length: 20 }, (_, j) => `seed ${j}`), questions: Array.from({ length: 15 }, (_, j) => `question ${j}`) })) });
describe('keyword count validation', () => {
  it('validates the later saved PR #2 replay without live APIs', () => {
    const validation = validateKeywordMap(replay.results);
    expect(validation.status).toBe('complete');
    expect(validation.issues).toEqual([]);
    const shortened = structuredClone(replay.results);
    shortened.clusters[0].seed_keywords = shortened.clusters[0].seed_keywords.slice(0, 10);
    expect(validateKeywordMap(shortened).status).toBe('incomplete');
  });
  it('accepts lower and upper boundaries', () => {
    expect(validateKeywordMap(complete()).status).toBe('complete');
    const map = complete();
    map.clusters = Array.from({ length: 20 }, (_, i) => ({ cluster_name: `${i}`, modifiers: [], seed_keywords: Array.from({length: 50}, (_, j) => `${j}`), questions: Array.from({length: 30}, (_, j) => `${j}`) }));
    expect(validateKeywordMap(map).status).toBe('complete');
  });
  it('does not count whitespace, blanks or case duplicates as extra ideas', () => {
    const map = complete(); map.clusters[0].seed_keywords[19] = ' SEED   0 ';
    map.clusters[0].questions[14] = '  ';
    const result = validateKeywordMap(map);
    expect(result.status).toBe('incomplete');
    expect(result.counts[0]).toMatchObject({ seeds: 19, questions: 14 });
  });
  it('flags excess counts and missing clusters', () => {
    const map = complete(); map.clusters[0].questions = Array.from({length: 31}, (_, j) => `${j}`);
    expect(validateKeywordMap(map).status).toBe('incomplete');
    map.clusters = []; expect(validateKeywordMap(map).status).toBe('incomplete');
  });
  it('rejects malformed arrays before the UI or reductions access them', () => {
    expect(() => validateKeywordMap({clusters: null})).toThrow();
    const map = complete(); (map.clusters[0] as any).questions = [7];
    expect(() => validateKeywordMap(map)).toThrow();
  });
});
