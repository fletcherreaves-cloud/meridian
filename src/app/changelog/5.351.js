// @ts-nocheck
export default {version:'5.351', date:'2026-09-04', changes:[
  'Fixed the scheduled EOM Baseline Snapshot workflow, which had failed every run for the last ' +
  'several days: scripts/eom-snapshot-pull.mjs hardcoded `${PERIOD}-31` as its qsr_fob date-range ' +
  'upper bound, an invalid Postgres date for any month with fewer than 31 days -- it broke outright ' +
  'the moment the active EOM period rolled to September (30 days), throwing "date/time field value ' +
  'out of range" on every run since.',
  'The same bug (same table, same query shape) was independently found live-armed but not yet ' +
  'triggered in scripts/qsrsoft-onhand-pull.mjs\'s fetchFobSnapshotForStore() -- called from three ' +
  'scheduled scripts (itself, eom-notification-resend.mjs, eom-digest-send.mjs) -- and fixed there ' +
  'too, before it could fail the same way.',
  'This is the THIRD independent occurrence of the identical mistake: src/lib/supabase.js\'s ' +
  'loadEbosMonthlyByStore already fixed it once (dispatch #365), but as an inline fix at one call ' +
  'site rather than a shared helper, so it drifted back into two more places by hand. Extracted ' +
  'scripts/lib/month-bounds.mjs (monthEndDate/nextMonthStart) so a fourth reintroduction is a test ' +
  'failure, not a production outage.',
  'Verified against real production data, not just the fix\'s own unit tests: ran the corrected ' +
  'eom-snapshot-pull.mjs directly -- it successfully locked the September baseline snapshot for ' +
  'all 27 stores (previously blocked entirely since the bug started).',
  '8 new tests for the extracted helper (dispatch-month-bounds.test.js), covering every 30-day ' +
  'month, both leap and non-leap February, and the December-into-January year rollover. 4383 tests ' +
  'pass (455 files, +8 new), build clean.',
]};
