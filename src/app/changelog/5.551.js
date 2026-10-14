// @ts-nocheck
export default {version:'5.551', date:'2026-10-13', changes:[
  'Above-Store One-Pager -- fixed the Scheduling section\'s "Scheduled Labor % (Total)" showing a ' +
  '100x-inflated reading (owner-flagged anomaly: "2397.15%" for a store whose real weekly labor ' +
  '% was ~24%). Root cause, live-measured against the source: schedule-summary.js\'s rollup() ' +
  'puts laborPct on a 0-100 PERCENT scale by design (its own "% scale" comment; ' +
  'schedule-summary.test.js\'s fixtures use 24.34/24.92/etc and assert toBeCloseTo(24.50, 2)) -- ' +
  'but one-pager-data.js\'s buildScheduleActuals() passed that value straight through as ' +
  'laborPctTotal with no conversion, and every render site (the live Scheduling section, the ' +
  'print HTML, and the AI-narrative text) formats it with this file\'s own fmtV(v,\'%\') helper, ' +
  'which does (v*100).toFixed(2) -- the convention every SIBLING field here uses, since ' +
  'fixedPct/floorPct/vlhPct/combinedPct are all 0-1 FRACTIONS. So a real 23.9715% got multiplied ' +
  'by 100 a second time. Same bug class already fixed once in this codebase for a different ' +
  'panel reading the same already-percent-scale field (Retention Rollup\'s "Labor % Δ" column, ' +
  '2026-08-26) -- recurring here because buildScheduleActuals is a separate call site that fix ' +
  'never touched. Fixed by dividing band.laborPct by 100 at the source, matching every sibling ' +
  'field\'s scale. See dispatch-onepager-sched-laborpct-scale-2026-10-13.test.js (confirmed to ' +
  'fail against the pre-fix code, both on buildScheduleActuals\' own output and on the rendered ' +
  'component\'s text).',
]};
