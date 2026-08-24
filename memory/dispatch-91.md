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

⚠️ **UPDATE 2026-08-24 — test 1's tooling is built but NOT yet run against the real API. See
`## Resolution` at the bottom.** The session that picked this up had neither `QSRSOFT_USERNAME`/
`QSRSOFT_PASSWORD` nor network egress to `api.security.myqsrsoft.com` (a proxy policy denial, not
a QSRSoft 403) — every real 200 in this investigation has come from the owner's own Mac mini, and
this session had no path to that machine or an equivalent one. It shipped
`scripts/probe-security-token-injection.mjs` plus a `workflow_dispatch`-only Actions workflow that
runs it on the same self-hosted runner the daily pull uses, ready for the Mac mini (or the owner
interactively) to produce the actual measurement in one run.

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

---

## Resolution (2026-08-24) — tooling built, test NOT yet run: this session has neither the credential nor the network path

**This is a "measurement not yet possible from here" outcome, not a "still unexplained" one.** Test 1
(token-injection) has not been run against the real API. Here is exactly why, checked directly
rather than assumed:

- `env | grep -i QSR` in this session: **empty.** No `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` — this
  environment cannot mint a token at all, injected or otherwise.
- `curl` to `https://api.security.myqsrsoft.com/` from this session: **`CONNECT tunnel failed,
  response 403`**, confirmed via the agent-proxy's own status endpoint as a **policy denial at the
  proxy** (`recentRelayFailures`: `connect_rejected`, `"gateway answered 403 to CONNECT (policy
  denial or upstream failure)"`, host `api.security.myqsrsoft.com:443`). This is a different 403
  than the one under investigation — it is this sandbox's own egress policy refusing the TLS
  tunnel before any QSRSoft request is even sent — but it means this session has no path to that
  host even with a credential.

Both blockers together mean **no code-level investigation from this environment can produce a real
measurement here**, and per this repo's own standing rule ("measure it, don't reason about it" /
"a live-data claim must name the credential and the observation"), the right move is to say so
rather than report a guessed or extrapolated result.

**What every real 200 in this investigation has in common** (re-confirmed by re-reading the finding
file, not re-tested): every successful call — the owner's original curl, every `A`/`C`/`D`/`E` case
in `scripts/probe-security-token-identity.mjs` — ran from the owner's own Mac mini, on the owner's
own network, with `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` present. Every GitHub-Actions-hosted-runner
call has 403'd regardless of token. So the token-injection test is only meaningful run from that
same machine/network — this session's total absence of both credential and network path to the
host is consistent with that pattern, not a new data point against it.

**What this dispatch actually delivers**, since the test itself couldn't run from here:

1. **`scripts/probe-security-token-injection.mjs`** (new) — implements test 1 exactly as specified:
   mints a token, proves it works with one direct `fetchOne()` call (reproducing "case E" in-
   process), then hands that *same* token string to `runSecurityEvents()` — the pull's own,
   unmodified loop — in place of `getFreshToken`, so `resolveToken()` returns it unchanged for
   every unit instead of minting fresh. Reports a clean verdict (token was/wasn't the variable, or
   a mixed result if some units differ) based on tracked auth failures, not row counts (a 200 with
   zero promo events that day must not read as a failure). Read-only — never calls
   `saveSecurityEventRows()`/Supabase. Never logs a token value, `sub`, `eID`,
   `cognito:username`, or employee name — unit labels and row/failure counts only.
2. **`runSecurityEvents()` and `STORE_NSNS` exported** from `scripts/qsrsoft-security-events-pull.mjs`
   (previously module-private) — so the probe drives the *actual* production loop rather than a
   hand-rolled replica that could quietly drift from it, the same reasoning that made `fetchOne`/
   `buildUrl`/`buildBody` exported for `probe-security-token-identity.mjs` in #616–#622. No
   behavior change to the pull's own `main()` path — same two names now visible to importers,
   nothing else touched.
3. **`.github/workflows/qsrsoft-security-token-injection-probe.yml`** (new) — `workflow_dispatch`
   only, runs the probe on `[self-hosted, macOS, qsr-security]`, the **same runner** the daily
   security-events pull uses and the only network context in this whole investigation that has
   ever returned a 200 from this route. Running it on `ubuntu-latest` (like
   `qsrsoft-event-details-probe.yml`) would prove nothing — every hosted-runner call to this route
   has 403'd regardless of token, so a hosted run would just reproduce that, not answer the
   token-vs-context question.

**Next step, and it is a short one:** trigger this workflow via `workflow_dispatch` once merged (or
run `node scripts/probe-security-token-injection.mjs` directly on the Mac mini with
`QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` set) and read its `[inject-probe] ── VERDICT ──` line. That
single run is test 1, complete. If it comes back 🔴 (token not the variable), test 2 (packet
capture) is the next move and still needs a machine with both real credentials and a packet-capture
tool (`tcpdump`/Wireshark) on the Mac mini itself — also outside what this session can do.

**Do not read this as a thirteenth eliminated hypothesis or a new conclusion about token vs.
context.** Nothing about the actual question was tested. The only new fact this session
established is about *this session's own reach*, not about QSRSoft.
