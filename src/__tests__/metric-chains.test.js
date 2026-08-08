import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { METRIC_SOURCES, metricDaily, metricSeries, MANUAL_ONLY_METRICS } from '../engine/metric-source.js';

// Field names each loader is known to emit, taken from src/lib/supabase.js. A chain that
// names a field its source doesn't emit resolves to nothing and silently falls through —
// exactly the blank-tile failure this work exists to remove — so pin them.
const EMITS = {
  auditRows: ['empMealDisc', 'mgrMealAmt', 'manualRefAmt', 'drawerOpens', 'posOverCnt'],
  ctrlRows: ['cashRefAmt', 'cashRefCnt', 'cashlessRefAmt', 'cashlessRefCnt', 'posOverAmt',
             'posOverCnt', 'promoAmt', 'promoPct', 'tRedACnt', 'tRedBCnt', 'laborPct',
             'tpph', 'otHrs', 'cashOSPct', 'cashOSAmt', 'tRedAPct', 'tRedBPct',
             'drawerOpens', 'discPct', 'actHrs', 'actVsNeed', 'salaryMgrHrs',
             'empMealAmt', 'mgrMealAmt', 'manualRefAmt', 'depositAmt'],   // ⚠️ this list has now
             // been stale THREE times in one day. It is hand-maintained against loaders that keep
             // gaining fields; it should be generated from src/lib/supabase.js instead.   // actHrs added 2026-08-08 — supabase.js:1143 maps act_hrs
  opsCashRows: ['cashRefAmt', 'cashRefCnt', 'cashlessRefAmt', 'cashlessRefCnt', 'tRedACnt',
                'tRedBCnt', 'tRedAPct', 'tRedBPct', 'cashOSAmt', 'cashOSPct', 'discPct',
                'drawerOpens'],
  cashRows: ['cashRefAmt', 'cashRefCnt', 'cashlessRefAmt', 'cashlessRefCnt', 'posOverAmt',
             'posOverCnt', 'avgCheck', 'cashOS', 'cashOSPct'],
  glimpseRows: ['posOverAmt', 'posOverCnt', 'promoAmt', 'promoPct', 'avgCheck', 'laborPct',
                'cashOS', 'cashOSPct', 'gc', 'kvst', 'kvsHealthy', 'oepe', 'parkedPct', 'empMealAmt', 'mgrMealAmt'],
  salesLedgerRows: ['avgCheck', 'dtPctTotal'],
  schedRows: ['needFloor', 'schFloor', 'needVLH', 'schVLH', 'fixGuideHrs', 'schFixHrs', 'salMgrHrs', 'crewHrs', 'schedTotHrs'],
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
      if (!def.srcs) continue;                    // derived metric — validated below
      for (const [src, field] of def.srcs) {
        if (EMITS[src] && !EMITS[src].includes(field)) bad.push(`${key}: ${src}.${field}`);
      }
    }
    expect(bad).toEqual([]);
  });

  // Derived metrics compute from other metrics rather than reading a field. Their inputs
  // must themselves be resolvable, or the derivation silently yields nothing.
  it('every derived metric names inputs that are themselves registered', () => {
    const bad = [];
    for (const [key, def] of Object.entries(METRIC_SOURCES)) {
      if (!def.derive) continue;
      for (const input of def.derive.inputs) {
        if (!METRIC_SOURCES[input]) bad.push(`${key} depends on unregistered "${input}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  // This assertion originally read "no metric is both a direct read and a derivation".
  // That was wrong, and TPPH is the counter-example: a precomputed tpph should win when a
  // source has it, but a day with Glimpse (guest counts) and Controls (hours) and no DAR
  // can still be computed. Chain first, derive to fill the gaps.
  it('a hybrid metric prefers a real source and only derives to fill gaps', () => {
    const hybrid = Object.entries(METRIC_SOURCES).filter(([, d]) => d.srcs && d.derive);
    expect(hybrid.length, 'expected at least one hybrid').toBeGreaterThan(0);
    const ds = {
      // day 1: a real precomputed tpph AND the parts — the source must win
      ctrlRows: [{ loc: '1', date: new Date('2026-08-01'), tpph: 9.99, actHrs: 100 }],
      // day 2: only the parts — derivation should fill it
      glimpseRows: [{ loc: '1', date: new Date('2026-08-02'), gc: 800 }],
      qsrActSummaryRows: [{ loc: '1', date: new Date('2026-08-02'), actHrs: 100 }],
    };
    const r = { s: new Date('2026-07-25'), e: new Date('2026-08-10') };
    const out = metricSeries(ds, '1', r, 'tpph');
    expect(out['2026-08-01'], 'precomputed source must win').toBe(9.99);
    expect(out['2026-08-02'], 'derived gap-fill').toBeCloseTo(8, 6);
  });

  it('every derived metric has a mode and a function arity matching its inputs', () => {
    for (const [key, def] of Object.entries(METRIC_SOURCES)) {
      if (!def.derive) continue;
      expect(def.mode, key).toBeTruthy();
      expect(def.derive.fn.length, `${key} fn arity`).toBe(def.derive.inputs.length);
    }
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

  it('prefers the manual Controls upload when both are present', () => {
    const ds = {
      ctrlRows: [row({ cashRefAmt: 10 })],
      opsCashRows: [row({ cashRefAmt: 99 })],
    };
    expect(metricDaily(ds, '3708', D, 'cashRefAmt')).toBe(10);
  });

  it('keeps a legitimate 0 rather than falling through to a staler source', () => {
    const ds = {
      ctrlRows: [row({ tRedACnt: 0 })],
      opsCashRows: [row({ tRedACnt: 7 })],
    };
    // 0 T-Reds is a clean day, not missing data — mode 'any' must return it.
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

describe('compute6wk sourcing (v4.893)', () => {
  // compute6wk is the sole source for both scorecards, every KPI tile, StoreCard and
  // RankingView's inputs. Until 2026-08-08 it read raw manual-upload arrays for all 28 of
  // its fields — the standing-rule violation that made recent windows blank or stale
  // everywhere it feeds.
  //
  // It now splits: resolvable metrics go through metricAvg (auto-first per day), and only
  // the genuinely manual-only ones keep the direct avg6 read. THE TWO LISTS MUST AGREE —
  // a field kept on avg6 that HAS a chain is silently manual-only again, which is the
  // exact regression this whole migration exists to undo.
  const FORECAST = readFileSync(new URL('../engine/forecast.js', import.meta.url), 'utf8');
  const body = (() => {
    const i = FORECAST.indexOf("const r={oepe:M(");
    return FORECAST.slice(i, FORECAST.indexOf('};', i));
  })();

  it('every field still on avg6 is genuinely manual-only', () => {
    const onAvg6 = [...body.matchAll(/(\w+):avg6\(/g)].map(m => m[1]);
    const wrong = onAvg6.filter(f => !MANUAL_ONLY_METRICS[f]);
    expect(wrong, `these have a chain but still read raw rows: ${wrong.join(', ')}`).toEqual([]);
  });

  it('every documented manual-only metric is accounted for', () => {
    const onAvg6 = new Set([...body.matchAll(/(\w+):avg6\(/g)].map(m => m[1]));
    const missing = Object.keys(MANUAL_ONLY_METRICS).filter(f => !onAvg6.has(f));
    expect(missing, `documented manual-only but not read: ${missing.join(', ')}`).toEqual([]);
  });

  it('every resolver-routed field is actually registered', () => {
    const routed = [...body.matchAll(/(\w+):M\('(\w+)'\)/g)].map(m => m[2]);
    expect(routed.length).toBeGreaterThanOrEqual(18);
    const unregistered = routed.filter(k => !METRIC_SOURCES[k]);
    expect(unregistered, `routed but unregistered: ${unregistered.join(', ')}`).toEqual([]);
  });
});
