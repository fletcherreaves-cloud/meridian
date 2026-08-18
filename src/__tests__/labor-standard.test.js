// @ts-nocheck
// dispatch20 §3 — every fixture number here is copied verbatim from
// memory/analysis-labor-allocation-2026-08-18.md, the owner-run, already-measured
// analysis this engine encodes. This is verifying the implementation reproduces a
// proven result, not asserting a newly-invented one.
import { describe, it, expect } from 'vitest';
import {
  daypartOf, DAYPARTS, allocationByStoreDaypart, allocationDistrict,
  overnightOpenness, fracToHour, preOpenLateNightFraction, lateNightStandardForDay,
  overnightExcessByStore, CLOSE_DOWN_HOURS, PRE_OPEN_HOURS,
} from '../engine/labor-standard.js';

describe('daypartOf — the VLH guide\'s own boundaries, single source of truth', () => {
  it('buckets every hour_slot exactly as the SQL case statement does', () => {
    const cases = [
      ['05:00', 'Late Night'], // 4-5am, Late Night at the START of the business day
      ['06:00', 'Breakfast'], ['07:00', 'Breakfast'], ['11:00', 'Breakfast'],
      ['12:00', 'Lunch'], ['13:00', 'Lunch'], ['14:00', 'Lunch'],
      ['15:00', 'Afternoon'], ['16:00', 'Afternoon'], ['17:00', 'Afternoon'],
      ['18:00', 'Dinner'], ['19:00', 'Dinner'], ['23:00', 'Dinner'],
      ['24:00', 'Late Night'], ['25:00', 'Late Night'], ['26:00', 'Late Night'],
      ['27:00', 'Late Night'], ['28:00', 'Late Night'],
    ];
    for (const [slot, dp] of cases) expect(daypartOf(slot)).toBe(dp);
  });

  it('reconciles to exactly 24 slots across the 5 dayparts (05,06-11,12-14,15-17,18-23,24-28)', () => {
    const slots = ['05', ...Array.from({ length: 24 }, (_, i) => String(i + 5).padStart(2, '0')).slice(1)];
    // 05..28 inclusive = 24 slots
    const all = Array.from({ length: 24 }, (_, i) => String(i + 5).padStart(2, '0') + ':00');
    expect(all.length).toBe(24);
    const counts = {};
    for (const s of all) counts[daypartOf(s)] = (counts[daypartOf(s)] || 0) + 1;
    expect(counts['Late Night']).toBe(6);   // 05, 24, 25, 26, 27, 28
    expect(counts['Breakfast']).toBe(6);    // 06-11
    expect(counts['Lunch']).toBe(3);        // 12-14
    expect(counts['Afternoon']).toBe(3);    // 15-17
    expect(counts['Dinner']).toBe(6);       // 18-23
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(24);
  });
});

// Build a minimal complete-day fixture: one store, one day, 24 hour_slots.
function mkDay(loc, dt, overrides = {}) {
  const all = Array.from({ length: 24 }, (_, i) => String(i + 5).padStart(2, '0') + ':00');
  return all.map(hour_slot => ({
    loc, dt, hour_slot,
    dt_trans_cnt: 0, actual_punched_hours: 0, total_needed_hours: 0, total_scheduled_hours: 0,
    ...(overrides[hour_slot] || {}),
  }));
}

