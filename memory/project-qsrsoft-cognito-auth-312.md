# QSRSoft Cognito auth — mint-per-run (#312)

## Finding chain

`QSRSOFT_TOKEN` and `QSRSOFT_COGNITO_TOKEN` are the same credential (owner-confirmed
2026-08-15): a Cognito ID token with a ~1h TTL. A value stored as a GitHub secret is
therefore stale ~23 of every 24 hours, and every scheduled QSRSoft pull that reads one
has been falling through to its Playwright fallback permanently, by construction —
rotation cannot fix that, only minting a fresh token per run can.

## Probe (workflow_dispatch, #314, merged, run [31906427264](https://github.com/fletcherreaves-cloud/meridian/actions/runs/31906427264))

Answered which Cognito `InitiateAuth` flow app client `2vt4qrqcakbeo9sh0ivli3lbui`
(pool `us-east-1_OdhPNFLDP`, region `us-east-1`) accepts:

```
Flow: USER_PASSWORD_AUTH
IdToken: yes
SecretHashRequired: no
ChallengeName: none
```

`USER_PASSWORD_AUTH` worked on the first attempt — a plain `fetch` POST, no SRP
needed. SRP was never exercised and is deliberately **not implemented** — an untested
fallback path is worse than none, since it would get its first real run on the day the
primary breaks. If `USER_PASSWORD_AUTH` ever stops being accepted, that's a deliberate
config change on QSRSoft's/AWS's side and deserves a real investigation, not a silent
second auth path. The probe script/workflow and the `amazon-cognito-identity-js`
dependency (added only to support the untested SRP fallback) were retired once the
question was answered — kept-but-unused would be exactly the dead weight the standing
rules warn against.

## Scope 2 — `scripts/lib/qsrsoft-auth.mjs`

`getFreshToken()` — mints a Cognito ID token via `USER_PASSWORD_AUTH`, cached for the
process lifetime only (one mint per pull run), never persisted to disk. The minted
token is the *same shape* `QSRSOFT_TOKEN`/`QSRSOFT_COGNITO_TOKEN` always were, so every
existing `fetchDirect()`-style call site keeps working unchanged — only the source of
the value changes, from a stale secret to a fresh mint.

## Scope 3 — one script converted, not fourteen

`scripts/qsrsoft-turnover-pull.mjs` (workflow `qsrsoft-turnover-pull.yml`, single daily
cron 11:30 UTC) is the first and, as of this PR, *only* converted script. Chosen for a
clean recent run history (19/19 green in the last 19 days) and a single schedule (no
multi-cron complexity). New ladder: `getFreshToken()` → Playwright fallback (unchanged).
`QSRSOFT_TOKEN`/`QSRSOFT_COGNITO_TOKEN` are no longer read by this script, and were
removed from its workflow's env block — the secrets themselves are NOT deleted (see
Scope 4 below).

**Measured, not inferred**, per the standing "measure it, don't reason about it" rule:
read the most recent pre-conversion run (31882938971, 2026-08-15 11:47 UTC) end to end.
Confirmed the exact failure the issue's premise describes:

```
[auth] trying direct fetch with QSRSOFT_TOKEN…
[auth] QSRSOFT_TOKEN rejected (AUTH_FAILED:401) — next method
[auth] trying direct fetch with QSRSOFT_COGNITO_TOKEN…
[auth] QSRSOFT_COGNITO_TOKEN rejected (AUTH_FAILED:401) — next method
[auth] direct token(s) unavailable/rejected — falling back to Playwright
```

Both stored secrets 401'd before the Playwright fallback ran, on every single day in the
run history checked — the "always falls through" premise is now measured on this
script, not just inferred from the ~1h TTL.

The remaining 13 scripts (`qsrsoft-ops-pull.mjs`, `qsrsoft-dar-pull.mjs`,
`qsrsoft-digital-app-pull.mjs`, `qsrsoft-ebos-pull.mjs`, `qsrsoft-employee-roster-pull.mjs`,
`qsrsoft-inventory-history-pull.mjs`, `qsrsoft-mcdelivery-pull.mjs`, `qsrsoft-onhand-pull.mjs`,
`qsrsoft-pull.mjs`, `qsrsoft-roster-stats-pull.mjs`, `qsrsoft-shift-manager-pull.mjs`,
`qsrsoft-variance-pull.mjs`, and whichever else remains) are a deliberate follow-up, once
turnover-pull has run green on its real 11:30 UTC schedule for several consecutive days.

## Scope 4 — HELD, do not delete the token secrets yet

`QSRSOFT_TOKEN`/`QSRSOFT_COGNITO_TOKEN` cost nothing to leave in place and are the only
thing standing behind the minted path if it fails at 5am for a reason not yet
anticipated (a Cognito throttle, a password change, an app-client setting edited
upstream). Delete them, and update CLAUDE.md's token-refresh runbook, only after the
converted scripts have run green on their real schedules for several consecutive days —
as a separate change, not bundled with a conversion PR.

