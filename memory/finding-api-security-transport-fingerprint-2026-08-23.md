---
name: finding-api-security-transport-fingerprint-2026-08-23
description: SETTLED. api.security 403s are transport-layer client fingerprinting, not auth. The owner's OWN working browser token returns 403 from Node on the same machine, same network, with Chrome's full header set. Overturns both the source-IP conclusion and the two-different-tokens hypothesis. Token-based Node automation cannot reach this module; Playwright in-browser fetch is the only path.
metadata:
  node_type: memory
  type: finding
---

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
