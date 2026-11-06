// @ts-nocheck
export default {version:'5.661', date:'2026-11-06', changes:[
  '**Knowledge Base: 6 more Panel Guide articles (task #75) — both named plan-doc sources now ' +
  'fully exhausted, picked by a fresh direct panel-registry.js sweep instead.** Grepped every ' +
  'real `kind:\'nav\'`/`kind:\'optional\'` entry (70 total), diffed against the current ' +
  '`KB_ARTICLES` keys, and picked 6 by real traffic/importance judgment: `events_guide` (the ' +
  'exact same `saveOrgEvents()` write path Quick-Capture and SAGE\'s `log_event` tool both feed), ' +
  '`loc_intel_guide` (Market Intelligence — live Pearson-r stats, an AI narrative built only from ' +
  'those same computed figures, and an independent Census demographics snapshot), ' +
  '`cash_variance_pattern_guide` (store × day-of-week grain only — no register-number field ' +
  'exists in this app\'s data model, and no built-in flag threshold by design), ' +
  '`metric_lineage_guide` (the 100%-transparency "how is this number built" registry), ' +
  '`district_lens_guide` (the real district-wide correlation heatmap + opportunity ranking + ' +
  'AI OK-vs-FL narrative), and `pay_rate_history_guide` (crew rate-change DETECTION vs. ' +
  'management\'s already-logged events, the real straight-time-vs-blended rate-basis check, and ' +
  'access-logging on every view since this is real wage data). Checked for stale `panel_index`/' +
  'Workflow-Guide wording — found one incomplete-but-not-wrong Events one-liner, left alone per ' +
  'the same already-documented one-liner-depth deferral every prior batch has used; no actual ' +
  'drift found. 12 new tests, 100 KB_ARTICLES keys total; build clean.',
]};
