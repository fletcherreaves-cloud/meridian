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
