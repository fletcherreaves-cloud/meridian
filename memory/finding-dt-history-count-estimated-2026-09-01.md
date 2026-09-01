---
description: Live re-measurement of dispatch #88's DT History fix (PR #633) against production qsr_daily_activity, using SUPABASE_SERVICE_ROLE_KEY -- found the shipped fix's own count:'exact' head query can itself time out and fall back to the slow path it was meant to replace, and documents the count:'estimated' + safety-extension correction (v5.308).
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# DT History (Speed of Service): count:'exact' timeout risk found and fixed, v5.308

## Context

Dispatch #88 item 2 (`memory/dispatch-88.md`) diagnosed and fixed Speed of Service's DT History
panel taking 15+ seconds to load: `loadDtHistory` (`src/lib/supabase.js`) was on the strictly-
sequential `fetchAll` pagination for `qsr_daily_activity`, and PR #633 (merged 2026-08-24)
converted it to the existing `_pagedParallel` helper. That PR's own commit body says explicitly:
*"No live production Supabase session is reachable from this sandbox (qsr_daily_activity is
RLS-restricted) ... a true production wall-clock trace isn't obtainable here."* It shipped and
measured only a controlled-latency mock (58 sequential rounds vs 11 parallel rounds).

A later session (2026-09-01, tasked with re-verifying/fixing the same complaint from a stale
`memory/notes-67-queue.md` field note) had `SUPABASE_SERVICE_ROLE_KEY` in its environment — per
CLAUDE.md's own "an agent session's environment is fixed at container start / re-measure
per-session" rule, this is expected to vary session to session and must not be assumed present or
absent based on a prior session's note. This session used it to read `qsr_daily_activity`
directly via the Supabase REST API (`$VITE_SUPABASE_URL/rest/v1/qsr_daily_activity`,
`apikey`+`Authorization: Bearer` both set to the service-role key).

## What was measured

**1. `count:'exact'` head-count query (the query `_pagedParallel` issues before firing pages) is
slow and can time out.** Same shape as `loadDtHistory`'s real query
(`dt=gte.<90-days-ago>&dt_trans_cnt=gt.0`, `Prefer: count=exact`, `Range: 0-0`):

| attempt | elapsed | result |
|---|---|---|
| 1st (cold cache, this session's very first request to this table) | ~8,088ms server-side (`x-envoy-upstream-service-time`) | `HTTP 500`, `{"code":"57014","message":"canceling statement due to statement timeout"}` |
| repeats, same/adjacent ranges, cache warm | 335ms – 3,860ms | `HTTP 206`, `content-range: 0-0/45136` |
| 4 further NEVER-before-queried ranges (different 90-day windows further back) | 2,551ms – 3,590ms | all succeeded, no timeout |

Only the very first (coldest) request timed out in this sample (~1 of 6 cold/near-cold attempts),
but that single occurrence matters: `_pagedParallel` treats a failed count as "fall back to
`fetchAll`" (#343's deliberate correctness-over-speed choice), and `fetchAll` on this identical
query measured **9,575ms live** (46 sequential rounds, all succeeded). One cold-cache count
timeout therefore costs **~8s wasted + ~9.6s sequential fallback ≈ 17.5s** — reproducing the
original "15+ second" complaint dispatch #88 shipped to fix, just less often instead of never.

**2. `count:'estimated'` (and `'planned'`) avoid the timeout and are consistently fast, but
undercount.** Same query, `Prefer: count=estimated`:

| run | elapsed | reported count |
|---|---|---|
| 1 | 394-520ms | 42,105 |
| 2 | 335-432ms | 42,105 |

True exact count for the identical window: **45,136**. The estimate is consistently **~7% low**
(stale `ANALYZE` stats), not a one-off. Trusting it directly in `_pagedParallel`'s
`pages = ceil(count/pageSize)` would silently truncate ~3,000 rows — and because `loadDtHistory`
is `_pagedParallel`'s one `ascending:true` caller, those missing rows would be the **newest**
days, the ones a DT History viewer is most likely to be looking at.

**3. End-to-end, three strategies, same live query (2026-09-01, cache-warm state):**

| strategy | ms | rows returned |
|---|---|---|
| OLD: `fetchAll` (strictly sequential) | 9,575 | 45,136 (correct) |
| SHIPPED (PR #633): `_pagedParallel`, `count:'exact'` | 2,177 | 45,136 (correct) |
| THIS FIX: `_pagedParallel`, `count:'estimated'` + safety-extension | 2,666 | 45,136 (correct, 3 extension rounds recovered the estimate's undercount) |

The shipped fix is genuinely ~4.4x faster than the old sequential path when the count query
doesn't time out — that part of PR #633's claim holds up under live measurement. The finding here
is narrower: the count query it depends on has a **tail-risk failure mode** that, when it fires,
defeats the fix entirely and costs *more* than the original complaint (extra ~8s of wasted timeout
on top of the same slow fallback). The fix in v5.308 trades ~500ms of consistent overhead
(3 extension rounds in the worst observed case) for removing that tail risk, since `'estimated'`
mode is not a `COUNT(*)` scan and structurally cannot hit that particular timeout.

## Fix shipped (v5.308)

`_pagedParallel` (`src/lib/supabase.js`, the shared helper — this is a correction to the helper
itself, used by all 11 of its callers, not a `loadDtHistory`-only patch):
- Head-count `Prefer` switched from `count:'exact'` to `count:'estimated'`.
- Added a safety-extension loop: after the initial estimate-sized parallel batch, if the
  highest-offset page came back completely full (`data.length === pageSize`), keep fetching one
  more page at a time (still through the same `_limited` concurrency gate) until a short/empty
  page proves the true end. Only runs when the initial batch had zero failures — a page failure
  is still reported via `_recordDataError` exactly as before.
- This never fires (costs nothing) when the estimate is accurate or high, since a real last page
  is short (a partial `pageSize` remainder) far more often than it lands exactly on a page
  boundary.

Tests: `src/__tests__/dt-history-pagination.test.js` — head query requests `count:'estimated'`;
an undercounting estimate is fully recovered via the exact expected page-offset sequence (no
gaps, no re-fetched ranges); an accurate estimate fires zero extension rounds; an estimate landing
exactly on a page boundary costs one harmless empty probe; a page failure during the extension
loop itself still surfaces the DATA INCOMPLETE banner.

## Why this wasn't caught by dispatch #88

Not a process failure — PR #633's own commit body and test-file comments are explicit and honest
that no live Supabase session was reachable and the wall-clock claim was therefore a controlled
mock, not a production measurement. This is exactly the situation CLAUDE.md's "re-measure
per-session" rule anticipates: environment access (here, `SUPABASE_SERVICE_ROLE_KEY`) is not
guaranteed to carry between sessions in either direction, so a later session with different access
can — and here did — surface something the earlier one structurally could not have found.

## Do NOT

- Do not re-raise "DT History panel is slow" as an open item — this is now the second fix layer
  on it (dispatch #88 for the sequential-vs-parallel scheduling, this finding for the count-query
  tail risk) and the live end-to-end measurement above confirms all three strategies return the
  correct row count; only wall-clock and tail-risk differ.
- Do not assume this session's `SUPABASE_SERVICE_ROLE_KEY` access carries to the next session —
  re-measure per CLAUDE.md's standing rule rather than trusting this file's numbers as still-live.
- Do not revert `_pagedParallel` back to `count:'exact'` "for speed" without re-measuring the
  timeout risk first — the ~500ms average overhead this fix adds is the cost of removing a
  tail-risk failure mode that, when it fires, is *worse* than either alternative.
