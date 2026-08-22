# Dispatch #66 — capture the SPA-minted token on the Mac mini and settle `event_details`

**Status:** ready to start. The runner exists and works. **This is the last blocking question.**
**Read first:** `memory/dispatch-65.md`'s **CORRECTION #2** — the source-IP conclusion is dead.

---

## Where this stands

The first live run from the Mac mini (run `32584444370`, runner `mac-mini-qsr`) got the **same
403** the cloud runners got. Same machine and network as the owner's `curl` that returned **200
with real rows** — only the token differed.

| token | origin | result |
|---|---|---|
| browser (Amplify/SRP session) | owner's home network | **200 + rows** |
| browser (same token) | mobile tether | **200 + rows** |
| `getFreshToken()` (USER_PASSWORD_AUTH) | **Mac mini — permitted origin** | **403** |
| `getFreshToken()`, ID *and* access | GitHub Actions | 403 |

**The token is the discriminator, not the network.** One untested cell remains: an **SRP/SPA-minted
token used from the Mac mini**.

## The bug blocking that test

`scripts/qsrsoft-security-events-pull.mjs:283`:
```js
await page.goto(REPORT_PAGE, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
```

The navigation failed and the error was **swallowed**, so no authenticated request fired and no
token was captured. The run logged `post-login url: …` and then `✗ no x-auth-token seen`.

**The tell:** `qsrsoft-register-audit-pull.mjs` prints
`report page url: … | token captured: true (1475 chars)` at the equivalent point — and that line is
**absent entirely** here. That script's Playwright capture demonstrably works; this one's does not.

**Fix:** stop swallowing the error, log the post-navigation URL, and distinguish "navigation
failed" from "navigated but no token seen". `qsrsoft-register-audit-pull.mjs:502` already documents
that exact distinction as a lesson it learned the hard way. **Reuse its listener rather than
reimplementing it** — the standing "check whether a helper exists" rule.

## Then run the one test

Retry `event_details` from the Mac mini with the SPA-minted token.

- **200** → solved. The fix is the auth path; wire it into the pull and ship. Report the row count.
- **403** → the browser session carries something *neither* minting flow reproduces. Do **not**
  guess what. The next step is a header-by-header and claim-by-claim diff between the owner's
  working request and ours, **changing one variable at a time.** Report and stop.

## ⚠️ Read this before theorising

This problem has now produced **two** wrong confident conclusions in one day, both from the same
mistake — **comparing cases that differ in more than one variable**:

