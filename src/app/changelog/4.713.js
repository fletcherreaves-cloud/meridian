// @ts-nocheck
export default {version:'4.713', date:'2026-08-01', changes:[
  'Trading-day comparison foundation (P0): a new pure engine (trading-days.js) for fair partial-period comparisons. Because we run on daily pulls and sales swing by weekday, a partial range that is NOT a whole number of weeks must be compared weekday-aligned — the clean trick being a 52-week (364-day) shift that preserves the day-of-week exactly, vs a naive same-calendar-date LY. It reports whether trading-day alignment was required (partial range) or calendar was already fair (whole weeks). +6 tests. Next: wire it through vs-LY, projections pace, and movers.',
]};
