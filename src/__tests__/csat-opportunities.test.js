// @ts-nocheck
// engine/csat-opportunities.js had zero test coverage despite being a live consumer of
// smg-voice.js's Opportunities tab (rankCommentOpportunities/MIN_N imported directly). Covers
// the file's own stated honesty guardrails: absolute-detractor-count primary sort (never let a
// thin store's scary rate outrank a real volume problem), Wilson-lower-bound tie-break, the
// thin-sample flag at MIN_N, and negative-only theme counting.
import { describe, it, expect } from 'vitest';
import { rankCommentOpportunities, classifyThemes, THEME_LEXICON, MIN_N } from '../engine/csat-opportunities.js';

describe('classifyThemes', () => {
  it('returns [] for empty/missing text', () => {
    expect(classifyThemes('')).toEqual([]);
    expect(classifyThemes(null)).toEqual([]);
    expect(classifyThemes(undefined)).toEqual([]);
  });

  it('matches a single theme by keyword, case-insensitively', () => {
    expect(classifyThemes('The line was SO SLOW today')).toEqual(['speed']);
  });

  it('matches multiple themes when a comment hits more than one lexicon', () => {
    const hits = classifyThemes('They gave me the wrong order and the fries were cold');
    expect(hits).toContain('accuracy');
    expect(hits).toContain('foodtemp');
  });

  it('THEME_LEXICON is well-formed (every entry has key/label/terms)', () => {
    for (const theme of THEME_LEXICON) {
      expect(theme.key).toBeTruthy();
      expect(theme.label).toBeTruthy();
      expect(Array.isArray(theme.terms) && theme.terms.length).toBeTruthy();
    }
  });
});

describe('rankCommentOpportunities — primary sort is absolute detractor count', () => {
  it('a 30-of-30 store outranks a 1-of-1 store despite identical 100% negative rate', () => {
    const rows = [
      ...Array.from({ length: 30 }, () => ({ loc: '1001', satisfactionLabel: 'dissatisfied', text: 'the wait was terribly slow' })),
      { loc: '1002', satisfactionLabel: 'dissatisfied', text: 'rude staff' },
    ];
    const { stores } = rankCommentOpportunities(rows);
    expect(stores[0].loc).toBe('1001');
    expect(stores[0].opportunity).toBe(30);
    expect(stores[0].negRate).toBe(1);
    expect(stores[1].loc).toBe('1002');
    expect(stores[1].negRate).toBe(1);
  });

  it('ties on opportunity break toward the higher confidence-adjusted (Wilson) rate', () => {
    const rows = [
      // Concentrated: 5 neg out of 10 (50% raw rate).
      ...Array.from({ length: 5 }, () => ({ loc: 'concentrated', satisfactionLabel: 'dissatisfied', text: 'slow' })),
      ...Array.from({ length: 5 }, () => ({ loc: 'concentrated', satisfactionLabel: 'satisfied', text: 'great' })),
      // Diluted: 5 neg out of 50 (10% raw rate) — same absolute opportunity, much thinner rate.
      ...Array.from({ length: 5 }, () => ({ loc: 'diluted', satisfactionLabel: 'dissatisfied', text: 'slow' })),
      ...Array.from({ length: 45 }, () => ({ loc: 'diluted', satisfactionLabel: 'satisfied', text: 'great' })),
    ];
    const { stores } = rankCommentOpportunities(rows);
    const concentrated = stores.find(s => s.loc === 'concentrated');
    const diluted = stores.find(s => s.loc === 'diluted');
    expect(concentrated.opportunity).toBe(5);
    expect(diluted.opportunity).toBe(5);
    expect(concentrated.negRateAdj).toBeGreaterThan(diluted.negRateAdj);
    // Tie-break puts the concentrated store first in the final ranking.
    expect(stores.indexOf(concentrated)).toBeLessThan(stores.indexOf(diluted));
  });
});

