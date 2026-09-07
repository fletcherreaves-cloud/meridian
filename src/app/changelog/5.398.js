// @ts-nocheck
export default {version:'5.398', date:'2026-09-07', changes:[
  'Store Analytics > Shift Analysis (ShiftAnalysisTab) was reading ds.laborRows (the manual ' +
  'Labor Excel upload) directly for its DOW-breakdown sales/channel-mix table, Weekday-vs-Weekend ' +
  'cards, 3 Peaks x Labor Gap same-day lookup, and Competitive Intelligence Impact same-day/DOW-' +
  'avg lookup -- the whole tab silently went blank on any device with only cloud data and no ' +
  'manual upload ever done (backlog `labor_rows` sweep item). Routed through metric-source.js\'s ' +
  'auto-first metricSeries/metricDaily instead; added bfMixPct/mopMixPct/kioskMixPct/delivMixPct ' +
  'metric chains (manual Labor -> emailed Sales Ledger) alongside the existing dtMixPct.',
  'ratchet-raw-metric-rows.test.js (R1) CEILING 155 -> 153 (net -2 real violations after also ' +
  'accounting for the new auto-first comments\' own text); ratchet-week-day-arithmetic.test.js ' +
  '(R3) CEILING 62 -> 56 (re-measured; -4 from this fix\'s consolidated getDay() bucketing, -2 ' +
  'pre-existing drift not chased down). 2 new tests ' +
  '(store-analytics-shift-tab-auto-first.test.js) render the real ShiftAnalysisTab against a ' +
  'cloud-only fixture.',
  'Also fixed a stale backlog line: the District View Action Plan TPPH item was already shipped ' +
  'in #1185 but never marked done in memory/backlog-open-2026-09-06.md.',
  'No user-visible behavior change for a device with a manual upload; a cloud-only device now ' +
  'sees real numbers instead of a blank tab. Full suite 486 files/4625 tests, build clean, eager ' +
  'budget 538.01 KB / 850 KB.',
]};