## Correction found while doing the housekeeping pass

The dispatch for this PR claimed `qsrsoft-inventory-history-pull.yml` passes
`QSRSOFT_COGNITO_TOKEN` to a script that never reads it. Measured directly: it's stale.
`scripts/qsrsoft-inventory-history-pull.mjs` imports `resolveEbosToken` from
`scripts/lib/ebos-auth.mjs` (extracted 2026-08-14, PR #273 — predates #312 by a day),
and `resolveEbosToken()` reads exactly `QSRSOFT_COGNITO_TOKEN || QSRSOFT_TOKEN` for its
SSO-exchange rung. The env var is genuinely consumed, indirectly through the shared
lib — removing it would have silently broken that script's fastest auth rung. Left
untouched; not the state described in the original issue text.

## Scope 3 — second script converted: `qsrsoft-ops-pull.mjs` (#322)

Pulled ahead of the remaining-12 queue by #322: the owner's OT Cost tile reading "—"
everywhere turned out to be #303 correctly exposing that the auto stream feeding it
(`qsr_labor_summary.overTimeTotalHours`/`overTimeTotalDollars`) is empty in production,
not a display bug — traced end to end to this script's stale `QSRSOFT_TOKEN` read.

This script writes **five** tables (`qsr_cash_sheet`, `qsr_labor_summary` ×2 (labor +
labor-detail merge), `qsr_service_stats`, `qsr_sales_mix`, `qsr_peaks_sales`), across
**three** invocation modes (`QSRSOFT_CASH_ANOMALY_CHECK`, `QSRSOFT_PULSE_PULL`, default
full-ops/backfill) — all three read `process.env.QSRSOFT_TOKEN` directly and all three
converted to pass `getFreshToken` (the function) into `runAll()`.

**TTL cache made expiry-aware in this PR, not deferred** — unlike `turnover-pull`, this
script is backfill-capable (`QSRSOFT_OPS_START_DATE`/`END_DATE`, day-by-day loop) and
CLAUDE.md records a 27-month API backfill as routine at ~6.6s/day, ≈1.5h against the
token's ~1h TTL. A single mint-once cache would sail past expiry mid-backfill and start
401ing silently. `getFreshToken()` (`scripts/lib/qsrsoft-auth.mjs`) now decodes the
token's own JWT `exp` claim and re-mints proactively at a 5-minute margin (55-minute
assumed-TTL fallback if `exp` can't be decoded), plus a `forceRemint` escape hatch for a
caller that gets rejected despite a nominally-fresh cached token. `runAll()` resolves a
token per `(endpoint, date)` via a new `resolveToken()` helper rather than being handed
one static value up front, so a long backfill re-mints transparently instead of running
out mid-loop.

`QSRSOFT_TOKEN` removed from `qsrsoft-ops-pull.yml`'s env block (secret stays defined in
GitHub, per the Scope 4 hold above).

**Live verification** (`workflow_dispatch`, branch `claude/issue-312-scope3-ops-pull`,
run [31913030549](https://github.com/fletcherreaves-cloud/meridian/actions/runs/31913030549),
2026-08-15, against production Supabase + QSRSoft credentials, default gap-aware window
— no `AUTH_FAILED`/Playwright-fallback lines in the log, confirming the direct
`getFreshToken()` path worked end to end):

```
[ops] pulling 5 date(s): 2026-08-11…2026-08-15
[ops] cash → qsr_cash_sheet: 135 rows
[ops] labor → qsr_labor_summary: 135 rows
[ops] laborDetail → qsr_labor_summary: 135 rows
[ops] service 2026-08-15: no data
[ops] service → qsr_service_stats: 108 rows
[ops] salesMix → qsr_sales_mix: 135 rows
[ops] peaks → qsr_peaks_sales: 402 rows
[ops] done — 1050 rows upserted across 6 endpoints.
```

135 = 27 stores × 5 dates (cash/labor/laborDetail/salesMix, full coverage); service is
108 = 27×4 (2026-08-15 not yet finalized, consistent with this script's own documented
"service-stats confirmed NOT live" note); peaks 402 ≈ 27×5×3 dayparts (a few sparse
timeslots). All three of the dispatch's required checks confirmed directly against
`qsr_labor_summary` via the Supabase REST API: non-zero rows (1050 total,
2026-08-11→2026-08-15); `qsr_labor_summary` received 135 rows; `over_time_total_hours`/
`over_time_total_dollars` are present (non-null key) on all 135 store-days pulled, with
**23 of 135 store-days showing a real non-zero OT reading** (range 1.08–21.18 hrs,
$25.63–$437.49) — the exact thing the owner reported existing operationally that the
dashboard couldn't see. OT Cost should now render a real number (or a correct "—" only
on the ~112 genuinely-zero-OT store-days) instead of blanket "—" everywhere.

