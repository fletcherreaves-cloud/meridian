# Dispatch #67 — the browser sends the localStorage ID token. Read it, don't intercept it.

**Status:** ready to start. Unblocked by a measurement taken 2026-08-22 after #66 closed.
**Read first:** `memory/dispatch-66.md` Resolution, and `memory/dispatch-65.md` CORRECTION #2.

---

## The measurement that unblocks this

Owner, in the browser console on `v3.myqsrsoft.com`, comparing the **exact `x-auth-token` value
from a working `event_details` request** against what is in `localStorage`:

```
matches idToken: true | matches accessToken: false
```

**The SPA sends the plain Cognito ID token, straight out of `localStorage`.** Nothing is minted at
click time, nothing is derived, nothing is wrapped.

### What this kills

#66's Resolution suggested the working capture might depend on **clicking into a specific
audit-row cell**, and recommended scripting that interaction. **That is no longer necessary and
should not be built.** The token exists in storage from login onward; the cell click merely causes
a request that happens to carry it. Scripting a click would add an untested variable to reach a
value we can read directly — exactly what #66's own warning cautions against.

## Task 1 — read the token from `localStorage`, then retry

In the Playwright fallback, after login completes, replace request-interception with a direct read:

```js
const spaToken = await page.evaluate(() => {
  const k = Object.keys(localStorage).find(k => k.endsWith('.idToken'));
  return k ? localStorage.getItem(k) : null;
});
```

Then retry `event_details` with it, **from the Mac mini runner**. That is the whole test.

- **200** → solved. The working credential is an SPA-login ID token; wire it in as the primary
  auth path and ship the pull. Report row count, store/date window, and confirm `crew`/`mgr` were
  tokenised.
- **403** → then two ID tokens for the **same principal, same app client** behave differently, and
  the difference is not in the token's contents. Report and stop; Task 2 is what narrows it.

⚠️ Keep the existing request-interception as a **fallback**, don't delete it. If `localStorage`
ever stops holding the token, a silent `null` would look identical to a failed login.

## Task 2 — the claim-name diff (do this regardless of Task 1's result)

`describeToken()` already computes `allClaimNames` and **still never prints it**. Print it, for
both our `getFreshToken()` token and the Playwright/localStorage token.

**The owner's working token's claim names, recorded 2026-08-22** (`dispatch-63.md:98`):

```
aud, auth_time, cognito:username, custom:authorName, eID, email, email_verified,
event_id, exp, iat, iss, jti, lastOrgId, orgAdmin, origin_jti, permissionsAccess,
sub, token_use, valid_eID
```

**Diff ours against that list.** A claim present there and absent from ours is a direct lead —
`lastOrgId` and `origin_jti` are the ones I would look at first, but do not pre-judge: report the
diff, don't theorise from it.

Names only. **No values** — no token, `sub`, `eID`, `email`, `cognito:username`, or
`custom:authorName` in any log, fixture, or memory file. Hashes and lengths where a comparison is
genuinely needed.

## ⚠️ The standing warning, still in force

This investigation has produced **two** wrong confident conclusions, both from comparing cases
that differ in more than one variable — the engineer's (two of our own tokens), then the PM's
(token *and* network at once, which drove #65's architecture until the first live run disproved
it). **Change one variable at a time, and say which one you changed.**

## Out of scope

- Scripting a cell-click. See above — it is now known to be unnecessary.
- Re-testing anything in `dispatch-63.md`'s elimination table.
- Contacting QSRSoft. Ruled out by the owner; the superseded entitlement request stays closed.
- `STREAMS` freshness wiring. Real and still needed, its own problem, do not ride it along here.

## Verification bar

- The **HTTP status** from the Mac mini using a `localStorage`-read SPA token, plus the first ~200
  chars of the body. One line, and it decides everything.
- The **claim-name diff**, both directions.
- On a 200: no plaintext name anywhere in the diff, logs, or fixtures.
- `npm run build` clean; `node -v` against `ci.yml`'s `[20, 22]` (#60).

