// @ts-nocheck
export default {version:'5.510', date:'2026-10-08', changes:[
  'QSRSoft Forms Reviews pull now captures the real score and the actual review content, not ' +
  'just completion counts. Found live: the dashboard\'s Score is points-weighted ' +
  '(Σ pointsReceived / Σ pointsPossible, a 0-100 rubric) -- NOT answered/total (two reviews ' +
  'both ~97% "complete" by count scored 29% and 91% by points). Content is PII-filtered by ' +
  'allow-list -- only structured rating questions, resolved to their answer label, are stored; ' +
  'a free-text "Current Wage" question on these forms is dropped unconditionally, never by ' +
  'title match. Crew Review\'s score/content is not reachable by this account (measured 11/11 ' +
  'denied) and is skipped rather than retried. Still data pipeline only -- no UI panel yet. See ' +
  'memory/finding-qsrsoft-review-forms-schedules-endpoint-2026-10-08.md.',
]};
