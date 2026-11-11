---
name: finding-register-audit-pull-403-explicit-deny-2026-11-11
description: QSRSoft Register Audit Pull (scripts/qsrsoft-register-audit-pull.mjs, feeds audit_rows -> CASH-001..004 security rules) has been failing EVERY run since 2026-09-21 (issue #1314, 51 comments, still open) -- root-caused from the real job log (run #102, 2026-11-10): the pull's own auth works fine (token captured via Playwright login), but the actual Register Audit report API call returns 403 "User is not authorized to access this resource with an explicit deny in an identity-based policy." This is a QSRSoft-side report-permission revocation for the QSRSOFT_USERNAME service account specifically, not a code bug or an expired-token issue -- the same account's login and other reports (ops-pull, DAR-pull) succeed daily. Company-wide: audit_rows has had ZERO new rows since 2026-09-19 (every store, confirmed via normalized loc query) -- CASH-001/002/003/004 have not meaningfully recomputed in ~8 weeks, which is why a 2026-11-11 investigation into a reported CASH-003 finding at store 38609 found no matching data in security_findings at all. Requires an action in QSRSoft itself (owner), not a code fix -- read before re-diagnosing this as a token-refresh issue or attempting another code-side fix.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Register Audit Pull dead since 2026-09-21 — QSRSoft-side 403 "explicit deny," not a token problem

## How this was found

Investigating the owner's report "After relooking at CASH-003, Lauren still does not show up" (store
38609/Freeport), the live `security_findings`/`security_findings_latest` tables were queried
directly (service-role + Management API). Measured, step by step:

- `security_findings_latest` (the view the Security panel actually reads) returns 0 rows for
  CASH-003 at any loc when queried via service-role/Management API — **expected**, not a bug: its
  own view definition gates on `get_my_role()` (`select role from profiles where id = auth.uid()`),
  which is `null` outside a real signed-in user session. Confirmed by reading the view's SQL
  directly (`pg_get_viewdef`).
