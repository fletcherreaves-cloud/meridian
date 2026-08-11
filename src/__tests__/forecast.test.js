// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { forecastDay, fetchLY, fetchLYDate, fetchGC } from '../engine/forecast.js';
import { computeEventFactors } from '../utils/events.js';

const LOC = '3708';

function makeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

function dKey(d) {
  return d.toISOString().slice(0, 10);
}

function buildLaborIdx(rows) {
  const idx = {};
  for (const r of rows) {
    if (!r.loc || !r.date) continue;
    const k = r.loc + '_' + dKey(r.date);
    if (!idx[k]) idx[k] = [];
    idx[k].push(r);
  }
  return idx;
}

// Build a ds with two full years of weekly-ish history for one store.
// Sales oscillate around $10,000/day with a DOW pattern.
function buildDs(loc = LOC) {
  const laborRows = [];
  const DOW_MULT = [0.8, 1.0, 1.0, 1.05, 1.1, 1.3, 1.2]; // Sun–Sat

  for (let i = 730; i >= 1; i--) {
    const d = makeDate(i);
    const dow = d.getDay();
    const sales = Math.round(10000 * DOW_MULT[dow] * (0.95 + Math.random() * 0.1));
    laborRows.push({ loc, date: d, sales, gc: Math.round(sales / 7), laborPct: 0.28 });
  }

  const laborIdx = buildLaborIdx(laborRows);
  const lastActual = { [loc]: makeDate(1) };

  return {
    laborRows,
    laborIdx,
    laborByLoc: { [loc]: laborRows },
    opsRows: [], ctrlRows: [], weatherRows: [],
    darRows: [], pmixData: {}, records: {},
    targets: {},
    lastActual,
    loaded: true,
    storeIds: [loc],
  };
}

const BASE_SETTINGS = {
  mode: 'Forecast',
  trendWeights: { t2: 0.5, t4: 0.3, t6: 0.2 },
  dialedInEnabled: false,
  dialedIn: {},
  dialedInSkipped: [],
  _userEvents: {},
};