describe('rankCommentOpportunities — thin-sample flag', () => {
  it('flags a store below MIN_N as thin, and one at/above MIN_N as not thin', () => {
    const thinRows = Array.from({ length: MIN_N - 1 }, () => ({ loc: 'thin-store', satisfactionLabel: 'dissatisfied', text: 'slow' }));
    const fullRows = Array.from({ length: MIN_N }, () => ({ loc: 'full-store', satisfactionLabel: 'dissatisfied', text: 'slow' }));
    const { stores } = rankCommentOpportunities([...thinRows, ...fullRows]);
    expect(stores.find(s => s.loc === 'thin-store').thin).toBe(true);
    expect(stores.find(s => s.loc === 'full-store').thin).toBe(false);
  });
});

describe('rankCommentOpportunities — theme counting is negative-only', () => {
  it('does not count a positive comment toward themeCounts even if it contains a theme keyword', () => {
    const rows = [
      { loc: '2001', satisfactionLabel: 'dissatisfied', text: 'the wait was way too long' },
      { loc: '2001', satisfactionLabel: 'satisfied', text: 'worth the wait, amazing food!' },
    ];
    const { stores } = rankCommentOpportunities(rows);
    const store = stores.find(s => s.loc === '2001');
    const speedTheme = store.topThemes.find(t => t.key === 'speed');
    expect(speedTheme.count).toBe(1);
  });

  it('rolls up theme counts district-wide across stores', () => {
    const rows = [
      { loc: '3001', satisfactionLabel: 'dissatisfied', text: 'so slow today' },
      { loc: '3002', satisfactionLabel: 'dissatisfied', text: 'waited forever' },
      { loc: '3002', satisfactionLabel: 'dissatisfied', text: 'rude employee' },
    ];
    const { district } = rankCommentOpportunities(rows);
    const speed = district.themes.find(t => t.key === 'speed');
    const service = district.themes.find(t => t.key === 'service');
    expect(speed.count).toBe(2);
    expect(service.count).toBe(1);
    expect(district.neg).toBe(3);
    expect(district.total).toBe(3);
  });
});

describe('rankCommentOpportunities — score aggregation and store identity', () => {
  it('averages only rows with a finite numeric score', () => {
    const rows = [
      { loc: '4001', satisfactionLabel: 'satisfied', score: 5 },
      { loc: '4001', satisfactionLabel: 'satisfied', score: 3 },
      { loc: '4001', satisfactionLabel: 'satisfied', score: null },
    ];
    const { stores } = rankCommentOpportunities(rows);
    expect(stores[0].avgScore).toBe(4);
    expect(stores[0].total).toBe(3);
  });

  it('normalizes numeric and string loc values into the same store bucket', () => {
    const rows = [
      { loc: 5001, satisfactionLabel: 'dissatisfied', text: 'slow' },
      { loc: '5001', satisfactionLabel: 'dissatisfied', text: 'slow' },
    ];
    const { stores } = rankCommentOpportunities(rows);
    expect(stores.length).toBe(1);
    expect(stores[0].total).toBe(2);
  });

  it('uses opts.storeName(loc) to resolve a friendly name when provided', () => {
    const rows = [{ loc: '6001', satisfactionLabel: 'dissatisfied', text: 'slow' }];
    const { stores } = rankCommentOpportunities(rows, { storeName: loc => `Store ${loc}` });
    expect(stores[0].name).toBe('Store 6001');
  });

  it('filters out rows with no loc and counts only valid rows in totalComments', () => {
    const rows = [
      { loc: '7001', satisfactionLabel: 'dissatisfied', text: 'slow' },
      { loc: null, satisfactionLabel: 'dissatisfied', text: 'slow' },
      {},
    ];
    const { totalComments } = rankCommentOpportunities(rows);
    expect(totalComments).toBe(1);
  });

  it('handles empty/missing input without throwing', () => {
    expect(rankCommentOpportunities([]).stores).toEqual([]);
    expect(rankCommentOpportunities(null).stores).toEqual([]);
    expect(rankCommentOpportunities(undefined).totalComments).toBe(0);
  });
});
