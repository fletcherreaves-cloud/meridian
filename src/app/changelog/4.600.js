// @ts-nocheck
export default {version:'4.600', date:'2026-07-29', changes:[
  'EOM Food-Cost Diagnosis + SAGE now frame "uncounted" items correctly. The report has a Count-Integrity section that splits them into NEVER counted (true blanks — real recovery, count before close), counted EARLY (already counted; recount only if the count looks wrong — dollars are locked this period), and STALE / obsolete / discontinued / inactive items (verify → count if still usable, or write off before close). SAGE is told to respect this split so it never hands a GM a "go count $X of blanks" instruction unless that money is truly never-counted.',
]};
