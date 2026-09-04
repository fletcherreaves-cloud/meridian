---
name: dispatch-91
description: The QSRSoft security-events pull has succeeded exactly ONCE in its complete 81-run history (2026-08-22 through 2026-09-04) -- a true ~1.2% success rate, not the ~10% a smaller 10-run sample suggested on 2026-08-24. The every-2-hours "catch more good windows" mitigation (dispatch #95) has run 40 times in the trailing week with zero successes. See part 4 of the Resolution for the complete run-history measurement and why options 1 (run more often) and 3 (QSRSoft support) are no longer live levers.
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

**Status:** 🔴 UPDATE 2026-09-04 — the complete 81-run history was pulled (not a sample): **1
success total, 0 in the trailing 40 runs.** Read "Resolution, part 4 of 4" at the bottom first —
it corrects part 3's "~10%" figure and narrows the live options. Parts 1-3 below are kept for the
investigation trail; do not treat part 3's "~10%" or its option-1 recommendation as current.

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

## Resolution (2026-08-24), part 1 of 2 — test 1 tooling built, not yet run

`scripts/probe-security-token-identity.mjs` gained **Case F**, exactly the token-injection test
this dispatch specifies: `runSecurityEvents` (the pull's own loop, previously module-private) is
now exported with an optional `{ stores, eventTokens }` scope override, and Case F calls it with
a proven-good token (already minted successfully earlier in the same process by Cases A/E)
injected in place of the loop's own `getFreshToken`. Scoped to the pull's documented
first-failing unit (store 3708, 2026-08-22, `all_promo`) rather than the full 216-unit sweep.

**No live result yet, and here is exactly why:** this dispatch has been worked entirely from
sandboxed sessions with no `QSRSOFT_USERNAME`/`PASSWORD` and no network path to
`api.security.myqsrsoft.com` — confirmed directly (the agent network proxy itself returns a
policy-denial 403 on `CONNECT` to that host, a *different* 403 than the one under investigation,
not a fluke). Every 200 anywhere in this whole investigation's history has come from the owner's
own Mac mini. Rather than guess or extrapolate a verdict from code inspection, this PR added
`.github/workflows/qsrsoft-security-token-identity-probe.yml` — `workflow_dispatch`-only, pinned
to `[self-hosted, macOS, qsr-security]` (the same runner the real daily pull uses) — so the actual
test runs where it can succeed or fail for real.

**Next step, owner or a follow-up session with Actions access:** trigger
`qsrsoft-security-token-identity-probe.yml` via `workflow_dispatch` (defaults are pre-filled with
the first-failing unit above) and read the `── VERDICT ──` block at the end of the run log — no
token values are ever printed, only hashes/lengths/claim names. That single run answers test 1:
injected token → 200 means look at module-level/context differences next; still 403 means proceed
straight to test 2 (packet capture).

Shipped as #652. A parallel, independently-arrived-at duplicate (#653, a separate new script
rather than extending the existing probe file) was closed in favor of this one — same conclusion,
this repo's own "check whether a helper exists before writing one" rule favored the one that
extended `probe-security-token-identity.mjs`'s existing Case A–E convention over a new file.

## Resolution (2026-08-24), part 2 of 2 — test 1 RUN, three times: the result is NOT reproducible

Triggered `qsrsoft-security-token-identity-probe.yml` on `main` via `workflow_dispatch`, three
times, on the self-hosted `mac-mini-qsr` runner (the only place this has ever worked). All three
runs used the same Cognito identity — `IDENTITY 3f73c22fba95` (hash of `sub` + `cognito:username`),
identical across all three, confirming one principal throughout, not a credential mix-up.

**Run 1** (workflow run `32765946685`) — default inputs: Cases A–E ran against store `35064` /
`2026-08-15` (the historical baseline store) and all four returned 200 (23/59/59/59 rows). **Case
F** — the pull's real `runSecurityEvents()` loop, the SAME token those four calls had just proven
good, injected in place of `getFreshToken` — targeted the pull's own documented first-failing unit
(store `3708`, `2026-08-22`, `all_promo`) and got **403**:
```
AccessDeniedException — "User is not authorized to access this resource with an explicit deny in
an identity-based policy" — x-amzn-requestid=62d9459b-edcf-457f-9f1b-95686daf3a87
```
Read naively against the dispatch's decision table, this says "the token is not the variable,
proceed to the packet capture." **But this run conflated two variables**: Cases A–E proved the
token good at store `35064`; Case F then tested a *different* store (`3708`). A clean one-variable
test needs the baseline and the injection on the *same* unit — this run didn't have that, so
before trusting the verdict, that gap needed closing.

**Run 2** (workflow run `32766142857`) — re-triggered with `probe_store=3708 probe_date=2026-08-22`,
so Cases A–E now test the *exact same unit* Case F does. Cases C/D/E all returned 200 with 87 rows
(Case A's scoped registers/cashiers filter legitimately matched 0 of them — not a failure, a narrow
query). **Case F, same store/date/event_token, a freshly-minted token from the same identity,
through the real loop — returned 200.** The HTTP call succeeded; all 87 rows were then dropped by
`parseSecurityEventRows` as "unkeyable" (a separate, unrelated data-shape issue — see the aside
below — not an auth failure, and the loop's own tracker recorded zero failures).

**Run 3** (workflow run `32766432766`) — identical inputs to run 2, immediately after. **Case F
succeeded again** — 200, same 87-rows-then-dropped shape, zero tracker failures.

### The actual finding

**The exact same request — store `3708`, date `2026-08-22`, `all_promo`, through the pull's real,
unmodified loop, with a token proven good moments earlier from the same identity — failed once and
succeeded twice, across three trials within about five minutes.** That is not the clean,
deterministic "token vs. context" split the dispatch's decision table assumes. Neither "injected
token succeeded → look at code/context" nor "still 403 → the token isn't the variable, do the
packet capture" honestly describes three trials that split 2-1.

**This most plausibly explains the puzzle that opened this dispatch** — Case E succeeding
in-process while the pull's own cold run failed on all 216 units (`#622`/`#623`). If the true
condition is a *transient* one on QSRSoft/AWS's side (IAM policy propagation lag, a canary or
rolling backend deploy serving a stale/negative-cached policy decision to some fraction of
requests, or something similar) rather than a stable structural difference between "called from a
probe" and "called from the pull's loop," then a historical run that happened to land inside a bad
window could 403 on every one of its 216 units without any code-level difference existing at all —
and a probe run moments earlier or later, hitting a different window, would cleanly succeed. This
is a hypothesis, not a new eliminated/confirmed item — flagged as the most parsimonious account of
*all* the evidence gathered across this dispatch and #616–#623, not asserted as settled.

### What this changes for the "Do NOT" list above

Proceeding straight to a packet capture (test 2) on the strength of run 1 alone, per the original
decision table, would have compared one real 403 against a Case E success from a *different* run —
exactly the kind of not-actually-one-variable comparison run 1 itself turned out to be. A packet
capture is still valuable, but only once there is a *reliably reproducible* failure to capture
against a reliably reproducible success on the identical unit — which this dispatch's three runs
show is not currently guaranteed on any single trigger.

### Recommended next step (not yet done — the owner's call)

1. **Cheapest first: just re-run the real production pull** (`qsrsoft-security-events-pull.yml`,
   not the probe) now. Two of three recent trials on its own first-failing unit succeeded: it may
   simply work today, in which case the practical problem is solved without a code change, pending
   confirmation the daily scheduled run is now clean too.
2. **If it's still failing at meaningful volume**, characterize the actual failure rate with a
   proper sample (10–20+ repeated probe triggers, not three) before spending effort on a packet
   capture that may just show "sometimes denied, sometimes not" with no stable pair to diff.
3. **If a real, recurring, unexplained intermittent `AccessDeniedException` from one stable
   identity persists** at a measurable rate, that — not a blanket entitlement gap — is a
   legitimate, well-evidenced thing to raise with QSRSoft support: normal IAM/Cognito
   authorization for fixed claims should be deterministic, and recurring non-determinism on their
   side is exactly the kind of thing worth their engineering attention. Give them the
   `x-amzn-requestid` above plus this dispatch's timestamps if it comes to that.

### Aside — a separate, minor finding noticed along the way (not this dispatch's scope)

Runs 2 and 3 both returned 87 real rows for store `3708` / `2026-08-22` / `all_promo`, and **all
87 were dropped** by `parseSecurityEventRows` as "unkeyable" (`isUsableRow` requires
`event_token`/`event_dt`/`event_tm`; at least one was evidently missing or shaped unexpectedly on
every row for this store/date). Worth a follow-up look at the raw response shape for this
store/date before trusting any `qsr_security_events` row counts from a future successful run — not
investigated further here, since it's a parsing question, not the 403 this dispatch is about.

## Resolution (2026-08-24), part 3 of 3 — real production evidence: this is NOT a rare blip

Two more pieces of evidence, gathered after part 2's three-trial probe, both from the **real**
`qsrsoft-security-events-pull.yml` workflow (not the diagnostic probe) — and both point the same
direction, away from part 2's "probably transient" reading.

**Owner-triggered run today (`workflow_dispatch`, run `32767800984`), cancelled mid-run:** 120 of
216 units attempted before manual cancellation, **all 120 failed** with the identical
`403 AccessDeniedException` / *"explicit deny in an identity-based policy"* shape documented
throughout this investigation. Zero successes, zero rows, in the portion that ran. This is real
production traffic (the actual daily pull, not a probe), at a **100% failure rate** over 120
trials — a far stronger and worse signal than part 2's 3-trial sample.

**Run history, `qsrsoft-security-events-pull.yml`, last 10 runs (Aug 22–24):**

| run | when | result |
|---|---|---|
| #14 | Aug 24 (today), scheduled | ❌ failed |
| #13 | Aug 23 5:37 PM | ❌ failed |
| #12 | Aug 23 5:14 PM | ❌ failed |
| #11 | Aug 23 4:41 PM | ❌ failed |
| #10 | Aug 23 4:33 PM | ❌ failed |
| #9 | Aug 23 4:28 PM | ✅ **succeeded** |
| #8 | Aug 23 3:49 PM | ❌ failed |
| #7 | Aug 23 3:48 PM | ⚠️ cancelled/errored |
| #6 | Aug 23 5:31 AM, scheduled | ❌ failed |
| #5 | Aug 22 2:46 PM (branch run) | ❌ failed |

**1 success in 10 real runs — roughly a 10% success rate**, not the "mostly fine, occasionally
denied" picture a 2-of-3 probe sample would suggest. ⚠️ Caveat: not all 10 runs are confirmed to be
on identical code — some may predate later fixes in this same window (e.g. #616's re-mint-on-403
throttle fix) — so this table is a real observed pattern, not a controlled A/B comparison the way
part 2's runs 2–3 were. Still, the direction is unambiguous: **this is failing far more often than
it succeeds, in real production use, right now.**

### What this changes

Part 2's recommended option 1 ("cheapest first: just re-run the pull, it may simply work today")
is now answered — **it does not simply work today.** Option 2 ("characterize the failure rate
properly") is effectively done by the table above: ~10% success over real runs, ~0% over today's
120-unit sample specifically.

**Option 3 (file with QSRSoft support) is RULED OUT — owner-stated 2026-08-24: they will not
assist with data-pulling/automation.** Not a data question, a relationship/policy fact only the
owner has — recorded here so a future session doesn't re-propose it. **This closes off the
externally-supported path entirely.** Whatever happens next has to be something achievable from
this side alone, without vendor cooperation.

### The real remaining options, given no vendor help is coming

1. **Adapt the pull around the failure instead of fixing its cause.** The evidence so far reads as
   correlated at the **run level**, not independently-random per unit — run `#9` succeeded (or
   mostly did), today's run failed on all 120 units it attempted. That shape suggests entire
   time windows are "good" or "bad," not that each request independently has a ~10% chance. If
   so, **running the pull more often** (e.g. every 1-2 hours instead of once daily) would catch
   more good windows over a day than one scheduled attempt does, even though each individual run's
   own outcome is still binary. This doesn't fix anything — it works around an unfixed problem —
   but it's the most direct lever available without QSRSoft's cooperation. Needs: confirming the
   run-level-correlation read on more data (the two data points so far are suggestive, not proven)
   before committing engineering effort to a new schedule.
2. **Still worth doing the packet capture (test 2 from the original decision table) — for a
   different reason than originally intended.** It was scoped as evidence to hand QSRSoft; that
   reason is gone. But it could still reveal something **actionable on our own side** — a header,
   a timing pattern, a connection-reuse quirk in how this pull's requests are shaped, if the two
   states (succeeding vs. failing) turn out to differ in some way *we* control. If the capture
   shows no difference at all between good and bad requests, that's a real answer too: it would
   mean the cause is entirely on QSRSoft's/AWS's side and out of reach, and this becomes a
   permanently-degraded data source to design around (option 1) rather than fix.
3. **Do nothing further and accept ~10% coverage as the ceiling.** Legitimate if the security-
   events data isn't worth more engineering effort relative to its value — that's a product
   call, not a technical one.

**Owner's call which of 1-3 (or some combination) to pursue.** Not proposing a default here since
this is a genuine trade-off between engineering effort and a problem that may not be fully
fixable regardless of effort spent.

## 🔴 Resolution (2026-09-04), part 4 of 4 — the COMPLETE run history, and it is worse than "~10%"

Owner (session 2026-09-04): *"i feel like we built a pull, but it never completes."* Pulled the
**entire** `qsrsoft-security-events-pull.yml` run history via the GitHub API (not a sample) —
81 runs total, `#2` (2026-08-22, the first real run) through `#81` (2026-09-04, today).

**Exactly ONE success in 81 runs: `#9`, 2026-08-23 21:28:38Z.** Every other run — 80 of 81,
including all 40 most recent, running on the every-2-hours schedule dispatch #95 put in place
specifically to "catch more good windows" — failed with the same `403 AccessDeniedException` /
*"explicit deny in an identity-based policy"* shape documented throughout this dispatch. **The
most recent run checked** (`#81`, triggered live this session): 3240/3240 units failed, zero rows
saved, `Process completed with exit code 1` — a complete, total failure, not a partial one.

**This corrects part 3's "~10% success rate" figure.** That number came from a 10-run sample
(`#5`–`#14`) that happened to catch `#9`'s lone success inside its window — 1/10 in that sample
read as "roughly 10%," but the true rate over the full 81-run population is **1/81 ≈ 1.2%**, and
the trailing week (`#42`–`#81`, Aug 28 → Sep 4) is a flat **0/40**. Recorded here per this repo's
own "measure it, don't reason about it" rule — the smaller sample wasn't wrong as a sample, it
was just small enough to be misleading, and nobody had pulled the complete history until now.

### What this changes for the three options part 3 left open

1. **"Run more often to catch good windows" — already implemented (dispatch #95, the current
   every-2-hours cron) and it has NOT worked.** 40 consecutive attempts on that exact cadence,
   spread across a full week and every hour of the day, produced zero successes. Either "good
   windows" are far rarer than one every few hours, or the run-level-correlation hypothesis itself
   doesn't hold at this timescale. Either way, **this option is not a live lever anymore — it was
   tried, for a week, at real cost (40 nine-minute self-hosted-runner jobs), and the data says it
   isn't working.**
2. **Packet capture** — still theoretically available, but only one single success (`#9`, now 12
   days stale) exists anywhere in this investigation's history to compare against. There is no
   fresh "good" request to capture back-to-back with a fresh "bad" one; re-manufacturing one would
   mean hoping for a second lucky run.
3. **QSRSoft support** — already ruled out (owner-stated 2026-08-24, unchanged).

**So the real, current choice is narrower than part 3 framed it: continue burning self-hosted
runner minutes on a schedule that has produced one success in 81 tries and zero in the last 40,
or stand it down.** Neither "wait for a good window" nor "ask QSRSoft" is a live option anymore —
both were tried or ruled out. This is the owner's call, not a technical one; not defaulted here.
