---
name: dispatch-81
description: Rebuild the security-events pull on Playwright in-browser fetch. Both its current auth paths make the request from Node, which today's finding proves can never reach api.security - so the script is wholly non-functional and always was. Also re-checks whether the self-hosted macOS runner is still needed, and a stale CLAUDE.md claim about api.reports.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #81 — the security-events pull cannot work, and never could

**Status:** ready to start. No owner input needed.
**Read first:** `memory/finding-api-security-transport-fingerprint-2026-08-23.md`. Nothing here
makes sense without it.

---

## What the finding changed

`api.security` rejects the **client**, not the credential. The owner's own working browser token
returns **403 from Node** on the same machine, same network, with Chrome's full header set. Source
IP, entitlement, token type, token contents, app client and headers are all ruled out. What is left
is TLS/HTTP-2 fingerprinting.

## 🔴 So `scripts/qsrsoft-security-events-pull.mjs` has never been able to work

Both of its auth paths end in a Node `fetch`:

- **Primary** — `getFreshToken()` → `runAll(token, …)` → Node fetch → **403, always**.
- **"Playwright fallback"** — launches Chromium, logs in, captures `x-auth-token`, then
  **`return await runAll(token, dates, tracker)`** (`:302`). It brings the token *back out* to Node
  and fetches from there. **Also 403, always.**

📌 **This is the trap worth naming.** The fallback *looks* like the browser path and is not one.
Using Playwright to obtain a credential and then leaving the browser is exactly as doomed as never
opening it — the browser is not the thing that gets you the token, **the browser is the thing that
has to make the request.**

The file's header comment also states the refuted theory as settled fact: *"#63 proved the 403 …
was a NETWORK-ORIGIN restriction (denied from GitHub-hosted runners, allowed from a consumer
connection)"*, and *"this host is token-only … a plain Node fetch with a minted token is the
primary path."* Both wrong. Rewrite the comment, don't just patch the code — the next reader will
believe it.

## The rebuild

**In-browser `page.evaluate()` is the ONLY path.** Copy the pattern from
`scripts/qsrsoft-dar-pull.mjs`, which already does exactly this for `api.reports` and is documented
in CLAUDE.md: explicit `X-Auth-Token` header, **no `credentials:'include'`**, and **one
`page.evaluate()` per request** — CLAUDE.md is explicit that a single evaluate with an internal
loop hangs with no output.

⚠️ **The standing two-path auth rule does NOT apply here, and this is a deliberate documented
exception.** CLAUDE.md requires "direct token → Playwright fallback" for new pulls. There is no
viable direct-token path for this host. **Do not keep a bare-fetch primary "just in case"** — it
cannot succeed, and leaving it makes every run look like a token problem. Say in the file why the
rule is being departed from, citing the finding.

⚠️ **Volume matters.** 27 stores × 8 tokens = **216 requests per day**, and one `page.evaluate()`
each. Whatever this cost as bare fetches, it will cost more. Measure the wall-clock on one day
before scheduling it, and if it is unreasonable, report that rather than batching into one evaluate
(see the hang above).

## Second question, and test it ONE VARIABLE AT A TIME

`.github/workflows/qsrsoft-security-events-pull.yml:52` pins
`runs-on: [self-hosted, macOS, qsr-security]`. **That runner was chosen because of the
network-origin theory, which is refuted.** If the discriminator is the client fingerprint and
Playwright ships real Chromium, a **hosted `ubuntu-latest`** runner may now work — which would
remove a self-hosted dependency from the estate.

🔴 **Test it properly.** This whole investigation cost six dispatches precisely because people
changed two variables at once. Get the rebuild working on the **self-hosted** runner first, prove
200s, and only then change **only** the runner and re-run. If it passes, drop the self-hosted
requirement and say so. If it fails, the network matters *as well as* the fingerprint — also a real
result, and one nobody currently knows.

## Third, small and separate

CLAUDE.md states: *"`api.reports.myqsrsoft.com` requires browser session cookies — server-side
Node.js fetch with token alone returns 401."* **Today's probe got 200 from bare Node** on
`api.reports/data_layer/v1/service/statistics` with a minted token and no cookies.

So that claim is at least route-specific and possibly stale. ⚠️ **Do not "fix" CLAUDE.md from this
one data point** — the DAR endpoints it was written about may genuinely still need the browser.
Probe two or three `api.reports` routes actually used by the pulls, then correct the claim to say
precisely which routes need what. A blanket statement in either direction is what caused this.

## Verification bar

A real run against a real day returning **200 and rows** — not a unit test with a mocked fetch,
which would pass against the current broken script too. Record the per-request wall-clock and the
total for one day in the PR body, since that decides whether a daily schedule is viable at all.

## Do NOT

- ⚠️ Do not keep the bare-fetch path as a fallback (see above).
- ⚠️ Do not extract the token from Playwright and fetch from Node. That is the current bug.
- ⚠️ Do not change the runner and the auth path in the same measurement.
