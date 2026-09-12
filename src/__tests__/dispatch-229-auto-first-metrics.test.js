// @ts-nocheck
// Dispatch #229 (2026-09-12) — signal-registry.js's manual-only metrics now route through
// metric-source.js's auto-first resolver for the confirmed field-identical overlaps, instead of
// a single static ds[source] read. Live-caught bug this closes: Trend Explorer picked "OEPE
// (sec)" for a store whose Operations-Report upload had gone stale and rendered an empty
// series, while the SAME metric's Scanner correlation (full-history sweep) read as healthy —
// same quantity, "broken" and "fine" at once in the same session, because the registry entry
// had no concept of falling back to a fresher auto/emailed stream.
//
// extractMetricValues() is the real integration point both Trend Explorer (trends.js:
// `extractMetricValues(metricKey, ds, baseGranularity, storeLoc)`) and the Scanner
// (signal-registry.js's own scanAllPairs / csat-signals.js) call directly with this exact
// signature — testing it here exercises the real consumer boundary, not an internal helper.
import { describe, it, expect } from 'vitest';
import { extractMetricValues } from '../engine/signal-registry.js';
import { METRIC_SOURCES } from '../engine/metric-source.js';

// Import the map indirectly through behavior (it isn't exported) — the mechanical "every
// mapped key resolves to a real chain" check instead walks a small mirrored list of the keys
// this dispatch actually wired, asserting each exists in METRIC_SOURCES. If the real map in
// signal-registry.js and this list drift, the live-bug reproduction test below (which exercises
// 'oepe' through the real function) still catches the class of failure that matters; this test
// exists so a typo'd key name fails loudly and specifically instead of silently no-opping.
const DIRECT_SWAP_KEYS = [
  'oepe', 'kvst', 'r2p', 'park', 'dtMixPct', 'sales', 'gc',
  'laborPct', 'tpph', 'avgRate', 'otHrs',
  'discPct', 'discAmt', 'promoPct', 'promoAmt', 'cashOSPct', 'cashOSAmt', 'drawerOpens',
  'posOverCnt', 'posOverAmt', 'cashRefCnt', 'cashRefAmt', 'cashlessRefCnt', 'cashlessRefAmt',
  'tRedAPct', 'tRedACnt', 'tRedBPct', 'tRedBCnt',
  'fobPct', 'compWaste', 'rawWaste', 'statVar',
];

describe('dispatch #229 — every direct-swap target exists as a real METRIC_SOURCES chain', () => {
  it.each(DIRECT_SWAP_KEYS)('%s', key => {
    expect(METRIC_SOURCES[key]).toBeTruthy();
  });
});

const GOOD = '3708';
const recent = n => new Date(Date.now() - n * 864e5);

describe('extractMetricValues — auto-first fallback (the motivating live bug, reproduced)', () => {
  it('"OEPE (sec)" now surfaces recent data from the auto DAR stream when the manual Ops Report upload has gone stale', () => {
    const ds = {
      // Manual upload stopped 30 days ago -- exactly the "stale opsRows" scenario that read
      // empty in Trend Explorer's own screenshot.
      opsRows: [{ loc: GOOD, date: recent(30), oepe: 140 }],
      // The auto-pulled DAR rollup, fresh, covering the last few days -- previously invisible
      // to this metric key entirely (the old code read ONLY ds.opsRows for 'oepe').
      qsrActSummaryRows: [
        { loc: GOOD, date: recent(1), oepe: 118 },
        { loc: GOOD, date: recent(2), oepe: 122 },
        { loc: GOOD, date: recent(3), oepe: 115 },
      ],
    };
    const out = extractMetricValues('oepe', ds, 'daily', GOOD);
    const recentDates = out.filter(r => {
      const days = (Date.now() - new Date(r.date).getTime()) / 864e5;
      return days <= 4;
    });
    expect(recentDates.length).toBe(3);
    expect(recentDates.map(r => r.value).sort((a, b) => a - b)).toEqual([115, 118, 122]);
    // The stale manual point is still visible too -- this is auto-FIRST, not auto-only; the
    // manual upload stays in the chain as the last-resort fallback it always was.
    const staleDate = out.find(r => {
      const days = (Date.now() - new Date(r.date).getTime()) / 864e5;
      return days > 25;
    });
    expect(staleDate?.value).toBe(140);
  });

  it('a district-wide pull (scopeLoc omitted) resolves every store that has data in ANY of the chain\'s real source arrays, not just ds.storeIds', () => {
    const OTHER = '5183';
    const ds = {
      storeIds: [GOOD], // OTHER deliberately absent from storeIds
      qsrActSummaryRows: [
        { loc: GOOD, date: recent(1), oepe: 118 },
        { loc: OTHER, date: recent(1), oepe: 130 }, // only reachable via the source-array union
      ],
    };
    const out = extractMetricValues('oepe', ds, 'daily', null);
    expect(out.some(r => r.loc === OTHER)).toBe(true);
  });

  it('monthly aggregation still honors the metric\'s own sum-vs-mean convention through the new path (otHrs is aggregate:"sum")', () => {
    const ds = {
      opsLaborRows: [
        { loc: GOOD, date: recent(3), otHrs: 3 },
        { loc: GOOD, date: recent(5), otHrs: 5 },
      ],
    };
    const out = extractMetricValues('otHrs', ds, 'monthly', GOOD);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(8); // summed, not averaged
  });

  it('a metric NOT in the direct-swap map is unaffected -- still reads its static source exactly as before (regression guard)', () => {
    // baseFoodPct has no METRIC_SOURCES chain (confirmed in this dispatch's own Task 1) and
    // must keep reading ds.fobRows directly, unchanged.
    const ds = { fobRows: [{ loc: GOOD, date: recent(1), baseFoodPct: 33.5 }] };
    const out = extractMetricValues('baseFoodPct', ds, 'daily', GOOD);
    expect(out).toEqual([{ loc: GOOD, date: expect.any(Date), value: 33.5 }]);
  });
});
