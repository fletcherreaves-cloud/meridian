// @ts-nocheck
export default {version:'5.706', date:'2026-11-09', changes:[
  '**⏱ Count Timing Report now shows how many items were counted, and which classes, not just '+
  'when (owner request 2026-11-09): "add how many items were counted as well? Show as xxx/xxx '+
  'and specify classes too... useful troubleshooting information."** Latest and Sessions modes '+
  'now carry a real "Items counted" xxx/xxx figure (distinct items vs. the store\'s whole item '+
  'universe for the period) plus a "By class" breakdown ("Food 42/45 · Paper 18/18", only classes '+
  'actually touched that day) — on-screen, in the printed report, and in the CSV export. Fixed a '+
  'real undercount along the way: the engine (`collectCountStamps`/`summarizeDaySession`, '+
  '`eom-item-journey.js`) was discarding each count stamp\'s item identity entirely, so the '+
  'existing `nCounts` is a tally of raw count-EVENTS, not distinct items — an item corrected '+
  'twice the same day was counted twice. The new `nItemsCounted`/`byClass` dedupe by wrin. Monthly '+
  'mode gets the overall xxx/xxx figure but skips the per-class breakdown (judgment call — a '+
  '12-period-by-store trend grid is for scanning a pattern, not diagnosing one day; the per-class '+
  'depth stays one click away in Latest/Sessions).',
]};
