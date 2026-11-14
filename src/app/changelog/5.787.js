// @ts-nocheck
export default {version:'5.787', date:'2026-11-14', changes:[
  '**QSRSoft Security Events Pull (GH #1532) — strategy fix: never request "today" at all.** ' +
  'Checked the real write timestamps before calling v5.785 done, and the "exactly one read ' +
  'per date, ever" theory doesn\'t fully hold up: every historical date has a full 24-hour ' +
  'spread of events (impossible if a date\'s only successful read happens at the 11:00 UTC ' +
  'cron, 1-2 hours into its own business day), and one date got a near-empty 2-row write one ' +
  'day then ~7,470 more two days later — a pattern that fits a per-identity daily request ' +
  'budget better than a strict per-date lock. Whichever it is, asking for "today" at 11:00 UTC ' +
  'is always wasted effort — the business day has barely started, so the read is either ' +
  'locked at a tiny fraction forever, or burns part of a scarce daily budget on an incomplete ' +
  'read. Every real date in this table\'s 5+ week history was captured complete the day AFTER ' +
  'it ended (as that day\'s "yesterday"), never via its own sliver. `getDateRange()`\'s default ' +
  'window now always ends at yesterday, never today — explicit backfill ' +
  '(`QSRSOFT_SECEVENTS_START_DATE`/`END_DATE`) is unaffected. `checkFreshness()`\'s thresholds ' +
  'shifted +24h (54h/78h, was 30h/54h) since the latest date is now intentionally ~2 days old ' +
  'right before a healthy run, not ~1. Full findings: ' +
  'memory/finding-security-events-reQuery-deny-2026-11-14.md.',
]};
