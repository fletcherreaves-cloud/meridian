// @ts-nocheck
export default {version:'5.588', date:'2026-10-27', changes:[
  '**Extended the eBOS auth verification fix (v5.587) to the remaining 7 scripts still ' +
  'calling resolveEbosToken() unverified** -- each confirmed failing live with the exact same ' +
  '"falling back to static QSRSOFT_EBOS_TOKEN (may be stale)" immediately followed by "auth ' +
  'failed" signature, across issues #1507 (Menu Item Recipe), #1506 (Menu Item Activity), ' +
  '#1509 (Inventory Summary), #1510 (Store Controls), #1511 (Store Settings), and #1547 ' +
  '(Menu Items Catalog) -- some of them failing for 7+ days straight with nobody having read ' +
  'the actual job log yet.',
  'Wired a `verify` callback into each: `qsrsoft-menu-item-recipe-pull.mjs` and ' +
  '`qsrsoft-menu-item-activity-pull.mjs` probe with a real storeMenuitemId pulled from the ' +
  'store\'s own catalog (a pure Supabase read, no eBOS token needed) rather than a fabricated ' +
  'one; `qsrsoft-inventory-summary-pull.mjs`/`qsrsoft-store-controls-pull.mjs`/' +
  '`qsrsoft-store-settings-pull.mjs`/`qsrsoft-menu-items-pull.mjs` probe with the store\'s own ' +
  'real (nsn)-only request; `qsrsoft-inventory-history-pull.mjs` (a diagnostic probe script, ' +
  'not currently on a failing issue) checks its own returned status code directly since that ' +
  'script already treats a 403 as potentially meaningful data (a retention cutoff), not just ' +
  'an auth failure.',
  'Not fixed here, flagged rather than guessed at: issue #1532 (Security Events Pull) is a ' +
  'separate Cognito/reporting-API 403, not this eBOS bug; the Playwright-capture failure on ' +
  '#1554 (`qsrsoft-ebos-pull.mjs`) is a UI-automation issue, not an auth-ladder issue.',
  'Full suite 663/663 files, 6161/6161 tests green. Build clean, unchanged (scripts/ only).',
]};
