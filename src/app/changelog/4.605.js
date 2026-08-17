// @ts-nocheck
export default {version:'4.605', date:'2026-07-29', changes:[
  'At-A-Glance Service tile now fills R2P from the auto DAR even when the manual Operations Report is stale (it was hard-wired to manual-only). Service metrics now merge field-by-field so each takes its freshest source (DAR, then Glimpse, then manual Ops). KVS Time/Healthy, DT-Parked, and Controls T-Reds/Cash-O/S still require the Operations Report / Controls upload (stopped Jul 15) — the durable fix is auto-pulling that report.',
]};
