import { describe, it, expect } from 'vitest';
import {
  computeLaborRow, analyzeStore, aggregateGroup, analyzeSheet,
  hoursOpen, fracToTime, FLH_THRESHOLDS,
  isoWeekMonday, deriveBand1FromSchedule, mergeAutoManualWeek,
} from '../engine/labor-analysis.js';
import { setWeekStartDay } from '../utils/date.js';

// Real inputs from the source sheet, store 3708 (row 4). Hours Forecast/Scheduled
// are [h]:mm durations — the PARSER converts day-serials to real hours (×24), so
// the engine takes hours: F=46.2083*24=1109.0, G=62.5208*24=1500.5. Expected
// outputs are the sheet's own displayed results — reproduced cell-for-cell.
const S3708 = {
  loc: '3708', salesFcst: 74379, laborPctActual: 0.2519, gcFcst: 7443,
  hoursFcst: 1109.0, hoursSched: 1500.5,
  schedFixedPct: 0.026, tpph: 4.96, rate: 13.1417313714383, laborTargetOrg: 0.215,
};

describe('labor-analysis — matches the source worksheet (store 3708)', () => {
  const r = computeLaborRow(S3708);
  it('Scheduled Labor $ = C*D', () => expect(r.scheduledLaborD).toBeCloseTo(18736.07, 1));
  it('Target Labor $ = C*L', () => expect(r.targetLaborD).toBeCloseTo(15991.49, 1));
  it('Labor Target +2% = L+0.02', () => expect(r.laborTargetPlus2).toBeCloseTo(0.235, 6));
  it('Projected Hours/Wk (target) = (C*L)/J', () => expect(r.projHrsTarget).toBeCloseTo(1216.85, 1));
  it('Hours ± sched vs forecast = G-F (hours) → 391.5', () => expect(r.hrsVsForecast).toBeCloseTo(391.5, 0));
  it('Hours ± sched vs target = G-O → 283.65', () => expect(r.hrsVsTarget).toBeCloseTo(283.65, 0));
  it('Hours ± sched vs target+2% = G-P → 170.46', () => expect(r.hrsVsTargetPlus2).toBeCloseTo(170.46, 0));
  it('$ ± vs projected (LifeLenz) = Q*J → 5145', () => expect(r.dollarsVsProjLL).toBeCloseTo(5145, -1));
  it('$ ± vs projected (target) = R*J → 3727.68', () => expect(r.dollarsVsTarget).toBeCloseTo(3727.68, 0));
  it('$ ± vs projected (target+2%) = S*J → 2240.1', () => expect(r.dollarsVsTargetPlus2).toBeCloseTo(2240.1, 0));
  it('Recommended Fixed @10% = O*0.1', () => expect(r.recFixed10).toBeCloseTo(121.68, 1));
  it('Combined @25% = O*0.25', () => expect(r.combined25).toBeCloseTo(304.21, 1));
});

describe('labor-analysis — null-safety', () => {
  it('returns nulls when inputs are missing, never NaN', () => {
    const r = computeLaborRow({ salesFcst: null, rate: 0 });
    expect(r.scheduledLaborD).toBeNull();
    expect(r.projHrsTarget).toBeNull();   // div-by-zero rate → null, not Infinity
    expect(Number.isNaN(r.combined25)).toBe(false);
  });
});

describe('labor-analysis — dollar-weighted subtotals (never average of %s)', () => {
  it('recomputes group labor % from Σ$/Σsales, not the mean of store %s', () => {
    // Two very different stores: a big low-% store and a small high-% store.
    const a = analyzeStore({ loc: 'A', salesFcst: 100000, laborPctActual: 0.20, gcFcst: 10000, hoursSched: 1500, laborTargetOrg: 0.20, rate: 13 });
    const b = analyzeStore({ loc: 'B', salesFcst: 10000, laborPctActual: 0.40, gcFcst: 2000, hoursSched: 400, laborTargetOrg: 0.20, rate: 13 });
    const g = aggregateGroup([a, b]);
    // Σ$ = 100000*.2 + 10000*.4 = 24000 ; Σsales = 110000 → 21.8%, NOT (20+40)/2=30%.
    expect(g.laborPctActual).toBeCloseTo(24000 / 110000, 6);
    expect(g.laborPctActual).not.toBeCloseTo(0.30, 3);
    expect(g.salesFcst).toBe(110000);
    expect(g.n).toBe(2);
  });

  it('weighted TPPH = Σgc/Σhours', () => {
    const a = analyzeStore({ loc: 'A', salesFcst: 1, gcFcst: 10000, hoursSched: 1500 });
    const b = analyzeStore({ loc: 'B', salesFcst: 1, gcFcst: 2000, hoursSched: 400 });
    const g = aggregateGroup([a, b]);
    expect(g.tpph).toBeCloseTo(12000 / 1900, 6);
  });

  it('empty group → null', () => expect(aggregateGroup([])).toBeNull());
});

