// @ts-nocheck
export default {version:'5.449', date:'2026-09-16', changes:[
  'Printable Forms expansion (Task #59). A background audit confirmed the pull-filter-widen ' +
  'part of this backlog item was already shipped (owner-requested 2026-09-01, 53 forms already ' +
  'captured) -- this dispatch ships the other two: scored-form field badges and a self-serve ' +
  '"add form" request.',
  'Scored-form field renderers: 28 of the 53 captured forms carry real point-weighted or ' +
  'percentage-banded rubric options in their raw text (e.g. \'135" or less - 8 pts\', ' +
  '\'OUTSTANDING  21-30 POINTS / 70% - 100%\') that rendered as plain, unweighted circle rows. ' +
  'engine/forms-model.js\'s parseOptionBadge/formatOptionBadge now surface that embedded weight ' +
  'as a small badge next to the option -- on-screen preview, the digital-fill workflow, AND ' +
  'both print-HTML styles. Deliberately does NOT classify an option good/bad or compute a total ' +
  'score -- that requires inferring which named tier in a scale is favorable, a call this can\'t ' +
  'reliably make from text alone.',
  'Self-serve "add form": Printable Forms gained a search box (filters the 53-form list by ' +
  'title) and a "🔄 Request pull" button that dispatches scripts/qsrsoft-forms-pull.mjs\'s own ' +
  'GitHub Actions workflow, scoped to the typed title, via the SAME on-demand-sync mechanism ' +
  '(trigger-dar-sync Edge Function) Data Manager\'s DAR/eBOS/FOB/LifeLenz buttons already use -- ' +
  'no new infrastructure, one new WORKFLOWS entry. Previously this required running the pull ' +
  'script locally with QSRSoft credentials and committing public/forms/*.json by hand. ' +
  '⚠️ Needs `supabase functions deploy trigger-dar-sync` before it works live.',
  'Also converted forms-print.js\'s hand-rolled modal backdrop to ModalShell while already deep ' +
  'in the file (panel-contract opportunistic check).',
  '17 new tests: 10 in forms-model-option-badge.test.js (against the exact real option strings ' +
  'the audit found, plus confirming the badge reaches the real print-HTML output), 7 in ' +
  'forms-print-self-serve.test.js rendering the real FormsPrintPanel consumer (search, the no-' +
  'match request-pull prompt, the actual triggerSync call shape incl. regex-escaping, success/' +
  'error display). Full suite 518/518 files, 4958/4958 tests. Build clean, eager payload ' +
  '550.23 KB / 850 KB budget. Full design notes: memory/project-printable-forms-expansion.md.',
]};
