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

## #311

Stays open until scope 3 lands in full (all 14 scripts converted). Its
Playwright-fallback annotation idea becomes genuinely valuable once the direct path
works on a schedule and a fallback event is rare — close #311 *with* that annotation
built, not instead of it.
