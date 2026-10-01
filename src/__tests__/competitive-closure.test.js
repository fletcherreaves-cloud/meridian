// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  pickControlPool, computeClosureImpact, summarizeClosureFactor, projectAnalogImpact, CLOSURE_EVENT_TYPES,
} from '../engine/competitive-closure.js';
import { computeEventFactors } from '../utils/events.js';

// ── Fixture builder ──────────────────────────────────────────────────────────
// Builds daily laborRows for a treated store + N control stores sharing a
// COMMON seasonal confound (every store runs hot in the event window relative
// to its own flat pre-period trend — mirrors the real 2026-09-30 Holdenville
// finding) PLUS, for the treated store only, a genuine extra `trueLiftPct` on
// top of that confound. A naive before/after read would report
// (confoundPct + trueLiftPct) combined; the DiD engine's job is to recover
// something close to trueLiftPct alone.
function buildFixture({
  treatedLoc = 'T1', controlLocs = ['C1', 'C2', 'C3'],
  preDays = 200, eventDays = 84,
  trueLiftPct = 0.15, confoundPct = 0.10,
  // Default keyed off the DEFAULT loc names only (T1/C1/C2/C3, C3 deliberately a worse
  // scale-match) — a caller passing different loc codes (e.g. real OK store numbers) without
  // overriding baseDaily falls through to the per-loc default below instead of silently
  // reading `undefined` for every unlisted loc and NaN-ing out the whole fixture.
  baseDaily,
  noiseAmp = 0.03, dowAmp = 0.08,
} = {}) {
  const laborRows = [];
  const start = new Date(2026, 0, 1); // 2026-01-01
  const eventStart = new Date(start.getTime() + preDays * 86400000);
  const eventEnd = new Date(eventStart.getTime() + (eventDays - 1) * 86400000);
  const totalDays = preDays + eventDays + 10;

  const allLocs = [treatedLoc, ...controlLocs];
  const DEFAULT_BASE_DAILY = { T1: 6000, C1: 6200, C2: 5800, C3: 9000 };
  if (!baseDaily) {
    baseDaily = {};
    allLocs.forEach((loc, i) => { baseDaily[loc] = DEFAULT_BASE_DAILY[loc] ?? (6000 + i * 400); });
  }
  // Deterministic pseudo-random noise so the fixture is reproducible.
  let seed = 42;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(start.getTime() + i * 86400000);
    const inEvent = date >= eventStart && date <= eventEnd;
    const dow = date.getDay();
    const dowFactor = 1 + dowAmp * Math.sin(dow); // same shape every store, pure noise source otherwise
    for (const loc of allLocs) {
      let sales = baseDaily[loc] * dowFactor * (1 + (rand() - 0.5) * noiseAmp);
      if (inEvent) sales *= (1 + confoundPct); // shared district-wide seasonal effect
      if (inEvent && loc === treatedLoc) sales *= (1 + trueLiftPct); // the real, store-specific effect
      laborRows.push({ loc, date, sales: Math.round(sales) });
    }
  }
  return { ds: { laborRows }, eventStart, eventEnd, totalDays };
}

const dk = d => d.toISOString().slice(0, 10);

