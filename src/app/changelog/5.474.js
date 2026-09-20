// @ts-nocheck
export default {version:'5.474', date:'2026-09-20', changes:[
  'SAGE: new query_forms tool -- QSRSoft Forms completion (shift checklists/travel-path forms) ' +
  'is now a queryable SAGE data source, closing the gap SAGE itself named ("Document/forms access ' +
  '-- currently none of it reaches SAGE"). Per-store resolved/completed/missed counts + pass rate, ' +
  'and per-form totals district-wide (worst-performing form first), for a date range.',
  'Reuses the SAME store-day rollup + per-form-summary logic (computeFormStoreDayRollup/ ' +
  'computeFormSummary, src/engine/forms-completion.js) src/views/forms-panel.js\'s in-app dashboard ' +
  'already computes from qsr_forms_completion -- new supabase/functions/sage-chat/forms-agg.js ' +
  'only shapes DB rows in and the tool response out, matching this file family\'s established ' +
  'pattern (single module imported by both index.ts and its own Vitest test, same as ' +
  'labor-summary-agg.js/smg-agg.js) rather than hand-deriving the pass/fail math a second time.',
  'System prompt (src/views/sage.js) documents the new tool as #11, tool count corrected ' +
  '10 -> 11 (7 live-data query tools now, was 6).',
  '4 new tests against the real exported forms-agg.js module (row mapping, per-store pass rate ' +
  'excluding open occurrences, per-form worst-first summary, the response note) -- same "closest ' +
  'thing to the real call site" pattern as every other query_* tool\'s own test (no Deno test ' +
  'infra exists to boot the edge function itself). sage-paginate.test.js\'s fetchAllRows call-site ' +
  'count + per-call .order() guard updated 10 -> 11 and passes against the new call site. Full ' +
  'suite 536/536 files, 5070/5070 tests. Build clean, eager payload 551.61 KB gzip (budget 850 KB).',
]};
