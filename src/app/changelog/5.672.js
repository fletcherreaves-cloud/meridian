// @ts-nocheck
export default {version:'5.672', date:'2026-11-07', changes:[
  '**New Store Launch Planner: 12-month view + real-vs-assumption reconciliation.** `maxDays` was ' +
  'hardcoded at 60 with no UI control, so nobody could ever check a mature-sales assumption against ' +
  'a real annual total. Added a Plan Length selector (60/90/180/365 days, now defaulting to 365) and ' +
  'a "Projected Total" stat. Running the existing Lindsay (44689) assumption for the full 365 days it ' +
  'was never shown for lands within 0.3% of an independent estimate reconstructed from real 18213 ' +
  'trailing sales + the Holdenville transition precedent — the mature-sales number itself needed no ' +
  'change.',
]};
