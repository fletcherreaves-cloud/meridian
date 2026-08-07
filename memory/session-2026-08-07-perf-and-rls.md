---
name: session-2026-08-07-perf-and-rls
description: The 2026-08-07 session — cold start 183s → 59s (time-to-usable 150s → 5s), per-loc RLS shipped after a rollback, two public-write holes closed, and seven wrong assumptions caught by live queries. Read before touching startup load or RLS.
metadata:
  type: project
---

# 2026-08-07 — startup performance + RLS

## Outcome

| | baseline | end of day |
|---|---|---|
| time to usable (T1) | ~150s | **5.1s** |
| total load (T3) | 182.9s | **59.3s** |
| HTTP 500s per login | 3 → 24 (peak) | ~0 |
| rows fetched per login | ~250,000 | materially fewer |

**Every blocker on onboarding a restricted user is closed.** Set `accessible_locs`
on a profile and that user sees only their stores, enforced by the database.

## What actually caused the slow start

Not one thing — four, found by tracing production (`?trace=1`, `src/utils/load-trace.js`):

1. **Five loaders fetched the ENTIRE table history every login** — `loadLaborRows`,
   `loadOpsRows`, `loadCtrlRows`, `loadAuditRows`, `loadPeaksRows`. ~150k of the
   ~250k rows. Now windowed to 400 days (covers vs-LY 365 + `BT_DAYS=400`).
2. **No index on `qsr_daily_activity.dt`.** PK is `(loc, dt, hour_slot)` — leading
   column `loc` — so every "last N days" query seq-scanned 367,562 rows. 2.70s → 0.37s.
3. **`audit_rows` paged 23 times sequentially** via `fetchAll`, owning the last 37s
   of the load on its own.
4. **28 startup stages ran serially.** Tiered into T1/T2/T3.

⚠️ **The serial chain was accidentally rate-limiting us.** Parallelising it without
adding back-pressure sent 100+ requests at once and made total time AND error rate
worse (v4.846, v4.847). A global in-flight cap of 6 was the missing piece.

## The rollup view: shipped, then shelved

A daily `GROUP BY` view over the hourly DAR table (24× fewer rows) failed twice:
- without `security_invoker` it **bypassed RLS entirely** and served sales data to
  the public anon key;
- with `security_invoker` it evaluates RLS per row while aggregating 367k rows and
  hits the statement timeout.

Now **service-role only**. The correct design is a rollup **TABLE** written by the
DAR pull (which already runs as service role) carrying `tenant_id`, read by the
client with ordinary cheap RLS. Not built yet.

## Per-loc RLS — the measured design

First attempt applied 51 policies calling `can_see_loc(loc)` — the ROW's loc as an
argument, so per-row evaluation with a `profiles` subquery each time. Timed out on
`qsr_daily_activity`, emptied the Sales/vs-LY/GC/TPPH tiles. Rolled back.

Rebuilt from EXPLAIN ANALYZE on the real table. Four designs, three eliminated:

| design | result |
|---|---|
| per-row correlated function | **timed out** |
| `= any ((select …))` | **parse error** — `ANY` parses a scalar subquery as the SUBQUERY form; array membership needs an array expression |
| bare no-arg `STABLE` function in the filter | **590 ms** — not auto-hoisted, `profiles` hit per row |
| **`(select public.my_locs())` wrapped** | **13.8 ms** — InitPlan, `loops=1` ✅ |

Restricted path verified separately: hashed SubPlan `loops=1`, filtering to 2,928 of
39,528 rows (exactly the 2 permitted stores), 53ms warm.

Three load-bearing details:
- **`AS RESTRICTIVE`** — permissive policies OR together, so a permissive per-loc
  policy beside the tenant ones would GRANT more, not less.
- **The `(select …)` wrapper** — without it, the 590ms version.
- **`ltrim` on both sides** — `qsr_*` store `'0003708'`, everything else `'3708'`.
  A padding mismatch in a security policy fails CLOSED and reads as "RLS is broken".

Files: `supabase/schema-rls-my-locs.sql` (run first), `schema-rls-phase2-loc.sql`.

## Security findings

- **`tasks` and `session_notes` were publicly READABLE AND WRITABLE** by the anon
  key. Closed — tenant-scoped like the other 68 tables.
- **`qsrsoft_kb`** had public write. Now read-only; writes via service role.
- **The "68 tables with defeated isolation" alarm was WRONG.** The diagnostic counted
  `qual IS NULL` as world-open — that is how *every INSERT policy* looks. Tenant
  isolation was real all along. ⚠️ Any future audit must test
  `coalesce(qual,'true')='true' AND coalesce(with_check,'true')='true'`.
- Multi-tenant Phase 1 + 2 were already applied (199 tenant-scoped policies).

## Real numbers (replaces the estimates in capacity-and-onboarding-review.md)

`qsr_daily_activity` 367,562 · `labor_rows` 42,156 · `ops_rows` 41,260 ·
`ctrl_rows` 41,510 · `audit_rows` 21,929 · **database 473 MB**.
Postgres is not strained; **egress is the constraint**, and it self-reinforces —
latency degraded from ~1-4s early in a load to 10-18s late.

## Seven wrong assumptions, all caught by live queries

RLS through views · `count:'exact'` on an aggregating view · `.range()` overriding
`db-max-rows` · `tenant_id` on a table never checked · jsonb vs `text[]` · an
uncommented rollback block · a no-arg STABLE function being auto-hoisted.

**Every one was caught by querying the live database. None by review.** Two reached
production (a public data exposure, and a timeout that emptied four tiles); both were
caught within minutes because `.env.local` was in place.

**The standing lesson: verify every assumption a statement depends on BEFORE running
it — especially the ones that seem too obvious to check.** Cold-cache readings also
fooled us twice (12.26s → 0.17s, 1007ms → 53ms); always re-measure warm.

## Still open

- Rollup **table** to replace the shelved view (~19-25× less on the largest stream)
- Golden-dataset regression tests — would have caught most of the above in CI
- PR #93 merge
- The failing `QSRSoft eBOS Purchases Pull` Action
- Service-role key rotation (owner deferred, key was pasted into a chat log)
- UI/UX redesign — owner wants Opus **plan mode** and alignment first
