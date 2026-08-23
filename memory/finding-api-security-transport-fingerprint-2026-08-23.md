---
name: finding-api-security-transport-fingerprint-2026-08-23
description: ⚠️ OVERTURNED 2026-08-23 (same day). This file concluded api.security 403s were transport-layer client fingerprinting and that Playwright in-browser fetch was the only path. BOTH ARE WRONG -- a plain curl from the owner's Mac, with a full browser header set and a FRESH token, returned 200 and 23 rows. curl is not a browser, so fingerprinting is refuted. In-browser fetch actually FAILS (CORS). Read the correction block at the top before using anything in this file.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# ⚠️ OVERTURNED THE SAME DAY — read this before anything below

**This file's two headline conclusions are both wrong.** Left intact below rather than deleted,
because the reasoning is instructive and because a deleted claim cannot be un-believed by someone
who already read it.

| this file said | actually |
|---|---|
| The 403 is **transport-layer client fingerprinting** (JA3/JA4) | **Refuted.** A plain `curl` — whose TLS fingerprint resembles Chrome's not at all — returned **200 and 23 rows**. |
| **Playwright in-browser fetch is the only path** | **Backwards.** The in-browser fetch is the one that *fails*: 216/216 CORS-blocked, `net::ERR_FAILED`, preflight 403. |

## The measurement that overturned it

The owner ran a plain `curl` from the Mac against
`api.security.myqsrsoft.com/security/event_details/v1/{orgId}/35064`, POST, JSON body, with:

- `x-auth-token: <fresh token>`
- `Origin: https://v3.myqsrsoft.com`
- `Referer: https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit`
- `Sec-Fetch-Site: same-site`, `Sec-Fetch-Mode: cors`, `Sec-Fetch-Dest: empty`
- `User-Agent:` Chrome 150, `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`
- `Accept: */*`, `Accept-Language`, `Connection: keep-alive`, `Content-Type: application/json`

**Result: HTTP 200, 23 event rows.** Real data — `event_dt`/`event_tm`, `event_name`,
`tender_type`, `daypart_name`, `reg_num`, `event_amt`, `order_key`, `remaining_amt`,
`store_busn_dt`, plus crew/manager identity fields. (No response values are reproduced here; the
crew and manager fields are personnel data and route through `tokenizeRows()` on ingest.)

## What is PROVEN, and what is still open

✅ **Proven:** a non-browser HTTP client can reach this endpoint. Transport/TLS fingerprinting is
not the gate. The endpoint, org id, path shape, POST body and token mechanism all work.

❓ **Not yet established — do not assume:**
1. **Which headers are load-bearing.** The curl sent ~12. `Origin`/`Referer` are the obvious
   candidates (the finding below already suspected Origin/Referer scoping), and the `Sec-Fetch-*`
   trio is the other plausible group. **Nobody has removed them one at a time.**
2. **Whether it works from a GitHub-hosted runner.** This ran on the owner's Mac, on his network.
   The source-IP question is *reopened*, because the config that finally works has never been
   tried from a hosted runner.
3. **Why the earlier Node attempts 403'd.** Two live candidates, and the first is newly strong:
   - **A stale token.** `QSRSOFT_TOKEN` is a Cognito ID token with a **~1h TTL** (#312, confirmed
     again 2026-08-23). This file's own test replayed "the owner's own working browser token" from
     Node — if more than an hour separated capture from replay, it was simply expired, and every
     403 in the investigation below may have been an expiry, not a fingerprint.
   - **A missing header.** The earlier test claimed "Chrome's full header set," but the set was
     never enumerated in this file, so it cannot now be compared against the curl above.

## What to do instead

**Rebuild the pull on a Node-side `fetch` with the full header set and a token from
`getFreshToken()`** (`scripts/lib/qsrsoft-auth.mjs`), not on Playwright. That is simpler, drops the
216 `page.evaluate()` calls, drops the Chromium launch entirely, and is the only variant now known
to work.

⚠️ **Test one variable at a time**, in this order: self-hosted Mac runner first (matching the
environment where curl succeeded), and only then a hosted `ubuntu-latest` runner. Changing the
client *and* the network at once is precisely the confounded test that produced this file's wrong
conclusion in the first place.

⚠️ **Use a freshly minted token for every attempt.** Given the ~1h TTL, a 403 from a token of
unknown age proves nothing at all.

---

# ⬇️ ORIGINAL (WRONG) CONCLUSION FOLLOWS — retained for its reasoning only

