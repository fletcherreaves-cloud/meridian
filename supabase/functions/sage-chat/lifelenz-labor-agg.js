// Shared, Deno/Node-agnostic aggregation logic for SAGE's query_lifelenz_labor tool
// (dispatch #82 Part B). Imported directly by supabase/functions/sage-chat/index.ts and by
// its Vitest test in src/__tests__/, so the SAME code that runs in production is what the
// test exercises -- not a re-implementation of it. Plain JS, no TypeScript, per repo
// convention. See memory/dispatch-82.md.
//
// The bug this fixes: the per-store payload used to carry a field named `gap_vlh` -- a
// WINDOW TOTAL (sum of sch_vlh - need_vlh across every row in the date range) -- sitting
// right next to `avg_daily_gap`, the per-day rate. `gap_vlh`'s name carried no period, and
// the tool's own `note` explained only the SIGN, never that it was a sum over `days`. SAGE
// read the larger, unlabeled number as a daily rate twice, e.g. reporting
// "Ada-Country Club is +141 hours/day over-staffed" for a store independently confirmed
// top-quartile on labor % -- the real per-day figure was 141 / 30 ≈ 4.7h, entirely
// plausible. `gap_vlh` is renamed `gap_vlh_total` so the name itself carries the period, and
// LIFELENZ_LABOR_NOTE states both fields' periods explicitly, since the note is the contract
// SAGE actually reads.

export function aggregateLifelenzLabor(rows, storeNames = {}) {
  const byStore = {};
  for (const row of rows) {
    // lifelenz_schedule.loc is ALWAYS a 7-char zero-padded NSN at the DB level
    // (scripts/lifelenz-pull.mjs pads on write, same as qsr_fob) -- storeNames/STORE_NAMES use
    // the unpadded convention. Without normalizing here, EVERY store's per-store row falls back
    // to the generated "Store 00XXXXX" label instead of its real name, since the raw padded
    // string never matches a storeNames key. The client-side static schedule summary
    // (src/views/sage.js buildScheduleSummary) never hit this because its data comes through
    // supabase.js's loadLifeLenzSchedule, which already strips the padding on load -- this tool
    // reads lifelenz_schedule directly and had no equivalent normalization. Same bug class as
    // the qsr_fob loc-padding fix (src/views/sage.js buildFobSummary) and the 2026-08-04
    // schedRows fix in supabase.js (loadLifeLenzSchedule). Found while investigating dispatch
    // #90's "Seminole missing from SAGE's under-staffed list" -- an unresolvable store label is
    // effectively invisible to the model, even though its row is present in the JSON.
    const loc = String(parseInt(row.loc, 10));
    if (!byStore[loc]) byStore[loc] = { schVLH: 0, needVLH: 0, days: 0 };
    const s = byStore[loc];
    s.schVLH += row.sch_vlh || 0;
    s.needVLH += row.need_vlh || 0;
    s.days++;
  }

  return Object.entries(byStore).map(([loc, s]) => ({
    loc,
    name: storeNames[loc] || `Store ${loc}`,
    sch_vlh: +s.schVLH.toFixed(1),
    need_vlh: +s.needVLH.toFixed(1),
    // The WINDOW TOTAL -- sum of sch_vlh - need_vlh across every row this store contributed.
    gap_vlh_total: +(s.schVLH - s.needVLH).toFixed(1),
    // The PER-DAY rate -- gap_vlh_total divided by the number of days actually summed.
    avg_daily_gap: +((s.schVLH - s.needVLH) / (s.days || 1)).toFixed(1),
    days: s.days,
  })).sort((a, b) => Math.abs(b.gap_vlh_total) - Math.abs(a.gap_vlh_total));
}

export const LIFELENZ_LABOR_NOTE =
  'gap_vlh_total = sch_vlh - need_vlh, SUMMED ACROSS THE WHOLE date_range (days field). '
  + 'avg_daily_gap = gap_vlh_total ÷ days, the PER-DAY rate -- use this one for "how over/'
  + 'under-staffed is this store on a typical day", not gap_vlh_total. Positive = '
  + 'over-scheduled. Negative = under-staffed.';
