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
