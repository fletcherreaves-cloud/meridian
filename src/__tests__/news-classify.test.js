// @ts-nocheck
// engine/news-classify.js had zero test coverage despite being live production code —
// scripts/news-rss-pull.mjs and scripts/youtube-pull.mjs both import classify() to feed the
// news_mentions table news-panel.js reads. Covers the file's own stated three-tier rules
// (brand always wins > local signal > noise suppressed) and rankNews's filter/sort/cap.
import { describe, it, expect } from 'vitest';
import { isNoise, mentionsBrand, classify, rankNews, BRAND_TERMS, NOISE_PATTERNS, LOCAL_SIGNALS } from '../engine/news-classify.js';

describe('mentionsBrand', () => {
  it('matches a brand term case-insensitively in title or summary', () => {
    expect(mentionsBrand({ title: 'New McDonald\'s opens on Main St' })).toBe(true);
    expect(mentionsBrand({ summary: 'MCDONALDS to renovate' })).toBe(true);
    expect(mentionsBrand({ title: 'Golden Arches unveils new menu' })).toBe(true);
  });

  it('returns false when no brand term is present', () => {
    expect(mentionsBrand({ title: 'City council meets Tuesday' })).toBe(false);
    expect(mentionsBrand({})).toBe(false);
  });
});

describe('isNoise', () => {
  it('treats empty title+summary as noise', () => {
    expect(isNoise({})).toBe(true);
    expect(isNoise({ title: '   ', summary: '' })).toBe(true);
  });

  it('flags prep-sports and obituary content as noise', () => {
    expect(isNoise({ title: 'Golf roundup: Velma claims team title' })).toBe(true);
    expect(isNoise({ title: 'John Smith obituary — visitation Friday' })).toBe(true);
  });

  it('brand mention always wins over a noise pattern in the same item', () => {
    expect(isNoise({ title: 'McDonald\'s sponsors the football roundup this week' })).toBe(false);
  });

  it('does not flag ordinary local content as noise', () => {
    expect(isNoise({ title: 'I-35 closed near Purcell due to a crash' })).toBe(false);
  });
});

describe('classify — three-tier rules', () => {
  it('empty content classifies as noise with score 0', () => {
    expect(classify({})).toEqual({ tier: 'noise', signals: [], score: 0 });
  });

  it('a noise pattern with no brand mention classifies as noise', () => {
    const r = classify({ title: 'Comanche\'s RJ Roberts named all-district' });
    expect(r.tier).toBe('noise');
    expect(r.score).toBe(0);
  });

  it('a brand mention classifies as tier "brand" with score 100 + signal count', () => {
    const r = classify({ title: 'McDonald\'s on Main St closes for renovation' });
    expect(r.tier).toBe('brand');
    expect(r.signals).toContain('business');
    expect(r.score).toBe(100 + r.signals.length);
  });

  it('a local signal with no brand mention classifies as tier "local" with score 10 + 5*signals', () => {
    const r = classify({ title: 'I-35 closed near Purcell due to a crash' });
    expect(r.tier).toBe('local');
    expect(r.signals).toContain('roads');
    expect(r.score).toBe(10 + r.signals.length * 5);
  });

  it('an unrecognized, non-noise, non-brand item is still kept as local (biased toward keeping)', () => {
    const r = classify({ title: 'Downtown Purcell welcomes visitors this weekend' });
    expect(r.tier).toBe('local');
  });

  it('multiple local signals in one item are all captured', () => {
    const r = classify({ title: 'Theft reported near I-40 construction zone' });
    expect(r.signals).toEqual(expect.arrayContaining(['roads', 'crime']));
  });
});

describe('BRAND_TERMS / NOISE_PATTERNS / LOCAL_SIGNALS — structural sanity', () => {
  it('exports non-empty arrays with the expected shapes', () => {
    expect(BRAND_TERMS.length).toBeGreaterThan(0);
    expect(NOISE_PATTERNS.length).toBeGreaterThan(0);
    for (const sig of LOCAL_SIGNALS) {
      expect(sig.key).toBeTruthy();
      expect(sig.re).toBeInstanceOf(RegExp);
    }
  });
});

describe('rankNews', () => {
  const brandItem = { title: 'McDonald\'s adds new drive-thru lane', published: new Date('2026-08-01') };
  const localItem = { title: 'I-35 closed near Purcell due to a crash', published: new Date('2026-08-05') };
  const noiseItem = { title: 'Golf roundup: local team wins tournament', published: new Date('2026-08-10') };

  it('drops noise items entirely', () => {
    const out = rankNews([brandItem, localItem, noiseItem]);
    expect(out.some(i => i.title === noiseItem.title)).toBe(false);
  });

  it('ranks brand items ahead of local items regardless of recency', () => {
    const out = rankNews([localItem, brandItem]); // local is more recent, brand should still lead
    expect(out[0].title).toBe(brandItem.title);
    expect(out[0].tier).toBe('brand');
  });

  it('excludes local items entirely when includeLocal:false, keeping only brand', () => {
    const out = rankNews([brandItem, localItem], { includeLocal: false });
    expect(out.length).toBe(1);
    expect(out[0].tier).toBe('brand');
  });

  it('caps results at max', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ title: `McDonald's story ${i}`, published: new Date(2026, 7, i + 1) }));
    const out = rankNews(many, { max: 3 });
    expect(out.length).toBe(3);
  });

  it('breaks a same-score tie by recency (newer first)', () => {
    const older = { title: 'McDonald\'s renovates lobby', published: new Date('2026-01-01') };
    const newer = { title: 'McDonald\'s renovates drive-thru', published: new Date('2026-08-01') };
    const out = rankNews([older, newer]);
    expect(out[0].title).toBe(newer.title);
  });

  it('handles empty/missing input without throwing', () => {
    expect(rankNews([])).toEqual([]);
    expect(rankNews(undefined)).toEqual([]);
  });
});
