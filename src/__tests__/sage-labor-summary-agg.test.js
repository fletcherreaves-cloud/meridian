// @ts-nocheck
// Dispatch #90 (memory/dispatch-90.md), item 1 -- SAGE reported OT as a fixed 60-day figure
// halved, which mis-ranks stores: it put Madill 5th at $1,706 when the real 30-day figure (from
// the owner's Controls export, 2026-07-25 to 2026-08-23) is $2,711 and Madill is actually #1.
// The total was close (SAGE $24,752 vs actual $23,590) but the ORDERING was wrong, which is the
// one thing an OT list exists to get right.
//
// Verification bar (memory/dispatch-90.md): "a 30-day OT question must return Madill first
// against this export, and must include Marietta and Chickasha. Assert on the ORDERING, not just
// the totals -- a total-only test passes with the ranking still broken."
//
// The fixture below reproduces the export's own 30-day OT dollars exactly (independently
// verified live against Supabase during this dispatch: querying qsr_labor_summary for
// 2026-07-25..2026-08-23 and summing metrics.over_time_total_dollars per store reproduces the
// export's per-store figures to the cent).
//
// Imports supabase/functions/sage-chat/labor-summary-agg.js directly -- the same plain-JS module
// index.ts's query_labor_summary tool calls and JSON.stringifies as its literal tool result. No
// Deno test infrastructure exists in this repo to boot the edge function itself, so this is the
// closest thing to the real call site.
import { describe, it, expect } from 'vitest';
import { aggregateLaborSummary, LABOR_SUMMARY_NOTE } from '../../supabase/functions/sage-chat/labor-summary-agg.js';

const STORE_NAMES = {
  '13113': 'Madill-Hwy 70',
  '24471': 'Ardmore-Cooper/12th',
  '37566': 'Mossy Head',
  '32525': 'Sulphur',
  '33109': 'Marietta',
  '5183': 'Chickasha-So 4th',
};

// One qsr_labor_summary row per store-day, matching the export's 30-day OT total exactly
// ($2,711.46 / 30 days = $90.382/day, etc).
function otRows(loc, days, otDollarPerDay) {
  const rows = [];
  for (let i = 0; i < days; i++) {
    rows.push({ loc, dt: `2026-08-${String(i + 1).padStart(2, '0')}`, metrics: { over_time_total_dollars: otDollarPerDay, over_time_total_hours: otDollarPerDay / 20 } });
  }
  return rows;
}

describe('labor-summary-agg -- OT ranking on the EXACT requested window (dispatch #90 item 1)', () => {
  it('Madill ranks #1 by 30-day OT dollars, ahead of Ardmore-Cooper (SAGE\'s old #1) and Mossy Head', () => {
    const rows = [
      ...otRows('13113', 30, 2711.46 / 30), // Madill -- the real #1
      ...otRows('24471', 30, 2418.11 / 30), // Ardmore-Cooper -- SAGE's wrong #1
      ...otRows('37566', 30, 2242.53 / 30), // Mossy Head
      ...otRows('32525', 30, 1985.14 / 30), // Sulphur
      ...otRows('33109', 30, 1705.71 / 30), // Marietta -- SAGE dropped this store entirely
      ...otRows('5183',  30, 1615.58 / 30), // Chickasha -- SAGE dropped this store entirely
    ];
    const out = aggregateLaborSummary(rows, [], STORE_NAMES);

    // The actual bug: ranking, not totals. Assert on order.
    expect(out.map(s => s.loc)).toEqual(['13113', '24471', '37566', '32525', '33109', '5183']);
    expect(out[0].name).toBe('Madill-Hwy 70');

    // Marietta and Chickasha must be present at all -- SAGE's old static 60-day summary missed
    // them entirely, not just mis-ranked them.
    const locs = out.map(s => s.loc);
    expect(locs).toContain('33109');
    expect(locs).toContain('5183');

    // Totals reconcile to the export within rounding (cents).
    expect(out.find(s => s.loc === '13113').ot_dollar_total).toBeCloseTo(2711.46, 1);
    expect(out.find(s => s.loc === '24471').ot_dollar_total).toBeCloseTo(2418.11, 1);
  });

  it('a fixed-window figure halved would have put Ardmore-Cooper first -- this is what the bug looked like', () => {
    // SAGE's actual reported figures (60-day totals halved): Ardmore-Cooper $3,244 (its #1),
    // Madill $1,706 (its #5). The real 30-day figures reverse that ranking entirely.
    const wrongHalved = { '24471': 3244, '13113': 1706 };
    expect(wrongHalved['24471']).toBeGreaterThan(wrongHalved['13113']); // the bug's ordering

    const rows = [...otRows('13113', 30, 2711.46 / 30), ...otRows('24471', 30, 2418.11 / 30)];
    const out = aggregateLaborSummary(rows, [], STORE_NAMES);
    // The real ordering is the reverse of the halved one.
    expect(out[0].loc).toBe('13113');
    expect(out[0].ot_dollar_total).toBeGreaterThan(out[1].ot_dollar_total);
  });
});

