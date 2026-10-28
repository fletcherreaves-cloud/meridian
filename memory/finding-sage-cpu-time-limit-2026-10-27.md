# SAGE "never finishes" on complex questions — root-caused to Supabase Edge Function CPU-time budget (2026-10-27)

## Summary

v5.590 (final-round nudge) and v5.591 (round budget raise + daypart/staffing tools) fixed the
narration-loop symptom but did **not** fix the owner's original report. Live-tested the exact
original night-shift planning prompt against the deployed v5.591 function four times, with an
SSE-parsing-corrected test harness (ruling out the test script itself): every run died with no
`[DONE]` and no error event, always during the idle gap while a large tool call (`query_daily_activity`
or `query_staffing_presence`) was executing server-side.

**Root cause: Supabase Edge Functions enforce a CPU-time budget per invocation — reported as low
as 200ms-2s of *actual compute*, excluding time spent awaiting I/O** (network to Postgres, network
to Anthropic). Exceeding it triggers a silent `CPUTime shutdown` / HTTP 546 at the runtime level,
which bypasses our own `try/catch` entirely — no error event reaches the client, the connection
just dies. Source: https://supabase.com/docs/guides/troubleshooting/edge-function-cpu-limits
(figures are inconsistent across Supabase's own pages — 200ms vs 2s — but both are far below what
a genuinely complex multi-tool-call conversation needs).

This is a genuinely different failure mode from the one v5.590/v5.591 fixed, and it is NOT a
wall-clock timeout, round-budget problem, or narration problem. Elapsed time to failure varied
wildly across identical re-runs (25s / 52s / 56s / 62s / 93s) precisely because the trigger is
cumulative CPU-**seconds** consumed, not wall-clock elapsed — which also explains why adding
concurrency (this same dispatch's `paginate.js`/`index.ts` fix, below) made some runs fail
*faster* in wall-clock terms: the same total CPU-bound JSON-parsing/aggregation work got
front-loaded into a shorter window, not reduced.

## What this dispatch DID fix (verified)

`fetchAllRows` (`supabase/functions/sage-chat/paginate.js`) paged strictly serially — one network
round trip per 1000-row page, awaited one at a time. Measured directly against production:
- District-wide 90-day `query_daily_activity` pull: 59 pages, **10.7s** serial.
- Wide-range `query_staffing_presence` pull (full ~150-day available history): 120 pages, **43.2s** serial.

Rewrote it to fire pages in concurrent batches of 6 instead of one at a time — same correctness
guarantees (ordered reassembly despite out-of-order completion, short/empty-page end detection,
error short-circuit). This is a real, independently valuable latency win verified by a live test
of a SIMPLE question (single tool round) completing in 12.5s end-to-end with a correct, complete
answer, store names, and correct OEPE/KVS/R2P math.

Also parallelized tool execution **within** a single model round (`Promise.all` instead of a
sequential `for...await`), since the system prompt already tells the model it can call multiple
tools simultaneously for a cross-domain question, and serial execution was throwing that away.
Investigated and ruled out as a NEW problem in its own right (see "ruled out" below) — kept because
it's still a correct, beneficial change for the common case.

## What remains broken

A question broad enough to need many large, CPU-heavy aggregations in one turn (the original
"90-day + YTD + last-year, multiple states, multiple metrics" night-shift prompt) can still
exceed the Edge Function's CPU-time budget and die silently, **even after this dispatch's fix**.
The pagination fix reduces wall-clock latency (less time spent idle, waiting on network I/O) but
does **not** reduce total CPU-seconds spent parsing and aggregating JSON — that work (building
arrays/Maps/objects from tens of thousands of rows per call, several calls per turn) is the actual
constraint, and no amount of request-level concurrency changes it.

**The real fix is server-side aggregation**: push the GROUP BY/SUM work into Postgres (an RPC or
view) so each tool call returns a small number of pre-aggregated per-store rows instead of tens of
thousands of raw rows for the Edge Function to parse and fold in JS. This is a real, nontrivial
build (new Postgres functions per aggregation shape, migrating `daily-activity-agg.js` /
`staffing-presence.js` and their call sites) — not started, scoped here as the next real step, not
attempted in this dispatch given the size of the change and the standing rule not to ship
unverified claims.

## Ruled out during investigation

- **Test harness bug / SSE parsing** — re-tested with a buffer-flush-corrected script; same failure.
- **Test client bypassing the outbound proxy** (Node's built-in `fetch()` doesn't honor
  `HTTPS_PROXY` without `NODE_USE_ENV_PROXY=1` on Node ≥22.21) — re-tested with the proxy properly
  enabled; same failure, same shape.
- **Postgres connection-pool exhaustion from stacking concurrency** (tool-level `Promise.all` on
  top of each tool's own 6-way page concurrency, worst case ~12-24 simultaneous connections) —
  tested with tool-level parallelism reverted (page-level concurrency only, tools sequential);
  same failure, same shape, just at a different wall-clock point. Restored the parallelism
  afterward since it isn't the cause and is independently correct.
- **Out-of-memory from a very wide `query_staffing_presence` pull** — directly measured the
  widest plausible range (full available history, 2026-05-27 to today, all stores): 119,428 rows,
  only ~111MB RSS / ~30MB heap in Node. Not remotely close to a plausible OOM threshold, and
  `qsr_punch_times` has a hard floor at 2026-05-27 (confirmed this same investigation) so the
  range can't grow much wider than this regardless of what the model asks for.

## Live test transcripts

Both the successful short-question transcript (12.5s, single tool round, complete correct answer)
and the four complex-question failure transcripts (with per-event timestamps on the last one) are
in the PR/session this finding shipped with, not duplicated here.
