// @ts-nocheck
export default {version:'5.270', date:'2026-08-30', changes:[
  'EOM Digest (dispatch #224 follow-up) -- three owner-reported fixes on the just-shipped ' +
  'per-store FOB+components table and recount-opportunities list, in both the app modal and the ' +
  'emailed digest.' +
  '\n\n' +
  '1. **Show the FOB a store has, even mid-count.** The email path previously gated the whole ' +
  'FOB section on the store\'s count being complete AND the snapshot being newer than that ' +
  'completion (isFobFresh(fobResult.updatedAt, completedAt)) -- so an incomplete count meant ' +
  'nothing ever showed, even a real, useful in-progress number. Now the latest available FOB ' +
  'snapshot always shows, captioned "(count in progress, not yet complete)" via a new ' +
  '`countComplete` field threaded through src/engine/eom-digest.js\'s rollupGroup(), instead of ' +
  'being withheld. The app path gets a matching fix: a store with zero qsr_fob rows THIS period ' +
  'now falls back to its last available snapshot (any period), captioned "no fresh data posted ' +
  'this period yet" via a new `stalePeriod` flag, rather than showing nothing.' +
  '\n\n' +
  '2. **Non-Product recount opportunities before they\'re due.** The new recount-opportunities ' +
  'list had no due-date awareness -- an uncounted Non-Product item showed as an actionable gap ' +
  'even though Non-Product isn\'t due until the LAST day of the month (the same rule the ' +
  'per-store diagnosis report already honors for its own "Finish today\'s count" section, ' +
  'nonProductDueToday(), eom-inventory.js). rollupGroup() now excludes Non-Product recount items ' +
  'until that day.' +
  '\n\n' +
  '3. **Softer "no open opportunities" wording.** "No open recount opportunities -- nothing a ' +
  'recount would still move" risked reading as a green light to stop recounting altogether. ' +
  'Replaced with "No uncounted-item gaps flagged -- not a signal to skip the routine of ' +
  'recounting top stat/variance items for consistency" in both the app and the email.' +
  '\n\n' +
  'New tests cover the Non-Product due-date gate (before/after the last day), countComplete ' +
  'pass-through, and the countComplete-caveat parameter on fobComponentsTableHtml() (including ' +
  'that omitting it -- every pre-existing caller -- renders identically to before this param ' +
  'existed).'
]};
