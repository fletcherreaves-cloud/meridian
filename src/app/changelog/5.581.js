// @ts-nocheck
export default {version:'5.581', date:'2026-10-17', changes:[
  '**Click-to-sort wired into every ReportShell report table** (owner: screenshot of Cash ' +
  'Variance Pattern\'s own copy saying "Sort any column" while it wasn\'t -- "this states to sort ' +
  'on any column. not wired in. check throughout please. i would like sort on any column ' +
  'throughout app"). Audited all 10 ReportShell-based reports plus the Access Log panel (same ' +
  'static-table gap, not ReportShell-based but included as the same class of bug) -- every one ' +
  'rendered a plain unsortable `<th>` despite several claiming sortability in their own copy. ' +
  'New shared src/components/SortableTh.js (`useSortedRows` hook + `SortTh` header cell -- ' +
  'null-safe, type-aware string/numeric comparator, click toggles asc/desc, switching columns ' +
  'resets to ascending) reused everywhere rather than inventing a second pattern (security-panel.js ' +
  'already had one bespoke sortTh; this makes it the one shared implementation).',
  'Wired into: cash-variance-pattern.js, fob-reference-table.js, channel-mix.js, ' +
  'controls-food-cost-link.js, item-velocity.js, labor-opportunity-cost.js, ' +
  'loss-prevention-report.js, price-change-impact.js, weather-impact.js, ' +
  'custom-report-builder.js, and access-log.js (sorts by the resolved actor display name, not ' +
  'the raw actor_id, since the join happens before sort). 7 new tests for the primitive itself ' +
  '(src/__tests__/sortable-th.test.js) plus a real header-click render test added to two panels ' +
  'to prove the wiring survives a revert, not just the primitive in isolation (per this repo\'s ' +
  '"would this verification still pass if the change were reverted?" rule) -- ' +
  'item-velocity-panel.test.js and access-log-panel.test.js.',
]};
