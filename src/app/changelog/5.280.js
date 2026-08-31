// @ts-nocheck
export default {version:'5.280', date:'2026-08-31', changes:[
  'EOM Share view -- the live-refresh caveat text ("re-syncs from QSRSoft every ~30 min...") still ' +
  'said "8a-6p CT" after v5.278 extended the actual pull window to 8a-10p CT -- this string was ' +
  'never tied to the real CT_END constant, just informational copy that got missed. Fixed here, ' +
  'plus two more stale references found in the same sweep: eom-dashboard.js\'s manual "Pull fresh ' +
  'On-Hand" button tooltip and a nearby code comment. Changelog entries themselves (4.598/5.100/' +
  '5.250/5.269/5.278) are historical record and intentionally left as-is -- only live copy/comments ' +
  'were swept.',
  'EOM Inventory -- QSRSoft\'s `active` boolean on on-hand rows disagrees with its own item-name ' +
  'text (measured live at two stores: Durant\'s Big Mac Sauce Cup showed active:null and its ' +
  'Caesar Sauce Pouch showed active:true, despite both names literally saying "(Deactivated)"), so ' +
  'the v5.276 active===false fix still let already-recounted items resurface as urgent. Added a ' +
  'descr-text detector (isDeactivatedByDescr) that reclassifies on the item\'s own "(Deactivated)"/' +
  '"(Obsolete)" text when the boolean disagrees -- deliberately excludes an "(Obsolete N days ' +
  'left" countdown, which measured active:true in most live samples and is still a normal current ' +
  'count, not a deactivation.',
  'EOM Diagnosis -- "Repeated static waste value" was displaying the flagged amount through ' +
  'whole-dollar rounding, so a genuinely repeated $0.05-$0.49 figure (a real, common amount -- one ' +
  'fry portion) read as the nonsensical "flagged $0 waste." Now shows cents precision, matching ' +
  'the exact figure the check actually grouped on.',
  'EOM Diagnosis -- grouped findings (recount-swing rollups, the generic multi-item rollup) were ' +
  'joined with " · " onto one run-on line; with this repo\'s normal per-item clause length that ' +
  'reads as an unreadable wall of text ("Second-Look Signals"). Switched to one item per line.',
  'EOM Dashboard -- printing the Missing Items / Team Snapshot / Recount Impact tabs (and, by the ' +
  'same mechanism, Supervisor Rollup) produced a BLANK page. Root cause: every routePanel renders ' +
  'inside App.js\'s "Main content" scroll wrapper, not as a direct child of .mf-app-root -- but ' +
  'PRINT_STYLE\'s hide-everything-else rule only ever inspected .mf-app-root\'s DIRECT children, so ' +
  'it hid that unmarked wrapper itself, which blanked the print modal nested inside it regardless ' +
  'of the modal\'s own class. Gave the wrapper a stable class (.mf-main-content) and repeated the ' +
  'same hide-rule one level down, exempting it at the outer level.'
]};
