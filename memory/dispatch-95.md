---
name: dispatch-95
description: The security-events pull's real success rate is ~10% and QSRSoft support is ruled out (owner-stated, won't assist with automation). Owner wants an actual resolution, not "accept the ceiling." Two-track dispatch, run in parallel -- Track A tries to find a real, in-our-control root cause via a controlled wire-level diff between succeeding and failing requests; Track B builds resilience (retry/frequency/visibility) regardless of what Track A finds, since even a found cause may not be something we can fix.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #95 — resolve the security-events pull, without QSRSoft's help

**Read first:** `memory/dispatch-91.md` in full (all four Resolution parts — the investigation
history matters here) and `memory/finding-qsrsoft-security-entitlement-request-2026-08-22.md`.

**Status:** ready, no further owner decision needed on scope — the owner has said resolve it, by
whatever means available without QSRSoft's cooperation (they've explicitly ruled that out; do not
propose filing a support ticket).

---

## Where this stands, in one paragraph

`qsrsoft-security-events-pull.yml`'s real-world success rate is **~10%** (1 of the last 10 real
runs; today's run failed 120/120 units before cancellation). Twelve hypotheses are already
eliminated (dispatch #91's "do not re-litigate" list — auth flow, source IP, entitlement, rate
limiting, token type, and more). A controlled 3-trial token-injection test found the *token* is not
reliably the variable (2 success / 1 failure on the identical request). **QSRSoft support is off
the table.** Whatever resolves this has to be found and fixed (or worked around) from this side
alone.

## Track A — controlled wire-level diff (the real "packet capture" step, done properly)

**Goal:** find something *we control* that differs between a succeeding call and a failing one.
Not for a vendor ticket — for our own fix.

1. **First, check what's actually available on the self-hosted runner (`mac-mini-qsr`) before
   assuming a tool.** True packet capture (`tcpdump`) needs elevated permissions a CI runner may
   not have. A more realistic starting point: Node's built-in transport-level debugging
   (`NODE_DEBUG=http,tls` env var, or a custom `fetch` wrapper that logs full request/response
   headers, TLS session reuse, connection keep-alive state) — this needs no special runner
   permissions and may already be enough to spot a difference. Confirm which is actually feasible
   before designing the rest of this around an assumption.
2. **Design a genuinely controlled comparison, learning from dispatch #91 part 2's run-1 mistake**
   (it conflated store/date between the "proven good" baseline and the actual test — don't repeat
   that). Trigger back-to-back: a call known to be likely-good (the historical baseline
   store/date), and the pull's own first-failing unit, in the *same process*, with full
   request/response tracing on both, whatever mechanism step 1 settles on.
3. **Compare everything the trace captures**, not just headers you'd guess matter: header
   ordering, connection reuse (new TLS handshake vs. keep-alive), request timing/spacing, TLS
   version/cipher if visible, anything present on one side and not the other.
4. **If something real and controllable turns up** (e.g. a header the pull sets differently than
   a known-good call, a connection-reuse pattern that correlates with failure), that becomes the
   actual fix — implement and verify it the same way dispatch #90/#92 verified their fixes (a real
   before/after measurement against live production, not just "the code compiles").
5. **If nothing differs at the wire level between good and bad calls**, that is also a real,
   valuable answer: it means the cause is entirely external (AWS/Cognito/QSRSoft's own
   infrastructure) and permanently out of reach from this codebase. Record that plainly — it's
   what makes Track B the actual resolution rather than a consolation prize.

## Track B — resilience, regardless of what Track A finds

**Goal:** whether or not Track A finds a fixable cause, this data source needs to actually get
data reliably, not stay at ~10%. Build this in parallel with Track A, not after it.

1. **Investigate whether failure is correlated at the *run* level rather than independently random
   per request** (dispatch #91 part 4's open question) — this determines whether Track B should be
   "retry within a run" (won't help if a whole window is uniformly bad) or "retry across time" (run
   the whole pull more often, so more windows get a chance). Look at the run-history evidence
   already gathered (today's run: 120/120 failed, uniformly — consistent with run-level
   correlation, not per-request-random) and extend it with a few more real trigger attempts if
   needed to confirm the pattern before designing the schedule change around it.
2. **If run-level correlation holds:** change `qsrsoft-security-events-pull.yml`'s schedule from
   once daily to something more frequent (e.g. every 1-2 hours), so a bad multi-hour window doesn't
   cost a full day of coverage. Keep the existing per-run 216-unit sweep — don't add per-request
   retry logic that would just re-fail inside the same bad window and waste calls (dispatch #91's
   own "a retry policy that cannot distinguish 'expired' from 'not allowed' will convert a clear
   diagnosis into a rate-limit" lesson, generalized: retrying inside a correlated-bad window is the
   same mistake in a different shape).
3. **Make the actual daily/rolling coverage visible, not just per-run pass/fail.** This repo's
   standing rule for every automated pull (CLAUDE.md's "adding a new automated pull" checklist)
   already requires per-stream freshness visibility, not a pooled Math.max — apply the same
   discipline here: surface how many of the last N days actually got real security-events rows,
   somewhere an operator would see a multi-day gap forming, not just a single run's red/green.
4. **Upserts must stay safe under a more-frequent schedule** — confirm the existing write path is
   idempotent (re-pulling an already-covered unit shouldn't duplicate or corrupt rows) before
   increasing frequency. If it isn't already, that's part of this fix, not a follow-up.

## Verification bar

**Track A:** a real, reproduced trace comparison exists and its finding (fixable difference found,
or genuinely no difference) is recorded with the actual evidence, not a guess.

**Track B:** after the schedule/resilience change, measure real coverage over a few days (not one
run) and confirm it's materially better than ~10% — e.g. most days now have at least one successful
window's worth of data, even if individual runs still fail at roughly the same rate. This needs
real time to pass and real production runs to accumulate; don't declare success from one lucky run.

## Do NOT

- **Do not propose filing anything with QSRSoft support.** Ruled out, owner-stated. Don't re-raise it.
- **Do not re-test any of the twelve hypotheses dispatch #91 already eliminated** (see that
  dispatch's "do not re-litigate" list).
- **Do not add per-request retry-on-403 inside a single run** without first confirming the
  run-level-correlation question in Track B step 1 — retrying inside a uniformly-bad window
  wastes calls and could reintroduce the exact Cognito-throttle bug `#616` already fixed once.
- **Do not increase pull frequency before confirming upserts are idempotent** (Track B step 4) —
  shipping the schedule change first risks data corruption, not just wasted effort.
- **Do not declare Track A "inconclusive, moving on" after one comparison.** If the first trace
  pair doesn't show a clear difference, that's one data point — the standing "measure it, don't
  reason about it" rule applies; get a few more comparisons before concluding there's genuinely
  nothing to find.
