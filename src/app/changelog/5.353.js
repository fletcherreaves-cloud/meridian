// @ts-nocheck
export default {version:'5.353', date:'2026-09-05', changes:[
  'Fixed a live production crash in the Graded Visits panel ("null is not an object (evaluating ' +
  '\'t.pct\')", reported on iOS): the table row, CSV export, and print-report code all read ' +
  '.pct off every entry in a visit\'s `modules` object, an assumption that held while only CFV/RGR ' +
  'data existed (their modules ARE a map of category -> {pct}) but broke the moment real EcoSure ' +
  'data first existed in graded_visits (244 visits imported this session) -- EcoSure\'s modules ' +
  'shape is completely different (pointsReceived/citedItems/sections/comments), and comments can ' +
  'be null, so reading .pct off it threw outright.',
  'Added moduleEntries() (src/views/graded-visits.js) -- filters to entries that actually look ' +
  'like {pct: number} before any .pct read, so a report type with a different modules shape is ' +
  'excluded from "components" displays instead of crashing them. Fixed at all three call sites ' +
  '(table row, CSV export, print report) that made the same assumption.',
  '4 new tests reproducing the exact crash against a real EcoSure visit (parsed through the real ' +
  'parseEcoSureVisit(), not a hand-built stand-in) with comments:null, confirmed the pre-fix code ' +
  'throws on this input and the fix does not.',
  '458 files / 4405 tests pass, build clean, eager-payload budget unaffected.',
]};
