// @ts-nocheck
export default {version:'4.256', date:'2026-07-01', changes:[
  'EOM Summary data wiring fixes: actSales and actLaborPct now pulled from laborRows (Operations Report Sales sheet) when not present in FOB rows — uses the row with highest sales (period-summary totals >> single-day totals) as the monthly figure. Cash auto-population rounded to 2 decimal places (no more -363.560000000). EditCell initial value displays with 2 decimal places instead of raw float string.',
]};