describe('allocationByStoreDaypart — ratio of sums, not average of per-row ratios', () => {
  it('sums each leg across all hours in a daypart before dividing (a naive average would differ)', () => {
    // Breakfast hour 06: 10 punched / 5 needed = 2.0 ratio. Hour 07: 1 punched / 10 needed = 0.1.
    // Naive average of ratios = 1.05. Ratio of sums = (10+1)/(5+10) = 11/15 = 0.7333 -- different,
    // and the ratio-of-sums figure is the one the standing rule requires.
    const rows = mkDay('0003708', '2026-06-01', {
      '06:00': { actual_punched_hours: 10, total_needed_hours: 5 },
      '07:00': { actual_punched_hours: 1, total_needed_hours: 10 },
    });
    const out = allocationByStoreDaypart(rows);
    expect(out['3708'].Breakfast.punchedVsGuide).toBeCloseTo(11 / 15, 5);
    expect(out['3708'].Breakfast.punchedVsGuide).not.toBeCloseTo(1.05, 2);
  });

  it('drops an incomplete day (< 24 hour_slots) via the mandatory completeness guard', () => {
    const complete = mkDay('0003708', '2026-06-01', { '06:00': { actual_punched_hours: 5, total_needed_hours: 5 } });
    const shortDay = complete.slice(0, 20); // only 20 of 24 slots -- must be dropped entirely
    const out = allocationByStoreDaypart(shortDay);
    expect(out['3708']).toBeUndefined();
  });

  it('exposes scheduled_vs_guide and punched_vs_scheduled as SEPARATE fields (not blended)', () => {
    // Group A shape (Bonifay): schedule short of guide, but what WAS scheduled mostly showed up.
    const groupA = mkDay('0006178', '2026-06-01', {
      '06:00': { actual_punched_hours: 7.2, total_scheduled_hours: 7.5, total_needed_hours: 10 },
    });
    const a = allocationByStoreDaypart(groupA)['6178'].Breakfast;
    expect(a.scheduledVsGuide).toBeCloseTo(0.75, 2);      // schedule written short
    expect(a.punchedVsScheduled).toBeCloseTo(0.96, 2);    // but execution against the written schedule is fine
    // Group B shape (Lindsay): schedule matches guide, but people don't show up.
    const groupB = mkDay('0011657', '2026-06-01', {
      '06:00': { actual_punched_hours: 6.9, total_scheduled_hours: 10, total_needed_hours: 10 },
    });
    const b = allocationByStoreDaypart(groupB)['11657'].Breakfast;
    expect(b.scheduledVsGuide).toBeCloseTo(1.0, 2);       // schedule is right
    expect(b.punchedVsScheduled).toBeCloseTo(0.69, 2);    // execution loses it
    // The point of the split: a single punched_vs_guide number can't tell these apart.
    expect(a.punchedVsGuide).toBeCloseTo(b.punchedVsGuide, 1); // both look similarly "short" blended
    expect(a.scheduledVsGuide).not.toBeCloseTo(b.scheduledVsGuide, 1); // but the real cause differs
  });
});

describe('allocationDistrict — district rollup sums across all stores before dividing', () => {
  it('aggregates two stores into one ratio-of-sums per daypart', () => {
    const rows = [
      ...mkDay('0003708', '2026-06-01', { '06:00': { actual_punched_hours: 10, total_needed_hours: 20 } }),
      ...mkDay('0006178', '2026-06-01', { '06:00': { actual_punched_hours: 5, total_needed_hours: 5 } }),
    ];
    const d = allocationDistrict(rows);
    expect(d.Breakfast.punchedVsGuide).toBeCloseTo(15 / 25, 5);
  });
});

describe('overnightOpenness — Query 5\'s own classifier, general not hardcoded', () => {
  it('flags a store with zero Late Night drive-thru activity as closed overnight', () => {
    const rows = mkDay('0003708', '2026-06-01', {
      '24:00': { actual_punched_hours: 2, total_needed_hours: 0.1, dt_trans_cnt: 0 },
    });
    const o = overnightOpenness(rows)['3708'];
    expect(o.isClosedOvernight).toBe(true);
    expect(o.pctSlotsWithCars).toBe(0);
  });

  it('does NOT flag a store with real Late Night car counts (e.g. Ponce de Leon, 24hr)', () => {
    const rows = mkDay('0024471', '2026-06-01', {
      '24:00': { actual_punched_hours: 2, total_needed_hours: 1.5, dt_trans_cnt: 8 },
      '25:00': { actual_punched_hours: 2, total_needed_hours: 1.2, dt_trans_cnt: 6 },
    });
    const o = overnightOpenness(rows)['24471'];
    expect(o.isClosedOvernight).toBe(false);
    expect(o.pctSlotsWithCars).toBeGreaterThan(5);
  });
});

