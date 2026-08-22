# Dispatch #70 — #67 is blocked by the RUNNER, not by the login. Move it back to `ubuntu-latest`.

**Status:** ready to start. **One line of YAML.** Nothing to build, nobody to ask.
**Reads:** `memory/dispatch-67.md` (the Resolution section), `memory/dispatch-65.md`
CORRECTION #2, `memory/dispatch-63.md` Task 1.

---

## What the engineer measured (correct, and well-diagnosed)

Dispatch #67's live run on the Mac mini: the Playwright login **never completes**. Three
independent signals agree — `login-form-still-present: true`, body text stuck on
`"Sign in / Email / Password / Signing in..."`, and the only `localStorage` key is Cognito's
*unauthenticated guest* identity. Zero of 22–39 requests carried `x-auth-token`.

The engineer then **declined to guess**, listing four candidate causes unchased and citing the
dispatch's own warning against stacking untested fixes. That was the right call and it is what
made the next step findable.

## 🔴 The candidate list is missing the one that fits — and it is not a code bug

**The same Playwright login worked five days ago.** `memory/dispatch-63.md` Task 1:

> *"The Playwright login succeeded, and a token **was** captured … from six other hosts hit during
> login/session bootstrap: `api.sso.myqsrsoft.com`, `accounts.home.myqsrsoft.com` …"*

and it produced a real SRP token that was then compared claim-by-claim against the
`USER_PASSWORD_AUTH` token. **That comparison was between two genuinely different tokens** — so
#63's elimination of the auth-flow hypothesis still stands, and nothing in #67's result
invalidates it. (I checked this specifically before writing, because if #63's SRP token had been
fictional then two prior conclusions would have collapsed. It wasn't. They don't.)

**What changed between then and now is the runner:**

| | runner | Playwright login |
|---|---|---|
| `qsrsoft-register-audit-pull.yml:41` | `ubuntu-latest` | **works** — logs `token captured: true (1475 chars)` |
| dispatch #63 Task 1 | GitHub-hosted | **worked** — SRP token captured |
| `qsrsoft-security-events-pull.yml:52` | `[self-hosted, macOS, qsr-security]` | **fails** — #66 and #67, twice |

Two runners, two outcomes, and the failing one is the newer of the two. Selector mismatch and
stale credential — two of the four candidates — are both hard to reconcile with the *same
selectors and the same secrets* working on `ubuntu-latest`.

## 🔴 And the reason it was moved to the Mac mini no longer exists

`qsrsoft-security-events-pull.yml` was pointed at the Mac mini by dispatch #65, whose entire
architecture rested on the **source-IP conclusion**. `memory/dispatch-65.md` **CORRECTION #2**
killed that conclusion the same day, on the runner's own first live run:

> *"The first live run from the Mac mini FAILED with the same 403 … This disproves the source-IP
> conclusion … The discriminator is the token."*

So the Mac mini is currently **buying nothing** for this pull, and **costing** the one thing #67
needs: a login that completes.

## Do this

1. **Set `qsrsoft-security-events-pull.yml:52` back to `runs-on: ubuntu-latest`** and re-run
   #67's diagnostics. That is the whole change. It reuses a login path proven twice, and it tests
   #67's actual question — *does the SPA's `localStorage.idToken` differ from what we mint?* —
   instead of the incidental question of why macOS Playwright hangs.
2. **Keep the diagnostics you added.** They are why this was findable, and they will confirm the
   login completes on the hosted runner rather than assuming it.
