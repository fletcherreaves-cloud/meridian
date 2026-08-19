# Dispatch #25 — Workstream C: pipeline contract

**Board (2026-08-19):** `main` at v5.066 (`8ddaacb`). Workstream B (event scope + recurrence)
fully shipped and verified — PR #420 merged, `schema-org-events-scope.sql` run against
production, both RLS policies independently confirmed `RESTRICTIVE` via `pg_policies`. Nothing
outstanding in the queue. This is Workstream C, next in the plan's recommended order (independent
of the front end — can run in parallel with anything else, per
`memory/plan-normalization-2026-08-17.md`).

---

## Correction to the plan before you start — one of the three motivating incidents is already fixed

The plan cites three silent successes from 2026-08-17 as Workstream C's motivation. Checked all
three against current `main` rather than trusting the write-up:

1. **pmix backfill wrote 0 rows, exited 0** — **already fixed.** `scripts/qsrsoft-pmix-pull.mjs`
   (v5.047, `#263`) now exits non-zero on a zero-row run over a non-empty window, and logs
   per-store counts so a partial pull is visible instead of averaging into a plausible total. This
   contradicts `memory/gate-pmix-backfill.sql`'s header, which still says "the fail-fast guard is
   #393 and is NOT MERGED" — that file is stale, don't trust it, and consider updating its header
   in the same PR if you touch pmix again.
2. **email parse ran green 30 times while `sales_ledger_daily` produced nothing** — **already
   resolved, and it was a misdiagnosis, not a bug.** Per v5.057's commit body: the rows were never
   actually lost — `qsr_sales_mix` held the same window — so this was a self-corrected finding,
   not an open pipeline gap. Don't re-chase it.
3. **`catch{}` swallowed the calendar write** — this is `#391`/dispatch19, already fixed
   (the mf_events write-path fix, error logging added to all 6 `localStorage.setItem` sites).

**What's actually still open is the *generalization*** — #263's guard exists in exactly one
script. Measured directly (grepped all pull scripts for the same zero-row-exits-nonzero shape):
**2 of ~19 pull/write scripts have it** (`qsrsoft-pmix-pull.mjs`, `qsrsoft-ops-pull.mjs`). These
do not: `qsrsoft-dar-pull.mjs`, `qsrsoft-ebos-pull.mjs`, `qsrsoft-digital-app-pull.mjs`,
`qsrsoft-employee-roster-pull.mjs`, `qsrsoft-forms-pull.mjs`, `qsrsoft-inventory-history-pull.mjs`,
`qsrsoft-kb-pull.mjs`, `qsrsoft-mcdelivery-pull.mjs`, `qsrsoft-onhand-pull.mjs`,
`qsrsoft-roster-stats-pull.mjs`, `qsrsoft-shift-manager-pull.mjs`, `qsrsoft-turnover-pull.mjs`,
`qsrsoft-variance-pull.mjs`, `lifelenz-people-pull.mjs`, `lifelenz-pull.mjs`,
`qsrsoft-email-parse.mjs`, `qsrsoft-pull.mjs`, `scripts/forecast-week-precompute.mjs`. That's the
real scope of Workstream C's first two contract items.

---

## The contract (three pieces, per the plan)

**1. Assert on what was written, not that it finished.** `qsrsoft-pmix-pull.mjs:444-447` is the
reference implementation — copy the shape, don't reinvent it:
```js
if (total === 0 && dates.length > 0) {
  console.error(`[x] ✗ 0 rows upserted across ${dates.length} requested day(s) — treating as a failed run, not an empty one.`);
  process.exit(1);
}
```

**2. Per-partition counts in the log.** Same file, lines 427-434 — logs `N/27 stores had at least
one row`, and names the missing stores when the run is partial. A 4-of-27 partial becomes visible
instead of averaging into a plausible total.

**3. Freshness SLA per source (`warn_after`/`error_after`).** Genuinely new — nothing in the repo
does this yet. #171's insight (pooled `Math.max` freshness hides one dead feed behind any fresh
sibling — see `CLAUDE.md`'s "adding a new automated pull" standing rule) applies at the pipeline
level here, not the panel level.

## Build the shared module the way this repo already does it

`scripts/_retry.mjs` is the existing convention for a shared script utility: underscore-prefixed,
pure, imported by 6 scripts already (`qsrsoft-dar-pull.mjs`, `qsrsoft-ebos-pull.mjs`,
`qsrsoft-inventory-history-pull.mjs`, `qsrsoft-kb-pull.mjs`, `qsrsoft-variance-pull.mjs`,
`eom-snapshot-pull.mjs`, `compute-hourly-projection-accuracy.mjs`). Build the new runner module
(`scripts/_pipeline-contract.mjs` or similar) the same way — a small set of pure exported
functions (an assert helper, a per-partition-count logger, a freshness-SLA checker), not a
framework the 19 scripts have to be rewritten around.

## C2 — idempotent partition replace

**Also greenfield.** The plan's motivating incident: a backfill pushed ~2.6M upserts and took
Supabase into Cloudflare 522s, collapsing three sibling workflows and the SQL Editor. Checked: the
codebase already treats a 522 as a well-known failure mode defensively on **reads**
(`qsrsoft-dar-pull.mjs`, `qsrsoft-ebos-pull.mjs`, `qsrsoft-pull.mjs`, `lifelenz-pull.mjs`,
`qsrsoft-ops-pull.mjs` all have a comment naming it explicitly), but nothing implements
delete-then-insert-per-date-partition with pacing on the **write** side — every script currently
paginates in ~500–1000-row chunks and upserts, with no partition-level replace semantics. Standard
is delete-then-insert per date partition, paced between partitions (not just between rows within
one upsert call) — makes re-runs cheap and multi-year backfills routine instead of a Cloudflare
incident.

## Scope guidance — don't do all 19 scripts in one PR

Matching the discipline that already worked for Workstream D's ratchet approach in this repo
(seed at today's count, convert opportunistically, never as a sweep): build the shared module,
convert a small bounded slice as proof (one or two of the ungoverned scripts — pick ones due for
other work anyway if any are queued), and leave the rest as a tracked follow-up rather than one
19-script PR. A ratchet test (same shape as `dispatch16`'s R1/R3/R4) that counts scripts missing
the contract and only allows the count to fall is the natural way to track the remaining rollout
without re-deriving the list by hand next time.

## Tracks

**#336.** (`#263` and `#360` are done/resolved — see the correction above, don't re-open either.)

## What NOT to do

- Don't rebuild `#263`'s guard from scratch — generalize the exact shape already proven in
  `qsrsoft-pmix-pull.mjs`.
- Don't touch `scripts/_retry.mjs` itself — it's a separate, already-working concern (transient
  network retry, not write-assertion). The new module sits alongside it, not inside it.
- Don't chase `#360` — it's a resolved misdiagnosis, not an open pipeline gap.
- Don't convert all 19 scripts in one PR — ratchet it, per the scope guidance above.
