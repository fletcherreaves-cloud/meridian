// @ts-nocheck
export default {version:'5.113', date:'2026-08-22', changes:[
  'Dispatch #74 -- ds.gradedVisits was fed only by manually-dropped PDFs; Propel holds 3.5 years '
  + 'of CFV history and the app had never seen any of it. Imported the committed '
  + 'memory/data/cfv-history-2023-2026.json (217 visits, 2023-01-18..2026-08-18, all 27 stores, '
  + 'captured from Propel\'s getCfvHistory -- a one-time backfill, not a stream: Propel is SSO+MFA '
  + 'with no automated pull path) into Supabase graded_visits via a new scripts/import-cfv-'
  + 'history.mjs, idempotent on the table\'s own (loc, visit_date, report_type) unique '
  + 'constraint.\n\n'
  + 'Three traps, all measured against the live table before writing a line of upsert logic: '
  + 'graded_visits.loc is 5-digit zero-padded but getCfvHistory returns bare NSNs (unpadded, '
  + 'every 4-digit loc would have silently duplicated instead of updating); daypart/weekpart are '
  + 'not in this endpoint at all, and Supabase upsert does a full-row replace on conflict, so a '
  + "blind import would have NULLed OUT a PDF-sourced row's real values on every collision -- "
  + 'fixed by reading the existing row first and carrying daypart/weekpart forward untouched, '
  + 'extended to owner/manager/visit_by after finding live that those three are the same '
  + "PDF-only/API-absent risk class even though the dispatch named only the first two; and "
  + "getCfvHistory's camelCase channel values ('driveThru'/'curbside'/'inRestaurant') don't "
  + "match the PDF parser's own vocabulary -- measured the live table's actual values rather "
  + "than trusting the parser's source comment (which names 'Front Counter', a value that never "
  + 'actually occurs in this dataset) to get the real mapping (\'Drive Thru\'/\'Curbside\'/\'In '
  + 'Restaurant\'). pass is recorded as an explicit derivation (score >= 80, matching the PDF '
  + "parser's own parseCFV() rule) since Propel's card reports \"% Meeting 80%\" but the API "
  + 'never returns a pass flag.\n\n'
  + 'Surfaces what was invisible in-app: 2026\'s CFV below-80% rate is 44.7%, nearly double every '
  + 'prior year (2023 27.1% / 2024 26.1% / 2025 23.1%) -- confirmed already present in Q1, not '
  + 'explained by the August visit-window change. Verified end-to-end against the panel that '
  + "actually renders it, not the loader: the real 47-visit 2026 subset run through the ACTUAL "
  + "VisitPatterns component reads back n=47 / 55.32% pass (26/47, matching Propel's own "
  + 'published Customer First card at 1-decimal rounding), and a second full import run confirms '
  + '0 new rows / 217 refreshed -- idempotent, per the dispatch\'s own verification bar. RGR/'
  + "EcoSure history, the Model Check rebuild, and the CFV predictability ceiling (rho=+0.023 / "
  + 'ICC=0.087, already measured) are explicitly out of scope and untouched.\n\n'
  + '3 new test files (11 new tests, incl. the pure-function guards for the padding/daypart/'
  + 'channel traps and one against the real component). 191/191 test files, 2085/2085 tests, '
  + 'build clean, entry-eager payload 516.96 KB gzipped (budget 850 KB, 333 KB headroom -- this '
  + 'is a Node-only backfill script, no client bundle impact).',
]};