describe('labor-analysis — analyzeSheet buckets FL vs OK', () => {
  it('splits and subtotals by the isFL predicate', () => {
    const inputs = [
      { loc: '3708', salesFcst: 74379, laborPctActual: 0.25, gcFcst: 7443, hoursSched: 62, laborTargetOrg: 0.215, rate: 13 },
      { loc: '6178', salesFcst: 50000, laborPctActual: 0.24, gcFcst: 5000, hoursSched: 45, laborTargetOrg: 0.215, rate: 13 },
    ];
    const FL = new Set(['6178']);
    const out = analyzeSheet(inputs, loc => FL.has(loc));
    expect(out.rows).toHaveLength(2);
    expect(out.subtotals.ok.n).toBe(1);
    expect(out.subtotals.fl.n).toBe(1);
    expect(out.subtotals.grand.n).toBe(2);
    expect(out.subtotals.grand.salesFcst).toBe(124379);
  });
});

describe('labor-analysis — hours of operation', () => {
  it('hoursOpen from Excel time fractions', () => {
    // 5:00 (0.2083) to 22:00 (0.9166) = 17h
    expect(hoursOpen(0.20833333, 0.91666666)).toBeCloseTo(17, 1);
  });
  it('close at/through midnight wraps to a 24h day span', () => {
    // open 5:00, close 0 (midnight) → 19h
    expect(hoursOpen(0.20833333, 0)).toBeCloseTo(19, 1);
    // open 22:00, close 2:00 → 4h (crossed midnight)
    expect(hoursOpen(0.91666666, 0.08333333)).toBeCloseTo(4, 1);
  });
  it('fracToTime formats 12-hour clock', () => {
    expect(fracToTime(0.20833333)).toBe('5:00 AM');
    expect(fracToTime(0.91666666)).toBe('10:00 PM');
    expect(fracToTime(0.5)).toBe('12:00 PM');
    expect(fracToTime(0)).toBe('12:00 AM');
  });
  it('FLH thresholds are the sheet constants', () => {
    expect(FLH_THRESHOLDS).toEqual({ fixed10: 0.10, fixed15: 0.15, floor10: 0.10, floor15: 0.15, combined25: 0.25 });
  });
});

