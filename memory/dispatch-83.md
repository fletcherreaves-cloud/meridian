---
name: dispatch-83
description: Rebuild qsrsoft-security-events-pull.mjs on a plain Node fetch with a full browser header set and getFreshToken(). A curl from the owner's Mac returned 200 and 23 rows, refuting the transport-fingerprint premise that six prior dispatches were built on. Deletes Playwright, the 216 page.evaluate() calls and the CORS problem outright. Three open questions to answer ONE VARIABLE AT A TIME.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #83 — rebuild security-events on a Node fetch. The browser was never needed.

**Reads first, in this order:** `memory/finding-api-security-transport-fingerprint-2026-08-23.md`
(**read the OVERTURNED banner at the top, not the body**), then `memory/dispatch-81.md`.

---

## 🔴 The premise of dispatch #81 is dead

#81 rebuilt this script on Playwright in-browser fetch because `api.security` was believed to
fingerprint the TLS/HTTP-2 client. **That is refuted.** On 2026-08-23 the owner ran a plain `curl`
from the Mac and got **HTTP 200 with 23 real event rows**. curl's TLS fingerprint resembles
Chrome's not at all.

Worse for #81: **the in-browser path is the one that fails.** Measured the same evening with the
#610 diagnostics — 216/216 units, preflight **403**, `No 'Access-Control-Allow-Origin'`,
`net::ERR_FAILED`. The browser cannot make this call cross-origin from `v3.myqsrsoft.com`; a
non-browser client can.

So this rebuild is a **simplification**, not a workaround. It deletes the Chromium launch, the SPA
login, the 216 `page.evaluate()` calls, the screenshot artifacts and the CORS problem in one go.

## The request that works

```
POST https://api.security.myqsrsoft.com/security/event_details/v1/{orgId}/{storeRef}?orgId={orgId}
```

Headers, as sent by the working curl — **send all of them initially**, then reduce (see Question 1):

```
x-auth-token: <FRESH token>
Content-Type: application/json
Accept: */*
Accept-Language: en-US,en;q=0.9
Connection: keep-alive
Origin:  https://v3.myqsrsoft.com
Referer: https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-site
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36
sec-ch-ua: "Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: "macOS"
```

Body shape is unchanged from what `buildBody()` already produces.

⚠️ **`Origin` and `Referer` are settable from Node and NOT from a browser** — they are forbidden
headers in the Fetch API, silently dropped in-page. That is very likely part of why the in-browser
attempt failed and the Node one works, and it is a good reason to stop trying to make the browser
do this.

## What to keep, and what to delete

**Keep, unchanged** — these are tested and orthogonal to the transport question:
`dateList()` (and its #607 validation), `extractRows()`, `buildUrl()`, `buildBody()`,
`parseSecurityEventRows()`, `tokenizeRows()`, `saveSecurityEventRows()`, `getLatestDate()`,
`getDateRange()`, the outcome tracker, and the loud-failure behaviour (`216/216 unit(s) failed` +
exit 1). **That last one earned its place tonight** — it is what turned a green no-op into a
visible failure.

**Delete:** `fetchOneInBrowser()`, `viaPlaywright()`, the Playwright import and launch, the SPA
login, the login-completion wait, the post-login diagnostics, the screenshot calls, and the #610
`requestfailed`/console listeners. All of it exists to serve a browser this no longer uses.

**Replace with:** one `fetchOne(storeRef, eventToken, date)` doing a Node `fetch` with the headers
above and `await getFreshToken()` **per unit of work**, exactly as `qsrsoft-ops-pull.mjs` does.

## Token handling — do not skip this

`QSRSOFT_TOKEN` as a stored secret is dead (~1 h Cognito TTL, #312). Use
`getFreshToken()` from `scripts/lib/qsrsoft-auth.mjs`, which is expiry-aware and exposes
`forceRemint` for a reactive re-mint on a 401.

📌 **This may be the whole original bug.** #588's fingerprint conclusion came from replaying "the
owner's own working browser token" from Node. If more than an hour separated capture from replay,
that token was simply **expired** — and every 403 across dispatches #58, #63, #65, #66, #67 and #70
may have been an expiry misread as a fingerprint. Worth knowing, and worth not repeating: **mint
fresh for every attempt.**

## The three open questions — ONE VARIABLE AT A TIME

⚠️ The wrong conclusion this dispatch exists to undo was produced by a **confounded test** that
varied client *and* network together. Do not repeat that.

**Q1 — which headers are load-bearing?** The curl sent 12. Nobody has removed any. Once the full
set works from the runner, drop them in groups and re-test: first `sec-ch-ua*` + `User-Agent`, then
the `Sec-Fetch-*` trio, then `Origin`/`Referer` **last** — the endpoint finding already suspected
Origin/Referer scoping, so those are the likeliest to matter. Record which set is minimal.

**Q2 — does it work from a hosted runner?** ⚠️ **The source-IP question is REOPENED.** curl
succeeded on the owner's Mac, on his network. The working configuration has never been tried from
`ubuntu-latest`. Test self-hosted **first** (matching where it is known to work), and only then
change `runs-on` and nothing else. If hosted works, the self-hosted runner requirement disappears
and `.github/workflows/qsrsoft-security-events-pull.yml` can drop its `runs-on:
[self-hosted, macOS, qsr-security]` pin.

**Q3 — was it always just token expiry?** Cheap to answer while doing the above: on the first
successful run, deliberately reuse a token older than ~1 h and confirm it 403s. If it does, say so
plainly — it retires the fingerprint theory completely rather than leaving it half-buried.

## Volume — much better than #81's

27 stores × 8 event tokens × 1 date = **216 requests**, but now plain HTTP with no browser. #81's
estimate warned about 216 `page.evaluate()` calls at unmeasured wall-clock; this should be closer
to the other pulls' per-request cost. **Record the wall-clock on the first successful day** — it
was never measured and it gates putting this on a daily schedule.

## Verification bar

CI cannot verify any of this — no QSRSoft credentials or network in the sandbox. The bar is a live
`workflow_dispatch`, **one date** (`start_date` = `end_date`, dashes — #607 now rejects slashes),
showing:

1. real `N row(s)` lines, not "no data" everywhere;
2. a non-zero final saved count, with `per-store: N/27`;
3. the wall-clock.

**Say plainly in the PR that live confirmation is outstanding** until that run exists. Do not claim
it works on a green CI — that is exactly what #81's PR was careful about, and it was right to be.

## Do not re-derive

- Credentials are fine — proven from a sibling workflow's log
  (`memory/finding-macmini-login-not-credentials-2026-08-23.md`).
- The Mac-mini login failure was a `waitForLoadState('networkidle')` race, fixed in #602. It is
  moot here since the login is being deleted, but do not go chasing Chromium drift.
- The date-window silent-zero bug is fixed in #607. Keep that validation.
