# Dispatch #70 — tested and REFUTED: the source-IP theory was NOT disproven

**Status:** measured, reverted. The relayed premise ("Playwright login isn't broken; it works on
ubuntu-latest and fails on the Mac mini, and the source-IP theory that moved the workflow there
was disproven the same day it was built") is **half right, half wrong** — and the wrong half is
the consequential one. Per CLAUDE.md's "a reviewer's root cause is a hypothesis — reproduce it
before fixing it" (applies "permanently, including the owner's own diagnosis"), this was measured
directly before touching `runs-on` permanently, rather than trusting the relayed claim.

---

## What was actually true

**Right:** Playwright login does complete on a hosted runner. Triggered
`qsrsoft-security-events-pull.yml` via `workflow_dispatch` with `runs-on` temporarily changed to
`ubuntu-latest` (run `32594730060`, job `97083797823`):

```
[auth] localStorage idToken read: true (1475 chars)
[auth] token source for retry: localStorage
[auth] bare (getFreshToken) claim NAMES: aud, auth_time, cognito:username, ... (18 names)
[auth] spa  (localStorage/interception) claim NAMES: <identical 18 names>
[auth] claim NAMES are identical between the bare and spa tokens.
```

Login genuinely succeeds from `ubuntu-latest` — a real, non-null, claim-identical-to-the-bare-token
SPA ID token was captured. This is the same "login doesn't complete" bug dispatch #67's Resolution
found on the Mac mini, and it does NOT reproduce on a hosted runner. Whatever is wrong is specific
to the Mac-mini environment (Chromium build, OS quirk, something else entirely) — not universal.

**Wrong, and the consequential part:** the retry against `event_details`, using that SAME genuine
SPA-minted token, from that SAME hosted runner:

```
[secevents-pull] 3708/2026-08-08/all_promo: 403 body: {"Message":"User is not authorized to
  access this resource with an explicit deny in an identity-based policy"}
[auth] ✗ Playwright fallback failed: AUTH_FAILED:403
```

**403.** Same IAM explicit-deny message as every other cloud-origin attempt to date.

## Reading this against dispatch-65.md's own CORRECTED matrix

CORRECTION #2 named exactly one untested cell: *"An SRP/SPA-minted token used FROM the Mac mini.
Nobody has run it."* That framing already implied the OTHER direction (an SRP/SPA token from a
hosted/cloud origin) was the one expected to fail if network still mattered — it just hadn't been
run either, because dispatch #66/#67's swallowed-error and no-token bugs meant no run ever
produced a real SPA token to test with, from any origin, until this one.

This run fills in that missing cell, and the network-origin theory survives it:

| token | origin | result |
|---|---|---|
| bare (`getFreshToken`) | Mac mini | 403 |
| bare (`getFreshToken`) | GitHub Actions (hosted) | 403 |
| **SPA/SRP (real, claim-identical to bare)** | **GitHub Actions (hosted)** | **403 (this run)** |
| SPA/SRP | Mac mini | **still untested** — the actual point of #67 |
| browser SRP (owner, by hand) | owner's home network | 200 |
| browser SRP (same) | mobile tether | 200 |

Every cloud-origin cell is 403, regardless of token type. Both real-browser cells, from consumer
networks, are 200. The one thing this run adds is ruling out "maybe any genuine SPA-flow token
just works everywhere" — it doesn't; a real one still 403s from the cloud. **The self-hosted
Mac-mini runner is still necessary for the actual `event_details` call.** Dispatch #65's
architecture is intact. Reverted `runs-on` back to `[self-hosted, macOS, qsr-security]`
immediately — no permanent change shipped.

## What #70 got right, worth keeping

The login step itself has no network dependency — it's a `v3.myqsrsoft.com` SPA login, not an
`api.security` call, and it now demonstrably works from a hosted runner. That narrows dispatch
#67's open question: whatever prevents login from completing on the Mac mini specifically (still
unconfirmed — see dispatch-67.md's Resolution, which recommended checking the screenshot artifact
next) is a **Mac-mini/macOS-Chromium-specific bug, not a network-origin one.** Two candidate
directions for whoever picks this up, neither attempted here (new untested variables, per the
standing warning against stacking them without checking in):

- Fix whatever is different about the Mac mini's login environment directly (stale/mismatched
  Chromium build from `npx playwright install`, a viewport/locale difference, something else) so
  login completes there too, keeping the whole pull on one runner as today.
- Or split the workflow into two jobs — capture the token on a hosted runner (fast, reliable, no
  Mac-mini-specific bug to fight), hand it to a second job that runs on the Mac mini and only does
  the actual `event_details` fetches with the already-captured token. Not attempted: this needs a
  real design decision (how the token crosses job boundaries — `GITHUB_OUTPUT` with `::add-mask::`
  vs an artifact — and a script change to accept an externally-supplied token instead of always
  running its own Playwright login) worth checking in on rather than building unasked.

## No token value, `sub`, `eID`, or email anywhere in this file or the quoted logs.