describe('preOpenLateNightFraction / lateNightStandardForDay — the pre-open daypart-crossing rule', () => {
  it('a 5:00am opener puts the whole pre-open hour in Late Night (fraction 1)', () => {
    expect(preOpenLateNightFraction(5.0)).toBeCloseTo(1, 5);
  });
  it('a 6:00am opener puts NONE of the pre-open hour in Late Night (fraction 0)', () => {
    expect(preOpenLateNightFraction(6.0)).toBeCloseTo(0, 5);
  });
  it('a 5:30am opener splits it evenly (fraction 0.5)', () => {
    expect(preOpenLateNightFraction(5.5)).toBeCloseTo(0.5, 5);
  });

  // Reproduces the file's own worked table exactly (memory/analysis-labor-allocation-2026-08-18.md
  // "Result: nine stores are closed for the ENTIRE 11pm-5am block").
  const worked = [
    { name: 'Ardmore-Cooper/12th', opens: 5.0, preOpenInLN: 3.0, low: 6, high: 7 },
    { name: 'Sulphur',             opens: 6.0, preOpenInLN: 0,   low: 3, high: 4 },
    { name: 'Holdenville',         opens: 6.0, preOpenInLN: 0,   low: 3, high: 4 },
    { name: 'Elgin',               opens: 5.0, preOpenInLN: 3.0, low: 6, high: 7 },
    { name: 'DeFuniak Springs',    opens: 5.0, preOpenInLN: 3.0, low: 6, high: 7 },
    { name: 'Seminole',            opens: 5.0, preOpenInLN: 3.0, low: 6, high: 7 },
    { name: 'Marietta',            opens: 5.0, preOpenInLN: 3.0, low: 6, high: 7 },
    { name: 'Tishomingo',          opens: 6.0, preOpenInLN: 0,   low: 3, high: 4 },
    { name: 'Lindsay-Wal-Mart',    opens: 5.5, preOpenInLN: 1.5, low: 4.5, high: 5.5 },
  ];
  for (const w of worked) {
    it(`${w.name} (opens ${w.opens}) -> preOpenInLN=${w.preOpenInLN}, expected ${w.low}-${w.high}`, () => {
      const std = lateNightStandardForDay(w.opens, false);
      expect(std.preOpenInLN).toBeCloseTo(w.preOpenInLN, 5);
      expect(std.low).toBeCloseTo(w.low, 5);
      expect(std.high).toBeCloseTo(w.high, 5);
    });
  }

  it('CLOSE_DOWN_HOURS and PRE_OPEN_HOURS match the owner\'s stated standard verbatim', () => {
    expect(CLOSE_DOWN_HOURS).toEqual({ low: 3, high: 4 });
    expect(PRE_OPEN_HOURS).toBe(3);
  });

  it('a 24hr store gets no close-down/pre-open standard at all -- it never closes', () => {
    expect(lateNightStandardForDay(5.0, true)).toBeNull();
  });
});

