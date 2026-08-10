import { describe, it, expect } from 'vitest';
import { newsContextFor, contextSummary, SIGNAL_WEIGHT, LEAD_DAYS } from '../engine/swing-context.js';

// Real Atoka (10422) headlines from news_mentions, and the real swing window.
const ATOKA = [
  { loc: '10422', locs: ['10422'], published: new Date('2026-06-24'), signals: ['roads', 'weather'],
    title: 'Work begins to restore storm-damaged roads in Atoka County' },
  { loc: '10422', locs: ['10422'], published: new Date('2026-06-27'), signals: ['weather'],
    title: 'Atoka County tallies storm damage repair costs' },
  { loc: '10422', locs: ['10422'], published: new Date('2026-07-19'), signals: ['roads'],
    title: 'ATV crash leaves woman hospitalized, man arrested in Atoka County' },
  { loc: '10422', locs: ['10422'], published: new Date('2026-08-04'), signals: [],
    title: 'Candidates gear up for Oklahoma primary runoff elections' },
  { loc: '35242', locs: ['35242'], published: new Date('2026-06-24'), signals: ['roads'],
    title: 'A different store entirely' },
];
const WINDOW = { loc: '10422', from: '2026-07-30', to: '2026-08-06' };

describe('newsContextFor', () => {
  it('looks BACK before the swing — a cause precedes its effect', () => {
    // The candidate explanation is 36 days before the decline window opens. Searching
    // only inside the window would find none of it, which is the whole point.
    const r = newsContextFor(ATOKA, WINDOW);
    expect(r[0].title).toContain('storm-damaged roads');
    expect(r[0].preceding).toBe(true);
  });

  it('ranks preceding items above concurrent ones', () => {
    const r = newsContextFor(ATOKA, WINDOW);
    const roadsBefore = r.find(x => x.title.includes('storm-damaged'));
    const crashDuring = r.find(x => x.title.includes('ATV'));
    expect(roadsBefore.score).toBeGreaterThan(crashDuring.score);
  });

  it('drops stories with no traffic-relevant signal', () => {
    expect(newsContextFor(ATOKA, WINDOW).some(r => r.title.includes('Candidates'))).toBe(false);
  });

  it('never leaks another store’s news', () => {
    expect(newsContextFor(ATOKA, WINDOW).some(r => r.title === 'A different store entirely')).toBe(false);
  });

  it('includes a story attributed ambiguously to this store among others', () => {
    const shared = [{ loc: '3708', locs: ['3708', '24471'], published: new Date('2026-07-01'),
                      signals: ['roads'], title: 'Ardmore road closure' }];
    expect(newsContextFor(shared, { loc: '24471', from: '2026-07-30', to: '2026-08-06' })).toHaveLength(1);
  });

  it('describes when each item happened relative to the decline', () => {
    const r = newsContextFor(ATOKA, WINDOW);
    expect(r[0].whenRelative).toBe('36 days before the decline');
    expect(r.find(x => x.title.includes('ATV')).whenRelative).toBe('11 days before the decline');
  });

  it('ignores anything outside the lookback window', () => {
    const ancient = [{ loc: '10422', locs: ['10422'], published: new Date('2025-01-01'),
                       signals: ['roads'], title: 'Ancient roadworks' }];
    expect(newsContextFor(ancient, WINDOW)).toEqual([]);
  });

  it('returns nothing rather than something when there is no news', () => {
    expect(newsContextFor([], WINDOW)).toEqual([]);
    // A store with no stories of its own gets nothing — 99999 appears nowhere in the
    // fixture. (35242 would NOT be empty: the fixture deliberately holds a Cottondale
    // roads story inside the lookback, which is what proves the loc filter works above.)
    expect(newsContextFor(ATOKA, { loc: '99999', from: '2026-07-30', to: '2026-08-06' })).toEqual([]);
  });

  it('is safe on junk input', () => {
    expect(newsContextFor(null, WINDOW)).toEqual([]);
    expect(newsContextFor(ATOKA, {})).toEqual([]);
    expect(newsContextFor([{ loc: '10422', published: null, signals: ['roads'], title: 'x' }], WINDOW)).toEqual([]);
  });

  it('weights roads highest — the most direct traffic lever', () => {
    expect(SIGNAL_WEIGHT.roads).toBeGreaterThan(SIGNAL_WEIGHT.weather);
    expect(SIGNAL_WEIGHT.weather).toBeGreaterThan(SIGNAL_WEIGHT.community);
    expect(LEAD_DAYS).toBe(45);
  });
});

describe('contextSummary', () => {
  it('names the kinds of activity found', () => {
    expect(contextSummary(newsContextFor(ATOKA, WINDOW))).toBe('road and weather activity reported locally around this window');
  });

  it('is null when there is nothing, so the UI can omit the section entirely', () => {
    expect(contextSummary([])).toBeNull();
  });

  it('never asserts causation', () => {
    // The wording is load-bearing. This ranks candidates; it does not explain anything.
    const s = contextSummary(newsContextFor(ATOKA, WINDOW));
    expect(s).not.toMatch(/caused|because|due to|explains/i);
  });
});
