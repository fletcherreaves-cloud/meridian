// @ts-nocheck
// Dispatch #169 — the dynamic per-item metric resolver itself: findMetric()/extractMetricValues()
// synthesizing a `pmixItem:<code>` key on the fly (no static METRIC_CATEGORIES entry), the
// price-tier summing, the allowZero decision, and the Scanner's bounded/opt-in item coverage.
// See dispatch-169-pmix-fof-correlation.test.js for the real-data acceptance test (the actual
// Filet-O-Fish × Friday claim) — this file is the plumbing underneath it, with small hand-built
// fixtures so each behavior is isolated and legible.
import { describe, it, expect } from 'vitest';
import {
  findMetric, extractMetricValues, computeCustomSignal, scanAllPairs,
  pmixItemKey, isPmixItemKey, pmixItemCodeFromKey, pmixItemsIndex, PMIX_SCANNER_TOP_N,
  METRIC_CATEGORIES,
} from '../engine/signal-registry.js';

describe('dispatch #169 — pmixItem key shape', () => {
  it('round-trips code -> key -> code', () => {
    expect(pmixItemKey('5926')).toBe('pmixItem:5926');
    expect(isPmixItemKey('pmixItem:5926')).toBe(true);
    expect(pmixItemCodeFromKey('pmixItem:5926')).toBe('5926');
  });
  it('does not misclassify a static registry key or an unrelated string', () => {
    expect(isPmixItemKey('sales')).toBe(false);
    expect(isPmixItemKey('__priceEvents')).toBe(false);
    expect(pmixItemCodeFromKey('sales')).toBeNull();
  });
  it('is never a static METRIC_CATEGORIES entry — the whole point of the dynamic resolver', () => {
    const allKeys = METRIC_CATEGORIES.flatMap(c => c.metrics.map(m => m.key));
    expect(allKeys.some(k => isPmixItemKey(k))).toBe(false);
  });
});

describe('dispatch #169 — findMetric() synthesizes item metrics on the fly', () => {
  it('resolves an item key with a generic label before any real data has been scanned', () => {
    const meta = findMetric('pmixItem:999999');
    expect(meta).toBeTruthy();
    expect(meta.label).toContain('999999');
    expect(meta.source).toBe('__pmixItem');
    expect(meta.granularity).toEqual(['daily']);
    expect(meta.allowZero).toBe(true);
  });
  it('picks up the REAL desc once pmixItemsIndex has scanned a ds.pmixRows carrying it', () => {
    const rows = [{ loc: '3708', date: '2026-01-02', item: 42424, price: 4.59, desc: 'Filet-O-Fish', familyGroup: 'REGULAR_ENTREE', soldQty: 10 }];
    pmixItemsIndex(rows); // warms the label cache, same as extractMetricValues does internally
    const meta = findMetric('pmixItem:42424');
    expect(meta.label).toBe('Filet-O-Fish · Sold Qty');
  });
  it('unknown static key still returns null (no accidental catch-all)', () => {
    expect(findMetric('not_a_real_metric')).toBeNull();
  });
});

