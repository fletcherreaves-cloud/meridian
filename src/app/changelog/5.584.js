// @ts-nocheck
export default {version:'5.584', date:'2026-10-22', changes:[
  '**Metric Lineage: the registry now covers every metric the resolver knows about, not just ' +
  'the 16 someone hand-wrote.** Notes 61 ask (2026-08-09): "Complete listing of every metric we ' +
  'have access to... should be generated from the registry, not hand-written." Measured before ' +
  'building, not assumed: `METRIC_PROVENANCE` (engine/metric-provenance.js, backs the Metric ' +
  'Lineage panel + every KPI ⓘ source tooltip) was itself entirely hand-written and covered only ' +
  '16 of `METRIC_SOURCES`\' (engine/metric-source.js) real 92 auto-first resolver chains -- under ' +
  '18% coverage of the single place this app actually sources every operational metric from.',
  'Fixed by having the registry auto-generate an entry for every METRIC_SOURCES key that has no ' +
  'hand-curated one: a new 15-row `DS_FIELD_META` table (which of the underlying ds-field ' +
  'streams -- qsrActSummaryRows, glimpseRows, opsCashRows, schedRows, etc. -- is which real ' +
  'QSRSoft/LifeLenz table, confirmed against App.js\'s loader wiring and supabase.js\'s own ' +
  '.from() calls, not guessed from the field name) plus a small `humanizeMetricKey()` labeler ' +
  '(camelCase -> Title Case, with a short dictionary for QSR abbreviations the app already uses ' +
  'fluently -- DT/OEPE/R2P/TPPH/KVS/...). A composed (derive:) chain\'s formula names its real ' +
  'inputs rather than inlining the derive function\'s source -- a production build minifies ' +
  'parameter names, and a transparency panel showing minified code would be worse than none. ' +
  'Hand-curated entries (the field-reconciled OEPE/R2P/TPPH math, OSAT/EAP\'s exact FullScale ' +
  'definitions, etc.) always win on a key collision -- this doesn\'t touch or demote them.',
  'The payoff is mechanical, not a one-time backfill: a metric added to the resolver going ' +
  'forward (one line, per that file\'s own standing rule) now gets a Metric Lineage entry and a ' +
  'KPI source tooltip automatically, instead of a second manual step someone has to remember (and ' +
  'the exact gap that let coverage silently sit at 16/92 for as long as it did).',
  '18 new/extended tests (src/__tests__/metric-provenance.test.js) assert every real ' +
  'METRIC_SOURCES key now resolves, curated-vs-auto precedence, and the composed/direct/' +
  'both-paths formula shapes -- cross-checked against the real resolver, not a fixture, so a ' +
  'future regression that silently drops the merge back to METRIC_SOURCES-only (losing the ' +
  '13 hand-curated-only entries like oppTotal/osat/headcount) would fail it.',
  'Corrected memory/notes-61-queue.md + memory/MEMORY.md, whose index entries never reflected ' +
  'this as resolved (it hadn\'t been, until now).',
  'Full suite 660/660 files, 6143/6143 tests green. Build clean, within budget (577.94 KB eager ' +
  '/ 850 KB).',
]};
