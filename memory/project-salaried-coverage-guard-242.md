# Salaried-manager field guard (#242)

Pre-emptive — no live bug when this landed. Placed ahead of the first real consumer (#211's
Labor instantiation) rather than after, per the owner's explicit request.

## The measurement this protects against (#241)

`qsr_labor_summary` measured over July 2026 (31 days, all 27 stores): `salaried_manager_hours`
and `salaried_manager_dollars` populate **independently**.

| Coverage | n | Stores |
|---|---|---|
| complete (hours>0 AND dollars>0) | 4 | Chipley-St Rd 77, Cottondale, Mossy Head, Freeport |
| partial — dollars only | 2 | DeFuniak Springs, Bonifay |
| partial — hours only | 10 | Chickasha, Seminole, Purcell, Lindsay, OKC-I240/Sooner, Ardmore-Cooper, Elgin, Tecumseh, Harrah, **Ponce de Leon** |
| absent (neither) | 11 | Ardmore-Broadway, Durant, Ada, Atoka, Madill, Duncan, Pauls Valley, Sulphur, Marietta, Holdenville, Tishomingo |

Reading `total_hours`/`gross_dollars` naively on a partial store produces a wrong-in-an-invisible-
direction number, not a missing one: #241 measured Bonifay's average wage **+13.7% high**
(dollars carry salaried cost, hours don't) and Ponce de Leon's hours denominator **+6.7% heavy**
(hours carry salaried time, dollars don't).

**Why not a market rule:** Ponce de Leon is FL and sits in the hours-only (partial) bucket — a
FL/OK-keyed predicate is already wrong today and would silently rot as configuration changes.
Coverage must be derived from the data every time.

## What was built

- **`src/engine/salaried-coverage.js`** — `salariedCoverage(rows)` sums `salaried_manager_hours`/
  `salaried_manager_dollars` across whatever rows the caller passes (one (loc, period) grouping,
  caller's choice) and returns `'complete'|'partial'|'absent'` per #241's own spec:
  `complete = hours>0 AND dollars>0`, `partial = exactly one > 0`, `absent = neither`.
  Also exports `deriveIfSalariedComplete(rows, computeFn)` — a convenience wrapper so a future
  metric (average wage rate, Total Labor %, any productivity figure denominated by `total_hours`)
  returns `null` unless coverage is `complete`, never a plausible-but-wrong value.
- **Guard tests**:
  - `src/__tests__/salaried-coverage.test.js` — unit tests on the classifier itself (complete/
    partial-dollars-only/partial-hours-only/absent/missing-fields/multi-row-sum/no-market-key).
  - `src/__tests__/salaried-coverage-guard.test.js` — source-parses every file under
    `src/engine`, `src/views`, `src/lib`, `src/features`, `src/app` (except the classifier itself)
    for a direct `.total_hours` / `.gross_dollars` / `.salaried_manager_hours` /
    `.salaried_manager_dollars` read, and asserts zero. Currently green because there are zero
    real consumers of these fields yet (#241's own "current state, verified" table) — this is the
    regression guard for the day #211's Labor instantiation (or anything else) reaches for one of
    them without going through `salariedCoverage()` first. `\.total_hours\b` deliberately does
    NOT match `.over_time_total_hours` (the already-verified-safe OT field) since the dot in that
    identifier is followed by "over_time_total_hours", not "total_hours" — verified by running the
    guard test before making any other change, confirming it doesn't false-positive on the fields
    `at-a-glance.js`/`eom-supervisor.js`/`metric-source.js`/`supabase.js` already safely read.

## Explicitly not done (per the issue's own scope)

- **No change to the loader** (`loadOpsLaborSummary` in `supabase.js`). It doesn't currently alias
  `total_hours`/`gross_dollars`/`salaried_manager_*` at all — the raw snake_case fields are already
  available via its `...r` spread for whoever eventually consumes them. The `?? null` (never
  `|| 0`) instruction in #242 is a rule for whoever adds that alias next, not a code change needed
  today (same discipline `supabase.js`'s existing `darSchedHrs: v.total_scheduled_hours ?? null`
  already models).
- **No change to existing consumers** (`at-a-glance.js`, `metric-source.js`, `eom-supervisor.js`,
  `supabase.js`'s `otHrs`/`otDollar` aliases) — they read only the already-safe OT/crew fields and
  work correctly. Left alone, per the issue's explicit instruction.
- **No fix to the upstream QSRSoft/LifeLenz configuration** — 23 of 27 stores being mis-set-up is
  an operational task for the owner, not a code change. Meridian's job is to refuse to report a
  number it cannot compute honestly, not to fix the source data.

## Related

- #241 — the measurement this guard encodes
- #211 — the Labor instantiation this protects (not yet built)
- #236 — labor tail; partial salaried data is a named candidate contributor there, not yet ruled in or out
