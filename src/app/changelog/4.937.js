// @ts-nocheck
export default {version:'4.937', date:'2026-08-09', changes:[
  'Data-integrity sweep, signature #2 continued: 4 more reports fixed the same way, one of them a real live bug — the Anomaly Detection panel and the AI Backtest Scanner build their day-by-day baseline from the manually-uploaded Labor Report, which had quietly stopped receiving new rows about two weeks earlier while every other data source kept updating. Both had been silently blind to two weeks of real sales anomalies. Also fixed: a stale slider baseline in the Performance Calculator, the district 6-week sales trend, and FOB% in the Operator Summary panel, which now falls back to the automatic FOB pull when the monthly report hasn’t been uploaded yet.',
]};
