import { describe, it, expect } from 'vitest';
import { storeScoreColor } from '../views/smg-voice.js';

// v4.931 — data-integrity sweep signature #5: the "By Store — Best → Worst" rail's row color
// fell through to the red ("worst") branch for a store with zero SMG comments (avgScore null),
// because `score >= 4.5`/`score >= 3.5` are both false for null/undefined — painting a store with
// NO DATA as if it had scored the worst possible result, visually indistinguishable from a real
// bad score. A real 1-5 star mean can never actually be 0, so null only ever means "no comments."
describe('storeScoreColor', () => {
  it('no data (null/undefined) renders muted, not red', () => {
    expect(storeScoreColor(null)).toBe('var(--text3)');
    expect(storeScoreColor(undefined)).toBe('var(--text3)');
  });
  it('a genuinely bad score still renders red', () => {
    expect(storeScoreColor(2.1)).toBe('#d94f4f');
  });
  it('grades the green/amber/red tiers correctly', () => {
    expect(storeScoreColor(4.7)).toBe('#28a870');
    expect(storeScoreColor(4.0)).toBe('#e8a040');
    expect(storeScoreColor(3.4)).toBe('#d94f4f');
  });
});
