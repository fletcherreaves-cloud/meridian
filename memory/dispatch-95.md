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

## Resolution

### Track A — wire-level trace: no fixable difference found, and a stronger negative result than expected

**Step 1, as instructed: checked feasibility before assuming a tool.** On `mac-mini-qsr`,
`tcpdump` is installed (`/usr/sbin/tcpdump`) but passwordless `sudo` is not configured
(`sudo -n tcpdump -D` fails immediately with `sudo: a password is required`) — true packet
capture is not available without a runner config change nobody asked for. Fell back to Node's
built-in `node:diagnostics_channel`, which needs no elevated permission. Verified against a real
request before relying on it: it exposes the exact sent-header bytes as undici puts them on the
wire (order preserved), the response header list in receipt order, and the underlying `tls.Socket`
(`getProtocol()`, `getCipher()`, `isSessionReused()`, local/remote port) on every request — a
genuine wire-level trace, not an approximation.

**Built as Case G in `scripts/probe-security-token-identity.mjs`** (extending the existing Case
A–F probe rather than a new file, per the repo's "check whether a helper exists" rule): repeated
trials of the pull's own actual `fetchOne()`, against the SAME unit dispatch #91 already used as
its documented first-failing case (store `3708`, `2026-08-22`, `all_promo`) — one variable
(nothing) held different between trials, full trace captured on each. A real bug was caught and
fixed before trusting the data: subscribing to `undici:client:connected` *inside* the Case-G
function missed the connection cases A–F had already opened, so the first run showed
`conn#=undefined tls=undefined` on every trial — moved the subscription to module load time
(before any case runs) and confirmed real TLS data on the next run.

**Three live runs, `workflow_dispatch` on `mac-mini-qsr`, this session, 2026-08-24 (times UTC):**

| run | trials | spacing | connection pattern | result |
|---|---|---|---|---|
| 1 (`32776077966`, 20:50) | 10 | 150ms (matches the real pull) | 1 reused connection throughout | **10/10 → 403** |
| 2 (`32776377517`, 20:53) | 15 | 150ms | 1 reused connection throughout | **15/15 → 403** |
| 3 (`32776635944`, 20:56–20:58) | 20 | 5000ms (spans ~100s) | a brand-new TCP+TLS connection every trial (keep-alive idle-timed-out between requests) | **20/20 → 403** |

**45/45 trials failed, byte-identical `403 AccessDeniedException` / "explicit deny in an
identity-based policy" every time — zero successes across three separate live processes.** That is
a stronger, more uniform negative result than dispatch #91 part 2 saw (its three separate runs on
the same unit split 403/200/200) — today specifically appears to sit inside a persistently bad
window, not a randomly-mixed one. Corroborated by the *actual production pull* the same day: the
scheduled run (`#14`, `32718173551`) failed on the near-entirety of its sweep and the
owner-cancelled run (`#15`, `32767800984`, cited in dispatch #91) failed 120/120. Production,
Case F, and this session's Case G all agree: **2026-08-24 saw no observed successes at all**, at
any layer, from any caller.

**What run 3 adds beyond "still failing":** varying connection freshness deliberately (one long-
lived reused connection in runs 1–2, vs. a fresh TCP+TLS handshake on all 20 trials of run 3) is a
genuinely new axis dispatch #91 never tested — and it made no difference either. TLS protocol
(`TLSv1.3`) and cipher (`TLS_AES_128_GCM_SHA256`) were identical on every connection; TLS
session-ticket reuse (`isSessionReused()`) varied true/false across trials with no relationship to
anything (there was nothing for it to correlate with, since every trial failed); local port
naturally incremented with each new connection. None of it mattered, because the response was the
same 403 regardless of whether the underlying socket was a minute old or a hundred milliseconds
old.

**Verdict: no real, controllable difference exists at the wire level, because no success occurred
in this session to diff against a failure.** This is exactly the outcome the dispatch names as a
legitimate answer ("if nothing differs... record that plainly — it's what makes Track B the actual
resolution"), sharpened by three data points instead of one: the failure is not explained by
anything this codebase sets or controls (not the token — dispatch #91; not the body, store, date,
builders, or headers — dispatch #91; not connection freshness or TLS session state — this
session). Combined with #91's 200/200/403 split on the identical unit across separate runs, the
most parsimonious remaining account is a backend-side, time-varying authorization decision (IAM
policy propagation lag, a canary/rolling deploy serving a stale or negative-cached policy verdict
to some fraction of requests or time windows, or similar) — not reachable or fixable from this
repository. **QSRSoft support remains off the table per the owner's standing instruction; this
finding is recorded for the record, not as the basis for any outreach.**

Tooling shipped for future use (Case G stays in the probe script, gated by `PROBE_WIRE_TRIALS`,
`0` to skip, `PROBE_WIRE_DELAY_MS` to control trial spacing) — if a future run happens to straddle
a success/failure boundary, the trace is already there to diff without rebuilding anything.

### Track B — resilience, shipped regardless of Track A's answer

**1. Run-level correlation, investigated before touching frequency or retry logic (per the "do
NOT add per-request retry-on-403" guard).** Evidence gathered this session, all from the CURRENT
(post-#83-rebuild) code on `mac-mini-qsr` — pre-rebuild Playwright-era runs on `ubuntu-latest`
were excluded as not code-comparable:

- Production run `#14` (`32718173551`, today's scheduled run): near-total 403 across its whole
  sweep, uniform.
- Production run `#15` (`32767800984`, owner-cancelled, cited in dispatch #91): 120/120 units
  failed before cancellation, uniform.
- This session's three Case-G runs: 10/10, 15/15, 20/20 — each internally uniform.
- Dispatch #91 part 2's own three separate Case-F runs on the identical unit: 403, then 200, then
  200 — mixed **across** runs, never **within** one.

**No run inspected this session or cited in dispatch #91 ever showed a mixed outcome within
itself** — every run is either uniformly good or uniformly bad, and the good/bad split happens
between runs, not between requests inside one run. That is the run-level-correlation signature the
dispatch's decision table asks for, now with more than the original two data points. Per-request
retry-on-403 stays un-added, per the guard (and per `#616`'s Cognito-throttle precedent).

**2. Schedule changed from once daily to every 2 hours** (`.github/workflows/qsrsoft-security-events-pull.yml`, cron `0 10 * * *` → `0 */2 * * *`) — 12 scheduling opportunities/day instead of 1, so a
bad multi-hour window costs hours of coverage instead of a full day. The existing 216-unit sweep
and its outcome-tracker/failure-rate gating are unchanged.

**3. Idempotency verified live, not assumed, before shipping the frequency change** — the dispatch's
own explicit precondition. Upserted a synthetic row to `qsr_security_events` via the real
`onConflict` target (`tenant_id,loc,event_token,event_dt,event_tm,order_key`, the actual unique
constraint added by `supabase/schema-qsr-security-events-upsert-fix.sql`), then upserted the same
key again with a changed field. Result: **same `id`, `event_name` field updated in place, exactly
one row for the key both times** (HTTP 201 then 200, not a duplicate). Re-pulling an already-
covered unit under the new 2-hour cadence overwrites, never duplicates. Synthetic row deleted
after the check.

**4. Real coverage measured, and it changes the urgency here.** Querying `qsr_security_events`
directly with the service-role key (`content-range: */0` on every read — `select event_dt order by
event_dt desc limit 1`, a plain row count, and a 14-day-window distinct-date scan; calibrated
against the same key returning real rows on `qsr_daily_activity` (599,724), `qsr_ebos_daily`
(8,569) and `qsrsoft_kb` (208) in the same session, so this is a real empty table, not a blocked
credential): **the table has zero rows, right now.** The one nominal "success" in dispatch #91's
own 10-run history (`#9`, `32667628183`) was re-examined by pulling its actual job log rather than
trusting its green checkmark: it ran the **pre-#83-rebuild Playwright code**
(`QSRSOFT_SECEVENTS_START_DATE: 2026/08/22` — **slashes**, the exact silent-zero-day bug the
current `dateList()` now throws on) and its own output reads `0 day(s) × 27 store(s) × 8 event
token(s)` → `done — 0 row(s) parsed, 0 saved` → exit 0. **It was the zero-date no-op, not a real
pull.** So the honest current picture is not "~10% success" — it is **0 real successful pulls
recorded in this table's entire history**, a materially worse and more urgent state than the
dispatch's own framing, now fixed going forward by the `dateList()` validation already on `main`
(no code change needed here) and made visible per item 5 below rather than staying hidden behind
a green run.

**5. Rolling coverage made visible in-app, not just per-run pass/fail** — CLAUDE.md's own standing
rule for every automated pull, applied here for the first time on this stream:
- `loadQsrSecurityEventsCoverage()` (new, `src/lib/supabase.js`) returns count/from/to/latest-sync
  **plus** `coveredDays`/`windowDays` — distinct `event_dt` values with at least one real row in a
  trailing 14-day window, not a min/max span that would read "fresh" while covering almost none of
  the days inside it (the exact pooled-`Math.max` blind spot `#171` already fixed for At-A-Glance,
  applied here before this stream's own version of that bug could hide behind a min/max tile).
- Data Manager (`DataManagerPanel`, `src/views/analytics.js`) gained a **QSRSoft Security Events**
  row in the Auto-Synced section, showing `coveredDays/windowDays` (color-graded red/amber/green)
  as its primary number — right now it correctly reads **0/14d**, matching item 4's measurement —
  plus a `↻ Sync` button.
- `trigger-dar-sync` (`supabase/functions/trigger-dar-sync/index.ts`) gained a `secevents` entry in
  its workflow allowlist so that Sync button can dispatch `qsrsoft-security-events-pull.yml`.
  **This edge function needs `supabase functions deploy trigger-dar-sync` before the button works**
  — this session has no Supabase CLI access to do that deploy (same constraint noted in dispatch
  #90/#91/#92's own resolutions); the coverage tile itself (a plain client-side read) works
  immediately on merge, independent of that redeploy.
- The stream was already correctly listed in `sync-failure-watch.yml`'s `workflows:` (added when
  the pull was first built) — verified present, no change needed there.

**Suite: 2252/2252 passing, `npm run build` clean, 518.44 KB gzip eager payload (unchanged --
`DataManagerPanel` is already lazy-loaded).**

### Verification bar — honestly assessed

**Track A's bar is met**: a real, reproduced trace comparison exists (three separate live runs,
45 trials, two connection regimes) and its finding — no wire-level difference surfaced, because no
success occurred to compare against a failure, which is itself informative given the corroborating
production evidence — is recorded with the actual evidence above, not a guess.

**Track B's bar (coverage materially better than ~10% over a few days) is NOT yet met and cannot
be from this session** — it requires real time and real scheduled runs to accumulate under the new
2-hour cadence, exactly as the dispatch's own verification bar says ("this needs real time to pass
... don't declare success from one lucky run"). What this session *can* and does certify: the
schedule change is live on this branch, idempotency is verified against the real database (not
assumed), and the coverage measurement that will judge the new cadence is now visible in-app
instead of requiring a Supabase console query. **Follow-up needed, from a session running after
the new cadence has had a few days to accumulate real runs:** re-read the Data Manager coverage
tile (or query `qsr_security_events` directly) and confirm `coveredDays` has moved off `0`.
