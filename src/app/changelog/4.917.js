// @ts-nocheck
export default {version:'4.917', date:'2026-08-08', changes:[
  'Forecast Table and Backtest Accuracy no longer grade the current day. A day still filling has only its sales so far, and comparing that against a whole-day forecast made it the Biggest Miss almost every time while dragging the accuracy, bias and pass-rate figures with it. Today is now shown separately as in-progress rather than scored.',
  'The tracer now also records React render time, which is the one place the previous instrumentation could not see.',
]};