describe('labor-analysis — weekly Band-1 from daily LifeLenz schedule', () => {
  // This test used to assert Monday, and in doing so enshrined the bug: the engine
  // hardcoded `(getDay() + 6) % 7` while this org's setting is WEDNESDAY, so every week
  // the Labor Analysis panel displayed was two days off. Now asserts that the configured
  // week start is HONOURED, whatever it is set to.
  it('isoWeekMonday honours the configured week start, not a hardcoded Monday', () => {
    const fri = new Date('2026-08-07T12:00:00');
    setWeekStartDay(3);                                     // Wed — this org's setting
    expect(isoWeekMonday(fri).toISOString().slice(0, 10)).toBe('2026-08-05');
    setWeekStartDay(1);                                     // Mon
    expect(isoWeekMonday(fri).toISOString().slice(0, 10)).toBe('2026-08-03');
    setWeekStartDay(0);                                     // Sun
    expect(isoWeekMonday(fri).toISOString().slice(0, 10)).toBe('2026-08-02');
    setWeekStartDay(3);                                     // restore
  });

  it('accepts an explicit week-start override without touching the global', () => {
    setWeekStartDay(3);
    const fri = new Date('2026-08-07T12:00:00');
    expect(isoWeekMonday(fri, 0).toISOString().slice(0, 10)).toBe('2026-08-02');
    expect(isoWeekMonday(fri).toISOString().slice(0, 10)).toBe('2026-08-05'); // global intact
  });

  // A store with 7 clean days in the target week, plus one row in the NEXT week
  // (must be excluded). Per-day: Proj VLH 150 + Fixed 30 + Floor 20 = 200 hrs
  // forecast; Sch 160 + 30 + 20 = 210 hrs scheduled; sales 10k, GC 1000, labor 21%.
  const mk = (loc, date, o) => ({ loc, date, fcstSales: 10000, fcstTCs: 1000, laborPct: 0.21, projVLH: 150, fixGuideHrs: 30, projFloor: 20, schVLH: 160, schFixHrs: 30, schFloor: 20, ...o });
  const week = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26'];
  const rows = week.map(d => mk('0003708', d));
  rows.push(mk('0003708', '2026-07-27', { fcstSales: 99999 })); // next week — excluded

  const out = deriveBand1FromSchedule(rows, { weekStart: '2026-07-20', orgTargetFor: () => 0.215 });
  const b = out.rows['3708'];

  it('buckets only the target week (excludes next-week rows)', () => {
    expect(out.weekStart).toBe('2026-07-20');
    expect(b.salesFcst).toBeCloseTo(70000, 6);   // 7×10k, NOT including the 99999 day
  });
  it('Hours Forecast (F) = Σ(Proj VLH + Fixed + Floor)', () => {
    expect(b.hoursFcst).toBeCloseTo(1400, 6);     // 7×200
  });
  it('Hours Scheduled (G) = Σ(Sch VLH + Sch Fixed + Sch Floor)', () => {
    expect(b.hoursSched).toBeCloseTo(1470, 6);    // 7×210
  });
  it('GC forecast sums Fcst TCs', () => expect(b.gcFcst).toBeCloseTo(7000, 6));
  it('Labor % is sales-weighted Σ$/Σsales (not a mean of daily %s)', () => {
    expect(b.laborPctActual).toBeCloseTo(0.21, 6);          // Σ(0.21×10k)/Σ10k
  });
  it('Rate = Σ labor$ / Σ scheduled hours', () => {
    expect(b.rate).toBeCloseTo(14700 / 1470, 6);            // = 10.0
  });
  it('TPPH = Σ GC / Σ scheduled hours', () => {
    expect(b.tpph).toBeCloseTo(7000 / 1470, 6);
  });
  it('org target wired from orgTargetFor', () => expect(b.laborTargetOrg).toBeCloseTo(0.215, 6));

  it('normalizes a labor % stored as 21.5 rather than 0.215', () => {
    const r2 = ['2026-07-20', '2026-07-21'].map(d => mk('0009999', d, { laborPct: 21 }));
    const o2 = deriveBand1FromSchedule(r2, { weekStart: '2026-07-20' });
    expect(o2.rows['9999'].laborPctActual).toBeCloseTo(0.21, 6);
  });

  it('skips a store with no forecast sales in the week', () => {
    const r3 = [mk('0001111', '2026-07-20', { fcstSales: 0 })];
    const o3 = deriveBand1FromSchedule(r3, { weekStart: '2026-07-20' });
    expect(o3.rows['1111']).toBeUndefined();
  });

  // Owner report 2026-08-05 (OKC-I240/Sooner, week-in-progress): only the days that have
  // already happened carry a labor_pct from LifeLenz — later days in the week are $10k
  // sales but no % yet. laborPctActual must stay a real (<100%) number scaled to the FULL
  // week's sales, not the partial-coverage subset — otherwise it (and Scheduled Labor $
  // downstream, which multiplies it back by the full week's sales) blow past 100%.
  it('a week with only some days reporting labor_pct does not inflate Labor % past reality', () => {
    const covered = ['2026-07-20', '2026-07-21'].map(d => mk('0020475', d, { laborPct: 0.21 }));   // 2 days @ 21%
    const uncovered = ['2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26']
      .map(d => mk('0020475', d, { laborPct: null }));                                             // 5 days, no % yet
    const o = deriveBand1FromSchedule([...covered, ...uncovered], { weekStart: '2026-07-20' });
    const r = o.rows['20475'];
    expect(r.salesFcst).toBeCloseTo(70000, 6);                     // full week still counted for sales
    expect(r.laborPctActual).toBeCloseTo((0.21 * 10000 * 2) / 70000, 6); // Σ$ / FULL-week sales → ~6%, not 21%
    expect(r.laborPctActual).toBeLessThan(1);                      // never a >100% headline number
    expect(r.laborPctCoverage).toBeCloseTo(2 / 7, 6);               // 2 of 7 days had a real %
    // Rate = Σ$ / hours-that-have-$-behind-them (2 covered days' 210hrs each = 420), NOT the
    // full week's 1470 hours — the old full-week denominator diluted rate toward $0/hr on the
    // very same partial-week days that inflated Labor %/Sched Labor $ above.
    expect(r.rate).toBeCloseTo((0.21 * 10000 * 2) / 420, 6);        // = 10.0, same as full-coverage case
    // Scheduled Labor $ (Band-2, C*D) must collapse back to the REAL summed $ once D's
    // denominator matches C — no longer re-inflated by multiplying a partial % by full sales.
    const row = analyzeStore(r);
    expect(row.scheduledLaborD).toBeCloseTo(0.21 * 10000 * 2, 1);   // = the 2 covered days' real $
  });

  // Dispatch #133 (2026-08-25): the CURRENT in-progress business day's labor_pct is an
  // intraday snapshot from LifeLenz (cost accrued so far ÷ sales accrued so far while the
  // day is still open), NOT a finished-day ratio. Multiplying it by the day's FULL forecast
  // sales is the same day-vs-week scope mismatch the 2026-08-05 fix caught one level up —
  // just within a single day instead of within the week. Live-verified against real
  // lifelenz_schedule rows (service-role read, 2026-08-25): today's raw labor_pct was 14147
  // for Duncan-Hwy 81/#29760 (vs. 18-23 every other day that week), and hand-reproducing the
  // pre-fix math from those exact rows landed at laborPctActual≈19.12 (1912%), matching the
  // owner-reported 1911.73% almost exactly — confirming this is the real mechanism.
  describe('the CURRENT in-progress business day\'s labor_pct is excluded, not multiplied by full-day sales (dispatch #133)', () => {
    const today = new Date('2026-07-22T12:00:00Z'); // "today" = 2026-07-22 (Wed), mid-week

    it('a garbage intraday value on TODAY does not blow the week past reality', () => {
      const rows = [
        mk('0029760', '2026-07-20', { laborPct: 0.21 }),
        mk('0029760', '2026-07-21', { laborPct: 0.21 }),
        mk('0029760', '2026-07-22', { laborPct: 14147 }),   // TODAY — real Duncan-Hwy 81 value
        mk('0029760', '2026-07-23', { laborPct: null }),    // not yet posted (future)
        mk('0029760', '2026-07-24', { laborPct: null }),
        mk('0029760', '2026-07-25', { laborPct: null }),
        mk('0029760', '2026-07-26', { laborPct: null }),
      ];
      const o = deriveBand1FromSchedule(rows, { weekStart: '2026-07-20', asOf: today });
      const r = o.rows['29760'];
      expect(r.salesFcst).toBeCloseTo(70000, 6);                 // full week still counted for sales
      // Only the 2 REAL prior days feed laborDol — today's 14147 contributes nothing,
      // exactly as if LifeLenz hadn't posted a value for it yet (same as tomorrow's days).
      expect(r.laborPctActual).toBeCloseTo((0.21 * 10000 * 2) / 70000, 6); // ≈ 6%
      expect(r.laborPctActual).toBeLessThan(1);                  // never a >100% headline number
      expect(r.laborPctCoverage).toBeCloseTo(2 / 7, 6);           // today does NOT count as covered
      expect(r.rate).toBeCloseTo((0.21 * 10000 * 2) / 420, 6);    // hours also exclude today's $-less day
    });

    it('reproduces the owner-reported Duncan-Hwy 81 figures from the real captured rows and lands sane after the fix', () => {
      // Real lifelenz_schedule rows for loc 0029760, week of 2026-08-19 (live-verified via
      // service-role read, 2026-08-25). Only fcstSales/laborPct vary here — the fix touches
      // laborDol/salesForPct only, not the hours/GC fields — so the rest of `mk`'s defaults
      // are fine stand-ins.
      const asOfNow = new Date('2026-08-25T12:00:00Z'); // today = 2026-08-25
      const rows = [
        mk('0029760', '2026-08-19', { fcstSales: 15776.8, laborPct: 23.32 }),
        mk('0029760', '2026-08-20', { fcstSales: 16658,   laborPct: 21.15 }),
        mk('0029760', '2026-08-21', { fcstSales: 17877.3, laborPct: 21.71 }),
        mk('0029760', '2026-08-22', { fcstSales: 17439.4, laborPct: 22.22 }),
        mk('0029760', '2026-08-23', { fcstSales: 15217.9, laborPct: 22.27 }),
        mk('0029760', '2026-08-24', { fcstSales: 14488.7, laborPct: 23.42 }),
        mk('0029760', '2026-08-25', { fcstSales: 15049.9, laborPct: 14147 }), // TODAY — the corrupted value
      ];
      const o = deriveBand1FromSchedule(rows, { weekStart: '2026-08-19', asOf: asOfNow, orgTargetFor: () => 0.215 });
      const r = o.rows['29760'];
      // Pre-fix this store rendered ~1911.73% (owner report). Post-fix it should land near
      // the other 6 days' own 18-23% range, not >100%.
      expect(r.laborPctActual).toBeCloseTo(0.1932, 3);
      expect(r.laborPctActual).toBeLessThan(0.30);
      expect(r.laborPctActual).toBeGreaterThan(0.10);
    });

    it('boundary regression (2026-08-05 case): today already NULL is a no-op — still under-states, never over-states', () => {
      // If LifeLenz simply hasn't posted anything for today yet (the ORIGINAL 2026-08-05
      // shape — no garbage value, just nothing), the todayIso check is a no-op: lp was
      // already null. Coverage/Labor % must behave identically to the pre-existing
      // partial-week test above, proving the fix doesn't change that established "safe
      // direction" behaviour.
      const rows = [
        mk('0020475', '2026-07-20', { laborPct: 0.21 }),
        mk('0020475', '2026-07-21', { laborPct: 0.21 }),
        mk('0020475', '2026-07-22', { laborPct: null }),   // today — not posted, same as future days
        mk('0020475', '2026-07-23', { laborPct: null }),
        mk('0020475', '2026-07-24', { laborPct: null }),
        mk('0020475', '2026-07-25', { laborPct: null }),
        mk('0020475', '2026-07-26', { laborPct: null }),
      ];
      const o = deriveBand1FromSchedule(rows, { weekStart: '2026-07-20', asOf: today });
      const r = o.rows['20475'];
      expect(r.laborPctActual).toBeCloseTo((0.21 * 10000 * 2) / 70000, 6);
      expect(r.laborPctActual).toBeLessThan(1);
      expect(r.laborPctCoverage).toBeCloseTo(2 / 7, 6);
    });
  });
});

