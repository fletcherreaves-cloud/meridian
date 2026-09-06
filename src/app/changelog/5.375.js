// @ts-nocheck
export default {version:'5.375', date:'2026-09-06', changes:[
  'District View 14-item visual-review punch list (notes-61-queue.md, 2026-08-08) fully ' +
  're-verified against current code -- backlog-master-2026-08-19.md had flagged the whole block ' +
  '"mostly unconfirmed as fixed." 9 of 14 were already fixed by earlier work; 2 fixed here.',
  'Shift Analysis / 3 Peaks: the per-daypart (breakfast/lunch/dinner) KPI cards computed TPPH ' +
  '(analyzePeaks) and used it in the AI-analysis prompt, but never rendered it as a visible tile -- ' +
  'a real display gap, not a sourcing gap. Added a TPPH tile alongside OEPE/R2P/KVS Time/DT ' +
  'Parked % in store-dash.js\'s PeaksTab.',
  'Tishomingo/Elgin/Mossy Head were mislabeled "New Store" (forecast model health null) despite ' +
  'being open 1+ years with real AE/DOW/LY calibration (n in the hundreds at monthly/yearly ' +
  'horizons). Root cause: DEFAULT_MODEL_ASSIGNMENTS\' recentOnly flag conflates a genuinely new/ ' +
  'ramp-up location (Ponce de Leon, monthly/yearly n:0) with an established store where ' +
  'Dialed-In specifically is not viable but simpler models are calibrated and running. ' +
  'modelHealthScore/computeModelHealth (engine/forecast.js) now branch on whether real ' +
  'monthly/yearly calibration exists: established-but-DI-unviable stores get a "DI N/A" label ' +
  'and an accurate statement instead of the "new location" claim. No numeric score is ' +
  'fabricated either way -- still null/N/A, only the label and explanatory text changed.',
  'Also confirmed already-fixed: PM->Snack daypart label, Biggest Miss partial-day exclusion ' +
  '(Forecast Table + Backtest Accuracy), Scorecard 2-Wk column, Intelligence Brief light-mode ' +
  'contrast, 3-Peaks Parked-at-Dinner, Register Audit refund rounding, District Overview ' +
  'Critical/Watch clickable chips. Left open, correctly: labor-missing-at-10am (unconfirmed, ' +
  'reads as a point-in-time observation not a reproducible bug), Register Audit employee ' +
  'drill-down + surface-all-metrics and Records top-3/near-miss detection (genuine unbuilt ' +
  'features, not bugs -- left unscoped rather than guessed at).',
  'New src/__tests__/model-health-recentonly-mislabel.test.js locks in the fix against all four ' +
  'real recentOnly stores (Tishomingo/Elgin/Mossy Head stay non-"New Store"; Ponce de Leon, ' +
  'genuinely new, is unaffected). Full per-item resolution: memory/notes-61-queue.md.',
]};
