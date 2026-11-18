// @ts-nocheck
export default {version:'5.827', date:'2026-11-18', changes:[
  '**New report: Night OEPE w/o Parked.** Owner request, explicitly "separate from previous ' +
  'work" (the whole-day DT OEPE w/o Parked report) — same real, scored w/o-parked formula ' +
  '(parked/held time excluded, never the diagnostic "with park" variant), broken out across 3 ' +
  'night segments: 4pm–Close (the entire night period), 5pm–7pm, and 7pm–Close, each across the ' +
  'same 6 lookback periods (MTD / LM / Last 30 / Last 45 / Last 90 Days / YTD). True Σ time ÷ Σ ' +
  'transactions per segment+period+store, never an average of daily/hourly OEPE values. New ' +
  '`loadNightOepeActivity` loader (src/lib/supabase.js) — no existing loader combined the full ' +
  'night hour_slot range (\'17:00\'..\'28:00\') with the complete dt_untilserve/dt_untilstore/' +
  'dt_heldtime/dt_trans_cnt leg set the formula needs. New engine/night-oepe-report.js (reuses ' +
  'dt-oepe-report.js\'s 6 period-window definitions rather than redefining them) + new ' +
  'views/night-oepe-report.js (ReportShell + a 3-way segment toggle). Registered as its own ' +
  'Reports entry, \'night-oepe-report\'.',
]};
