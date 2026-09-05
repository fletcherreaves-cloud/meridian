// @ts-nocheck
export default {version:'5.372', date:'2026-09-05', changes:[
  'Wired real EcoSure visit data into two places it was staged for but not yet connected ' +
  '(memory/finding-ecosure-propel-api-2026-08-22.md), now that real EcoSure rows exist in ' +
  'graded_visits: (1) Performance Review\'s Food Safety EcoSure (%) metric moves from src:\'manual\' ' +
  'to auto -- same "src:\'manual\'->\'auto\' once real data exists" migration dispatch #231 did for ' +
  'Complaint Contacts/100K, averaging the store\'s EcoSure visit score(s) for the review month. ' +
  '(2) Visit Readiness now surfaces a critical-fail count separately from score, everywhere a ' +
  'last-visit result is shown (store row, coaching one-pager, district report) plus a new district ' +
  'rollup count -- an explicit instruction in the finding file: a store can rank well on overall ' +
  'score while still carrying the estate\'s only critical fail (measured live on ADA 06972).',
  'Complaints and SMG were also researched for the same "pre-wired, pending real data" pattern -- ' +
  'neither has a design doc proposing them as Visit Readiness inputs (complaints feeds Performance ' +
  'Review only; SMG isn\'t automated yet), so neither was wired in here. The waste/holding proxy ' +
  'flag itself (fsFlag/W&V) is untouched in this pass -- replacing or calibrating it against real ' +
  'EcoSure scores needs the leak-free "as of visit date" backtest the finding file prescribes, ' +
  'which is real methodology work, not a quick wire-up; tracked separately.',
]};