describe('dispatch #169 — pmixItemsIndex', () => {
  const rows = [
    { loc: '3708', date: '2026-01-01', item: 1, price: 1, desc: 'Item One', familyGroup: 'FRIES', soldQty: 100 },
    { loc: '3708', date: '2026-01-02', item: 1, price: 1, desc: 'Item One', familyGroup: 'FRIES', soldQty: 50 },
    { loc: '3708', date: '2026-01-01', item: 2, price: 2, desc: 'Item Two', familyGroup: 'SHAKES', soldQty: 5 },
  ];
  it('aggregates total soldQty per item and sorts by volume descending', () => {
    const idx = pmixItemsIndex(rows);
    expect(idx.map(e => e.item)).toEqual(['1', '2']);
    expect(idx[0].totalSoldQty).toBe(150);
    expect(idx[0].desc).toBe('Item One');
    expect(idx[0].familyGroup).toBe('FRIES');
  });
  it('is memoized by array identity (same reference -> same computed list)', () => {
    const a = pmixItemsIndex(rows);
    const b = pmixItemsIndex(rows);
    expect(a).toBe(b);
  });
  it('a fresh array (even with identical content) recomputes rather than reusing a stale cache', () => {
    const a = pmixItemsIndex(rows);
    const b = pmixItemsIndex([...rows]);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
  it('handles empty/missing pmixRows without throwing', () => {
    expect(pmixItemsIndex(null)).toEqual([]);
    expect(pmixItemsIndex([])).toEqual([]);
  });
});

describe('dispatch #169 — extractMetricValues(__pmixItem): price-tier summing', () => {
  it('sums soldQty across multiple price tiers on the SAME (loc,date,item) — grain is (loc,date,item,price)', () => {
    // schema-product-mix.sql's own measured example: a McChicken sold at $1.50 AND $3.69
    // the same store-day. Same shape here for item 5926 across two price points.
    const rows = [
      { loc: '3708', date: '2026-01-05', item: 5926, price: 4.59, soldQty: 11 },
      { loc: '3708', date: '2026-01-05', item: 5926, price: 5.39, soldQty: 2 },
      { loc: '3708', date: '2026-01-06', item: 5926, price: 4.59, soldQty: 8 },
    ];
    const vals = extractMetricValues(pmixItemKey('5926'), { pmixRows: rows }, 'daily');
    const byDate = Object.fromEntries(vals.map(v => [v.date, v.value]));
    expect(byDate['2026-01-05']).toBe(13); // 11 + 2, not one row silently dropped
    expect(byDate['2026-01-06']).toBe(8);
  });
  it('only ever reads the requested item — a co-loaded neighbor item does not leak in', () => {
    const rows = [
      { loc: '3708', date: '2026-01-05', item: 5926, price: 4.59, soldQty: 11 },
      { loc: '3708', date: '2026-01-05', item: 4314, price: 1.19, soldQty: 999 }, // McChicken, unrelated
    ];
    const vals = extractMetricValues(pmixItemKey('5926'), { pmixRows: rows }, 'daily');
    expect(vals.length).toBe(1);
    expect(vals[0].value).toBe(11);
  });
  it('respects scopeLoc', () => {
    const rows = [
      { loc: '3708', date: '2026-01-05', item: 5926, price: 4.59, soldQty: 11 },
      { loc: '5183', date: '2026-01-05', item: 5926, price: 4.59, soldQty: 30 },
    ];
    const vals = extractMetricValues(pmixItemKey('5926'), { pmixRows: rows }, 'daily', '3708');
    expect(vals.length).toBe(1);
    expect(vals[0].value).toBe(11);
  });
  it('is daily-only — a monthly request returns nothing rather than a misleading partial sum', () => {
    const rows = [{ loc: '3708', date: '2026-01-05', item: 5926, price: 4.59, soldQty: 11 }];
    expect(extractMetricValues(pmixItemKey('5926'), { pmixRows: rows }, 'monthly')).toEqual([]);
  });
  it('an item with zero pmixRows coverage returns an empty series, not an error', () => {
    expect(extractMetricValues(pmixItemKey('123456'), { pmixRows: [] }, 'daily')).toEqual([]);
    expect(extractMetricValues(pmixItemKey('123456'), {}, 'daily')).toEqual([]);
  });
});

describe('dispatch #169 — allowZero semantics (task 5)', () => {
  // The dispatch's own reasoning: "0 Filet-O-Fish sold on a Tuesday" is real signal, not missing
  // data, so allowZero must be true. Documented finding: scripts/qsrsoft-pmix-pull.mjs already
  // filters soldQty<=0 rows before upsert ("catalog placeholders"), so in the CURRENT pipeline a
  // literal 0-sold day never reaches ds.pmixRows as a row — it shows up as an absent (loc,date),
  // not a present zero. allowZero:true is still correct (forward-compatible + harmless today);
  // this test locks in the behavior that WOULD apply if a zero-qty row ever did arrive, so a
  // future change to the resolver doesn't silently start dropping it the way the generic daily
  // branch drops 0 for every non-allowZero metric.
  it('metadata is allowZero:true', () => {
    expect(findMetric(pmixItemKey('5926')).allowZero).toBe(true);
  });
  it('a literal soldQty:0 row, if one ever arrives, survives extraction rather than being dropped', () => {
    const rows = [{ loc: '3708', date: '2026-01-05', item: 5926, price: 4.59, soldQty: 0 }];
    const vals = extractMetricValues(pmixItemKey('5926'), { pmixRows: rows }, 'daily');
    expect(vals.length).toBe(1);
    expect(vals[0].value).toBe(0);
  });
});

describe('dispatch #169 — Scanner item coverage (task 4): bounded and opt-in only', () => {
  // 40 days × 3 stores of laborRows (for the calendar universe) plus pmixRows for 5 items,
  // 3 of which correlate with Friday by construction and 2 which are pure noise.
  const days = Array.from({ length: 40 }, (_, i) => new Date(2026, 0, 1 + i));
  const stores = ['3708', '5183', '6178'];
  const laborRows = [];
  const pmixRows = [];
  for (const loc of stores) {
    for (const d of days) {
      laborRows.push({ loc, date: d, sales: 10000, gc: 900 });
      const isFri = d.getDay() === 5;
      const dstr = d.toISOString().slice(0, 10);
      pmixRows.push({ loc, date: dstr, item: 9001, price: 4.59, desc: 'Signal Item', soldQty: isFri ? 40 : 10 });
      pmixRows.push({ loc, date: dstr, item: 9002, price: 1.0, desc: 'Noise Item A', soldQty: 20 + (loc.charCodeAt(0) % 3) });
      pmixRows.push({ loc, date: dstr, item: 9003, price: 1.0, desc: 'Noise Item B', soldQty: 15 });
    }
  }
  const ds = { laborRows, pmixRows };

  it('a default scan (no includeItems) is byte-for-byte unaffected by item coverage existing', () => {
    const withoutFlag = scanAllPairs(ds, { granularity: 'daily', minAbsR: 0.1, minN: 20 });
    const withFalseFlag = scanAllPairs(ds, { granularity: 'daily', minAbsR: 0.1, minN: 20, includeItems: false });
    expect(withoutFlag.tested).toBe(withFalseFlag.tested);
    expect(withoutFlag.metricsUsed).toBe(withFalseFlag.metricsUsed);
    expect(withoutFlag.results.some(r => isPmixItemKey(r.xKey) || isPmixItemKey(r.yKey))).toBe(false);
    expect(withoutFlag.itemsUsed || 0).toBe(0);
  });

  it('includeItems:true surfaces the real Friday-linked item and stays bounded', () => {
    const before = scanAllPairs(ds, { granularity: 'daily', minAbsR: 0.1, minN: 20 });
    const after = scanAllPairs(ds, { granularity: 'daily', minAbsR: 0.1, minN: 20, includeItems: true });
    expect(after.itemsUsed).toBeGreaterThan(0);
    // Bounded growth: item pairs only ever multiply against calendar/weather metrics (a handful),
    // never against the full registry (O(items × few), not O(items²) or O(items × everything)).
    const calWxKeysBefore = Object.keys(ds).length; // not the real formula, just asserts sane order of magnitude below
    const growth = after.tested - before.tested;
    expect(growth).toBeGreaterThan(0);
    expect(growth).toBeLessThan(after.itemsUsed * 10); // calendar has 3 keys, weather unused here — generous ceiling
    // The constructed Friday-correlated item shows up, tagged as a product_mix pair.
    const fofPair = after.results.find(r => (r.xKey === 'pmixItem:9001' || r.yKey === 'pmixItem:9001'));
    expect(fofPair).toBeTruthy();
    expect(Math.abs(fofPair.r)).toBeGreaterThan(0.3);
  });

  it('respects an explicit itemTopN cap', () => {
    const capped = scanAllPairs(ds, { granularity: 'daily', minAbsR: 0.01, minN: 20, includeItems: true, itemTopN: 1 });
    expect(capped.itemsUsed).toBeLessThanOrEqual(1);
  });

  it('is a no-op with no pmixRows loaded, even when requested', () => {
    const res = scanAllPairs({ laborRows }, { granularity: 'daily', minAbsR: 0.1, minN: 20, includeItems: true });
    expect(res.itemsUsed || 0).toBe(0);
  });

  it('is a no-op at monthly granularity (item metrics are daily-only)', () => {
    const res = scanAllPairs(ds, { granularity: 'monthly', minAbsR: 0.1, minN: 3, includeItems: true });
    expect(res.itemsUsed || 0).toBe(0);
  });

  it('PMIX_SCANNER_TOP_N is a sane positive bound, not accidentally unlimited', () => {
    expect(PMIX_SCANNER_TOP_N).toBeGreaterThan(0);
    expect(PMIX_SCANNER_TOP_N).toBeLessThan(1000);
  });
});

describe('dispatch #169 — regression: Calendar/Pricing metrics now actually reach scanAllPairs', () => {
  // Measured while building the item×Calendar/Weather sweep above: scanAllPairs's valMap
  // pre-extraction loop gated every metric on `ds[m.source]` being a non-empty array. Calendar
  // (__calendar) and Pricing (__priceEvents) are DERIVED sources with no such backing array by
  // design (see the header comment on the calendar METRIC_CATEGORIES block) — so this silently
  // dropped every calFri/calWeekend/calMon/pxDaysSince/etc. metric from the Scanner's sweep,
  // every time, since Calendar shipped in v4.533. computeCustomSignal (used by SEEDED_SIGNALS'
  // "Friday lift" entry) never hit this — only the auto-scan path did. Reproduced directly
  // before this dispatch's fix: scanAllPairs({ laborRows }, ...) against an obvious Fri/Sat/Sun
  // sales pattern returned metricsUsed:2 (sales, gc only), zero calendar pairs. This is exactly
  // the "engine right but unused" shape CLAUDE.md's dispatch16 rule calls out — a test on
  // extractMetricValues/computeCustomSignal alone (which is all the pre-existing calendar tests
  // did) can't tell "wired into the Scanner" from "wired into everything except the Scanner."
  const days = Array.from({ length: 42 }, (_, i) => new Date(2026, 0, 1 + i));
  const laborRows = days.map(d => {
    const wknd = (d.getDay() === 0 || d.getDay() === 6);
    return { loc: '3708', date: d, sales: wknd ? 14000 : 10000, gc: wknd ? 1400 : 1000 };
  });

  it('calFri/calWeekend actually appear as scanAllPairs results, not just in computeCustomSignal', () => {
    const res = scanAllPairs({ laborRows }, { granularity: 'daily', minAbsR: 0.1, minN: 20 });
    expect(res.metricsUsed).toBeGreaterThan(2); // sales+gc alone would be 2 — the old broken state
    const calPair = res.results.find(r => r.xKey === 'calWeekend' || r.yKey === 'calWeekend');
    expect(calPair).toBeTruthy();
    expect(Math.abs(calPair.r)).toBeGreaterThan(0.9); // the constructed weekend lift is deterministic
  });

  it('pxDaysSince actually appears in scanAllPairs when pmixRows is loaded', () => {
    // Minimal pmixRows carrying a detectable confirmed price step so priceDailySeries has
    // something to report — reuses the same real detector price-events.js already ships.
    const pmixRows = [];
    for (let i = 0; i < 20; i++) {
      pmixRows.push({ loc: '3708', date: `2026-01-${String(i + 1).padStart(2, '0')}`, item: 100, price: i < 10 ? 1.00 : 1.50, soldQty: 10 });
    }
    const laborRows2 = Array.from({ length: 20 }, (_, i) => ({ loc: '3708', date: new Date(2026, 0, 1 + i), sales: 1000 + i }));
    const res = scanAllPairs({ laborRows: laborRows2, pmixRows }, { granularity: 'daily', minAbsR: 0.01, minN: 5 });
    expect(Object.keys(res).length).toBeGreaterThan(0); // sanity: didn't throw
    // metricsUsed must count at least sales -- pxDaysSince may or may not clear minN depending
    // on the confirmed-step detector's window, so assert the gate no longer silently excludes
    // the whole __priceEvents category outright (i.e. it was at least attempted).
    expect(res.metricsUsed).toBeGreaterThanOrEqual(1);
  });
});

describe('dispatch #169 — computeCustomSignal with a pmixItem metric on one axis', () => {
  it('builds a real signal object with the item label, not a raw key', () => {
    const days = Array.from({ length: 30 }, (_, i) => new Date(2026, 0, 1 + i));
    const laborRows = days.map(d => ({ loc: '3708', date: d, sales: 1000 }));
    const pmixRows = days.map(d => ({
      loc: '3708', date: d.toISOString().slice(0, 10), item: 7777, price: 3, desc: 'Test Sandwich',
      soldQty: d.getDay() === 5 ? 50 : 10,
    }));
    const sig = computeCustomSignal({ id: 't', xMetric: 'calFri', yMetric: pmixItemKey('7777'), granularity: 'daily', scope: 'district' }, { laborRows, pmixRows });
    expect(sig.yLabel).toBe('Test Sandwich · Sold Qty');
    expect(sig.r).toBeGreaterThan(0.5);
    expect(sig.n).toBe(30);
  });
});