# `api.security` is fingerprinting the CLIENT, not checking the token

**Settled 2026-08-23** by the owner, at the Mac mini, in one session. Closes the investigation that
ran across dispatches **#58, #63, #65, #66, #67, #70**.

---

## 🔴 The measurement that ends it

**The owner's own browser token — the one that returns 200 in Chrome — returns 403 from Node**, on
the same machine, on the same network, with byte-identical URL, body, and Chrome's complete header
set (`User-Agent`, `Sec-Fetch-*`, `Sec-Ch-Ua*`, `Accept-Language`, `Priority`, `Origin`, `Referer`).

One token. Two clients. **200 in Chrome, 403 from Node.**

The token was never the variable.

## Everything this rules out, and what killed each

| hypothesis | killed by |
|---|---|
| **Source-IP restriction** | minted token, **owner's own network** (Mac mini) → **403** |
| Entitlement gap / separate principal | identical `sub`, `permissionsAccess`, `orgAdmin`, `lastOrgId` |
| Wrong token type | ID token → 403, access token → 403 |
| Token contents differ | claim-name sets **byte-identical** between browser and minted |
| Different app client | `aud` identical (`2vt4qrqcakbeo9sh0ivli3lbui`) on both |
| Route-scoped denial | `video_provider` (same module) also 403 |
| Bad / expired token | same minted token → **200** on `api.reports/data_layer/v1/service/statistics` |
| **Token identity itself** | **browser's own working token → 403 from Node** |
| Missing request headers | full Chrome header set replicated → still **403** |

**What remains:** TLS fingerprint (JA3/JA4) and/or HTTP/2. Chrome negotiates HTTP/2 with a
distinctive ClientHello; Node's `undici` presents a different TLS stack and defaults to HTTP/1.1.
Headers cannot forge that. Consistent with the Akamai cookies seen in the owner's earlier cURL
captures — this is bot protection, not authorization.

## ⚠️ Two committed findings this overturns

1. **`finding-qsrsoft-security-entitlement-request-2026-08-22.md`** — its correction block states
   the 403 is *"a SOURCE-IP restriction… allowed from the owner's network and denied from GitHub
   Actions."* **Refuted.** That conclusion rested on a confounded pair: the two measurements
   differed in **both** token-origin **and** network. Holding the network constant (minted token
   from the Mac mini) still yields 403. That file has now been wrong twice — it was already
   superseded once — and should be read as history, not as a source.
2. **`dispatch-65.md:255`** — *"`api.security` is token-only, no session cookie."* Not refuted
   outright, but **no longer load-bearing**: cookies are irrelevant if the client is rejected before
   auth is evaluated at all.

📌 **The methodological lesson, and it is the one worth keeping.** Every prior dispatch changed two
variables at once — a different token *and* a different runner. Three dispatches of plausible
theories followed. **The decisive test held everything constant but one thing**, and it took about
two minutes once someone actually ran it.

## What this means for the build

**Token-based Node automation cannot reach `api.security`. Not from GitHub Actions, not from the
Mac mini, not with a perfect token.** No amount of header work, credential rotation, or IP
allow-listing changes it. Stop trying.

✅ **The path that works is already this repo's documented pattern for a sibling host:** Playwright
in-browser `page.evaluate()` fetch with an explicit `X-Auth-Token` header, exactly as
`scripts/qsrsoft-dar-pull.mjs` does for `api.reports.myqsrsoft.com`. Real Chrome, real fingerprint.

⚠️ **One caveat worth carrying:** CLAUDE.md says `api.reports` *"requires browser session cookies —
server-side Node.js fetch with token alone returns 401."* Today's probe got **200** from bare Node
on `api.reports/data_layer/v1/service/statistics`. So that claim is at least route-specific and
possibly stale. **Do not assume it generalises** — it is a separate thing to re-check, not
something to act on here.

## What is now unblocked, and what is not

- **PR #560 / dispatch #67 can close.** Its question — *"does the SPA's localStorage token work?"* —
  is answered: no, and neither would any other token. ⚠️ Do **not** merge its localStorage-reading
  change as a fix; it reads the right value for a request that will 403 regardless.
- **Register-audit / security-events automation** needs rebuilding on the Playwright in-browser
  pattern. That is a real piece of work and it should be scoped as its own dispatch.
- **The Playwright SPA-login capture failed twice** (#66 and again today — `[task1] no token
  captured`). That is a *navigation* problem, separate from this finding, and it stops mattering
  once the request is made in-browser: there is nothing to capture if you never leave the page.
