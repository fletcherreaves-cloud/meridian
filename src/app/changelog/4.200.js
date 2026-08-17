// @ts-nocheck
export default {version:'4.200', date:'2026-06-18', changes:[
  'Calendar Manager — proactive event calendar, converts event system from reactive to forward-looking',
  'School calendar event types added (early release, no-school, breaks, year start/end)',
  'Recurring rules engine — register an annual pattern once instead of re-tagging every year',
  'Proactive AI search — finds school district calendars + local events via web search, single-store or all-27 batch',
  'Unified Pending Review queue — AI-search and recurring-rule instances both require human approval before writing',
  'Month-grid calendar view with District/OK/FL/single-store scope, reuses existing EventEntryModal for entry',
  'Every write goes through the same mf_events storage — no separate code path, every existing system sees these identically',
]};
