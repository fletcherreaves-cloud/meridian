// @ts-nocheck
export default {version:'5.278', date:'2026-08-31', changes:[
  'EOM count-window pulls (qsrsoft-onhand-pull.mjs + qsrsoft-variance-pull.mjs) -- extended the ' +
  'intraday Central-time business-hours gate from 8am-6pm to 8am-10pm during the last 3 days of ' +
  'the month (owner question: "change the frequency of auto pulls for eom cycle to 10pm also").' +
  '\n\n' +
  'Measured before changing anything: both workflows\' cron already fires every 30 min around the ' +
  'clock year-round (qsrsoft-onhand-pull.yml\'s `0 * * * *`/`30 * * * *`, qsrsoft-variance-pull.yml\'s ' +
  '`15 * * * *`) -- the in-script CT_START/CT_END gate (scripts/lib/count-window.mjs\'s ' +
  '`inCtBusinessHours`) is the SOLE thing deciding whether a landed run does real work outside ' +
  'business hours, and it was discarding every run after 6pm as a no-op. So a 10pm run was already ' +
  'happening on the clock; it just wasn\'t allowed to pull. Widening the gate to 22 needed no new ' +
  'cron entries, no workflow YAML changes, and no new GitHub Actions cost beyond the pulls already ' +
  'firing (and being discarded) at that hour.' +
  '\n\n' +
  'Rationale for extending rather than leaving as-is: the original 8a-6p window (Notes 35) assumed ' +
  '"managers count during the day." Closing-shift counts -- especially Non-Product, which is due ' +
  'only on the last day of the month -- commonly land after 6pm, and the old window meant any such ' +
  'count wouldn\'t show up in Meridian until the next morning\'s 8am pull, a real same-night ' +
  'blind spot during exactly the 3 nights/month the owner most wants live count-completion ' +
  'visibility. Both scripts share the same env var (ONHAND_CT_END), so this is tunable further ' +
  '(e.g. to 23 for stores with later closes) without another code change.' +
  '\n\n' +
  'Both `CT_START`/`CT_END` constants and their surrounding comments updated in both files ' +
  '(same shared gate, same rationale, kept in sync per the "check whether a helper exists" rule). ' +
  '`inCtBusinessHours` itself is a pure, generically-tested function (count-window.test.js passes ' +
  'explicit start/end args) -- unaffected by this default change, no test updates needed.'
]};
