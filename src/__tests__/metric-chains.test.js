import { describe, it, expect } from 'vitest';
import { METRIC_SOURCES, metricDaily } from '../engine/metric-source.js';

// Field names each loader is known to emit, taken from src/lib/supabase.js. A chain that
// names a field its source doesn't emit resolves to nothing and silently falls through —
// exactly the blank-tile failure this work exists to remove — so pin them.
const EMITS = {
  ctrlRows: ['cashRefAmt', 'cashRefCnt', 'cashlessRefAmt', 'cashlessRefCnt', 'posOverAmt',
             'posOverCnt', 'promoAmt', 'promoPct', 'tRedACnt', 'tRedBCnt', 'laborPct',
             'tpph', 'otHrs', 'cashOSPct', 'cashOSAmt', 'tRedAPct', 'tRedBPct',
             'drawerOpens', 'discPct'],
  opsCashRows: ['cashRefAmt', 'cashRefCnt', 'cashlessRefAmt', 'cashlessRefCnt', 'tRedACnt',
                'tRedBCnt', 'tRedAPct', 'tRedBPct', 'cashOSAmt', 'cashOSPct', 'discPct',
                'drawerOpens'],
  cashRows: ['cashRefAmt', 'cashRefCnt', 'cashlessRefAmt', 'cashlessRefCnt', 'posOverAmt',
             'posOverCnt', 'avgCheck', 'cashOS', 'cashOSPct'],
  glimpseRows: ['posOverAmt', 'posOverCnt', 'promoAmt', 'promoPct', 'avgCheck', 'laborPct',
                'cashOS', 'cashOSPct', 'gc', 'kvst', 'kvsHealthy', 'oepe', 'parkedPct'],
  salesLedgerRows: ['avgCheck', 'dtPctTotal'],
  laborRows: ['avgCheck', 'dtPctTotal', 'sales', 'gc', 'laborPct', 'tpph', 'otHrs'],
};

const NEW_IN_PHASE1 = [
  'cashRefAmt', 'cashRefCnt', 'cashlessRefAmt', 'cashlessRefCnt',
  'posOverAmt', 'posOverCnt', 'promoAmt', 'promoPct',
  'tRedACnt', 'tRedBCnt', 'avgCheck', 'dtMixPct',
];

describe('Phase 1 resolution chains', () => {
  it('registers all 12', () => {
    for (const k of NEW_IN_PHASE1) expect(METRIC_SOURCES[k], k).toBeTruthy();
  });

  it('gives every one a real fallback — a single-source "chain" would be theatre', () => {
    for (const k of NEW_IN_PHASE1) {
      expect(METRIC_SOURCES[k].srcs.length, k).toBeGreaterThan(1);
    }
  });

  it('only names fields the source loader actually emits', () => {
    const bad = [];
    for (const [key, def] of Object.entries(METRIC_SOURCES)) {
      for (const [src, field] of def.srcs) {
        if (EMITS[src] && !EMITS[src].includes(field)) bad.push(`${key}: ${src}.${field}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('uses mode "any" for metrics where zero is a legitimate reading', () => {
    // A store with no refunds, no promos and no T-Reds had a clean day. Treating 0 as
    // "missing" would fall through to a staler source and misreport a good day.
    for (const k of ['cashRefAmt', 'cashRefCnt', 'cashlessRefAmt', 'cashlessRefCnt',
                     'posOverAmt', 'posOverCnt', 'promoAmt', 'promoPct', 'tRedACnt', 'tRedBCnt']) {
      expect(METRIC_SOURCES[k].mode, k).toBe('any');
    }
  });

  it('uses mode "pos" where zero means missing', () => {
    // An average check or DT mix of 0 is never a real reading.
    expect(METRIC_SOURCES.avgCheck.mode).toBe('pos');
    expect(METRIC_SOURCES.dtMixPct.mode).toBe('pos');
  });
});

describe('resolution behaviour', () => {
  const D = new Date('2026-08-05T12:00:00');
  const row = (extra) => ({ loc: '3708', date: D, ...extra });

  it('falls back to the emailed stream when the manual upload is absent', () => {
    const ds = { cashRows: [row({ cashRefAmt: 42 })] };
    expect(metricDaily(ds, '3708', D, 'cashRefAmt')).toBe(42);
  });

  it('prefers the AUTO stream over the manual upload when both are present', () => {
    // Inverted deliberately in v4.855. This asserted manual-first, which contradicted
    // CLAUDE.md's standing rule that manual uploads "must never override auto/emailed
    // data or be a tile's primary source". 27 of 30 chains led with manual until then.
    const ds = {
      ctrlRows: [row({ cashRefAmt: 10 })],       // manual
      opsCashRows: [row({ cashRefAmt: 99 })],    // auto-pulled Operations Report
    };
    expect(metricDaily(ds, '3708', D, 'cashRefAmt')).toBe(99);
  });

  it('still falls through to manual when the auto stream has no row for that day', () => {
    // The reason manual is KEPT last rather than removed: it holds history back to
    // 2022-01-01 that DAR (2025-01-01) does not, and resolution is per-day.
    const ds = { ctrlRows: [row({ cashRefAmt: 10 })] };
    expect(metricDaily(ds, '3708', D, 'cashRefAmt')).toBe(10);
  });

  it('keeps a legitimate 0 rather than falling through to a staler source', () => {
    // 0 T-Reds is a clean day, not missing data — mode 'any' must return it rather than
    // falling through. Source here is the AUTO stream, which now leads the chain.
    const ds = { opsCashRows: [row({ tRedACnt: 0 })], ctrlRows: [row({ tRedACnt: 7 })] };
    expect(metricDaily(ds, '3708', D, 'tRedACnt')).toBe(0);
  });

  it('does fall through on 0 for a "pos" metric, where 0 means missing', () => {
    const ds = {
      laborRows: [row({ avgCheck: 0 })],
      glimpseRows: [row({ avgCheck: 8.25 })],
    };
    expect(metricDaily(ds, '3708', D, 'avgCheck')).toBeCloseTo(8.25, 4);
  });

  it('returns null when no source has the day at all', () => {
    expect(metricDaily({}, '3708', D, 'cashRefAmt')).toBeNull();
  });
});
