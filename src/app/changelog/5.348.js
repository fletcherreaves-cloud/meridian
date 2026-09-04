// @ts-nocheck
export default {version:'5.348', date:'2026-09-04', changes:[
  'Wired qsr_store_settings (the cash-control automation shipped earlier today, v5.346) into ' +
  'Signals -> Store Controls: clicking a store now shows a "Store Settings — Cash (2nd source)" ' +
  'cell alongside the existing Cash Controls / Safe & Deposit cells from storewide_controls.',
  'Deliberately shown side-by-side, not merged or reconciled -- the two endpoints overlap but are ' +
  'not identical (memory/project-qsrsoft-store-settings-endpoint.md spot-checked one field match, ' +
  'several with no counterpart), and reconciling them is real work nobody has done yet. Labeled ' +
  'plainly as a second, unreconciled source rather than silently blended into the first.',
  'New loadQsrStoreSettings() loader (src/lib/supabase.js), loaded independently and failing soft ' +
  '(never blocks or blanks the main Store Controls table if it errors).',
  'Extended the existing hook-order regression suite (dispatch-store-controls-tab-hook-order.test.js, ' +
  'no new file) with a second test: clicking a store shows the new cash cell with real field values, ' +
  'plus mocking the new loader alongside the existing loading-transition test.',
  '4349 tests pass (451 files, +1 test), build clean, eager-payload budget unaffected.',
]};
