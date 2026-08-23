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

---

## Resolution (2026-08-23)

**Built, from a sandbox with zero QSRSoft credentials and zero QSRSoft network access** (checked
first — no `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD`/`QSRSOFT_TOKEN` in env or `.env.local`). What
follows is exactly what that constraint allowed and exactly what it didn't — no live result is
fabricated below.

### What shipped (item 1 + the two comment fixes)

`scripts/qsrsoft-security-events-pull.mjs` rewritten so its **only** auth/fetch path is in-browser:
real Chromium SPA login → capture `X-Auth-Token` from a live request (same capture mechanism the
old Playwright-fallback already had) → **one `page.evaluate()` per (store, date, event_token)
unit** (`runSecurityEvents()` → `fetchOneInBrowser()`), the actual `fetch()` running inside the
page context with an explicit `X-Auth-Token` header and no `credentials:'include'`. The token never
crosses back into a Node-side `fetch()` — that was the exact bug being fixed. The old bare-Node
"primary" path (`getFreshToken()` → Node `fetch`) is deleted entirely, not kept as a fallback, per
the dispatch's explicit instruction — this file now has one path, not two, and says why in its own
header comment, citing this finding file.

Unchanged: the 27 `STORE_NSNS`, the 8 `EVENT_TOKENS` (imported from `src/engine/security-events.js`,
untouched), `getDateRange()`/`getLatestDate()` gap detection, `parseSecurityEventRows()` →
`tokenizeRows()` → `saveSecurityEventRows()` pipeline, and `buildUrl`/`buildBody`/`extractRows` —
same exported signatures, same behavior, now called from Node to build the URL/body (cheap, no
network) and then handed into `page.evaluate()` as data rather than used in a Node-side `fetch()`
directly.

Both stale comments the dispatch named are corrected in place, not just patched around:
- The script's own header no longer states the network-origin theory as fact, and no longer calls
  this host "token-only… a plain Node fetch with a minted token is the primary path." It now states
  the real cause (TLS/HTTP-2 client fingerprinting) and cites
  `memory/finding-api-security-transport-fingerprint-2026-08-23.md` directly.
- `.github/workflows/qsrsoft-security-events-pull.yml`'s header comment is corrected the same way,
  and its "NOT live-verified" note now says why for the *right* reason: not "no self-hosted runner
  and no QSRSoft network access from that sandboxed session" (the old, now-inapplicable reason —
  this workflow still targets the self-hosted `qsr-security` runner), but "this rebuild session had
  no QSRSoft credentials and no QSRSoft network access at all, so the live in-browser fetch path has
  never actually been run against the real API."

### What was explicitly SKIPPED, and why (dispatch items 2 and 3)

Both require live QSRSoft network access / the actual self-hosted runner, neither of which this
sandbox has. Skipped cleanly rather than guessed at, matching how other blocked sub-items in this
repo's dispatches get handled — the rest of the dispatch shipped, only these two did not:

- **Item 2 — hosted `ubuntu-latest` runner test.** Unattempted. The dispatch is explicit this must
  happen *only after* the self-hosted runner has already produced a real 200+rows run on the
  rebuilt code, changing **only** the runner label as the next, separate test. Neither half of that
  sequence is possible without live infrastructure.
- **Item 3 — probe 2–3 real `api.reports` routes to correct CLAUDE.md's "requires browser session
  cookies… token alone returns 401" claim** (CLAUDE.md:434-ish, the QSRSoft DAR API auth rule).
  Unattempted — needs live QSRSoft network access this sandbox does not have. CLAUDE.md is
  unchanged; that claim stands as-is pending a real probe.

### The core claim is UNVERIFIED — owner action items to close this out

Nothing in this PR proves the in-browser fetch actually reaches `api.security` and gets rows back.
CI can prove the code parses, the pure helpers still behave, and the full suite/build stay green —
it cannot prove the fix works, because that requires a real request from a real browser against the
real API, which only the owner (or the self-hosted runner) can produce.

