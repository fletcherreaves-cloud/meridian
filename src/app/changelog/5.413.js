// @ts-nocheck
export default {version:'5.413', date:'2026-09-10', changes:[
  'Security panel now leads with a decision, not just a table -- Loss Forensics Roadmap Rec #1 ' +
  '(the owner-reviewed research artifact from 2026-09-09). buildSecurityPrintHtml\'s own ' +
  'heroCard treatment ("N Subjects Flagged," "Total Signals," "2+ Signal Convergence," "Latest ' +
  'Batch") already answered "how bad is it right now" at a glance -- it only ever rendered in ' +
  'the PDF export, never the live screen people actually open day to day. SecuritySummaryBar ' +
  'ports the same four numbers (same groups/newestBatch already feeding the table+export, so it ' +
  'can never drift from what\'s on screen) plus one decision line, per CLAUDE.md\'s "voice by ' +
  'role" standing rule -- the number stays visible, the sentence says what to do with it.',
  'The decision line names a converging subject (2+ independent signals on the same subject) ' +
  'when one exists. Deliberately does NOT also try to call out a single-rule CHRONIC subject ' +
  '(flagged many days running on one rule) -- that needs a subject\'s own multi-window history, ' +
  'which this scope-wide summary can\'t afford to fetch for every visible subject ' +
  '(loadSecurityFindingsForSubject is deliberately lazy, one subject at a time, on row-expand). ' +
  'Naming a false "top pick" from data this bar doesn\'t actually have would be worse than ' +
  'staying quiet on it -- a composite score across both axes (Roadmap Rec #5) is a separate, ' +
  'larger piece of work, not attempted here.',
  '3 new tests through the real SecurityPanel (standing "verification must touch the call site" ' +
  'rule) -- converging subject named correctly, single-signal-only case reads "nothing ' +
  'converging yet," and the bar stays absent (not an empty "0 subjects" tile row) when nothing ' +
  'is flagged, since the existing "no findings" message already covers that case alone. Full ' +
  'suite 4667/4667, build clean, 538.59 KB / 850 KB budget.',
]};
