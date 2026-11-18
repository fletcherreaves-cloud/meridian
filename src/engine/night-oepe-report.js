// @ts-nocheck
// ── Night OEPE w/o Parked report (owner request, 2026-11-18) ────────────────────────────────────
// "create a report for OEPE w/o parked for nights (4pm-close) for each location. Add ask - do it
// for the entire night period but also for 5p-7p and 7p-cl. I need to see it for the following
// look back periods: MTD, Last month, last 30 days, last 45 days, last 90 days and YTD ...
// This is separate from previous work." -- "previous work" is dt-oepe-report.js, which answers
// the same w/o-parked formula but whole-day only, with no daypart breakdown. This file is a new,
// standalone report: 3 night segments x the same 6 lookback periods dt-oepe-report.js already
// defined (reused here verbatim, not re-derived -- see DT_OEPE_WINDOW_COLS/dtOepeReportWindows).
//
// DT OEPE here always excludes parked/held time -- the real, scored formula
// (src/utils/oepe.js's oepeSeconds()), never the diagnostic-only "with park" variant.
//
// hour_slot is the END of its hour block (daypart-peaks.js's header comment, confirmed live):
// '17:00' is the 4pm-5pm block, '18:00'/'19:00' are 5pm-6pm/6pm-7pm, '20:00' is 7pm-8pm, and the
// 24-slot shape runs through '28:00' (the 3am-4am block, the last hour before the 4am ABC
// cutover -- CLAUDE.md's "the business day runs 4am to 4am"). So:
//   - "4pm-Close" (the entire night period)  = hour_slot >= '17:00'
//   - "5pm-7pm"                               = hour_slot in ('18:00', '19:00')
//   - "7pm-Close"                             = hour_slot >= '20:00'
// A store that's already closed in a given hour_slot has dt_trans_cnt = 0 for that slot, which
// contributes nothing to any of these sums -- no per-store closing-time lookup is needed; "close"
// falls out automatically from summing across the full slot range the loader already pulled
// (src/lib/supabase.js's loadNightOepeActivity).
//
// Rolls up the same way dt-oepe-report.js and daypart-peaks.js's aggregateAutoPeaks do: sum every
// raw leg across every matching hourly row for the segment+period+store, THEN take one ratio --
// never average a day's or hour's already-divided OEPE value (CLAUDE.md's ROLLUP CAVEAT).
import { oepeSeconds } from '../utils/oepe.js';
import { DT_OEPE_WINDOW_COLS, dtOepeReportWindows } from './dt-oepe-report.js';

export const NIGHT_SEGMENTS = [
  { key: 'allNight', label: '4pm–Close', test: slot => slot >= '17:00' },
  { key: 'fivePmSeven', label: '5pm–7pm', test: slot => slot === '18:00' || slot === '19:00' },
  { key: 'sevenPmClose', label: '7pm–Close', test: slot => slot >= '20:00' },
];

function _windowRanges(asOf) {
  const windows = dtOepeReportWindows(asOf);
  const out = {};
  for (const col of DT_OEPE_WINDOW_COLS) {
    const s = new Date(windows[col.key].s); s.setHours(0, 0, 0, 0);
    const e = new Date(windows[col.key].e); e.setHours(23, 59, 59, 999);
    out[col.key] = { s, e };
  }
  return out;
}

// rows: raw qsr_daily_activity rows from loadNightOepeActivity (loc, dt, hour_slot,
// dt_untilserve, dt_untilstore, dt_heldtime, dt_trans_cnt). Returns one entry per requested loc:
// { loc, segments: { allNight: {mtd,lm,...}, fivePmSeven: {...}, sevenPmClose: {...} } }.
export function computeNightOepeReport(rows, locs, asOf) {
  const d = (asOf instanceof Date && !isNaN(asOf)) ? asOf : new Date();
  const ranges = _windowRanges(d);
  const periodKeys = DT_OEPE_WINDOW_COLS.map(c => c.key);

  const acc = new Map(); // loc -> segKey -> perKey -> {untilServe,untilStore,heldTime,cnt}
  const _bucket = (loc, segKey, perKey) => {
    let byLoc = acc.get(loc); if (!byLoc) { byLoc = new Map(); acc.set(loc, byLoc); }
    let bySeg = byLoc.get(segKey); if (!bySeg) { bySeg = new Map(); byLoc.set(segKey, bySeg); }
    let b = bySeg.get(perKey);
    if (!b) { b = { untilServe: 0, untilStore: 0, heldTime: 0, cnt: 0 }; bySeg.set(perKey, b); }
    return b;
  };

  for (const r of (rows || [])) {
    if (!r || !r.loc || !r.dt || !r.hour_slot) continue;
    const loc = String(r.loc).trim();
    const dt = r.dt instanceof Date ? r.dt : new Date(String(r.dt) + 'T00:00:00');
    if (isNaN(dt)) continue;
    for (const seg of NIGHT_SEGMENTS) {
      if (!seg.test(r.hour_slot)) continue;
      for (const perKey of periodKeys) {
        const range = ranges[perKey];
        if (dt < range.s || dt > range.e) continue;
        const b = _bucket(loc, seg.key, perKey);
        b.untilServe += r.dt_untilserve || 0;
        b.untilStore += r.dt_untilstore || 0;
        b.heldTime += r.dt_heldtime || 0;
        b.cnt += r.dt_trans_cnt || 0;
      }
    }
  }

  return (locs || []).map(loc => {
    const locStr = String(loc).trim();
    const byLoc = acc.get(locStr);
    const segments = {};
    for (const seg of NIGHT_SEGMENTS) {
      const bySeg = byLoc?.get(seg.key);
      const row = {};
      for (const perKey of periodKeys) {
        const b = bySeg?.get(perKey);
        row[perKey] = b
          ? oepeSeconds({ dt_untilserve: b.untilServe, dt_untilstore: b.untilStore, dt_heldtime: b.heldTime, dt_trans_cnt: b.cnt })
          : null;
      }
      segments[seg.key] = row;
    }
    return { loc: locStr, segments };
  });
}
