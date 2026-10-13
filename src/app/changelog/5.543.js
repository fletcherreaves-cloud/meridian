// @ts-nocheck
export default {version:'5.543', date:'2026-10-13', changes:[
  'District View per-store Records tab (StoreRecordsTab) -- added the Record Hour section ' +
  '(best 60-minute sliding window, Current Record / Top 5 All-Time toggle, sortable Store/ ' +
  'Date/Daypart columns, previous-record comparison) that the district-wide Records panel ' +
  '(record-day.js\'s RecordDayTab) already has, scoped to this one store instead of rebuilt. ' +
  'Reuses the exact same HourRecordTab component, same engine (computeHourRecords/ ' +
  'scopeHourRecords), same "load full history since 2022" wide-tier mechanism.',
  'Fixed a real, pre-existing ambiguity this reuse surfaced (via a test, not a live report): ' +
  'the district-wide Records panel\'s day-records history button sits in a top bar that ' +
  'persists across every tab, including Record Hour -- so its own "Load full history (since ' +
  '2022)" button was ALREADY showing beside HourRecordTab\'s identically-worded one whenever a ' +
  'user opened that tab, just never caught before. Each button now names which stream it ' +
  'backfills.',
]};
