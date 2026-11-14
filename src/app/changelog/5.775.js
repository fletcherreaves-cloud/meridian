// @ts-nocheck
export default {version:'5.775', date:'2026-11-14', changes:[
  '**QSRSoft Quick Links now open directly to the active store, where confirmed safe** (task ' +
  '#156, closing Notes 74\'s own "verify syntax" follow-up — owner: *"login as well and verify ' +
  'syntax to make the links even more specific to open directly to active store where ' +
  'appropriate"*). Logged into v3.myqsrsoft.com live (main app only — the WAF-blocked ' +
  '/equipment/tickets sub-app was NOT touched again) and confirmed the real per-store deep-link ' +
  'syntax is `?location=<unpadded loc>` — the same short code INV_ORG_COORDS already keys on ' +
  '(e.g. \'5183\', not \'0005183\') — by forcing a DIFFERENT store\'s code onto each URL and ' +
  'seeing the page\'s own store badge/body text update to match, not just echo whatever was ' +
  'already selected. 9 of 11 QSR report/form links confirmed (Register Audit, both Travel Path ' +
  'forms, Pre-Shift Breakfast, 3 Peaks, Food Over Base, On Hand Inventory, Variance/Yields); ' +
  'Operations Report stayed ambiguous after a generous wait and is left unscoped rather than ' +
  'guessed; Home and the equipment Tickets sub-app don\'t take the param at all. The At A Glance ' +
  'footer now appends `?location=` automatically whenever exactly one store is in view ' +
  '(district/patch views fall back to the original unscoped URL, same as before). 7 new tests. ' +
  'Full findings: memory/notes-74-queue.md\'s dated update block.',
]};