describe('overnightExcessByStore — end-to-end verdicts against the file\'s own excess/night column', () => {
  function fixtureConfig(openHour, is24hr = false, is24Note = null) {
    const dayHours = { open: openHour / 24, close: (openHour + 12) / 24, hours: 12 };
    const hours = {};
    for (const wd of ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) hours[wd] = { ...dayHours };
    return { is24hr, is24Note, hours };
  }
  function fixtureOpenness(punchedPerNight) {
    return { isClosedOvernight: true, punchedHrsPerNight: punchedPerNight, pctSlotsWithCars: 0, nights: 90, carsPerNight: 0, neededHrsPerNight: 0.1, gapHrs: 0 };
  }

  // Table rows from the file, "actual/night" vs "excess/night":
  const table = [
    { name: '3708-ardmore-like', opens: 5.0, actual: 13.9, excess: 6.9, verdict: 'over' },
    { name: '6178-sulphur-like', opens: 6.0, actual: 7.4,  excess: 3.4, verdict: 'over' },
    { name: '5985-holdenville-like', opens: 6.0, actual: 6.6, excess: 2.6, verdict: 'over' },
    { name: '6838-elgin-like', opens: 5.0, actual: 9.4, excess: 2.4, verdict: 'over' },
    { name: '6972-defuniak-like', opens: 5.0, actual: 7.9, excess: 0.9, verdict: 'over' },
    { name: '10034-seminole-like', opens: 5.0, actual: 7.5, excess: 0.5, verdict: 'over' },
    { name: '10422-marietta-like', opens: 5.0, actual: 4.7, verdict: 'under' },   // low=6, 4.7 < 6
    { name: '10915-tishomingo-like', opens: 6.0, actual: 3.1, verdict: 'target' }, // in [3,4]
    { name: '11657-lindsay-like', opens: 5.5, actual: 1.1, verdict: 'under' },    // low=4.5, way under
  ];

  for (const t of table) {
    it(`${t.name}: opens ${t.opens}, actual ${t.actual}/night -> ${t.verdict}${t.excess ? ` (+${t.excess})` : ''}`, () => {
      const loc = t.name.split('-')[0];
      const config = { [loc]: fixtureConfig(t.opens) };
      const openness = { [loc]: fixtureOpenness(t.actual) };
      const out = overnightExcessByStore(config, openness)[loc];
      expect(out.safeForWeeklyAverage).toBe(true);
      if (t.verdict === 'over') {
        expect(out.verdict.overStandard).toBe(true);
        expect(out.verdict.excess).toBeCloseTo(t.excess, 1);
      } else if (t.verdict === 'under') {
        expect(out.verdict.underStandard).toBe(true);
      } else {
        expect(out.verdict.onTarget).toBe(true);
      }
    });
  }

  it('Ponce de Leon (24hr) is excluded from the standard entirely -- na, not graded', () => {
    const config = { '24471': { is24hr: true, is24Note: null, hours: {} } };
    // A genuinely-open 24hr store should not even be classified isClosedOvernight in real
    // data (real Late Night car counts), but overnightExcessByStore itself must also refuse
    // to grade a 24hr store even if it were mistakenly passed in.
    const openness = { '24471': fixtureOpenness(13.4) };
    const out = overnightExcessByStore(config, openness)['24471'];
    expect(out.na).toBe(true);
    expect(out.reason).toMatch(/24hr/);
  });

  it('a mixed-hours store (24hr weekend folded into a fixed weekday schedule) is NOT weekly-averaged', () => {
    // Chickasha-style: is24Note carries "24 HR W/E" -- a weekly average would blend a
    // genuinely-24hr Saturday with a midnight-closing Monday and erase the variation
    // (the file's own example: 32.0 punched vs 2.43 AVERAGE open hours).
    const loc = '33222';
    const config = { [loc]: { is24hr: false, is24Note: '24 HR W/E', hours: {
      sun: { open: 5 / 24, close: 22 / 24, hours: 17 }, mon: { open: 5 / 24, close: 22 / 24, hours: 17 },
      tue: { open: 5 / 24, close: 22 / 24, hours: 17 }, wed: { open: 5 / 24, close: 22 / 24, hours: 17 },
      thu: { open: 5 / 24, close: 22 / 24, hours: 17 }, fri: { open: 0, close: 0, hours: 24 },
      sat: { open: 0, close: 0, hours: 24 },
    } } };
    const openness = { [loc]: fixtureOpenness(15) };
    const out = overnightExcessByStore(config, openness)[loc];
    expect(out.safeForWeeklyAverage).toBe(false);
    expect(out.verdict).toBeNull(); // no single verdict manufactured from an unsafe average
    expect(out.perDay.fri).toBeTruthy(); // per-weekday standards still exposed
  });
});