// #153 defect 3: laborTargetOrg (column L) on a MANUAL/gap-filled row used to come straight
// from the MBI upload's own hand-typed cell — a snapshot frozen at upload time, measured up to
// 2.00pp stale against constants.js. mergeAutoManualWeek now repoints L through the SAME
// resolver on every row regardless of source, so a manual-only week is no longer scored/planned
// against a stale spreadsheet snapshot.
describe('mergeAutoManualWeek — target repoint (#153 defect 3)', () => {
  const orgTargetFor = loc => ({ '3708': 0.21, '5183': 0.22 }[loc] ?? null);

  it('AUTO-only rows are repointed even though deriveBand1FromSchedule already set L via orgTargetFor', () => {
    const auto = { weekStart: '2026-07-20', rows: { '3708': { loc: '3708', laborTargetOrg: 0.21, salesFcst: 100 } } };
    const out = mergeAutoManualWeek(auto, { weekStart: null, rows: {} }, orgTargetFor);
    expect(out.rows['3708'].laborTargetOrg).toBe(0.21);
    expect(out.source).toBe('auto');
  });

  it('a gap-filled MANUAL row is repointed away from its own stale laborTargetOrg', () => {
    const auto = { weekStart: '2026-07-20', rows: { '3708': { loc: '3708', laborTargetOrg: 0.21, salesFcst: 100 } } };
    // Manual row for a DIFFERENT store, carrying a stale hand-typed target the resolver disagrees with.
    const manual = { weekStart: '2026-07-20', rows: { '5183': { loc: '5183', laborTargetOrg: 0.999, salesFcst: 50 } } };
    const out = mergeAutoManualWeek(auto, manual, orgTargetFor);
    expect(out.manualFill).toBe(1);
    expect(out.rows['5183'].laborTargetOrg).toBe(0.22);   // resolver's value, NOT the stale 0.999
    expect(out.rows['5183'].salesFcst).toBe(50);           // everything else from the manual row survives
  });

  it('a MANUAL-only week (no schedule data at all) is also repointed, not left on the stale upload value', () => {
    const auto = { weekStart: null, rows: {} };
    const manual = { weekStart: '2026-07-13', rows: { '5183': { loc: '5183', laborTargetOrg: 0.999, salesFcst: 50 } } };
    const out = mergeAutoManualWeek(auto, manual, orgTargetFor);
    expect(out.source).toBe('manual');
    expect(out.rows['5183'].laborTargetOrg).toBe(0.22);
  });

  it('AUTO never gets overridden by a same-store MANUAL row (AUTO still wins)', () => {
    const auto = { weekStart: '2026-07-20', rows: { '3708': { loc: '3708', laborTargetOrg: 0.21, salesFcst: 100, source: 'auto-marker' } } };
    const manual = { weekStart: '2026-07-20', rows: { '3708': { loc: '3708', laborTargetOrg: 0.21, salesFcst: 999, source: 'manual-marker' } } };
    const out = mergeAutoManualWeek(auto, manual, orgTargetFor);
    expect(out.manualFill).toBe(0);
    expect(out.rows['3708'].salesFcst).toBe(100); // AUTO's number, not manual's 999
  });
});
