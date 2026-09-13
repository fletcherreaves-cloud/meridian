// @ts-nocheck
export default {version:'5.439', date:'2026-09-13', changes:[
  'Needs Attention -- guest-count decline and traffic/sales divergence now surface (GH #316). ' +
  'Sales already had a detector (salesBehindLY); guest counts -- the metric the whole McValue ' +
  '2.0 traffic story is about -- had none, despite the inputs already being pulled ' +
  '(qsr_daily_activity, reachable through vs-ly.js\'s existing matchedVsLY(ds, [loc], range, ' +
  '\'gc\')). New gcBehindLY() mirrors salesBehindLY exactly (dollars:0 -- a guest-count gap ' +
  'alone has no honest $ value without an assumed average check). New ' +
  'trafficDivergenceAlerts() catches the actual McValue signature: sales holding or rising ' +
  'while guest counts fall (fewer, bigger transactions masking a real traffic problem a ' +
  'sales-only detector cannot see) -- and the reverse (traffic up, sales down). The sales-' +
  'holds/GC-falls direction gets an honest $ figure (lost guests x the store\'s own current ' +
  'average check, both already matched-day quantities); the reverse direction is flagged with ' +
  'dollars:0 since dollarizing an average-check/mix shift is a guess. Both wired through ' +
  'attention-now.js\'s useAttentionFeed via the same auto-first/matched-day/worst-of-two-' +
  'windows plumbing sales already uses. Full writeup: ' +
  'memory/dispatch-316-gc-traffic-attention-2026-09-13.md.',
  '14 new/extended tests confirmed to fail against pre-fix code, including a real render of ' +
  'the useAttentionFeed hook (not just the engine functions) since the wiring lives there.',
  'Full suite 509/509 files, 4860/4860 tests. Build clean, 542.19 KB / 850 KB eager-payload ' +
  'budget.',
]};
