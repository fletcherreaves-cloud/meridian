// @ts-nocheck
export default {version:'4.598', date:'2026-07-29', changes:[
  'EOM Dashboard: on-demand "↻ On-Hand" and "↻ Variance" buttons pull fresh count-progress / raw-item data right now instead of waiting for the next scheduled run. (Requires the trigger-dar-sync edge function to be redeployed with the new allowlist entries.)',
  'The scheduled intraday On-Hand pull now only runs 8am–6pm Central during the count window (managers count during the day), cutting wasted overnight pulls. A manual pull button overrides this anytime.',
]};