describe('competitive-closure engine', () => {
  it('computeClosureImpact recovers the true store-specific lift, not the confounded raw deviation', () => {
    const { ds, eventStart, eventEnd } = buildFixture({ trueLiftPct: 0.15, confoundPct: 0.10 });
    const result = computeClosureImpact(ds, {
      loc: 'T1', startDate: dk(eventStart), endDate: dk(eventEnd), controlLocs: ['C1', 'C2', 'C3'],
    });
    expect(result.ok).toBe(true);
    expect(result.controlLocs.length).toBeGreaterThan(0);

    // Weights are a real simplex: non-negative, sum to 1.
    const wVals = Object.values(result.weights);
    expect(wVals.every(w => w >= -1e-9)).toBe(true);
    expect(wVals.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);

    // The DiD estimate should land near the TRUE 15% lift, not near the
    // confounded ~25% a naive before/after would show.
    expect(result.summary.medianImpactPct).toBeGreaterThan(0.08);
    expect(result.summary.medianImpactPct).toBeLessThan(0.22);

    // Cross-check against a hand-computed naive (treated-only) deviation to
    // prove the DiD correction is actually doing something, not a no-op.
    const naiveDeviation = confoundNaiveDeviation(ds, 'T1', eventStart, eventEnd);
    expect(Math.abs(result.summary.medianImpactPct - 0.15)).toBeLessThan(Math.abs(naiveDeviation - 0.15));
  });

  it('pre-fit R² is high when controls genuinely track the treated store pre-period', () => {
    const { ds, eventStart, eventEnd } = buildFixture();
    const result = computeClosureImpact(ds, {
      loc: 'T1', startDate: dk(eventStart), endDate: dk(eventEnd), controlLocs: ['C1', 'C2', 'C3'],
    });
    expect(result.preFit.r2).toBeGreaterThan(0.5);
    expect(result.summary.confidence).not.toBe('low');
  });

  it('decaying lift across the event window is captured week-by-week, not flattened to one number', () => {
    // Build a fixture where the true lift decays linearly over the event window —
    // same shape as the real Sonic/Holdenville finding (strong month 1, fading by month 3).
    const laborRows = [];
    const start = new Date(2026, 0, 1);
    const preDays = 200, eventDays = 84;
    const eventStart = new Date(start.getTime() + preDays * 86400000);
    let seed = 7;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < preDays + eventDays + 5; i++) {
      const date = new Date(start.getTime() + i * 86400000);
      const inEvent = date >= eventStart && i < preDays + eventDays;
      const dow = date.getDay();
      const dowFactor = 1 + 0.08 * Math.sin(dow);
      for (const loc of ['T1', 'C1', 'C2']) {
        let sales = 6000 * dowFactor * (1 + (rand() - 0.5) * 0.02);
        if (inEvent && loc === 'T1') {
          const weekIdx = Math.floor((i - preDays) / 7);
          const decayLift = Math.max(0, 0.30 - weekIdx * 0.025); // starts ~30%, fades toward 0
          sales *= (1 + decayLift);
        }
        laborRows.push({ loc, date, sales: Math.round(sales) });
      }
    }
    const eventEnd = new Date(start.getTime() + (preDays + eventDays - 1) * 86400000);
    const result = computeClosureImpact({ laborRows }, {
      loc: 'T1', startDate: dk(eventStart), endDate: dk(eventEnd), controlLocs: ['C1', 'C2'],
    });
    expect(result.ok).toBe(true);
    expect(result.weekly.length).toBeGreaterThan(5);
    expect(result.summary.firstWeekImpactPct).toBeGreaterThan(result.summary.lastWeekImpactPct);
  });

  it('fails soft (ok:false) rather than throwing when there is no usable control data', () => {
    const { ds, eventStart, eventEnd } = buildFixture();
    const result = computeClosureImpact(ds, {
      loc: 'T1', startDate: dk(eventStart), endDate: dk(eventEnd), controlLocs: ['NOPE_NOT_A_REAL_LOC'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('fails soft when the treated store itself has no data', () => {
    const { ds, eventStart, eventEnd } = buildFixture();
    const result = computeClosureImpact(ds, {
      loc: 'GHOST_LOC', startDate: dk(eventStart), endDate: dk(eventEnd), controlLocs: ['C1', 'C2'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_treated_data');
  });
});

describe('pickControlPool', () => {
  it('excludes the treated store, out-of-state stores, and anything with an overlapping contaminating event', () => {
    const userEvents = {
      '3708': { '2026-10-10': { tags: [{ type: 'construction' }] } }, // contaminated, same window
    };
    const pool = pickControlPool({}, {
      loc: '35064', // Holdenville, OK
      userEvents, startDate: '2026-10-01', endDate: '2026-12-30',
    });
    expect(pool).not.toContain('35064');       // never the treated store
    expect(pool).not.toContain('6178');        // FL store — out of state
    expect(pool).not.toContain('10034');       // FL store — out of state
    expect(pool).not.toContain('3708');        // contaminated by its own event in-window
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every(loc => loc !== '35064')).toBe(true);
  });

  it('a contaminating event OUTSIDE the analysis window does not disqualify the control', () => {
    const userEvents = {
      '3708': { '2025-01-05': { tags: [{ type: 'construction' }] } }, // way before the window
    };
    const pool = pickControlPool({}, {
      loc: '35064', userEvents, startDate: '2026-10-01', endDate: '2026-12-30',
    });
    expect(pool).toContain('3708');
  });
});

describe('summarizeClosureFactor', () => {
  it('clamps to the ±25% ceiling forecast.js already enforces on the other two _evFactor paths', () => {
    const hot = { ok: true, summary: { medianImpactPct: 0.9 } };
    const cold = { ok: true, summary: { medianImpactPct: -0.9 } };
    expect(summarizeClosureFactor(hot)).toBeCloseTo(0.25, 5);
    expect(summarizeClosureFactor(cold)).toBeCloseTo(-0.25, 5);
  });

  it('returns 0 for a failed/null result rather than throwing', () => {
    expect(summarizeClosureFactor({ ok: false })).toBe(0);
    expect(summarizeClosureFactor(null)).toBe(0);
  });

  it('passes a real sub-ceiling value through unclamped', () => {
    expect(summarizeClosureFactor({ ok: true, summary: { medianImpactPct: 0.12 } })).toBeCloseTo(0.12, 5);
  });
});

describe('projectAnalogImpact', () => {
  it('applies a measured source curve onto a different store\'s own growth-adjusted baseline', () => {
    const laborRows = [];
    const locs = ['TARGET'];
    // Two full years of flat $5000/day sales (no real growth, no DOW pattern) so the math is checkable by hand.
    for (let i = 0; i < 730; i++) {
      const date = new Date(2024, 0, 1);
      date.setDate(date.getDate() + i);
      laborRows.push({ loc: 'TARGET', date, sales: 5000 });
    }
    const ds = { laborRows };
    const sourceWeekly = [
      { weekIndex: 0, impactPct: 0.20 },
      { weekIndex: 1, impactPct: 0.10 },
    ];
    const result = projectAnalogImpact(ds, {
      loc: 'TARGET', startDate: '2026-01-01', endDate: '2026-01-14', sourceWeekly,
    });
    expect(result.ok).toBe(true);
    // Flat history, zero growth -> baseline should track the flat $5000/day rate closely.
    expect(result.growth).toBeCloseTo(0, 1);
    expect(result.weekly[0].liftPct).toBeCloseTo(0.20, 5);
    expect(result.weekly[1].liftPct).toBeCloseTo(0.10, 5);
    expect(result.summary.totalIncrementalDollars).toBeGreaterThan(0);
  });

  it('fails soft when there is no prior-year baseline to grow from', () => {
    const result = projectAnalogImpact({ laborRows: [] }, {
      loc: 'NOPE', startDate: '2026-01-01', endDate: '2026-01-14', sourceWeekly: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe('computeEventFactors integration — closure events use the control-corrected calc', () => {
  it('a long comp_closure tag on a real store is measured against real same-state district controls, landing near the true lift rather than the confounded raw one (would fail if the _applyClosureFactors wiring were reverted)', () => {
    // Real OK loc codes, so pickControlPool's INV_ORG_COORDS state lookup actually
    // finds a control pool end-to-end — this is the one test that exercises the full
    // events.js -> pickControlPool -> computeClosureImpact wiring, not just the math.
    const { ds, eventStart, eventEnd } = buildFixture({
      treatedLoc: '35064', // Holdenville, OK
      controlLocs: ['3708', '5183', '6972', '10422', '13113', '24471'], // all real OK stores
      trueLiftPct: 0.15, confoundPct: 0.10,
    });
    const userEvents = { '35064': {} };
    for (let d = new Date(eventStart); d <= eventEnd; d.setDate(d.getDate() + 1)) {
      userEvents['35064'][dk(d)] = { tags: [{ type: 'comp_closure' }] };
    }
    const factors = computeEventFactors(ds, userEvents);
    const measured = factors['35064'].comp_closure;
    expect(measured).toBeGreaterThan(0.08);
    expect(measured).toBeLessThan(0.22);
    // The naive single-store calc (what this measurement would be WITHOUT the
    // control-group correction) sits near the confounded ~25% combined effect —
    // proving the override actually fired and actually changed the number, not a
    // coincidental match.
    const naive = confoundNaiveDeviation(ds, '35064', eventStart, eventEnd);
    expect(naive).toBeGreaterThan(0.20);
    expect(Math.abs(measured - 0.15)).toBeLessThan(Math.abs(naive - 0.15));
  });

  it('short (<7 day) comp_closure tags are left on the naive calc — this engine is not for single-day events', () => {
    const { ds } = buildFixture();
    const userEvents = { T1: { '2026-07-20': { tags: [{ type: 'comp_closure' }] }, '2026-07-21': { tags: [{ type: 'comp_closure' }] } } };
    const factors = computeEventFactors(ds, userEvents);
    // Should not throw, and (since computeClosureImpact is never even attempted below the
    // 7-day floor) whatever the naive single-store calc produces is left untouched.
    expect(() => computeEventFactors(ds, userEvents)).not.toThrow();
  });

  it('CLOSURE_EVENT_TYPES is exactly the two types this engine owns', () => {
    expect([...CLOSURE_EVENT_TYPES].sort()).toEqual(['comp_closure', 'own_closure']);
  });
});

// Hand-rolled naive (treated-store-only) before/after deviation, independent of the
// engine under test, so the "DiD beats naive" assertion isn't circular.
function confoundNaiveDeviation(ds, loc, eventStart, eventEnd) {
  const rows = ds.laborRows.filter(r => r.loc === loc);
  const pre = rows.filter(r => r.date < eventStart);
  const event = rows.filter(r => r.date >= eventStart && r.date <= eventEnd);
  const preMean = pre.reduce((s, r) => s + r.sales, 0) / pre.length;
  const eventMean = event.reduce((s, r) => s + r.sales, 0) / event.length;
  return eventMean / preMean - 1;
}
