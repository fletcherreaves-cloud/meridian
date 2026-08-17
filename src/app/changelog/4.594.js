// @ts-nocheck
export default {version:'4.594', date:'2026-07-29', changes:[
  'Faster current-data load: the Daily Glimpse, Cash, Sales Ledger, Labor, Ops and Controls streams now load their pages in parallel (like the DAR summary already does) instead of one after another — the current-day sales/service/controls appear noticeably quicker after login.',
  'Fixed the At-A-Glance "stores at red model health" count mismatch (header said 1, checklist said 2): a store with no model-health score yet was being counted as red in one place; both now ignore null scores.',
]};
