// @ts-nocheck
// Dispatch #82 Part B -- gap_vlh had no period in its name, sitting next to avg_daily_gap (a
// per-day rate). SAGE read the window total as a daily rate twice, e.g. reporting
// "Ada-Country Club is +141 hours/day over-staffed" for a store independently confirmed
// top-quartile on labor % -- the real per-day figure was 141/30 ~= 4.7h. Verification bar
// (memory/dispatch-82.md): a test over a known multi-day fixture asserting the daily field is
// the total ÷ days, plus an assertion that the note names the period of every field it
// describes -- revert-sensitive, so reverting the rename must fail it.
//
// Imports supabase/functions/sage-chat/lifelenz-labor-agg.js directly -- the same plain-JS
// module index.ts's query_lifelenz_labor tool calls and JSON.stringifies as its literal tool
// result. No Deno test infrastructure exists in this repo to boot the edge function itself, so
// this is the closest thing to the real call site: reverting the field name back to gap_vlh
// (not just its wiring into index.ts) makes these tests fail, since they exercise that exact
// code.
import { describe, it, expect } from 'vitest';
import { aggregateLifelenzLabor, LIFELENZ_LABOR_NOTE } from '../../supabase/functions/sage-chat/lifelenz-labor-agg.js';

// A 30-day fixture for one store -- the exact window length the dispatch's own reconciliation
// used (141 / 30 = 4.7, 71.6 / 30 = 2.4) -- schVLH/needVLH chosen so the total gap is a round,
// unmistakably-not-a-daily-number figure.
function makeRows(loc, days, schPerDay, needPerDay) {
  const rows = [];
  for (let i = 0; i < days; i++) {
    rows.push({ loc, date: `2026-08-${String(i + 1).padStart(2, '0')}`, sch_vlh: schPerDay, need_vlh: needPerDay });
  }
  return rows;
}

describe('lifelenz-labor-agg -- gap_vlh_total vs avg_daily_gap (dispatch #82 Part B)', () => {
  it('gap_vlh_total is the WINDOW SUM; avg_daily_gap is gap_vlh_total divided by days actually summed', () => {
    // 30 days, +4.7 VLH/day gap -> total should be 141.0, matching the dispatch's own
    // reconciliation of SAGE's reported "141 hours/day" figure.
    const rows = makeRows('6972', 30, 104.7, 100);
    const out = aggregateLifelenzLabor(rows, { 6972: 'Ada-Country Club' });
    const store = out.find(s => s.loc === '6972');
    expect(store).toBeTruthy();
    expect(store.days).toBe(30);
    expect(store.gap_vlh_total).toBeCloseTo(141.0, 1);
    // The bug: SAGE read gap_vlh_total (141) as if it were already a daily rate. The real
    // daily rate is the total divided by days -- this is the assertion that would have caught
    // the original bug, and is revert-sensitive: a caller that goes back to treating the total
    // as the daily figure fails this exact check.
    expect(store.avg_daily_gap).toBeCloseTo(store.gap_vlh_total / store.days, 5);
    expect(store.avg_daily_gap).toBeCloseTo(4.7, 1);
  });

  it('a second store on a shorter window reconciles independently -- not a hardcoded divisor', () => {
    // Madill: dispatch reconciled SAGE's "71.6h/day" against a 30-day window -> 2.4/day. Here
    // proven on a DIFFERENT day-count (18 days) so the fix is confirmed to divide by each
    // store's own `days`, not a fixed assumption borrowed from the first fixture.
    const rows = makeRows('13113', 18, 105, 100); // +5 VLH/day * 18 days = 90 total
    const out = aggregateLifelenzLabor(rows, { 13113: 'Madill-Hwy 70' });
    const store = out.find(s => s.loc === '13113');
    expect(store.days).toBe(18);
    expect(store.gap_vlh_total).toBeCloseTo(90.0, 1);
    expect(store.avg_daily_gap).toBeCloseTo(5.0, 1);
  });

  it('field is named gap_vlh_total, not the old unlabeled gap_vlh -- the actual rename', () => {
    const rows = makeRows('6972', 30, 104.7, 100);
    const out = aggregateLifelenzLabor(rows, {});
    const store = out[0];
    expect(store).toHaveProperty('gap_vlh_total');
    expect(store).not.toHaveProperty('gap_vlh');
  });

  it('sorts worst-gap-first by the WINDOW TOTAL, magnitude-ranked', () => {
    const rows = [
      ...makeRows('100', 10, 110, 100), // total +100
      ...makeRows('200', 10, 101, 100), // total +10
      ...makeRows('300', 10, 90, 100),  // total -100 (under-staffed, same magnitude as store 100)
    ];
    const out = aggregateLifelenzLabor(rows, {});
    expect(out.map(s => s.loc)).toEqual(['100', '300', '200']);
  });

  it('note names the period of BOTH fields it describes -- not just the sign', () => {
    // The original bug's other half: the note explained only "Positive = over-scheduled",
    // never that gap_vlh was a sum over days. Assert the note is now explicit about the
    // period of each field, so a future reader (human or SAGE) can't repeat the misread.
    expect(LIFELENZ_LABOR_NOTE).toMatch(/gap_vlh_total/);
    expect(LIFELENZ_LABOR_NOTE).toMatch(/summed across/i);
    expect(LIFELENZ_LABOR_NOTE).toMatch(/date_range/);
    expect(LIFELENZ_LABOR_NOTE).toMatch(/avg_daily_gap/);
    expect(LIFELENZ_LABOR_NOTE).toMatch(/per-day/i);
  });

  it('falls back to a generated store label when no name is supplied', () => {
    const rows = makeRows('99999', 5, 100, 100);
    const out = aggregateLifelenzLabor(rows, {});
    expect(out[0].name).toBe('Store 99999');
  });

  // Dispatch #90, item 2 -- lifelenz_schedule.loc is ALWAYS the 7-char zero-padded NSN at the DB
  // level (verified live against Supabase: every row in the table reads "0010915", never
  // "10915"). Without normalizing, every store's name lookup misses storeNames (keyed unpadded)
  // and falls back to "Store 00XXXXX" -- an unresolvable label that is effectively invisible to
  // SAGE even though the row is present in the tool's JSON. Same bug class as the qsr_fob
  // loc-padding fix and the 2026-08-04 schedRows fix in supabase.js (loadLifeLenzSchedule).
  it('strips zero-padding on the real 7-char NSN format, so the name resolves', () => {
    const rows = makeRows('0010915', 30, 141, 140); // Seminole, real padded format
    const out = aggregateLifelenzLabor(rows, { '10915': 'Seminole-Milt Phillips' });
    expect(out[0].loc).toBe('10915');
    expect(out[0].name).toBe('Seminole-Milt Phillips');
    expect(out[0].name).not.toMatch(/^Store 00/);
  });

  it('merges padded and unpadded rows for the same store into one entry', () => {
    const rows = [...makeRows('0006972', 15, 110, 100), ...makeRows('6972', 15, 110, 100)];
    const out = aggregateLifelenzLabor(rows, { '6972': 'Ada-Country Club' });
    expect(out.length).toBe(1);
    expect(out[0].days).toBe(30);
  });
});
