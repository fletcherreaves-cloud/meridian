// @ts-nocheck
export default {version:'5.359', date:'2026-09-05', changes:[
  'Graded Visits panel now renders PEAK per-visit detail (peak_detail): a new 🔎 PEAK Visit ' +
  'Detail section inside a CFV/RGR row\'s existing expand-on-click area, defaulting to just the ' +
  'commented questions (a real RGR visit ran 193 questions with 15 commented -- showing all 193 ' +
  'by default would bury the signal) with a "Show all N" toggle. Each shown question carries its ' +
  'category, text, a CRITICAL badge when flagged, its score/possibleScore, and the real inspector ' +
  'comment; the overall visit comment renders above the table when present. A small 🔎 badge next ' +
  'to the row\'s CFV/RGR type pill makes a PEAK-enriched row discoverable without expanding every ' +
  'one. The auditor field (a tokenized id, never a plaintext name) is deliberately never rendered ' +
  'here, matching this session\'s own security posture for real captured personnel identity.',
  'This closes the loop on today\'s PEAK work end to end: parser + enrichment-only import ' +
  '(scripts/import-peak-visit-detail.mjs) shipped earlier, the owner ran the graded_visits.' +
  'peak_detail column migration and captured two real visits (CFV + RGR), the import ran live ' +
  'against production -- and now the panel actually shows what was imported, which nothing did ' +
  'until this change (peak_detail was already being fetched via loadGradedVisits()\'s select(\'*\') ' +
  'but had zero UI consumer).',
  '6 new tests (src/__tests__/dispatch-peak-detail-block.test.js), rendered via react-dom/server ' +
  'the same way this repo\'s shell-nav-snapshot.test.js already does: no-peak_detail renders ' +
  'nothing, commented-only-by-default, the toggle only appears when there\'s more to show, the ' +
  'zero-commented empty state, the visit-comment render, and a hard assertion that a tokenized ' +
  'auditor id never appears in the rendered HTML.',
]};
