// @ts-nocheck
export default {version:'5.422', date:'2026-09-10', changes:[
  'Labor Allocation panel (backlog item G, "shift dimension") -- closed both confirmed gaps: ' +
  'zero live-verification coverage and zero perf instrumentation.',
  'Perf: the file\'s 4 useMemo calls (allocationDistrict/allocationByStoreDaypart/' +
  'overnightOpenness/overnightExcessByStore -- up to 90 days x 27 stores x 24 hour_slots, ' +
  '~58k rows) now wrapped in _mark(), matching the click-trace.js idiom other heavy-compute ' +
  'panels (at-a-glance.js\'s compute:weekProjections) already use, so a ?clicktrace=1 session ' +
  'can see where the cost actually sits instead of one opaque render.',
  'Verification: 4 new tests render the REAL LaborAllocationPanel (mocking only its two ' +
  'Supabase loaders, not the engine) across all 3 tabs with a realistic 24-hour_slot/2-store/' +
  '2-day fixture built from labor-standard.js\'s own documented row/config shapes -- ' +
  'District\'s real deficit/surplus totals, By Store listing both fixture stores, Overnight\'s ' +
  'Open-branch (TPPH) and Closed-branch (standard verdict) rows both exercised, plus the ' +
  'genuine zero-rows placeholder a fresh cloud session sees before its 90-day fetch resolves. ' +
  'Not a literal live-browser session (none available in this sandbox), but a real render ' +
  'through the actual component tree rather than the engine functions in isolation.',
  'Full suite 4721/4721, build clean, 539.40 KB / 850 KB eager-payload budget (unchanged -- ' +
  'the panel is lazy-loaded, not in the eager entry).',
]};