describe('labor-summary-agg -- Act vs Need, the Controls basis (dispatch #90 item 2)', () => {
  function rollupRows(loc, days, actMinusNeedPerDay) {
    const rows = [];
    for (let i = 0; i < days; i++) {
      rows.push({ loc, dt: `2026-08-${String(i + 1).padStart(2, '0')}`, actual_punched_hours: 100 + actMinusNeedPerDay, total_needed_hours: 100 });
    }
    return rows;
  }

  it('Seminole surfaces as the most under-staffed store when fed the Controls-basis rollup -- SAGE\'s LifeLenz-only view missed it entirely', () => {
    // Real figures measured live against Supabase during this dispatch (2026-07-25..2026-08-23):
    // Seminole -58.2h/day on the Controls/DAR basis (qsr_daily_activity_rollup) vs +1.3h/day on
    // the LifeLenz basis (sch_vlh/need_vlh) -- the two sources disagree in DIRECTION, not just
    // magnitude, which is why giving SAGE only the LifeLenz tool made Seminole invisible as an
    // under-staffed store even though its row was present in that tool's own JSON.
    const rows = [
      ...rollupRows('10915', 30, -58.2), // Seminole -- the real worst store, missed by SAGE
      ...rollupRows('32525', 30, -49.5), // Sulphur -- named correctly by SAGE
      ...rollupRows('10034', 30, -30.2), // Bonifay -- named correctly by SAGE
      ...rollupRows('6972',  30, 57.2),  // Ada -- over-staffed
    ];
    const out = aggregateLaborSummary([], rows, { '10915': 'Seminole-Milt Phillips', '32525': 'Sulphur', '10034': 'Bonifay', '6972': 'Ada-Country Club' });

    const seminole = out.find(s => s.loc === '10915');
    expect(seminole).toBeTruthy();
    expect(seminole.act_vs_need_avg_hrs_per_day).toBeCloseTo(-58.2, 1);

    const underStaffed = out.filter(s => s.act_vs_need_avg_hrs_per_day < 0).sort((a, b) => a.act_vs_need_avg_hrs_per_day - b.act_vs_need_avg_hrs_per_day);
    expect(underStaffed[0].loc).toBe('10915'); // Seminole is #1 most under-staffed
  });

  it('act_vs_need_avg_hrs_per_day is a PER-DAY average, not a window total', () => {
    const rows = rollupRows('10915', 30, -58.2); // 30 days at -58.2h/day = -1746h total
    const out = aggregateLaborSummary([], rows, {});
    const s = out[0];
    expect(s.act_vs_need_days).toBe(30);
    expect(s.act_vs_need_avg_hrs_per_day).toBeCloseTo(-58.2, 1);
    expect(s.act_vs_need_avg_hrs_per_day).not.toBeCloseTo(-1746, 1); // not the window sum
  });

  it('rows missing actual_punched_hours or total_needed_hours are skipped, not treated as zero', () => {
    const rows = [
      { loc: '10915', dt: '2026-08-01', actual_punched_hours: 50, total_needed_hours: null },
      { loc: '10915', dt: '2026-08-02', actual_punched_hours: null, total_needed_hours: 100 },
      { loc: '10915', dt: '2026-08-03', actual_punched_hours: 42, total_needed_hours: 100 },
    ];
    const out = aggregateLaborSummary([], rows, {});
    const s = out[0];
    expect(s.act_vs_need_days).toBe(1);
    expect(s.act_vs_need_avg_hrs_per_day).toBeCloseTo(-58, 1);
  });
});

describe('labor-summary-agg -- loc normalization (same padded-NSN class as qsr_fob and lifelenz-labor-agg)', () => {
  it('strips zero-padding on both otRows and rollupRows so they merge into ONE store entry', () => {
    const ot = [{ loc: '0013113', dt: '2026-08-01', metrics: { over_time_total_dollars: 90, over_time_total_hours: 4.5 } }];
    const rollup = [{ loc: '0013113', dt: '2026-08-01', actual_punched_hours: 150, total_needed_hours: 120 }];
    const out = aggregateLaborSummary(ot, rollup, { '13113': 'Madill-Hwy 70' });
    expect(out.length).toBe(1);
    expect(out[0].loc).toBe('13113');
    expect(out[0].name).toBe('Madill-Hwy 70');
    expect(out[0].ot_dollar_total).toBeCloseTo(90, 1);
    expect(out[0].act_vs_need_avg_hrs_per_day).toBeCloseTo(30, 1);
  });
});

describe('labor-summary-agg -- note names the period and basis of every field it describes', () => {
  it('note distinguishes this tool\'s Controls basis from query_lifelenz_labor\'s', () => {
    expect(LABOR_SUMMARY_NOTE).toMatch(/ot_dollar_total/);
    expect(LABOR_SUMMARY_NOTE).toMatch(/exact requested date_range/);
    expect(LABOR_SUMMARY_NOTE).toMatch(/act_vs_need_avg_hrs_per_day/);
    expect(LABOR_SUMMARY_NOTE).toMatch(/AVERAGED PER DAY/);
    expect(LABOR_SUMMARY_NOTE).toMatch(/query_lifelenz_labor/);
  });
});
