---
name: finding-macmini-login-not-credentials-2026-08-23
description: The Mac-mini Playwright login failure is NOT a credentials problem. The same QSRSOFT_USERNAME/PASSWORD secrets completed a full SPA login on ubuntu-latest 90 minutes earlier, in the DAR pull. Rules out the cheapest hypothesis for free, from a run that already happened. Also records that QSRSOFT_TOKEN is stale, so all 22 QSRSoft pulls are paying the Playwright cost on every run.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# The Mac-mini login failure is environment-specific, not a credentials problem

**2026-08-23.** Rules out the first hypothesis on the Mac-mini login investigation **without
running anything** — the evidence was already in a workflow log.

---

## The hypothesis being tested

The proposed first step was: *"confirm the `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` credentials are
current, since that's the cheapest thing to rule out first."* Right instinct. But it did not need a
manual test.

**22 workflows share those exact two secrets** (`grep -rl QSRSOFT_USERNAME .github/workflows/`), and
**21 of them run on `ubuntu-latest`** — `qsrsoft-security-events-pull.yml` is the only one on
`[self-hosted, macOS, qsr-security]`. So any recent green run of a sibling that actually reaches the
Playwright branch answers the question for free.

## The measurement

`QSRSoft Daily Activity Pull`, run `32660801315`, job `97246565933`, `ubuntu-latest`,
**2026-08-23 19:18 UTC** — roughly 90 minutes before the Mac-mini diagnosis:

```
[auth] trying direct server-side fetch with QSRSOFT_TOKEN…
[auth] QSRSOFT_TOKEN rejected (401/403) — falling back to Playwright
[auth] launching Playwright…
[auth] navigating to v3.myqsrsoft.com…
[auth] post-login url: https://v3.myqsrsoft.com/
[auth] daily activity url: …/reports/mcd/shift/dailyActivity | token captured: true
[auth] ✓ DAR token captured (1475 chars) — fetching 5 dates…
[dar-pull] done. 3240 rows upserted
[dar-pull] per-store: 27/27 store(s) had at least one row upserted.
```

⚠️ **The token path failing is what makes this decisive.** Had `QSRSOFT_TOKEN` worked, the run would
have proven nothing about the username/password — it would never have reached the login. Because the
token was **rejected**, the run fell through to the Playwright branch and completed a **real SPA
login** with those secrets. `post-login url: https://v3.myqsrsoft.com/` is the app, not the login
page.

## Conclusion

| claim | status |
|---|---|
| `QSRSOFT_USERNAME` / `QSRSOFT_PASSWORD` are current and valid | ✅ **proven**, 2026-08-23 19:18 UTC |
| The Mac-mini failure is a credentials problem | ❌ **refuted** |
| The Mac-mini failure is environment-specific | ✅ by elimination |

`scripts/qsrsoft-dar-pull.mjs` and `scripts/qsrsoft-security-events-pull.mjs` log in to the **same
host** (`v3.myqsrsoft.com`), with the **same secrets**, the **same Playwright API** and
**equivalent selectors**. One works on a hosted runner; the other does not work on the Mac mini.
The variable is the **machine**, not the credentials and not the login code.

⚠️ **This does not mean the Mac mini is unnecessary.** That is a separate question, and the
transport-fingerprint finding is what bears on it. This finding is narrow: it removes ONE branch of
the investigation.

## Where to look instead

Ordered by how cheaply each can be falsified, not by likelihood — none of these is yet measured, so
treat every one as a hypothesis, per the standing rule:

1. **Chromium/Playwright version drift on that host.** The hosted runner downloaded
   `Chrome for Testing 149.0.7827.55 (playwright chromium v1228)` fresh on this very run. A
   self-hosted runner reuses whatever is cached in `~/.cache/ms-playwright`. Log the resolved
   browser build on the Mac mini and compare — one line, and it is the difference the hosted-vs-self
   comparison most obviously has.
