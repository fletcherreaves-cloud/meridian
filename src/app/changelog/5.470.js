// @ts-nocheck
export default {version:'5.470', date:'2026-09-18', changes:[
  'Data Manager: 13 more auto-synced streams now show a labeled row with source attribution -- ' +
  'Ops Cash/Labor/Service Stats/Sales Mix, LifeLenz Attendance, Inventory Summary/Usage, ' +
  'Forecast Week Cache, and the 6 monthly Performance-Review streams (Roster Statistics, ' +
  'Employee Roster, Turnover, Digital App, McDelivery, Shift Manager). All 13 are the SAME ' +
  'src/engine/stream-freshness.js STREAMS entries the freshness checklist already reads and ' +
  'were already eager-loaded into ds at startup -- they simply had no row anywhere in this ' +
  'panel, so no way to see which report feeds them or how many rows are on file.',
  'New ⚡ Auto-Synced (extended) section, right below the existing live-Supabase-query auto tiles ' +
  '-- reuses the SAME calcCov()/dataRow()/SRC_INFO pattern the existing "Cloud-Persisted" section ' +
  'already uses for manual streams (cloudOpRows), so this is calcCov() over already-loaded ds ' +
  'arrays, zero new network calls -- not the separate live-count-query mechanism the original ' +
  '5 auto tiles (LifeLenz/FOB/eBOS/DAR/Security Events) use.',
  '5 new tests against the real exported DataManagerPanel (a populated daily stream, SRC_INFO ' +
  'source-attribution text, a monthly dateField:\'month\' stream resolving correctly, an absent ' +
  'stream rendering empty rather than throwing, and all 13 labels present) -- would fail on a ' +
  'revert, since none of these fields were read anywhere before. Full suite 533/533 files, ' +
  '5061/5061 tests. Build clean, eager payload 551.59 KB gzip (budget 850 KB).',
]};
