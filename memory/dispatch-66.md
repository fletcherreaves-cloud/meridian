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
