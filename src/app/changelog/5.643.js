// @ts-nocheck
export default {version:'5.643', date:'2026-11-05', changes:[
  '**Store Dashboard → Forecast Table: LifeLenz forecast line + source toggle (owner req ' +
  '2026-11-05).** The Backtest Accuracy Report chart now overlays the forecast source NOT ' +
  'currently driving the grades (dashed purple line, same visual convention as the Overview ' +
  'tab\'s Sales Trend "LifeLenz Forecast" overlay — sourced from the same `ds.schedRows`, no new ' +
  'fetch, via the shared `lifeLenzSeries` helper rather than a second hand-rolled copy). A new ' +
  'toggle picks which source drives Accuracy Score/MAPE/Bias/Pass Rate and the Most Accurate/' +
  'Biggest Miss callouts — **defaults to LifeLenz** ("that is what is officially driving the ' +
  'schedule," owner\'s words), falls back to the Engineered Model with an on-screen note when a ' +
  'store/range has no usable LifeLenz backtest, and both callout headers now say which source ' +
  'they are reading. `computeBacktestStats` (generalized out of the old inline IIFE, same math, ' +
  'unchanged for the default engineered path) and `lifeLenzBacktestRows` (same actual/forecast/' +
  'not-today filter, recomputes varPct/pass against the LifeLenz number so diagnoseMiss grades ' +
  'the number actually shown) are now exported from store-dash.js for direct testing. 11 new ' +
  'tests (`dispatch-lifelenz-forecast-table-toggle-2026-11-05.test.js`); build clean.',
]};
