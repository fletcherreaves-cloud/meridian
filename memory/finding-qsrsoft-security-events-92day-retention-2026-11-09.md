---
name: finding-qsrsoft-security-events-92day-retention-2026-11-09
description: MEASURED -- api.security.myqsrsoft.com's event_details endpoint only retains ~92 days of history. Binary-searched the exact boundary live: 2026-08-08 returns 400 "Invalid date range", 2026-08-09 returns 200 with real rows. 2026-08-09 is exactly 92 days before the measurement date (2026-11-09). This is a real data floor on this specific endpoint, same category as the documented LifeLenz-Oklahoma-starts-Oct-2025 floor -- not a bug, not something CLAUDE.md's general "data depth is never the limiter" backfill guidance can route around, since the data genuinely isn't retained upstream past this window. Do not re-attempt a backfill before this date without re-measuring first (the window is almost certainly rolling, not fixed).
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# QSRSoft Security Events — ~92-day retention floor on `event_details`

## What happened

Attempting to extend `qsr_security_events`' history 90 days further back (2026-07-28 →
2026-10-25, beyond the already-landed 2026-10-26 → 2026-11-09 backfill from PR #1765/#1766)
failed immediately: **every single request from 2026-07-28 through 2026-07-31 returned
`400 Invalid request. Invalid date range`** — not an intermittent failure, not auth, not rate
limiting. Killed the bulk job after confirming this (727 failed requests, zero successes) rather
than let it burn ~19,000 more doomed requests over an estimated 90 minutes.

## Measurement

Binary-searched the real boundary with a tiny one-off probe (store 0003708, `all_promo` only,
one request per candidate date, deleted after use):

| date | result |
|---|---|
| 2026-07-31 | `400` |
| 2026-08-01 / 03 / 05 / 07 | `400` |
| 2026-08-08 | `400` |
| **2026-08-09** | **`200`, real rows** |
| 2026-08-15 / 31, 09-10 / 20 / 30, 10-05 / 10 / 15 / 20 / 25 | all `200`, real rows |

**The boundary sits exactly between 2026-08-08 and 2026-08-09.** Today is 2026-11-09 —
2026-08-09 is exactly **92 days** before the measurement. This is a clean round number, strongly
suggesting a deliberate ~90-day (13-week) retention policy on this specific endpoint, not a
coincidence or a per-store quirk (the five confirmed-good dates span the full range and multiple
months without a second failure).

## What this means

- **This is a real, hard data floor** — not the "manual upload stopped" or "emailed stream is
  forward-only" pattern CLAUDE.md's standing backfill rule exists to override. The data genuinely
  is not retained by QSRSoft past ~92 days on this endpoint. No amount of re-pulling recovers it.
  Same category as the one standing exception CLAUDE.md already names for LifeLenz/Oklahoma
  (system transition, data doesn't exist before it) — add this as a second named exception, not a
  gap to keep re-raising.
- **The corrected, actually-available backfill window is 2026-08-09 → 2026-10-25** (77 days,
  ~16,600 requests) — launched after this finding, not the originally-planned 90 days.
- **The window is almost certainly rolling**, not a fixed historical cutoff (no reason to expect
  QSRSoft hard-codes 2026-08-09 specifically). Re-measure the boundary before attempting any
  future backfill past what's already landed — don't assume today's ~92 days still holds next
  month.
- **Daily automation is unaffected.** The existing pull (`scripts/qsrsoft-security-events-pull.mjs`)
  only ever requests a rolling recent window (`DAYS_BACK`/`DAYS_RECENT`, default 14/2 days), far
  inside the retention floor. This finding only bounds how far *backward* a one-time historical
  backfill can reach, not ongoing daily coverage.
