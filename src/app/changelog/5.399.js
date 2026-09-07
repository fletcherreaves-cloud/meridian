// @ts-nocheck
export default {version:'5.399', date:'2026-09-07', changes:[
  'Signals: SignalBuilder, ScannerTab, and SignalsPanel each built their store-picker/location-' +
  'filter dropdown from a union of ds.laborRows/opsRows/schedRows/ctrlRows presence -- a store ' +
  'whose only data was cloud-pulled never appeared in its own filter. SignalsPanel\'s was the ' +
  'widest blast radius: its filter gates every Signals tab including LiveOps, which reads the ' +
  'fully-automated qsr_daily_activity stream and never touches laborRows/opsRows/schedRows at ' +
  'all. Fixed to Object.keys(STORE_NAMES), matching the same file\'s own pre-existing ParkOepeTab ' +
  'pattern. CsatDriversTab\'s SMG-presence-scoped picker is correctly left alone -- SMG has no ' +
  'auto-first source.',
  'Deliberately not touched: SignalsPanel\'s filteredDs (feeds computeInsights only when a ' +
  'location filter is active) -- computeInsights fans out to ~30 sig_* functions with a mix of ' +
  'raw-row and metricSeries reads; auditing which ds fields each actually needs is separate work.',
  'ratchet-raw-metric-rows.test.js (R1) CEILING 153 -> 149 (4 real violations removed). 2 new ' +
  'tests (signals-availlocs-all-stores.test.js) render the real SignalBuilder against a cloud-' +
  'only fixture.',
  'Full suite 487 files/4627 tests, build clean, eager budget 538.00 KB / 850 KB.',
]};
