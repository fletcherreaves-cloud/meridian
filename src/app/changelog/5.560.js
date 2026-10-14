// @ts-nocheck
export default {version:'5.560', date:'2026-10-14', changes:[
  'GM Assignments populated live for the first time -- settings.gmAssignments (Settings -> GMs) ' +
  'has carried real GM name/email data for zero stores in production since it shipped (confirmed ' +
  'during the Lindsay relocation build this same day). Owner supplied a real org-structure ' +
  'workbook; cross-checked every store\'s GM against the app\'s own morning-brief.js STORE_STAFF ' +
  'seed before writing (not the spreadsheet\'s Supervisor/Operator columns, which the first upload ' +
  'had stale for 3708/24471/43380/13113/35064 -- those are already correct live via the real ' +
  'org_config reassignment and were left untouched). All 28 stores (27 existing + 44689, the ' +
  'Lindsay relocation successor) now have a real gmAssignments row.',
  '10034 (Bonifay, FL) GM corrected: Melissa Hagerman, not Harlee Yates. The owner\'s re-uploaded, ' +
  'corrected workbook surfaced a real personnel change morning-brief.js\'s STORE_STAFF seed had ' +
  'never picked up -- confirmed with the owner before writing. Fixed in both the live ' +
  'gmAssignments row and the STORE_STAFF seed itself (so a fresh/reset settings state seeds ' +
  'correctly too, not just the already-corrected live data).',
  'Store Status (settings.storeLifecycle, shipped earlier today) now also carries a real, ' +
  'owner-confirmed-tentative entry: 18213\'s last day of operation, 2026-11-10, sourced from the ' +
  'same workbook. Tentative and editable -- the owner\'s own words: "not final, i put tentative ' +
  'dates in, i can update as i gain more data."',
  'Full suite green (602/602 files, 5635/5635 tests), npm run build clean, within the ' +
  'entry-chunk budget. No other code changes this pass -- the gmAssignments/storeLifecycle data ' +
  'itself already lives in Supabase org_config, not in this repo.',
]};
