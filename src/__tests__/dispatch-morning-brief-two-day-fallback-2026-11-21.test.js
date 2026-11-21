// @vitest-environment happy-dom
// @ts-nocheck
// Owner report (2026-11-21): "viewing yesterday's results [in the Morning Intelligence Brief]
// is still showing 2 days ago actuals." Root cause: assembleBriefStoreData()'s `nearby` fallback
// (src/features/morning-brief.js, used when no labor/ctrl row exists for the exact viewed date)
// compared raw millisecond gaps (`Math.abs(r.date-targetDate)<2*86400000`). The comment next to
// it called this "±1 day," but it isn't: every date picked via the brief's <input type=date>
// is set to NOON (`new Date(e.target.value+'T12:00:00')`), and a midnight-anchored row from 2
// CALENDAR days earlier sits only 36h (1.5 days) from that noon target — under the old `<2 days`
// cutoff, so it silently matched. Fixed with `_calDayDiff`, which anchors both sides to local
// midnight before diffing, making this a true ±1 CALENDAR day. Same bug, same fix, for the
// `lyLabor` vs-LY fallback a few lines below it.
import { describe, it, expect } from 'vitest';
import { computeMorningBrief } from '../features/morning-brief.js';

const LOC = '3708'; // real seed store (constants.js STORE_NAMES), Ardmore-Broadway OK
// The brief's date <input> sets a picked date to noon — exactly like "the user picked yesterday
// in the date control."
const TARGET_NOON = new Date('2026-11-20T12:00:00');

function storeFrom(brief) {
  const s = brief.stores.find(st => String(st.loc) === LOC);
  expect(s, `store ${LOC} not found in brief.stores`).toBeTruthy();
  return s;
}

describe('Morning Brief — labor/ctrl fallback is a true ±1 calendar day, not ±2 (2026-11-21)', () => {
  it('does NOT pull a labor row from 2 calendar days before the (noon-anchored) viewed date', () => {
    const ds = { laborRows: [{ loc: LOC, date: new Date('2026-11-18T00:00:00'), sales: 99999, gc: 500 }] };
    const brief = computeMorningBrief(ds, TARGET_NOON, {});
    const store = storeFrom(brief);
    expect(store.sales).not.toBe(99999);
    expect(store.hasLabor).toBe(false);
  });

  it('DOES still pull a labor row exactly 1 calendar day before the viewed date (legitimate late-upload fallback)', () => {
    const ds = { laborRows: [{ loc: LOC, date: new Date('2026-11-19T00:00:00'), sales: 12345, gc: 300 }] };
    const brief = computeMorningBrief(ds, TARGET_NOON, {});
    const store = storeFrom(brief);
    expect(store.sales).toBe(12345);
    expect(store.hasLabor).toBe(true);
  });

  it('DOES still pull a labor row exactly 1 calendar day AFTER the viewed date', () => {
    const ds = { laborRows: [{ loc: LOC, date: new Date('2026-11-21T00:00:00'), sales: 54321, gc: 200 }] };
    const brief = computeMorningBrief(ds, TARGET_NOON, {});
    const store = storeFrom(brief);
    expect(store.sales).toBe(54321);
    expect(store.hasLabor).toBe(true);
  });

  it('still prefers an EXACT same-day row over a ±1-day one when both exist', () => {
    const ds = { laborRows: [
      { loc: LOC, date: new Date('2026-11-19T00:00:00'), sales: 11111, gc: 100 },
      { loc: LOC, date: new Date('2026-11-20T00:00:00'), sales: 22222, gc: 200 },
    ] };
    const brief = computeMorningBrief(ds, TARGET_NOON, {});
    expect(storeFrom(brief).sales).toBe(22222);
  });
});