---

## Resolution (2026-08-22) — a fourth outcome, not the one the brief planned for

Task 1 shipped (`a8b7542`): `viaPlaywright()` reads `Object.keys(localStorage).find(k =>
k.endsWith('.idToken'))` directly after login, prefers it over interception, keeps interception as
fallback. Task 2 shipped alongside it: the claim-name diff against `getFreshToken()`'s cached
bare token, names only. `npm run build` clean, 2027/2027 tests, `node -v` 22.

**Triggered from the Mac mini (run `32593065224`, runner `mac-mini-qsr`, `debug=1`) — the live
result is neither 200 nor 403. It's a third failure to get a token at all:**

```
[auth] post-login url: https://v3.myqsrsoft.com/
[auth] localStorage idToken read: false
[auth] report page url: https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit
  | nav error: (none) | interception token captured: false
[auth] ✗ no token from localStorage or interception during SPA login
```

Direct path (`getFreshToken()`) still gets the known, expected 403 first — consistent with every
prior run, not new. The claim-name diff never ran: it needs a `finalToken` to diff against, and
there wasn't one.

**Read exactly:** `Object.keys(localStorage).find(k => k.endsWith('.idToken'))` found nothing —
not a wrong value, an *absent key*. That is a stronger negative than #66's interception-only
result: interception only proves no `event_details`-bound request carried a token; a direct
`localStorage` read with no scoping proves Amplify (or whatever auth layer this SPA uses) never
wrote an ID token to this browser context's storage **at all**, under any key, following this
login sequence.

**This is the same post-login URL #66 already recorded** (`https://v3.myqsrsoft.com/`, bare
root) — not a new anomaly on its own; #66 read that as "login succeeded" without independent
confirmation beyond the click completing without an exception. Combined with this run's
`localStorage` result, that reading now looks like the weaker of two explanations, not the
stronger one: **the more consistent account of both runs together is that the Playwright-driven
login (`QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD`, this exact selector/click sequence) is not
completing authentication**, rather than "it authenticates but mints no token anywhere." Two
independent negative measurements (no token via interception in #66; no token via direct storage
read now) are more consistent with "never logged in" than with "logged in via some third
mechanism neither check can see."

**Flagging this as a hypothesis, not asserting it as a finding** — per the standing warning this
dispatch itself carries twice over: two wrong confident conclusions today already came from
comparing cases differing in more than one variable, and asserting "the login is failing" without
visual confirmation would be exactly that shape of mistake a third time. The workflow uploads
`screenshots/secevents-01-post-login.png` and `secevents-02-report-page.png` as a build artifact
on every run specifically to make this checkable (artifact `9480834416` on this run) — **but this
sandboxed session cannot reach that artifact.** `productionresultssa19.blob.core.windows.net` is
not on this session's egress allowlist (`curl` returns a proxy-level `CONNECT tunnel failed,
response 403`; confirmed via `$HTTPS_PROXY/__agentproxy/status`'s `recentRelayFailures`, not
guessed). Only someone with a normal browser — the owner, viewing the artifact from the Actions
run page — can look at those two screenshots and settle whether the login form shows an error,
still shows the login fields, or actually reached an authenticated view at the bare root path.

**Not attempted, deliberately:** no second code change stacked on this unconfirmed premise —
no retry logic, no different selector, no longer wait, no scripted click. That would be a second
untested variable on top of a first one that hasn't been visually confirmed, the identical mistake
class #66's own warning names. **Recommended next step for whoever picks this up:** view
`secevents-01-post-login.png` (does it show the login form still, an error, or the authenticated
app?) before writing any further auth-flow code. If the screenshot shows a still-unauthenticated
login page, the fix is in the login step itself (selector mismatch, timing, or a genuinely wrong
credential) and Task 1/2's `localStorage`/claim-diff logic is unreachable code until that's fixed.
If the screenshot shows a real authenticated view, the mystery deepens and is worth a second,
independent Mac-mini run before theorizing further.

No token value, `sub`, `eID`, or email anywhere in this section or the quoted logs.

### Follow-up (2026-08-22, same day) — the hypothesis above is now confirmed, not just plausible

The owner asked for the diagnostics the prior section said only a screenshot could supply, in
text instead (`563ab78`): `document.title`, whether the login form is still in the DOM,
`localStorage` key **names**, any `role="alert"` text, short body text when the page is brief, and
total-vs-matching request counts. Re-triggered from the Mac mini (run `32593483334`,
`debug=1`). The result settles it:

```
[auth] post-login url: https://v3.myqsrsoft.com/
[auth] post-login document.title: "MyQSRSoft"
[auth] post-login login-form-still-present: true
[auth] post-login localStorage key NAMES: CognitoIdentityId-us-east-1:d9b200e7-ce76-4ddf-a804-494c93b57b70
[auth] post-login short body text: "We make it easier to run great restaurants