- Replicated the view's own `DISTINCT ON (tenant_id, loc, subject_key, rule_id) ... ORDER BY
  window_end DESC, computed_at DESC` logic directly against the base `security_findings` table
  (role-independent) for store 38609: **every one of ~33 subjects' latest CASH-003 finding has
  `value: 0, pass: false`.** Zero `pass=true` CASH-003 rows have EVER existed for this store, in
  the rule's entire history.
- Checked whether this was a CASH-003-specific engine bug: grouped `security_findings` by `rule_id`
  for store 38609. **CASH-001 through CASH-004 all stopped updating on 2026-10-17**, while
  INV-001/002/003, EVENT-004 and LABOR-001/002 at the same store kept computing fresh results
  through 2026-11-10. Same four-rule freeze, same date, pointed at a shared upstream input: all
  four CASH rules read `audit_rows` (the Register Audit pull).
- Checked `audit_rows` freshness directly, normalizing `loc` to strip the known leading-zero
  duplication (`memory` already documents this same-event-two-loc-formats bug from an earlier pass
  this session): **every single store's newest `audit_rows.date` is 2026-09-19 — company-wide, not
  isolated to one store.** `select max(date) from audit_rows` for the whole table: `2026-09-19`.
- That pointed straight at the pull script. `qsrsoft-register-audit-pull.yml`'s last 5 runs (as of
  2026-11-10) are **all `conclusion: failure`**, and `sync-failure-watch.yml` already caught it:
  **issue #1314, opened 2026-09-21T16:22:22Z, still open, 51 comments**, last updated
  2026-11-10T17:38:27Z. The watcher did its job; nobody had root-caused the failure itself in the
  seven weeks since.

## Root cause — read from the real job log, not inferred

Run #102 (2026-11-10, job 130006735102), `QSRSOFT_AUDIT_DEBUG` off:

```
[audit-pull] 401 body: {"message":"Unauthorized"}
[audit-pull] 2026-09-15..2026-10-05:cashier: cached token rejected — forcing a re-mint and retrying once
[audit-pull] 401 body: {"message":"Unauthorized"}
[auth] mint-and-fetch failed (AUTH_FAILED:401) — falling back to Playwright
[auth] post-login url: https://v3.myqsrsoft.com/
[auth] report page url: https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit | token captured: true
[auth] ✓ token captured (1475 chars)
[auth] pulling 3 chunk(s) via the browser context…
[audit-pull] browser-context 403 body: {"Message":"User is not authorized to access this resource with an explicit deny in an identity-based policy"}
[auth] ✗ browser-context pull failed: AUTH_FAILED:403
[audit-pull] done — 0 rows saved.
```

**This is not an expired-token problem.** The two-path auth (direct token → Playwright fallback)
behaves exactly as designed: the stale cached token correctly gets rejected (401), the script
correctly re-mints via Playwright, login succeeds, a FRESH token is captured, and the script
correctly navigates to the real Register Audit report page first (`token captured: true` after
landing on `.../controlsCash/registerAudit`). The failure happens on the next step — the actual
data API call with that fresh token — and it is a **403 with an AWS-style "explicit deny in an
identity-based policy"** message, not a 401. An explicit deny is QSRSoft's own authorization layer
saying this specific account is **not permitted to access this specific report**, independent of
whether its login/token is valid. The `QSRSOFT_USERNAME` account can clearly still log in and
reach other reports (the same credentials' ops-pull and DAR-pull succeed daily on the exact same
account) — only the Register Audit report itself is denied.

**This means the fix is not in this codebase.** No amount of token-refresh logic, retry handling,
or auth-path rework changes an explicit-deny response from QSRSoft's own permission system. This
needs **the owner (or whoever administers the `QSRSOFT_USERNAME` account's role in QSRSoft) to
check that account's report permissions** — specifically, whatever QSRSoft calls the Controls →
Cash → Register Audit report access, and restore it if it was revoked, downgraded, or moved behind
a different role tier around 2026-09-19 to 09-21. Worth checking QSRSoft's own admin/permissions
audit log for that window if one exists, since the timing is precise enough to likely correlate
with a specific account or role change on their side.

## What this costs, concretely

- **Zero register-audit data (manual refunds, POS over-rings, T-Reds via this specific feed, cash
  drawer-open/meal-discount figures) company-wide for ~8 weeks**, across all 27 stores.
- **CASH-001 (T-Red), CASH-002 (POS over-ring), CASH-003 (manual refund), CASH-004** have all been
  silently frozen since 2026-10-17 (the last day the batch had any real new data to fold into its
  rolling windows before the window's own trailing data fully aged out) — the Security panel's Cash
  domain has been running on stale information this entire time without any of them surfacing as
  "stale" the way a dead stream normally would, because the daily batch job itself keeps completing
  "successfully" (it just increasingly has nothing new to compute).
- Whatever the owner saw on-screen for CASH-003 at store 38609 (8 named subjects, no Lauren, with
  recent-looking window-end dates) **does not match any row in `security_findings` for that rule
  and store, at any point in its history** — the most likely explanation is a stale client-side
  cache (an old loaded snapshot from before this gap, or from a different rule/panel state), not a
  live, currently-computed result. Not fully resolved — the exact stale-cache mechanism wasn't
  tracked down further since the bigger, more urgent finding (register-audit pull dead for 8 weeks)
  took priority. If this resurfaces, check what the Security panel's own data-loading path caches
  client-side (IndexedDB/localStorage) before re-querying the database again.

## Status

Reported to the owner 2026-11-11, not yet fixed — needs a QSRSoft-side permissions check the
owner has to do themselves, not a code change. Issue #1314 (open since 2026-09-21) is the tracking
issue; commented there with this diagnosis so the next person who looks doesn't re-walk the same
token-refresh dead end the bot's 51 auto-comments imply without this context.
