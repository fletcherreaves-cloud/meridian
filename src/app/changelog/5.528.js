// @ts-nocheck
export default {version:'5.528', date:'2026-10-12', changes:[
  'LABOR-001 (ghost employee) and LABOR-002 (self-approval) are now LIVE AND ACTIVE. Measured ' +
  'against real data first (service-role session, 321 real lifelenz_punch_edits rows, 1716 ' +
  'qsr_employee_tenure rows): the previously-unverified LifeLenz-geid/QSRSoft-geid cross-vendor ' +
  'assumption holds at 93.8% (121/129 subjects), both rules ran clean with zero false positives ' +
  '(129/129 subjects clear), and a real production run of scripts/security-rules-run.mjs wrote ' +
  '258 real security_findings rows -- verified by a second live count, not assumed from the log.',
  'LABOR-003 (per-manager outlier edit rate) stays INACTIVE -- its shipped min_denominator:500 ' +
  'was an unmeasured guess, and the real numbers prove it unusable: every one of 60 real ' +
  'subjects\' own denominator fell in [1,193] (median 46), so literally none could ever clear ' +
  '500. Fixed to min_denominator:20 (measured, not guessed), but held back from activation -- ' +
  'the window measured is only 5 days old (lifelenz_punch_edits is brand new), far short of the ' +
  'rule\'s own 28-day design window, and the store-baseline population is still dominated by ' +
  'thin-denominator noise. Re-measure no sooner than ~2026-11-09.',
  'The LABOR-001/002/003 rows themselves had to be inserted into the live security_rules table ' +
  'for the first time this pass -- the earlier PR\'s own migration SQL had never actually been ' +
  'applied to production. Full measurement + exactly what changed live vs. in the repo: ' +
  'memory/finding-labor-rules-live-measurement-2026-10-12.md.',
  'No application code changed -- schema-security-rules-labor.sql updated to match the live, ' +
  'measured state exactly (final active/min_denominator values at INSERT time, plus idempotent ' +
  'UPDATEs so re-applying the file elsewhere still corrects an old unmeasured value). Full suite ' +
  'and build unaffected by this pass.',
]};