3. **Do NOT decommission the Mac mini runner.** It is cheap to leave registered, and if a later
   finding revives a network dependence it is already built and proven to pick up jobs
   (dispatch #65). Just stop *blocking* on it.
4. **Leave the macOS login failure unchased** unless it turns out to matter. It is a real defect
   and worth a line in the runner's notes, but nothing currently depends on it.

## Why this is the right question to be testing

The corrected matrix (`dispatch-65.md` CORRECTION #2) is:

| token | origin | result |
|---|---|---|
| browser session token, by hand | owner's network | **200 + rows** |
| browser session token, same token | mobile tether | **200 + rows** |
| Playwright SRP token | GitHub Actions | 403 |
| `getFreshToken()` (USER_PASSWORD_AUTH) | GitHub Actions | 403 |
| `getFreshToken()` | Mac mini — permitted origin | 403 |

Every programmatically-obtained token is denied; the browser's own token is allowed from two
different networks. Same principal (`sub#9378eb7a6502` on both sides), same claim names, same app
client, same auth flow as row 3 — all measured, all eliminated.

**The live hypothesis is narrow and specific.** #63's SRP token was captured **off request headers
on six bootstrap hosts** — `api.sso`, `accounts.home`, `chat.home`, and so on. The owner separately
confirmed his browser sends `x-auth-token` **equal to `localStorage.idToken`**. Those need not be
the same value: a bootstrap host can be handed a different token than `api.security` is. **Nobody
has yet compared the SPA's `localStorage.idToken` against what we mint** — which is exactly what
#67 was written to do, and it remains unanswered rather than disproven.

⚠️ **Do not let the runner detour become a new theory.** The runner is why the *test* cannot run.
It is not a candidate explanation for the 403 — row 3 already failed from `ubuntu-latest`, and row
5 already failed from the permitted network. Fix the test, then read its result.

## Verification bar

The run must print, before anything else is believed: the post-login URL, `document.title`,
`Object.keys(localStorage)` (**names only, never values**), and whether the login form is still in
the DOM. If those say the login completed, the localStorage comparison is trustworthy; if they say
it did not, the result is void regardless of what else the run prints — the same trap #66 fell into
when a swallowed navigation error made "navigation failed" and "no token found" print identically.

🔒 As throughout this thread: **no token value, `sub`, `eID`, or email in any log, fixture, or
memory file** — hashes and lengths only.

---

## Addendum — owner: *"sso credentials are different if that matters"* (2026-08-22)

**Short answer: on the evidence recorded, it does not — and one measurement is why.** But it is a
fair thing to raise, it was a live hypothesis once, and there is a cheap re-check plus a genuinely
useful forward test.

### Why SSO is already ruled out of the 200

A federated/SSO user is a **distinct Cognito user** from a native username+password user —
different `sub`, potentially different `eID`. That was dispatch #63's original "same email, two
principals" hypothesis. It closed on this:

| token | `sub` hash | result |
|---|---|---|
| **owner's browser token** (the one that returns 200) | **`9378eb7a6502`** | 200 |
| our `getFreshToken()` token (native, `QSRSOFT_USERNAME`/`PASSWORD`) | **`9378eb7a6502`** | 403 |

**Same `sub`.** If the browser session that succeeds were the SSO identity, its `sub` would differ
from ours. It doesn't. So the 200 is being produced by the *same native principal we already
mint* — which is also why the entitlement request was withdrawn: there is no separate account to
entitle.

The owner separately confirmed at the time that the captured browser session was **email+password,
not SSO**, which agrees.

### ✅ The one thing that would have overturned this — checked, and it holds

The chain rests entirely on that browser `sub` hash having come from **the same session that
produced the 200**. Read at a different time, after a re-login, or from another tab or profile, the
comparison would be void and SSO would be back on the table.

**Owner confirmed, 2026-08-22:** *"same login and tab."*

So the hash and the 200 come from one session. **SSO is eliminated, not merely unlikely** — the
principal that succeeds is the same native principal `getFreshToken()` already mints, and there is
no second Cognito user in this picture. Do not re-raise it.

### The forward test — now demoted, but not deleted

With SSO eliminated above, this drops from "next thing to try" to "a last resort if everything
else is exhausted." Kept only because it is cheap and because the reasoning about its *cost* is
what matters if anyone reaches for it later. The SSO credential is an untried principal:
sign in via SSO, take that session's token, and call `event_details` with it. If it returns 200
where the native token returns 403, that is the answer and it is a credentials problem, not an
infrastructure one.

🔴 **But hope it is not the answer, because it is the expensive outcome.** `USER_PASSWORD_AUTH`
**cannot authenticate a federated user at all** — so if the entitlement lives on the SSO principal,
`getFreshToken()` can never mint it and no amount of fixing it helps. The pull would need a
different credential path entirely, and SSO + MFA puts it behind exactly the wall
`memory/finding-ecosure-propel-api-2026-08-22.md` hit on Propel: a persistent authenticated browser
profile with periodic manual re-auth, not a headless mint.

**Order of work is unchanged, and now clearer.** Run #70's one-line runner fix and read #67's
result — it is free, it tests the one hypothesis still live (SPA `localStorage.idToken` vs what we
mint), and with SSO eliminated it is no longer competing with anything. If #67 comes back with the
two tokens **identical**, this repo has genuinely exhausted what it can test alone, and the next
step is the QSRSoft question — not another local hypothesis. Give them the `x-amzn-requestid`
values from a 403 run so they can find the denial in their own logs, and ask what actually
distinguishes the two requests, since by then every variable we can see will be equal.
