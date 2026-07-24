import { describe, it, expect } from 'vitest';
import { computeVisitReadiness, READINESS_WEIGHTS } from '../engine/visit-readiness.js';
import { DEFAULT_TARGETS } from '../constants.js';

// Two real loc IDs that exist in DEFAULT_TARGETS.
const GOOD = '3708';
const BAD = '5183';
const recent = n => new Date(Date.now() - n * 864e5);

// A store comfortably beating its targets on every mapped metric.
function goodRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * 0.85, kvst: t.tKvst * 0.8, laborPct: t.tCrewLabor * 0.92 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * 0.7, r2p: t.tR2p * 0.85 })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * 1.15, laborPct: t.tCrewLabor * 0.92 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 1 })),
    smg: [{ loc, year: 2026, month: 6, accuracyB2B: 98, overallProblem: 4, osatB2B: 94 }],
    ctrl: days.map(d => ({ loc, date: d, tRedAPct: t.tRedAPct * 0.6 })),
    fob: [{ loc, date: recent(10), compWaste: t.tCompWaste * 0.7, rawWaste: t.tRawWaste * 0.7, statVar: t.tStatLoss * 0.7 }],
  };
}
// A store badly missing its targets everywhere.
function badRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * 1.6, kvst: t.tKvst * 1.7, laborPct: t.tCrewLabor * 1.4 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * 2.5, r2p: t.tR2p * 1.6 })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * 0.6, laborPct: t.tCrewLabor * 1.4 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 20 })),
    smg: [{ loc, year: 2026, month: 6, accuracyB2B: 84, overallProblem: 22, osatB2B: 78 }],
    ctrl: days.map(d => ({ loc, date: d, tRedAPct: t.tRedAPct * 3 })),
    fob: [{ loc, date: recent(10), compWaste: t.tCompWaste * 4, rawWaste: t.tRawWaste * 4, statVar: t.tStatLoss * 4 }],
  };
}
function mkDs(...perStore) {
  const ds = { glimpseRows: [], opsRows: [], laborRows: [], schedRows: [], smgFullscale: [], ctrlRows: [], fobRows: [] };
  for (const s of perStore) {
    ds.glimpseRows.push(...s.glimpse); ds.opsRows.push(...s.ops); ds.laborRows.push(...s.labor);
    ds.schedRows.push(...s.sched); ds.smgFullscale.push(...s.smg); ds.ctrlRows.push(...s.ctrl); ds.fobRows.push(...s.fob);
  }
  return ds;
}

describe('visit-readiness', () => {
  it('ranks a target-beating store far above a target-missing store', () => {
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    const res = computeVisitReadiness(ds);
    const g = res.stores.find(s => s.loc === GOOD);
    const b = res.stores.find(s => s.loc === BAD);
    expect(g).toBeTruthy(); expect(b).toBeTruthy();
    expect(g.readiness).toBeGreaterThan(b.readiness);
    expect(g.readiness).toBeGreaterThan(80);
    expect(b.readiness).toBeLessThan(55);
    expect(g.band).toBe('ready');
    expect(b.band).toBe('at-risk');
  });

  it('most at-risk store sorts first', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD), badRows(BAD)));
    expect(res.stores[0].loc).toBe(BAD);
  });

  it('flags food-safety risk from elevated waste proxies', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD), badRows(BAD)));
    expect(res.stores.find(s => s.loc === GOOD).fsFlag).toBe('low');
    expect(res.stores.find(s => s.loc === BAD).fsFlag).toBe('elevated');
  });

  it('surfaces per-store top risk drivers (worst metrics first)', () => {
    const res = computeVisitReadiness(mkDs(badRows(BAD)));
    const b = res.stores.find(s => s.loc === BAD);
    expect(b.topDrivers.length).toBeGreaterThan(0);
    expect(b.topDrivers[0].score).toBeLessThanOrEqual(b.topDrivers[b.topDrivers.length - 1].score);
    expect(b.topDrivers[0]).toHaveProperty('actual');
    expect(b.topDrivers[0]).toHaveProperty('target');
  });

  it('renormalizes weights when a sub-score has no data (speed only)', () => {
    // Only glimpse speed data present → composite = speed sub-score, coverage < 1.
    const t = DEFAULT_TARGETS[GOOD];
    const ds = { glimpseRows: [{ loc: GOOD, date: recent(1), oepe: t.tOepe * 0.8, kvst: t.tKvst * 0.8 }] };
    const res = computeVisitReadiness(ds);
    const g = res.stores.find(s => s.loc === GOOD);
    expect(g).toBeTruthy();
    expect(g.coverage).toBeLessThan(1);
    expect(g.subs.speed.score).not.toBeNull();
    expect(g.subs.accuracy.score).toBeNull();
  });

  it('attaches the last actual graded visit when present', () => {
    const ds = mkDs(goodRows(GOOD));
    ds.gradedVisits = [{ store: GOOD, dateISO: '2026-06-15', reportType: 'CFV', score: 88, pass: true }];
    const res = computeVisitReadiness(ds);
    const g = res.stores.find(s => s.loc === GOOD);
    expect(g.lastVisit).toBeTruthy();
    expect(g.lastVisit.score).toBe(88);
  });

  it('produces a district rollup', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD), badRows(BAD)));
    expect(res.district.nStores).toBe(2);
    expect(res.district.readiness).toBeGreaterThan(0);
    expect(res.district.atRisk).toBeGreaterThanOrEqual(1);
    expect(res.weights).toEqual(READINESS_WEIGHTS);
  });

  it('writes a plain-language "why" that names the worst drivers for an at-risk store', () => {
    const res = computeVisitReadiness(mkDs(badRows(BAD)));
    const b = res.stores.find(s => s.loc === BAD);
    expect(typeof b.why).toBe('string');
    expect(b.why).toMatch(/At risk/i);
    // Should reference a driver label + "vs" + "target"
    expect(b.why).toMatch(/vs .* target/i);
  });

  it('a ready store\'s why reads clean (no big gaps)', () => {
    const res = computeVisitReadiness(mkDs(goodRows(GOOD)));
    const g = res.stores.find(s => s.loc === GOOD);
    expect(g.why).toMatch(/Ready/i);
  });

  it('calibration: needs >=3 visits, else reports n and null r', () => {
    const ds = mkDs(goodRows(GOOD), badRows(BAD));
    ds.gradedVisits = [{ store: GOOD, dateISO: '2026-06-15', reportType: 'CFV', score: 90, pass: true }];
    const res = computeVisitReadiness(ds);
    expect(res.calibration.n).toBe(1);
    expect(res.calibration.r).toBeNull();
  });

  it('calibration: positive rank correlation when predictions track actual visit scores', () => {
    // Three stores whose actual visit scores mirror their (good→bad) predicted order.
    const A = '3708', B = '5183', C = Object.keys(DEFAULT_TARGETS).filter(l => /^\d+$/.test(l) && l !== A && l !== B)[0];
    const ds = mkDs(goodRows(A), badRows(B), goodRows(C));
    ds.gradedVisits = [
      { store: A, dateISO: '2026-06-10', reportType: 'CFV', score: 92, pass: true },   // good pred, high actual
      { store: C, dateISO: '2026-06-11', reportType: 'CFV', score: 85, pass: true },   // good pred, high actual
      { store: B, dateISO: '2026-06-12', reportType: 'CFV', score: 60, pass: false },  // bad pred, low actual
    ];
    const res = computeVisitReadiness(ds);
    expect(res.calibration.n).toBe(3);
    expect(res.calibration.r).toBeGreaterThan(0);
  });
});
