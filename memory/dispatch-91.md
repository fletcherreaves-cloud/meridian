---
name: dispatch-91
description: The QSRSoft security-events 403 investigation has narrowed to one bizarre, unexplained fact -- within the SAME process, calling fetchOne() directly returns 200, but the pull's own loop calling what should be the identical request returns 403, seconds apart, byte-identical wire dump. Twelve other hypotheses are already eliminated. Run the token-injection test, then a packet capture if that doesn't separate it. Do NOT file a QSRSoft support ticket yet -- the answer changes what to ask for.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #91 — QSRSoft security-events 403: the token-injection test

**Read first:** `memory/finding-qsrsoft-security-entitlement-request-2026-08-22.md` (the full
history and current state — read it top to bottom, including the superseded/re-opened banners;
they're in the file on purpose, not stale) and `memory/dispatch-63.md`'s resolution section (the
earlier source-IP measurement, itself later complicated by the finding file's 2026-08-24 appendix).

**Status:** ready, no owner decision needed. This is a debugging task, not a fix — the deliverable
is an answer, and possibly a follow-up dispatch once the answer is known.

---

## Where this actually stands (do not re-litigate any of this)

This investigation has already run through **four superseded conclusions** — auth-flow,
source-IP, transport-fingerprint, and CORS — each overturned by the next measurement. The current,
most-recent state (from `#616`–`#623`, appended 2026-08-24) is narrower and stranger than any of
them:

**Within one process, on one machine, seconds apart: `fetchOne()` called directly returns 200.
The pull's own loop, calling what appears to be the identical request, returns 403.**

Specifically (`scripts/qsrsoft-event-details-probe.mjs` "Case E", which imports and calls the
pull's actual `fetchOne` rather than reconstructing it): **200, 87 real rows.** Seconds later, the
same pull's own loop (`scripts/qsrsoft-security-events-pull.mjs`) hit the same route and got
**403**, with a wire dump showing the same URL, same body, same token hash, same token age/TTL.

**Twelve hypotheses are already eliminated** — do not re-test any of these:
`Origin`/`Referer` headers (the DAR pull sets them too and works), request body scope, rate
limiting, the specific store used, the specific date used, token expiry, `[object Object]` token
stringification, re-mint-on-403 (a real bug, already fixed separately — see the finding file),
auth flow (`USER_PASSWORD_AUTH` vs the SPA's `USER_SRP_AUTH` — same `sub` hash via both), wrong
token type (ID vs access, both tried), account/entitlement (one principal, allowed and denied
depending on context — there is no separate account to entitle), and route-specificity (a second,
unrelated route in the same module is also denied).

## The two remaining tests, in order — do these, not more logging

The finding file is explicit: **"do not add another round of logging. Reading the source has been
exhausted."** The next moves are measurements, not code reading.

### 1. Token-injection test

Run the pull's actual loop (`scripts/qsrsoft-security-events-pull.mjs`), but instead of letting it
mint its own token, inject the token captured from the probe's own successful `fetchOne()` call
(Case E above). This isolates one variable: is it the **token** that differs between the two call
sites, or is it something about the **caller's context** (module-level state, import side effects,
something in how the pull's loop constructs or dispatches the request)?

| outcome | reading |
|---|---|
| injected token → 200 | The token itself was fine; something about the pull's own request-construction or module state is the variable. Look at what differs between the probe's call site and the pull's loop — module-level imports/side effects are the finding file's own lead (`scripts/qsrsoft-event-details-probe.mjs` "imports the pull module, so it shares every module-level import and any side effect they carry — which is what makes the difference so hard to localize"). |
| injected token → still 403 | The token is not the variable. The difference is below what code-level injection can isolate — proceed to the packet capture. |

### 2. Packet capture (only if injection doesn't separate it)

If the token-injection test still 403s, the difference is below the application layer and only
the wire will show it. Capture both requests (the probe's succeeding call and the pull's failing
call) at the packet level, back to back, and diff them byte-for-byte — TLS handshake, header
ordering, connection reuse, anything that a `fetch()`-level comparison can't see.

## Verification bar

This dispatch is done when there is a **clear answer to which of the two tests separated the
variable**, recorded in the finding file (append, don't create a new file — see below), with
enough detail that a follow-up dispatch could act on it. It is explicitly allowed for this
dispatch to conclude "still unexplained, here's what the packet capture showed" — the point is a
real measurement, not a forced resolution.

## Do NOT

- **Do not file a QSRSoft support ticket.** The finding file's earlier "send this to support" recommendation is itself flagged as superseded by the 2026-08-24 appendix — if `fetchOne` can return 200 at all, on this machine, with a minted token, a blanket entitlement or network-restriction ask may be the wrong thing to request. The answer to this dispatch changes what (if anything) to ask QSRSoft for.
- **Do not re-derive any of the twelve eliminated hypotheses.** Each one was a real measurement already; re-testing them wastes a round and this file exists so nobody has to.
- **Do not add more console logging / instrumentation as a first move.** That path is explicitly exhausted per the finding file.
- **Do not create a new `dispatch-91.md`.** Per this repo's standing convention, append a `## Resolution` section to this file, or update the finding file directly (it already carries a "🔴 APPENDED" pattern for exactly this kind of update-in-place).
- **Do not include any token value, `sub`, `eID`, `cognito:username`, or employee name in any file, log, or memory doc.** The finding file's PII note is not optional — a prior capture briefly exposed plaintext crew names in a session transcript, and that must not recur. Only sha256 prefixes and claim-**name** lists (never claim values) are safe to record.
