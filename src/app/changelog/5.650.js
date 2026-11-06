// @ts-nocheck
export default {version:'5.650', date:'2026-11-05', changes:[
  '**Fix: Register Audit tab ignored the toolbar date-range control entirely (owner-caught ' +
  'live).** `RegisterAuditTab` (store-analytics.js) never took `dateRange` as a prop at all — ' +
  'its row filter checked only `r.loc===loc`, so the "Oct 28 – Nov 3 · Last Week" pill every ' +
  'other tab on Store Dashboard renders above its content had nothing to drive here. Not a ' +
  'missing effect dependency (the mount-only `ensureLazyFill` call is a correct one-time demand-' +
  'load of the whole stream, same as every other LAZY_FILL_SOURCES consumer) — the bug was in ' +
  'the render-time row filter never consulting the range at all. Reproduced live before fixing ' +
  '(two-day stub + a narrowed range still showed both days\' totals), per the standing "measure ' +
  'it, don\'t reason about it" rule. Now filters `ds.auditRows` by the real toolbar `dateRange` ' +
  'in addition to `loc`; the summary line echoes the active range label, and a new empty state ' +
  'distinguishes "no data in this range" (with the store\'s real on-file span) from "no data at ' +
  'all" (upload prompt) instead of collapsing both into the same generic message. ' +
  'Audited every other Store Dashboard tab for the same shared-root-cause shape: Shift Analysis, ' +
  '3 Peaks, Store Records, AI Insights, Food Cost and Labor cockpits each already show their OWN ' +
  'explicit window label (own weeksBack tag, own DateRangeControl, own liveWindow, etc.) rather ' +
  'than implying they follow the toolbar range, so none exhibit this symptom. Action Plan ' +
  '(`ActionPlanTab`) does carry an unused `dateRange` prop with no effect on its output — flagged ' +
  'as a separate, lower-priority finding (not fixed here: its content is driven by `store.p/t`\'s ' +
  'own trailing-window concept, not the toolbar range, and it never displays a date label that ' +
  'would make a user expect otherwise, unlike Register Audit).\n\n' +
  'Also fixed a second, independently-reproduced defect found in the same component while ' +
  'tracing this: `activeSection`\'s `useState` was declared AFTER three early-return branches, a ' +
  'genuine Rules-of-Hooks violation — a fresh mount with no data yet commits on an early-return ' +
  'branch (stopping before that hook), and the lazy-fill resolving then re-renders the SAME ' +
  'instance past every early return, reaching that hook for the first time. Confirmed against a ' +
  'minimal isolated React 19 repro that this throws "Rendered more hooks than during the ' +
  'previous render." on exactly that mount→loaded transition. Fixed by hoisting the hook above ' +
  'the early returns, alongside the tab\'s other unconditional state.\n\n' +
  '6 new tests (`register-audit-date-range-2026-11-05.test.js`), including one that reproduces ' +
  'the hook-order crash directly (confirmed it fails without the hoist, passes with it) and one ' +
  'proving the rendered content actually changes when the date range changes. 60/60 register-' +
  'audit tests, full suite and build clean.',
]};
