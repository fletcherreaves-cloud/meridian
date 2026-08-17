// @ts-nocheck
export default {version:'4.870', date:'2026-08-07', changes:[
  'Failed data loads are no longer silent. A read that errored was indistinguishable from a table that genuinely had no data — the failure marker was being destroyed before any panel could see it, across 37 loaders. That is how six tables returning server errors went unnoticed, each one rendering as a normal "no data yet" empty state. Failures now raise the DATA INCOMPLETE banner and name the source.',
]};