2. **Device-unfamiliarity challenge.** The reported signature — submit fires, *"Signing in…"* hangs,
   then bounces back to a **blank** login form — is what an MFA / new-device / risk challenge looks
   like when the automation cannot answer it. A hosted runner hitting the same endpoint from a
   datacenter IP may be treated differently from a residential one, in either direction.
3. **Stale browser profile / storage state** on the self-hosted runner, which a fresh hosted runner
   never has.

📌 **#560's post-login diagnostics already print what distinguishes these** (`document.title`,
login-form-still-present, `localStorage` key NAMES, `role="alert"` text, request counts) and were
deliberately preserved through the #593 merge. **Read those from the next Mac-mini run before adding
any new instrumentation.**

## ⚠️ CORRECTED 2026-08-23 — the section below was wrong, keep reading

The section that follows told you to **refresh `QSRSOFT_TOKEN`**. **Do not.** That advice was
wrong, and #312 had already settled it on 2026-08-15, five days before this file was written —
the same not-reading-the-corpus failure this session had already committed once tonight.

From `scripts/lib/qsrsoft-auth.mjs`'s own header, verbatim:

> `QSRSOFT_TOKEN` and `QSRSOFT_COGNITO_TOKEN` are the same credential, a Cognito ID token with a
> **~1h TTL** — so a token STORED as a GitHub secret is expired **~23 of every 24 hours**, and
> every scheduled pull that reads one has been falling straight through to its Playwright
> fallback, **by construction, no matter how often the secret is rotated.**

So `[auth] QSRSOFT_TOKEN rejected (401/403)` is the **expected steady state**, not degradation.
Rotating the secret buys about an hour. There is no "stale token" to fix.

**The actual work item** is the migration that already exists and is half done:
`scripts/lib/qsrsoft-auth.mjs` mints a token in-process per run (expiry-aware, re-mints when the
`exp` claim nears, plus a reactive `forceRemint` on a 401). Measured 2026-08-23:

| | count |
|---|---|
| scripts using the shared `getFreshToken()` lib | **5** |
| scripts still reading `process.env.QSRSOFT_TOKEN` | **11** |

Converting the remaining 11 is the fix. `qsrsoft-ops-pull.mjs` is the reference conversion.

⚠️ **CLAUDE.md's QSRSoft token-refresh runbook is stale for the same reason** and should stop
telling people to rotate this secret. (The **LifeLenz** token runbook next to it is unaffected —
that one is a genuinely long-lived token and does need manual refresh.)

The one thing the section below got right: the fallback absorbing this silently is the #171 shape.
But the fix is the migration, not an alarm on an expected condition.

## ~~Second, unrelated finding in the same log: `QSRSOFT_TOKEN` is stale~~ (superseded — see above)

`[auth] QSRSOFT_TOKEN rejected (401/403)` means the direct-token fast path is dead, so **every one of
the QSRSoft pulls is falling through to a full Playwright launch on every run** — downloading and
starting Chromium, ~25 s of browser install plus login, per workflow, per run, many times a day.

Not an outage (the fallback works, hence nobody noticed), but it is pure waste and it removes the
safety margin the two-path design exists to provide. CLAUDE.md carries the refresh runbook: DevTools
→ Network → any `api.reports.myqsrsoft.com` or `v3.myqsrsoft.com` request → copy the `X-Auth-Token`
header → update the GitHub Secret.

⚠️ **Silent degradation of exactly the kind #171 is about** — a fallback quietly absorbing a failed
primary, with nothing alarming. Worth considering whether a rejected `QSRSOFT_TOKEN` should warn
rather than only log.

## Method note

The general form, worth reusing: **before testing a shared credential by hand, check whether a
sibling job already exercised it.** 22 workflows share these secrets and most run several times a
day, so the answer to "are these credentials current" is almost always already sitting in a log —
free, and with no risk of the test itself perturbing the thing being tested.
