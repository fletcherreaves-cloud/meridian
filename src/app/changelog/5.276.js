// @ts-nocheck
export default {version:'5.276', date:'2026-08-31', changes:[
  'diagnoseIncompleteCount() (src/engine/eom-inventory.js) now reads QSRSoft\'s own `active` flag ' +
  'when classifying an uncounted item, generalizing the Tishomingo/#43380 fix (v5.268) beyond its ' +
  'zero-value proxy. That fix only caught a deactivated item with EXACTLY $0 on hand and 0 units; ' +
  'it missed a deactivated item still carrying a small real residual. Found live 2026-08-30, Ada-' +
  'Country Club (loc 6972): two items QSRSoft marks `active:false` -- LEMONS ($11.07 on hand) and ' +
  'Big Mac Sauce Cup (-$1.47) -- both counted earlier this period, so the date-only logic classed ' +
  'them \'early\' and the diagnosis report gave them the aggressive "recount now, real gap" ' +
  'framing meant for genuinely active items, exactly the false-urgency pattern the Tishomingo fix ' +
  'was supposed to close for good.' +
  '\n\n' +
  '`active === false` (never null/undefined -- null means "unknown, pre-migration row", not ' +
  'inactive) now forces `state: \'stale\'` regardless of value or count date, routing straight to ' +
  'the same Obsolete/Discontinued/Inactive "verify & clear" bucket a real stale item already gets. ' +
  'One shared function, so this is fixed everywhere it feeds: EOM Digest emails, the EOM Dashboard, ' +
  'and the diagnosis report -- not a per-surface patch.' +
  '\n\n' +
  'New test (real 2026-08-30 Ada-Country Club data) proves the reclassification, and that it does ' +
  'NOT blunt a genuine early-count warning for an actually-active item (Fried Apple Pie stays ' +
  '\'early\') or misfire on active:null (Blue Raspberry Syrup stays \'early\' too).'
]};
