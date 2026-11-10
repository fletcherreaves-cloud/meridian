// @ts-nocheck
export default {version:'5.730', date:'2026-11-10', changes:[
  '**Onboarding backfill guidance note on YoY Trends (task #99).** The just-shipped YoY Trends '+
  'dashboard (task #90, v5.727) caps its on-screen overlay at 4 years, which reads as a hard '+
  'ceiling to a new user even though it isn\'t one — per CLAUDE.md\'s standing "data depth is '+
  'never the limiter, backfill it" rule, almost every source this app pulls from goes back far '+
  'further than what\'s currently loaded. Added a one-line, always-visible note next to the '+
  '2/3/4-year window pills ("Need more than 4 yrs? Ask — it’s a backfill, not a limit.") '+
  'plus a short paragraph in the existing `yoy_trends_guide` KB article cross-linking the '+
  '`data_collection_bounds` article already shipped 2026-11-09 — no new KB article, no new UI '+
  'component, just the two real surfaces a GM/operator opening this panel would actually see. '+
  'Deliberately did not route this through the first-login nav-walkthrough overlay (task #107) — '+
  'that overlay is scoped to stable nav-shell landmarks only (sidebar/Home/scope filter/bell), '+
  'not per-panel content, by its own design note.',
]};