**Correction (found during the backfill addendum below):** this was originally
described as "anon key, RLS-honoring read." Wrong — this sandbox's local `.env.local`
has `VITE_SUPABASE_ANON_KEY` set to the exact same value as `SUPABASE_SERVICE_ROLE_KEY`
(both decode to `role: service_role`), so every read this session has made was already
full-access, not RLS-scoped. That's sandbox-only convenience, not representative of the
real anon key's production behavior — the check above is still correct as a *read of
what's in the table*, just not evidence about anon-key RLS either way.

Deliberately not touched, per the dispatch: `sync-failure-watch.yml` (this workflow is
already watched and already passing — the gap is that it can succeed while returning
zero rows, which is #269's completeness-ledger's job, not a missing watch entry); no
historical backfill run (owner's call on cost/runtime once the daily pull is confirmed
working).

## Backfill addendum — owner authorized "no gaps" (2026-08-15)

Owner: *"Backfill as much as needed to have no gaps."* Two-part scope: fill interior
holes in the already-covered range, and extend the start date to match sibling ops
streams (per CLAUDE.md, a table's `min(dt)` is when the pull first ran, not a real data
floor).

**Gap report tool**: `scripts/qsrsoft-ops-gap-report.mjs` (new, committed) — min(dt),
max(dt), row count, distinct-day count vs. expected calendar days, and missing interior
days as compact ranges, for all 5 tables. Requires `SUPABASE_SERVICE_ROLE_KEY` — an
anon-key `[]` read is RLS, not evidence of an empty table, and must never be reported as
a confirmed gap (this is the exact trap the addendum's own author hit). First draft of
this script had a real bug worth recording: PostgREST caps each response at 1000 rows
regardless of the requested `Range` size (confirmed via a manual probe — `Range: 0-9999`
came back `content-range: 0-999/*`), and treating "fewer rows than requested" as
"last page" silently truncated the query to just the oldest ~1000 rows, reporting a
false early `max(dt)` of 2024-05-10 for a table that actually had rows through
2026-08-15. Fixed by stepping in fixed 1000-row windows and stopping only on an empty
page.

**Before** (all 5 tables identical): floor 2024-04-01, ceiling ~2026-08-15, one shared
90-day interior hole 2025-01-01..2025-03-31. All five agreeing exactly on the same
single contiguous gap (not scattered per-table divergence) is consistent with a real
historical outage window.

**Sibling floor check**: `qsr_daily_activity` (DAR) reaches back to 2024-01-01,
`qsr_fob` to 2024-01-19, `qsr_ebos_daily` to 2024-01-21 — all ~91 days earlier than
these 5 tables' 2024-04-01 floor. Target: 2024-01-01 (DAR, earliest). Well inside the
addendum's ~3-year owner-check threshold, so extended without asking.

**Backfill**: two `workflow_dispatch` chunks against this PR's branch (so the
expiry-aware `getFreshToken()` fix was live for both, required by the addendum before
the first backfill dispatch), each well under the workflow's 120-minute timeout:

- [run 31913447998](https://github.com/fletcherreaves-cloud/meridian/actions/runs/31913447998): `2024-01-01..2024-03-31` (91 days, start extension) — 18,193 rows, ~4m45s.
- [run 31913691310](https://github.com/fletcherreaves-cloud/meridian/actions/runs/31913691310): `2025-01-01..2025-03-31` (90 days, interior hole) — 18,720 rows, ~4m38s.

No `AUTH_FAILED`/Playwright-fallback lines in either log.

**After** (all 5 tables identical): floor **2024-01-01** (now matches DAR exactly),
missing interior days **0**, 36,913 total rows added. Full before/after tables and the
gap-report output posted to PR #323 as comments (before: [comment
5304626064](https://github.com/fletcherreaves-cloud/meridian/pull/323#issuecomment-5304626064),
after: [comment
5304664692](https://github.com/fletcherreaves-cloud/meridian/pull/323#issuecomment-5304664692)).

**Open caveat**: these dispatches ran against the PR branch, not `main` — the historical
gap is permanently closed (writes are real), but `main`'s scheduled cron still carries
the stale-`QSRSOFT_TOKEN` bug until PR #323 merges, so a *new* gap can start
accumulating from 2026-08-15 forward until that lands.

## #311

Stays open until scope 3 lands in full (all 14 scripts converted). Its
Playwright-fallback annotation idea becomes genuinely valuable once the direct path
works on a schedule and a fallback event is rare — close #311 *with* that annotation
built, not instead of it.
