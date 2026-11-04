// @ts-nocheck
export default {version:'5.620', date:'2026-11-04', changes:[
  '**Customize Fields: hide, rename, or regroup Monthly/Yearly target metrics (owner-requested, ' +
  '"add settings to the targets so they may be customized as needed... add or remove metrics and ' +
  'categories on monthly and yearly").** New "⚙️ Customize" editor on both Monthly Projections ' +
  '(Planning → Targets) and Yearly Targets (Planning → Yearly → Target Categories): toggle any ' +
  'metric\'s visibility, rename its display label, or move it into a different category -- type ' +
  'a brand-new category name to create one on the spot. A category that ends up with every field ' +
  'hidden or moved out drops off the list automatically. Nothing is invented out of nothing -- ' +
  'every field is still tied to its real underlying column (Tier 1: reshape what already exists, ' +
  'no schema change); a genuinely new custom metric with no backing column at all would need a ' +
  'real DDL change and is documented as a deferred future option, not built here. The three ' +
  'existing Service/Bonus Labor/Bonus Food toggle chips on Monthly Projections are untouched and ' +
  'keep working exactly as before -- the new config layers on top of them, never replaces them. ' +
  'Pure, reusable engine (src/engine/target-field-config.js, 15 tests) handles both Monthly\'s ' +
  'flat field list and Yearly\'s nested categories through one shared primitive; shared editor ' +
  'component (src/components/TargetFieldConfigEditor.js) used by both panels. Settings-backed, ' +
  'same mechanism every other org preference already uses -- no new Supabase table. Design notes ' +
  'in memory/plan-target-field-customization-2026-11-04.md. 717/717 test files, 6601/6601 tests; ' +
  'build clean, eager payload 605.96 KB gzip (unchanged, well within the 850 KB budget).',
]};
