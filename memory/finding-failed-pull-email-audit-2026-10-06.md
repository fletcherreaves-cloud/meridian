---
name: finding-failed-pull-email-audit-2026-10-06
description: Owner reported "a lot of emails" from failed scheduled pulls. Audited the last ~8 days of GitHub Actions failures (100 most recent). Top cause is a known, still-UNRESOLVED issue (QSRSoft Security Events Pull, 0 rows ever, dispatches #81/83/91/95) plus a sibling (Register Audit Pull, same 401-on-everything signature). An account-permission theory built from a stale memory/qsrsoft-report-catalog.md capture was raised, then REFUTED the same day -- the owner checked QSRSoft's own admin UI live and the account has Director of Operations + System Administrators roles with Security Access explicitly toggled on. Real cause still open; next step needs the owner's own live-browser test (does the report load interactively for this confirmed-correct account?). Cadence dropped from every 2 hours to once daily (owner-requested) to cut email volume ~12x while this stays open. Separately found and fixed a real, different, actually-resolved bug: YouTube Mentions Pull crashed on every run that found new content because its workflow pinned Node 20, and a bare createClient() throws setting up Supabase's Realtime sub-client on Node 20 (no native WebSocket) -- before the real upsert ever runs, so found content was silently never saved. "Sync Failure Watch" showing up as a top failure source is a false alarm -- those are concurrency cancellations, not errors.
metadata:
  node_type: memory
  type: finding
---

# Why the inbox is full: an audit of recent failed-pull emails (2026-10-06)

## Method

Pulled the 100 most recent `status=failure` GitHub Actions runs (`gh api
repos/.../actions/runs?status=failure`), which spans roughly 2026-09-29 → 2026-10-06 (8 days).
Counted by workflow name, then pulled actual job logs (`get_job_logs`) for the top offenders
instead of guessing from the workflow name alone.

```
32  QSRSoft Security Events Pull
16  Sync Failure Watch
 8  QSRSoft Register Audit Pull
 7  YouTube Mentions Pull
 5  QSRSoft Menu Item Activity Pull
 4  CI
 3  QSRSoft eBOS Purchases Pull
 3  QSRSoft On-Hand Pull (EOM count-progress)
 3  LifeLenz Daily Sync          <- the already-fixed #1385 outage window
 2  QSRSoft Menu Price Comparison Pull / McDelivery / LifeLenz Attendance
 1  each: Store Controls, Punch Times, Product Outage, Product Mix, Menu Item Recipe,
     Live Pulse, KB Pull, Inventory Summary, Employee Roster, Digital App, LifeLenz
     People Skills, Hourly Projection Accuracy, EOM Baseline Snapshot
```

## 1. QSRSoft Security Events Pull — the dominant cause, and NOT new

**32 of the last 100 failures, from a 2-hour cron (12 runs/day) — this one stream alone accounts
for roughly a third of all recent failure emails.** Pulled the actual log for the latest run
(`37452586006`): every single requested unit across every store and every date in its retry
window (`2026-09-22` → `2026-10-06`) came back `AUTH_FAILED:403`. Verbatim:
`[secevents-pull] ✗ zero rows saved across 3240 requested unit(s) -- a quiet no-op, not a success.`

This is **not a regression** — it is the same issue tracked across dispatches #81, #83, #91, #95
(`memory/dispatch-95.md`). Re-measured live right now: `qsr_security_events` still has
**zero rows, full history, right now** (`content-range: */0`, same calibrated service-role query
dispatch #95 used). The fix tried in #95 (move from daily to a 2-hour cadence, on the theory that
failures were a time-correlated flake and more windows/day would eventually catch a good one) has
not worked — it has been producing **12 failure emails a day with zero successful rows** for
weeks since.

The script's own code (`scripts/qsrsoft-security-events-pull.mjs:300`) already distinguishes a
403 "AccessDenied" (an authorization verdict) from a token-expiry 401/403 and deliberately does
NOT re-mint/retry on it — so this isn't a token-TTL problem the code is mishandling. A 100%
failure rate across *every* unit, not a partial split, points at an **account-level entitlement
problem on the QSRSoft side** (the service account's role no longer has access to the Security
Events / Controls report), not something fixable from this repo.

## 2. QSRSoft Register Audit Pull — looks like the same root cause, different report

8 failures. Pulled the full log for `37497089014`: the direct-token path gets a clean `401
Unauthorized` from QSRSoft, the script correctly force-re-mints a fresh token and retries — **401
again** — then falls all the way back to the Playwright browser-login path. The login itself
*succeeds* (`[auth] post-login url: https://v3.myqsrsoft.com/`, i.e. it's really authenticated),
but the report's own API calls inside that authenticated session **also** come back 401.

So two independent report pulls (Security Events, Register Audit — both live under QSRSoft's
"Controls" reporting family) are being denied with the exact same "fully authenticated, still
denied" signature, while reports outside that family (eBOS, DAR, FOB, Menu Items, Employee
Roster, etc.) mostly succeed. `QSRSoft Store Controls Pull`'s one "failure" in this window was
actually a concurrency *cancellation* (see #3), not a new data point either way, but it's the
third stream in this same report family and worth checking if/when the Controls permission gets
restored.

**The likely shared cause has an exact answer already on file, found instead of re-guessed:**
`memory/qsrsoft-report-catalog.md`, captured 2026-08-14, records QSRSoft's own RBAC groups —
`Office Manager` · `Maintenance` · `Operations Manager` · `Owner Operator` ·
`Director of Operations` · `System Administrators` — and that **`security_access` (the
permission the Security Events/Controls console requires) is granted only to
`Director of Operations`** (plus the owner's own separate permission set), not to Owner Operator,
Operations Manager, or Office Manager. The same capture records the account's SAML role as
**`Franchisee Office Staff`** (per-store role `Operator`) — none of the roles that carry
`security_access`. This looked like the answer: it matched the owner's own instinct ("pretty sure
we have struggled with this from day 1") and explained why `qsr_security_events` has zero rows
across its entire history.

**❌ WRONG — checked live and refuted same day, 2026-10-06.** Owner opened QSRSoft's own Users
admin screen for the account (Fletcher Reaves) and sent screenshots: **4 roles checked —
`Director of Operations`, `Operations Manager`, `Owner Operator`, `System Administrators`** — and
on the Permissions tab, **`Security Access` is explicitly toggled ON**. The account has full,
correctly-provisioned access by every measure QSRSoft's own UI exposes. The `qsrsoft-report-
catalog.md` capture this reasoning rested on is either stale (captured 2026-08-14, access may
have changed since) or was describing a different identity context — its `SAML role` field is
almost certainly McDonald's corporate SSO/SAML identity (used for McD-wide systems), a SEPARATE
permission system from QSRSoft's own native in-app RBAC the Users admin screen shows and that the
username/password-driven Cognito login this script's auth path actually uses is governed by. The
two should not have been conflated as the same "role."

**So the account-entitlement theory is RULED OUT, not confirmed — the real cause of the 100%
AUTH_FAILED:403 is still open.** With permission confirmed correct, the remaining live
candidates: (a) a session/device-trust or step-up-auth requirement on the Security/Controls API
surface specifically that an automated Cognito-token or Playwright-session login can't satisfy
even though the login itself succeeds; or (b) dispatch #81/83's original transport/anti-bot
fingerprint territory, not actually overturned as cleanly as #83 concluded (that overturn rested
on ONE successful curl from the owner's own Mac/network, and #91/95 then documented continued
failures afterward). **Next useful experiment, and it needs the owner's own live browser
session:** open the Security Events and Register Audit report pages interactively, logged in as
this same (confirmed-correct) account, and confirm whether they load with real data. If they do,
that cleanly isolates the problem to the automated/programmatic path specifically, not the
account — the single most informative next data point, and not something this repo's own
investigation can produce without it.

**Cadence reduced 2026-10-06** (owner: "reduce the cadence while I sort out QSRSoft
permissions") — `qsrsoft-security-events-pull.yml` dropped from every 2 hours (12 emails/day) to
once daily (`0 11 * * *`), cutting volume ~12x. The #95 Track B "run-level-correlated flake"
theory the 2-hour cadence rested on is now superseded by this finding (a missing entitlement
fails identically regardless of time-of-day, which is exactly what was re-measured). **Do not
restore a tighter cadence on a guess** — re-verify via `workflow_dispatch` once the owner
confirms the QSRSoft role change took effect. Did not go further and pause the schedule entirely
(still runs once/day) — that stays a real signal for the moment the owner's QSRSoft fix lands,
without the 12x email cost of the old cadence.

## 3. "Sync Failure Watch" showing 16 failures — a false alarm, not a bug

Checked `37373601220` (one of the 16): job `conclusion` is `cancelled`, not `failure` — GitHub's
run-list `status=failure` filter buckets cancelled runs in with real failures. This workflow
triggers on `workflow_run` completion of every pull workflow, and with ~25 pull workflows firing
throughout the day (several of them long-running, like the 30-90 minute QSRSoft Playwright pulls),
it gets re-triggered faster than each run finishes and the newer trigger cancels the older one —
ordinary concurrency behavior, not an error. Same for `QSRSoft Store Controls Pull`'s one entry in
this window. **Not actionable, no fix needed** — but worth knowing when skimming the failure list
so it isn't mistaken for 16 more real incidents.

## 4. YouTube Mentions Pull — a real, different, now-fixed bug

7 failures, and genuinely wrong every time it had something to report. Full log for `37370294596`:
the pull itself worked completely (`27 searches · 2 videos · 2 rows (2 attributions)`, a real
video found and correctly attributed to a store), then immediately:
```
[yt-pull] fatal: Node.js 20 detected without native WebSocket support.
```
`scripts/youtube-pull.mjs:115` calls a bare `createClient(SB_URL, SB_KEY, ...)` — **right before**
the actual `.upsert()` call, after all the real work (search, classify, attribute) is already
done. `.github/workflows/youtube-pull.yml` pinned `node-version: '20'`, and on Node 20 (no native
`WebSocket` global) a newer `@supabase/supabase-js` throws while eagerly setting up its Realtime
sub-client — even though this script never uses Realtime at all. This is the *exact* failure mode
`scripts/lib/safe-supabase-client.mjs`'s own header comment already documents from a different
incident (#399-adjacent, 2026-08-30) — just never connected to this workflow before now.

**The practical effect: every run that found new content crashed before the upsert could ever
run, so the finding was silently never saved** — not just a failed run, a real content-loss bug,
on top of the email. A run with nothing new to report returns early (before reaching
`createClient()`) and succeeds silently, which is why this looked intermittent rather than
systemic.

**Fixed**: bumped `youtube-pull.yml`'s `node-version` from `'20'` to `22` — matching
`news-rss-pull.yml` (the sibling workflow that already feeds the same `news_mentions` table) and
every other active pull workflow in this repo. No code change needed in the script itself; the
crash was purely the runtime version. Checked the other two Node-20-pinned workflows
(`lifelenz-vlh-explore.yml`, `lifelenz-vlh-sync.yml`) — neither of their scripts calls
`createClient` at all, so they aren't exposed to this bug; left them alone, scope stayed minimal.
`deploy.yml`'s Node 20 pin is an unrelated GitHub Pages deploy pipeline, not a data pull.

## 5. QSRSoft Menu Item Activity Pull — benign, lower priority, not fixed this pass

5 failures. Full log for `37499559538`: this is a **sequential 27-store pull where each store
takes ~90 seconds** (≈40 minutes total), and the Cognito eBOS token's ~1h TTL expires partway
through on a slow run — in this instance after 22/27 stores, with `11196 rows saved` for the 22
that completed before expiry (`[menu-item-activity] auth failed — refresh QSRSOFT_EBOS_TOKEN`).
This is a **mostly-successful partial run**, not a total loss like #1/#2, and a materially
different root cause (run-duration-vs-TTL race, not an authorization denial) — lower priority,
not addressed in this pass. If it keeps recurring, the fix would be either re-minting the token
mid-run (same pattern `qsrsoft-pull.mjs`/other converted scripts already use per-unit) or
chunking the store list across more than one scheduled run.

## Summary / what's actionable where

| Stream | Real cause | Fixable from this repo? | Status |
|---|---|---|---|
| QSRSoft Security Events Pull | Still unknown (not new, dispatch #81-95) — account permission theory was raised then REFUTED same day (owner confirmed Director of Operations + Security Access are both on) | No — real cause still open; next step needs the owner's live browser test | Cadence cut 12x → 1x/day while open; root cause not found |
| QSRSoft Register Audit Pull | Same likely cause as above | No — same | Flagged, not fixed |
| QSRSoft Store Controls Pull | Same report family; 1 sample was a cancellation, not data | No — same, watch once Controls access is restored | Flagged |
| Sync Failure Watch | Concurrency cancellation, not a real failure | N/A — not a bug | No action needed |
| YouTube Mentions Pull | Node 20 + bare `createClient()` crashes on Realtime init before upsert — real content silently lost | **Yes** | **Fixed** (`node-version: 22`) |
| QSRSoft Menu Item Activity Pull | Token TTL race on a long sequential run; partial success | Yes, but lower priority | Not fixed this pass |