1. The engineer compared two of *our* tokens against each other and declared the principal question
   closed. Both were ours; the row that mattered (the owner's browser) was never captured.
2. The PM then compared across **token and network simultaneously** and concluded "source IP",
   which drove #65's whole architecture. The first live run disproved it.

**Change one variable at a time, and say which one you changed.** If a test needs two things to
differ, it is not a test yet.

## Out of scope

- Re-testing anything in dispatch-63.md's elimination table.
- Contacting QSRSoft. The owner has ruled this out; the superseded entitlement request stays
  closed.
- The `STREAMS` freshness wiring — real and still needed, but it is its own problem (role-gated
  RLS, no precedent for a role-conditional eager load) and should not ride along here.

## Verification bar

- The **actual HTTP status** from the Mac mini with an SPA-minted token, plus the first ~200 chars
  of the body. That single line is the deliverable.
- On a 200: row count, store/date window, and confirmation that `crew`/`mgr` were tokenised —
  **no plaintext name in any log, fixture, or memory file.**
- No token value, `sub`, `eID`, or email anywhere. Hashes and lengths only.
- `npm run build` clean; check `node -v` against `ci.yml`'s `[20, 22]` (#60).

---

## Resolution (2026-08-22) — the bug is fixed; the test could not run, and here is exactly why

**Not the deliverable the brief asked for.** The verification bar wanted one HTTP status. What
came back instead is a *third* outcome the brief didn't anticipate: the fix worked exactly as
intended, and what it revealed is that **no token was ever captured, from any host, on this
navigation path** — so there was no token to retry `event_details` with at all. Reporting that
precisely, and stopping here rather than chasing a new theory unilaterally, per the brief's own
explicit warning about this exact failure mode.

### The fix (`42038fd`)

`scripts/qsrsoft-security-events-pull.mjs`'s `viaPlaywright()` no longer swallows the navigation
error, and now always logs the post-navigation URL + nav error + token state together — reusing
`qsrsoft-register-audit-pull.mjs`'s pattern (`report page url: … | token captured: …`) rather than
reimplementing it, per the brief's instruction. `npm run build` clean, 2027/2027 tests
(`node -v` 22, within `ci.yml`'s `[20, 22]`).

### Triggered from the Mac mini (run `32584962388`, runner `mac-mini-qsr`) — the live result

Direct path (`getFreshToken()`, matches the brief's own known-403 cell — expected, not new):
```
3708/2026-08-08/all_promo: 403 body: {"Message":"User is not authorized to access this resource
  with an explicit deny in an identity-based policy"}
3708/2026-08-08/all_promo: 403 headers: x-amzn-errortype=AccessDeniedException ·
  x-amzn-requestid=f6c5ce07-f5dd-4c5e-ad78-f0cd6bc0307e
```
(re-mint retried once, same 403, second `x-amzn-requestid=29d42b90-ebd4-4c36-baa6-3150586e3cce` —
recorded per the standing evidence convention, not because QSRSoft is being contacted).

Playwright fallback — **the fix is what makes this line legible at all**:
```
[auth] post-login url: https://v3.myqsrsoft.com/
[auth] report page url: https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit
  | nav error: (none) | token captured: false
[auth] ✗ no x-auth-token seen on any request during SPA login
```

Read exactly: login succeeded, navigation to the Register Audit report page succeeded (URL
changed, no thrown error), and **the listener — unscoped to any single host, watching every
request the whole session made — never saw an `x-auth-token` header anywhere.** Before this fix,
this exact outcome was printed identically to a *failed* navigation (nothing after "post-login
url"); now the two are distinguishable, and this run is unambiguously the "navigated fine, no
token" case, not the "navigation broke" case.

### What this measures, and what it doesn't

**Measures:** loading the bare Register Audit report page mints no `api.security`-bound token in
this session, full stop — not "the token we captured didn't work," but "no token was ever
observed to capture."

**Does NOT measure:** whether an SPA-minted token, once one exists, would get a 200 from
`event_details`. That cell is still untested — there was nothing to test it with.

**Why, read against the endpoint's own confirmed shape:** `memory/finding-qsrsoft-event-details-
endpoint-2026-08-21.md`'s own capture records the *working* browser request's Referer as this
exact report-page URL — but that capture came from the owner **drilling into a specific
register-audit cell**, not from the report page loading on its own. `regAudit` itself (the report
GRID) is confirmed to fire on page load with no token at all (`qsrsoft-register-audit-pull.mjs`'s
own header, "no x-auth-token, no cookie... scoped by orgId/nsn params"). `event_details` is the
**drill-in** one level below that grid — plausibly it only fires, and only then does the SPA mint
and attach a token, on an actual click into a row, which this run's navigation never performed. If
true, that is a genuinely different, previously-unstated variable (an interactive step, not just a
navigation) — not a re-test of anything already in dispatch #63's elimination table, and not
something to unilaterally chase further this session per the brief's own explicit instruction on
comparing cases that differ in more than one variable at a time.

### Reported and stopped here, per the brief

Not attempted, deliberately: scripting a click into a specific audit-row cell to try to trigger the
drill-down and observe whether THAT mints a token. That is a new, untested variable (an
interaction, not a navigation) and changing it without checking in first would repeat the exact
mistake this dispatch exists to correct. **Recommended next step, for whoever picks this up:**
either (a) have the Mac mini's Playwright session click into one real audit-row cell after loading
the report (the interaction the owner's own working capture came from) and re-observe the listener,
or (b) ask the owner directly whether `event_details` ever fires from their browser WITHOUT first
clicking into a specific cell — if it never does, (a) is confirmed necessary, not a guess.

No token value, `sub`, `eID`, or email anywhere in this section, the logs quoted above, or the run
itself (`QSRSOFT_SECEVENTS_DEBUG=1` was set for this run; the debug branch that prints response
row *key names* never fired, since zero rows were ever returned to log). No plaintext crew/manager
name appears anywhere — no rows were ever fetched to tokenize.
