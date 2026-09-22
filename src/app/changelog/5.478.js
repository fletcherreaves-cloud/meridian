// @ts-nocheck
export default {version:'5.478', date:'2026-09-22', changes:[
  'Swing Alarm: added a "worth checking" cross-metric section to the critical-swing modal, ' +
  'alongside the existing news-context section (Notes 33 #9). When a store hits a sustained ' +
  'sales/guest swing, the alarm now also shows the store\'s OWN labor% and OEPE (DT speed) ' +
  'during the swing window, each compared to the equal-length window immediately before it -- ' +
  'auto-sourced via metric-source.js\'s metricAvg (the same freshest-wins resolution every other ' +
  'panel uses), never a bespoke raw-stream read.',
  'New `metricContextFor()` (src/engine/swing-context.js), same non-causal "worth checking" ' +
  'framing as the existing newsContextFor() -- a metric moving alongside the sales swing is a ' +
  'candidate to look at, never an explanation. Deliberately small in scope: the two operational ' +
  'metrics a DO already watches elsewhere in the app. The bigger, more judgment-laden half of ' +
  'this ask -- wiring an AI-driven cause search (why.js\'s lookupMissEvent or equivalent) into ' +
  'the swing alarm -- is a separate piece, not done here.',
  '8 new tests (swing-context.test.js + a new dispatch-swing-alarm-metric-context test mounting ' +
  'the real SwingAlarm component) -- confirmed to fail against the pre-fix code. Full suite ' +
  '540/540 files, 5087/5087 tests. Build clean, eager payload 552.17 KB gzip (budget 850 KB).',
]};