**To confirm the fix (closes this dispatch):**
1. On the self-hosted `qsr-security` runner (already registered, always-on per
   `memory/dispatch-65.md`'s macOS checklist), trigger
   `.github/workflows/qsrsoft-security-events-pull.yml` via `workflow_dispatch` with a **small**
   explicit window (`start_date`/`end_date` set to one recent date) — do not let the first real run
   be a full 14-day backfill at 216 requests/day.
   - Confirm the SPA login succeeds and a token is captured (`[auth] ✓ token captured` in the log;
     `screenshots/secevents-01-post-login.png` / `secevents-02-report-page.png` as a visual
     backstop if it doesn't).
   - Confirm at least one `[secevents-pull] <unit>: N row(s)` line with a real 200 and rows — not
     just "no data", which is ambiguous between "worked, zero rows that day" and "never actually
     fetched."
   - **Record the wall-clock** — 216 `page.evaluate()` calls/day is real added cost the dispatch
     flagged as needing measurement; this PR cannot produce that number.
2. Only *after* step 1 shows real 200s: re-run the same workflow with **only** `runs-on` changed to
   `ubuntu-latest` (item 2, the dispatch's "second question") and compare. If it also 200s, the
   self-hosted requirement can be dropped in a follow-up PR; if it 403s, the network *does* still
   matter alongside the fingerprint — a real, currently-unknown result either way.
3. Separately (item 3, unrelated to this rebuild): probe 2-3 real `api.reports` routes the DAR/
   register-audit pulls actually use, and correct CLAUDE.md's blanket "requires browser session
   cookies" claim to say precisely which routes need what, per the finding file's own caveat that a
   single data point (the `statistics` route) must not be generalized.

### Verification bar actually met (the adjusted, sandbox-realistic one)

- `node --check scripts/qsrsoft-security-events-pull.mjs` — clean.
- `src/__tests__/qsrsoft-security-events-pull.test.js` — passes **unmodified** (all 6 tests); no
  signature change to `buildUrl`/`buildBody`/`extractRows` was needed.
- Full suite: `npx vitest run` — 2114/2114 passing, 199/199 files.
- `npm run build` — clean; entry-eager payload 517.40 KB gzip (budget 850 KB) — this script isn't
  imported by any client-side panel, so it has zero bundle impact regardless.
- Structural match to `qsrsoft-dar-pull.mjs`'s proven pattern, read carefully: per-unit
  `page.evaluate()`, explicit `X-Auth-Token` header, no `credentials:'include'`, no token ever
  reaching a Node-side `fetch()` — confirmed by inspection, not by a live run.

### Follow-up already exists — read before touching this topic again (2026-08-23)

The Mac-mini live-run failure this Resolution flagged as unverified (step 1 above) has already
been diagnosed and mostly fixed in two follow-ups. **Do not re-derive either result:**

- **`memory/finding-macmini-login-not-credentials-2026-08-23.md` (#600).** Rules out a stale
  `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` credential as the cause, using an existing log from a
  different workflow that shares the same secrets and succeeded ~90 min before the Mac-mini
  failure. **Superseded in part — see #602 below**, which corrects #600's own token-rotation
  advice in place (struck through, not deleted).
- **PR #602** (`claude/fix-secevents-login-race`, open as of 2026-08-23, not yet merged — check
  current state before assuming either fix is live). Two findings, from the run's own screenshot
  artifacts:
  1. **The login failure is a self-inflicted race, not an auth failure and not Chromium drift.**
     `waitForLoadState('networkidle')` is the wrong signal for this SPA login — the click fires an
     XHR, not a navigation, so `networkidle` can return before the auth request even completes,
     and the script then navigates away and aborts the in-flight login. Fix: wait for a real
     success signal (the Cognito `idToken` landing in `localStorage`, falling back to "password
     field is gone"), not a timing proxy. This is *why* the same credentials pass on
     `ubuntu-latest` (#600) and fail on the self-hosted Mac mini — machine speed, not machine
     identity. Retires the Chromium-drift and MFA-challenge hypotheses.
  2. **Do NOT rotate `QSRSOFT_TOKEN`** (correcting #600 and CLAUDE.md's own runbook, which was
     wrong to suggest it). It's a Cognito ID token with a ~1h TTL stored as a static secret — by
     construction it reads as expired ~23 of every 24 hours no matter how often it's rotated. The
     401/403 is the expected steady state. The real fix is converting the 11 scripts still reading
     the dead secret onto the shared `getFreshToken()` lib (`scripts/lib/qsrsoft-auth.mjs`, already
     used by 5 scripts; `qsrsoft-ops-pull.mjs` is the reference conversion) — separate work, not
     part of this dispatch.

  Neither fix in #602 is live-verified yet (same sandbox constraint as this dispatch — CI can't log
  in to QSRSoft). If picking this thread back up: check whether #602 merged first, and if not,
  that's the next step, not a fresh investigation.
