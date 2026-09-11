// @ts-nocheck
export default {version:'5.426', date:'2026-09-11', changes:[
  'Closes #289: DEFAULT_TARGETS (constants.js) was missing 3 target blocks (Customer ' +
  'Satisfaction, Digital Execution, People) that VOICE-grading and missingReviewTargets() ' +
  'have been waiting on since dispatch #109/#142/#145 wired their field mappings. Real blocker ' +
  'was never code -- the owner\'s 2026 yearly targets workbook had never landed in the repo. ' +
  'Owner uploaded it and asked for it to be committed this time.',
  '16 new fields (tOsat/tOsatB2B/tVoiceEAD, t1800Contacts/tDigAppPct/tDigAppGCRD/tMcdGCRD/' +
  'tMcdWait/tMcdStars, tCrewStaffing/tShiftLeaders/tManagers/tHeadcount/tToShiftLeader/' +
  'tToCrew090/tToCrewYTD) merged into all 27 DEFAULT_TARGETS store entries, parsed from the ' +
  'real workbook with the production parseYearlyTargets() parser -- purely additive, zero ' +
  'pre-existing fields touched. Workbook + provenance README committed to ' +
  'data/restaurant-targets/ (same pattern as data/org-structure/).',
  '2 tests in review-target-autofill.test.js updated to reflect the closed gap: ' +
  'missingReviewTargets() no longer flags osat/delivWait/headcount (genuinely-unresolvable ' +
  'epb2b/complaints substituted), and mergedTargetsForLoc() now resolves tMcdWait=180 from the ' +
  'new fallback while still preferring a real ds.targets value (240) over it -- precedence ' +
  'proof added.',
  'Also committed docs/2026_Food_Safety_Guide.pdf (source doc, confidential/internal) and ' +
  'memory/finding-fs-scoring-mechanism-2026-09-11.md -- the owner\'s EcoSure/RGRV scoring rules ' +
  '(80% pass threshold, 9 critical auto-fail questions FS-A through FS7, two distinct ' +
  'remediation rulesets by visit type) confirmed against the PDF. Design note only -- the ' +
  'scoreEcoSureVisit() engine work is separate follow-on.',
  'Full suite 4745/4745, build clean.',
]};