Sign in
Email
Password
Signing in
Forgot your password?
OR
Sign in with McD eID
OR
Sign in with Email Link
ENGLISH

QSRSoft, LLC Confidential

© 2019-2026 QSRSoft, LLC. All rights reserved"
[auth] post-login requests seen so far: total 22 | carrying x-auth-token: 0
[auth] localStorage idToken read: false
[auth] report page url: https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit
  | nav error: (none) | interception token captured: false | requests seen: total 39 carrying x-auth-token: 0
```

**Login did not complete.** The page after the login click is still the sign-in form (`Email` /
`Password` / `Sign in` fields present, `Signing in` visible), not any authenticated view. The only
`localStorage` key is `CognitoIdentityId-us-east-1:...` — Cognito's unauthenticated **Identity
Pool** guest ID, which Amplify writes on load regardless of sign-in state — not a
`CognitoIdentityServiceProvider.*` key, which is what an actual sign-in writes and what carries
`.idToken`. 22 requests fired before the read (real network activity, not a blank page) and 39 by
the time the report-page navigation settled, and **zero** of them ever carried `x-auth-token` on
any host. Three independent signals (form still present, no auth-shaped storage key, zero
authenticated requests across two separate page loads) now agree instead of one ambiguous URL.

**This resolves the open question, not just narrows it:** Task 1 and Task 2's code
(`localStorage` read, claim-name diff) is correct and unreachable only because nothing upstream of
it ever authenticates — not a bug in either task. The real defect is earlier: the Playwright login
step (`page.fill` + `page.click` against `qsrsoft-register-audit-pull.mjs`'s same selector list)
is not producing a signed-in session for `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` on this SPA, at
least not the way this script drives it. Candidate causes, **not investigated further this
session** (reporting and stopping, consistent with the dispatch's own repeated instruction not to
stack an untested fix on top of a hypothesis before checking in): a selector mismatch specific to
this login form vs. the one `qsrsoft-register-audit-pull.mjs` was built against, a client-side
validation error the `role="alert"` selector doesn't catch (QSRSoft may use a different error UI
pattern), bot/headless detection, or a genuinely stale/wrong credential in the
`QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` secrets.

Still no token value, `sub`, `eID`, or email anywhere in this section or the quoted logs.

### Dispatch #70 cross-reference (2026-08-22) — login works elsewhere; the Mac mini is the anomaly

A relayed claim that "the source-IP theory was disproven" was tested directly (not trusted) —
see `memory/dispatch-70.md` for the full measurement. Result: Playwright login DOES complete on a
hosted `ubuntu-latest` runner (real `localStorage` idToken, claim-identical to the bare token),
but the retry against `event_details` with that same genuine token still 403s from that same
hosted runner. So network origin still gates the actual data call — the source-IP theory was
**not** disproven. What IS now narrower: whatever prevents login from completing specifically on
the Mac mini (recorded above) is a Mac-mini-specific bug, since the identical script completes
the same login step cleanly elsewhere. The next session should look there — Chromium/Playwright
version or environment differences on that host — rather than at network or auth-flow theories.
