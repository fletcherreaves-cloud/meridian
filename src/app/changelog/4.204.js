// @ts-nocheck
export default {version:'4.204', date:'2026-06-19', changes:[
  'Model Assignment Backtest — first real-data run: 65 of 81 store×horizon assignments updated, all known problem stores (Elgin, Sulphur, Madill, Tishomingo) resolved correctly per their existing notes',
  'Found + fixed: Mossy Head yearly horizon showed 355%+ MAPE across all models — one contaminated period the recentOnly window didn\'t fully exclude was dominating the average',
  'Backtest MAPE is now a trimmed mean — worst ~5% of individual-day errors excluded before averaging (min sample guards apply), so one bad data day can\'t decide the model winner',
  'Trimming is always surfaced in the evidence ref ("N outlier days excluded") — never silently hidden, since a high trim count is itself a data-quality signal worth noticing',
]};
