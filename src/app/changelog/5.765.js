// @ts-nocheck
export default {version:'5.765', date:'2026-11-13', changes:[
  '**Daily Review: added Supervisor/OM patch rollup** (owner spec, Notes 75 follow-up — ' +
  '"largely the same review as a GM\'s, but across all assigned locations... Supervisor and OM ' +
  'levels especially should also see WTD and MTD"). A new Store/Patch toggle on the existing ' +
  'Daily Review panel — Patch mode picks a real supervisor patch, adds Today/WTD/MTD window ' +
  'tabs, and shows the same Sales/Service/Controls/FOB sections aggregated across every store ' +
  'in the patch, plus a worst-first hotspot list so a Supervisor/OM can see which stores need ' +
  'attention without opening each one. Reuses the GM engine\'s existing section/line ' +
  'definitions verbatim — dollar/hours/count lines are a true sum across stores and days, rate/% ' +
  'lines go through metric-source.js\'s metricRate (real Σ/Σ sum-ratio first, never a mean of ' +
  'store percentages or an in-progress day blended in at full weight), Sales/GC vs LY goes ' +
  'through vs-ly.js\'s matchedVsLY. The GM store-grain path is unchanged — same engine, same ' +
  'output, proven byte-for-byte identical by the existing test suite. 7 new tests. Full suite ' +
  '(7997 tests) and build pass clean (699.00 KB eager, budget 850 KB).',
]};