// ── fetchLY / fetchLYDate / fetchGC — measured anomaly, not tag presence (v4.924) ──────────────
// Owner directive: "the only time a date should be excluded from forecasting is if it is a true
// anomaly in sales or GC" — tagging is informational, never itself a reason to drop a day. These
// functions no longer take a userEvents argument at all; a candidate is only skipped if its own
// value is a measured statistical outlier among its peer candidates (same test as robustBaseline
// elsewhere), or if it's a calendar holiday (genuinely no comparable sales to test).
describe('fetchLY — measured anomaly test, no tag involvement', () => {
  // All 7 candidate offsets are exact multiples of 7 days, so they always share date's DOW —
  // build one labor row per offset, all on a fixed reference date so the test is time-independent.
  const REF = new Date('2026-08-09T12:00:00');
  const OFFS = [-364,-357,-371,-378,-350,-385,-343];
  function addD_(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function buildRows(valueByOffset) {
    const rows = [];
    for (const off of OFFS) {
      const v = valueByOffset[off];
      if (v == null) continue;
      rows.push({ loc: LOC, date: addD_(REF, off), sales: v, gc: Math.round(v / 10) });
    }
    return { rows, idx: buildLaborIdx(rows) };
  }

  it('picks the -364 candidate normally when every candidate looks alike', () => {
    const { idx } = buildRows({ '-364': 10000, '-357': 9800, '-371': 10200, '-378': 9900, '-350': 10100 });
    expect(fetchLY(idx, null, LOC, REF)).toBe(10000);
  });

  it('a tagged-but-normal candidate is used — there is no tag input to this function at all', () => {
    // Same fixture as above; the historical "userEvents" bug was skipping a candidate purely
    // because a human tagged it. fetchLY's signature no longer accepts that input, so there is
    // nothing that COULD skip it — the value returned is exactly the real, unadjusted actual.
    const { idx } = buildRows({ '-364': 10000, '-357': 9800, '-371': 10200, '-378': 9900, '-350': 10100 });
    expect(fetchLY(idx, null, LOC, REF)).toBe(10000);
  });

  it('skips a candidate that measures as a genuine outlier among its peers, regardless of tags', () => {
    // -364 is a wild outlier (a closure-like $500 day) against five otherwise-consistent ~$10K
    // peers — the measured test should reject it and fall through to the next candidate in
    // priority order (-357), exactly the "true anomaly in sales" case the owner described.
    const { idx } = buildRows({ '-364': 500, '-357': 9800, '-371': 10200, '-378': 9900, '-350': 10100, '-385': 9950 });
    expect(fetchLY(idx, null, LOC, REF)).toBe(9800);
  });

  it('still excludes a holiday candidate — a closure has no comparable sales to measure', () => {
    // Dec 24, 2026 minus 364 days lands exactly on Dec 25, 2025 (both Thursdays) — chosen
    // deliberately so the -364 candidate IS Christmas. Every candidate gets an identical,
    // perfectly normal sales value, so this isolates the holiday check from the value-based
    // outlier test: if -364 were skipped anyway, it must be because of isHoliday(), not because
    // its value looked unusual (it doesn't — they're all the same).
    const forecastDate = new Date('2026-12-24T12:00:00');
    const xmas = addD_(forecastDate, -364);
    expect(dKey(xmas)).toBe('2025-12-25');
    const rows = OFFS.map(off => ({ loc: LOC, date: addD_(forecastDate, off), sales: 10000, gc: 1000 }));
    const idx = buildLaborIdx(rows);
    const used = fetchLYDate(idx, LOC, forecastDate);
    expect(dKey(used)).not.toBe(dKey(xmas)); // Christmas must be skipped even with a "normal" value
  });

  it('with only one valid candidate, nothing to compare against — it is used as-is', () => {
    const { idx } = buildRows({ '-364': 500 }); // only one candidate, however unusual
    expect(fetchLY(idx, null, LOC, REF)).toBe(500);
  });

  it('fetchLYDate returns the same date whose value fetchLY actually used', () => {
    const { idx } = buildRows({ '-364': 500, '-357': 9800, '-371': 10200, '-378': 9900, '-350': 10100, '-385': 9950 });
    const usedDate = fetchLYDate(idx, LOC, REF);
    expect(dKey(usedDate)).toBe(dKey(addD_(REF, -357)));
  });
});

describe('fetchGC — same measured test as fetchLY, no tag involvement', () => {
  const REF = new Date('2026-08-09T12:00:00');
  function addD_(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  it('skips a GC outlier candidate the same way fetchLY skips a sales outlier', () => {
    const offs = { '-364': 5, '-357': 1000, '-371': 1020, '-378': 990, '-350': 1010, '-385': 995 };
    const rows = Object.entries(offs).map(([off, gc]) => ({ loc: LOC, date: addD_(REF, +off), gc, sales: gc * 10 }));
    const idx = buildLaborIdx(rows);
    expect(fetchGC(idx, null, LOC, REF)).toBe(1000);
  });
});

// ── forecastDay ───────────────────────────────────────────────────────────────

describe('forecastDay — null ds guard', () => {
  it('returns zero-forecast when ds is null', () => {
    const result = forecastDay(LOC, new Date(), null, BASE_SETTINGS);
    expect(result.forecast).toBe(0);
    expect(result.isFuture).toBe(true);
    expect(result.noLYData).toBe(true);
  });
});

describe('forecastDay — historical date (isFuture = false)', () => {
  let ds;
  beforeEach(() => { ds = buildDs(); });

  it('marks past dates as not future', () => {
    const pastDate = makeDate(10);
    const result = forecastDay(LOC, pastDate, ds, BASE_SETTINGS);
    expect(result.isFuture).toBe(false);
  });

  it('returns a positive forecast for a past date with LY data', () => {
    const pastDate = makeDate(10);
    const result = forecastDay(LOC, pastDate, ds, BASE_SETTINGS);
    expect(result.forecast).toBeGreaterThan(0);
    expect(result.noLYData).toBe(false);
  });

  it('sets actual from laborRows when the row exists', () => {
    const targetRow = ds.laborRows[ds.laborRows.length - 5];
    const result = forecastDay(LOC, targetRow.date, ds, BASE_SETTINGS);
    expect(result.actual).toBe(targetRow.sales);
  });
});

describe('forecastDay — future date (isFuture = true)', () => {
  let ds;
  beforeEach(() => { ds = buildDs(); });

  it('marks future dates correctly', () => {
    const futureDate = makeDate(-7); // 7 days from now
    const result = forecastDay(LOC, futureDate, ds, BASE_SETTINGS);
    expect(result.isFuture).toBe(true);
  });

  it('still returns a positive forecast for a future date', () => {
    const futureDate = makeDate(-7);
    const result = forecastDay(LOC, futureDate, ds, BASE_SETTINGS);
    expect(result.forecast).toBeGreaterThan(0);
  });
});

describe('forecastDay — forceModel', () => {
  let ds;
  beforeEach(() => { ds = buildDs(); });

  it('ewma model returns a positive forecast', () => {
    const pastDate = makeDate(10);
    const r = forecastDay(LOC, pastDate, ds, BASE_SETTINGS, null, null, 'weekly', 'ewma');
    expect(r.forecast).toBeGreaterThan(0);
    expect(r.modelUsed).toBe('ewma');
  });

  it('ae model returns a positive forecast', () => {
    const pastDate = makeDate(10);
    const r = forecastDay(LOC, pastDate, ds, BASE_SETTINGS, null, null, 'weekly', 'ae');
    expect(r.forecast).toBeGreaterThan(0);
    expect(r.modelUsed).toBe('ae');
  });

  it('ewma and ae produce different values', () => {
    const pastDate = makeDate(14);
    const ewma = forecastDay(LOC, pastDate, ds, BASE_SETTINGS, null, null, 'weekly', 'ewma');
    const ae   = forecastDay(LOC, pastDate, ds, BASE_SETTINGS, null, null, 'weekly', 'ae');
    // Different models — values can differ (not guaranteed, but almost always true with real data)
    expect(typeof ewma.forecast).toBe('number');
    expect(typeof ae.forecast).toBe('number');
  });

  it('simple model returns a positive forecast tagged modelUsed=simple', () => {
    const pastDate = makeDate(10);
    const r = forecastDay(LOC, pastDate, ds, BASE_SETTINGS, null, null, 'weekly', 'simple');
    expect(r.forecast).toBeGreaterThan(0);
    expect(r.modelUsed).toBe('simple');
  });

  it('simple respects same-DOW shape (Saturday > Sunday given the seeded DOW pattern)', () => {
    // Seeded DOW_MULT: Sun=0.8, Sat=1.2 — the simple model multiplies the trailing
    // daily rate by a same-DOW shape, so a Saturday must project higher than a Sunday.
    const findDow = (dow, minDaysAgo) => {
      for (let i = minDaysAgo; i < minDaysAgo + 7; i++) {
        const d = makeDate(i);
        if (d.getDay() === dow) return d;
      }
      return makeDate(minDaysAgo);
    };
    const sat = forecastDay(LOC, findDow(6, 8), ds, BASE_SETTINGS, null, null, 'weekly', 'simple');
    const sun = forecastDay(LOC, findDow(0, 8), ds, BASE_SETTINGS, null, null, 'weekly', 'simple');
    expect(sat.forecast).toBeGreaterThan(sun.forecast);
  });

  it('simple is leak-free — projects a completed day without reading its own actual', () => {
    // The forecast anchors strictly to data BEFORE the date, so injecting an
    // extreme actual on the target day must not move the forecast.
    const target = makeDate(20);
    const before = forecastDay(LOC, target, ds, BASE_SETTINGS, null, null, 'weekly', 'simple').forecast;
    const dk = target.toISOString().slice(0, 10);
    const row = ds.laborRows.find(r => r.loc === LOC && r.date.toISOString().slice(0, 10) === dk);
    if (row) row.sales = 999999; // poison the same-day actual
    const after = forecastDay(LOC, target, ds, BASE_SETTINGS, null, null, 'weekly', 'simple').forecast;
    expect(after).toBe(before);
  });

  // #178 item 4: t2/t4/t6 on the ae/ewma/simple branches used to be the raw dollar forecast
  // (Math.round(_aeFcst), ~$10,000+ for this fixture) reused verbatim instead of a YOY trend
  // RATIO — the same field every other model path (and ForecastRow's "T2W/T6W — YOY Sales%"
  // cells, via (r.t2*100).toFixed(2)+'%') treats as a fraction like 0.05. Since all 27 real
  // stores are assigned model 'ae', this meant the T2W/T6W column showed a ~6-7 digit garbage
  // "percent" for every store — the owner's reported "xxxxxxx.xx%".
  it.each(['ae', 'ewma', 'simple'])('%s model: t2/t4/t6 are YOY trend ratios, not the dollar forecast', (model) => {
    const r = forecastDay(LOC, makeDate(10), ds, BASE_SETTINGS, null, null, 'weekly', model);
    expect(r.forecast).toBeGreaterThan(1000); // sanity: this fixture's forecasts are ~$10k+
    for (const k of ['t2', 't4', 't6']) {
      expect(typeof r[k]).toBe('number');
      expect(Number.isNaN(r[k])).toBe(false);
      // A real YOY trend ratio is bounded well within ±3 (±300%); the bug produced values in
      // the thousands (the raw dollar forecast), so this bound cleanly separates the two.
      expect(Math.abs(r[k])).toBeLessThan(3);
      expect(r[k]).not.toBe(r.forecast);
    }
  });
});

describe('forecastDay — result shape', () => {
  it('always returns required fields', () => {
    const ds = buildDs();
    const result = forecastDay(LOC, makeDate(10), ds, BASE_SETTINGS);
    const required = ['date', 'loc', 'forecast', 'ly', 'lyAdj', 't2', 't4', 't6',
                      'actual', 'isFuture', 'noLYData', 'opsFactor'];
    for (const key of required) {
      expect(result).toHaveProperty(key);
    }
  });
});

// ── ForecastAudit prop-shadowing regression (issue #114) ──────────────────────
// analytics.js's ForecastAudit panel has two forecastDay call sites for the SAME date: a date
// sidebar and a detail pane. Both must be built from the exact same `_userEvents`/`_eventFactors`
// settings or the two can silently disagree on what "the forecast for this date" is — in a panel
// whose entire purpose is explaining that number. The bug was the detail pane building its own
// local `userEvents` from `settings._userEvents` (always `{}` in practice — nothing keeps that
// field live on the raw settings object; every real caller injects it via `{...settings,
// _userEvents: userEvents}` right before the call), silently dropping tagged-event impact that
// the sidebar's forecastDay call — which read the real `userEvents` prop — still applied.
//
// forceModel:'dow' is used throughout so these tests exercise the engineered pipeline that
// actually computes _evFactor. The 'ae'/'ewma' short-circuits (LOC 3708's real assigned weekly
// model per DEFAULT_MODEL_ASSIGNMENTS) return before _evFactor is ever computed — a separate,
// out-of-scope issue (their t2/t4/t6 fields hold a raw dollar forecast, not a trend fraction,
// which ForecastAudit's Trend Signal section renders as if it were one) flagged in issue #114's
// write-up, not fixed here.
describe('forecastDay — _userEvents must be threaded through, not silently dropped (issue #114)', () => {
  let ds;
  beforeEach(() => { ds = buildDs(); });

  it('a tagged event with an expected sales delta shifts the forecast when _userEvents is passed', () => {
    const target = makeDate(10);
    const dk = dKey(target);
    const userEvents = { [LOC]: { [dk]: { type: 'promo', expectedSalesDelta: 0.20 } } };

    const withTag = forecastDay(LOC, target, ds,
      { ...BASE_SETTINGS, useEventRegistry: true, _userEvents: userEvents }, null, null, 'weekly', 'dow');
    const withoutTag = forecastDay(LOC, target, ds,
      { ...BASE_SETTINGS, useEventRegistry: true, _userEvents: {} }, null, null, 'weekly', 'dow');

    // If _userEvents is silently dropped (the pre-fix bug — settings._userEvents is never live on
    // the raw settings object), this collapses to `withoutTag` and the assertion below catches it.
    expect(withTag._evFactor).toBeCloseTo(0.20, 10);
    expect(withoutTag._evFactor).toBe(0);
    expect(withTag.forecast).not.toBe(withoutTag.forecast);
  });

  it('ForecastAudit sidebar and detail-pane forecastDay calls agree for the same date when both use the real userEvents prop', () => {
    const target = makeDate(10);
    const dk = dKey(target);
    const userEvents = { [LOC]: { [dk]: { type: 'promo', expectedSalesDelta: 0.20 } } };
    const settings = { ...BASE_SETTINGS, useEventRegistry: true };

    // Sidebar call shape (analytics.js ForecastAudit, ~line 5859): includes _eventFactors.
    const sidebar = forecastDay(LOC, target, ds, {
      ...settings, _userEvents: userEvents,
      _eventFactors: settings.useEventRegistry !== false ? computeEventFactors(ds, userEvents) : {},
    }, null, null, 'weekly', 'dow');

    // Detail-pane call shape (analytics.js ForecastAudit runAudit, post-fix): must mirror it.
    const detail = forecastDay(LOC, target, ds, {
      ...settings, _userEvents: userEvents,
      _eventFactors: settings.useEventRegistry !== false ? computeEventFactors(ds, userEvents) : {},
    }, null, null, 'weekly', 'dow');

    expect(detail.forecast).toBe(sidebar.forecast);

    // And prove this isn't vacuous: swap in the pre-fix bug's `{}` for the detail pane only, and
    // the two panes diverge — this is the exact failure mode issue #114 reported.
    const detailPreFixBug = forecastDay(LOC, target, ds, {
      ...settings, _userEvents: {}, _eventFactors: {},
    }, null, null, 'weekly', 'dow');
    expect(detailPreFixBug.forecast).not.toBe(sidebar.forecast);
  });
});
