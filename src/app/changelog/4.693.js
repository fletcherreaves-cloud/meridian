// @ts-nocheck
export default {version:'4.693', date:'2026-07-31', changes:[
  'EOM count exception now DATES the accepted count: when you grant "accepted early count", Meridian reads the store\'s items to find the day the bulk of the count actually happened (the perceived full-count date, e.g. Ponce\'s 07/28) and stamps the exception with it — the green tag now shows "✓ count accepted 07/28 · {approver}" so the count is attributed to when it really took place, not the close date.',
  'var-0 fix now flows through the Change Monitor BASELINE too: the nightly baseline auto-lock (eom-snapshot cron) reads per-item variance from the raw item ledger (posts the instant a manager submits) instead of the lagging aggregate Variance/Stat report — so both sides of the day-over-day diff use the same immediate as-counted variance the live side already uses. Re-lock a baseline to see it apply.',
]};
