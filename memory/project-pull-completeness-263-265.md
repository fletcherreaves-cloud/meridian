# Pull failure detection + completeness ledger (#263 + #265)

Shipped together, per the dispatch's own framing: "they ship as one or neither works." #263
makes a pull say so when it KNOWS it failed. #265 catches the gaps a pull never saw at all —
QSRSoft had no row, no error was ever thrown, and the pull reported success truthfully. Neither
one substitutes for the other; the critical caveat in the originating issue is that neither the
Sulphur nor the Marietta outage would have been caught by #263's checks alone, because neither
pull actually failed.

## Review fix (2026-08-14) — `qsrsoft-ops-pull.mjs` was missing, and it's the one that mattered

The PR review on #269 caught a real gap the dispatch itself introduced: the audit list named
"every script sharing that auth ladder" and then enumerated seven — `dar-pull`, `ebos-pull`,
`onhand-pull`, `variance-pull`, `employee-roster-pull`, `roster-stats-pull`, `lifelenz-pull` —
omitting `qsrsoft-ops-pull.mjs`. That is the script that produced the **actual incident this
issue exists for**: a backfill chunk logged `[ops] done — 0 rows upserted across 6 endpoints`
after both auth paths failed, and exited green anyway. It's also the widest-blast-radius script
in the set (six endpoints, arbitrary date ranges, used for every backfill).

Fixed the same way as the other seven: `makeOutcomeTracker` wired into `runAll()`'s existing
per-(endpoint, date) `try/catch` (was already there, just never fed into a tracker) and all
three of the script's exit paths (the default full pull, the cash-anomaly targeted re-pull, and
the Live Pulse hourly capture). The pulse path's zero-rows check is on the TOTAL across its 4
keys, not per-key, so `service`'s documented same-day emptiness doesn't false-positive — only
all four keys landing at zero does, which is the real failure. `formatRerun` reuses the script's
own existing `QSRSOFT_OPS_START_DATE`/`END_DATE` override, since that's real and the review
specifically noted it (unlike the three scripts correctly flagged as having no rerun mechanism).

Also fixed the schema comment the review flagged as non-blocking but worth doing now:
`data_completeness_incidents.loc` is written **padded** (`nsn7()`, matching
`qsr_service_stats`/`qsr_daily_activity`) but the original comment said "unpadded, matches
STORE_NAMES keys" — backwards. Functionally harmless today (everything written is internally
consistent), but a wrong comment is how the next person joins `STORE_NAMES` unpadded and quietly
breaks the `unique (tenant_id, loc, stream, date_start)` constraint's deduplication — this repo
has four documented loc-padding incidents (v4.809/823/827/831), all silent failures. Corrected to
say padded and to point at `ltrim(loc,'0')` for a `STORE_NAMES` join.

## #263 — shared failure tracker (`scripts/lib/pull-outcome.mjs`)

Audited all 7 scripts sharing the auth ladder before touching anything (see the audit table this
doc distills). Real findings, not assumed uniform breakage:

- **`qsrsoft-dar-pull.mjs` had a genuine bug**: `pullViaPlaywright` returned `0` (not `null`) when
  DAR-token capture itself failed — a total auth failure — but `main()`'s `=== null` check let a
  bare `0` sail through as "0 rows upserted, exit 0." Fixed to return `null`, matching every other
  auth-exhausted path in the file.
- **Zero-rows-exit was already correct** on `qsrsoft-employee-roster-pull.mjs` and
  `qsrsoft-roster-stats-pull.mjs` (`if (!saved) process.exit(1)`); missing everywhere else,
  including `lifelenz-pull.mjs`, where an all-empty CSV run exited 0.
- **No script tallied partial per-date/per-store failures against a threshold.** All of them
  logged `ERROR`/`console.warn` inside a `try/catch` and kept going, with nothing counting failed
  units against the total attempted.
- **`lifelenz-pull.mjs`'s `fetchReportChunk` swallowed real fetch/HTTP errors into `[]`**,
  indistinguishable from "this schedule genuinely has zero shifts in this window." Now throws on
  a real failure; the caller's per-chunk `try/catch` tells the two apart.

`makeOutcomeTracker(label, opts)` gives every script three checks: auth failure (unchanged,
script-owned), zero rows saved across a non-empty requested scope, and a failure-rate threshold
(**25%, `FAIL_THRESHOLD_PCT` in `pull-outcome.mjs` — a first cut, not measured**; there is no
prior data on "how often does an individual date/store legitimately fail" because this tally has
never existed before. Recalibrate once real runs accumulate under it, the same way the swing
alarm's -10% and the count-completeness 0.75 were picked from measured distributions rather than
chosen up front).

Applied to all 7: `qsrsoft-dar-pull.mjs`, `qsrsoft-ebos-pull.mjs` (both the direct-token path and
the Playwright path, whose per-store loop runs inside `page.evaluate` and can't reach the Node
tracker directly — its `log` array is parsed after the fact for `"NSN X error"`/`"NSN X HTTP"`
lines instead), `qsrsoft-onhand-pull.mjs`, `qsrsoft-variance-pull.mjs`,
`qsrsoft-employee-roster-pull.mjs`, `qsrsoft-roster-stats-pull.mjs`, `lifelenz-pull.mjs`.

**Re-runnable failed-unit form differs by script shape, deliberately not forced into one
pattern**: `dar-pull` is truly per-date, so a failed date reruns via
`QSRSOFT_DAR_START_DATE=<d> QSRSOFT_DAR_END_DATE=<d>`. `variance-pull` has a real
`VARIANCE_STORES` override. `employee-roster`/`roster-stats` reuse `ROSTER_STORES`. **`ebos-pull`,
`onhand-pull`, and `lifelenz-pull` have no store/chunk-subset override today** — their
`formatRerun` says so honestly rather than inventing one; adding those flags is a real, separate
follow-up (scope creep beyond failure *detection*, which is what #263 asked for).

`src/__tests__/pull-outcome.test.js` covers the tracker directly (8 cases: pass, empty scope,
zero-rows-exit, under-threshold tolerance, over-threshold exit, custom threshold, formatRerun
invocation/contents, `failedUnits()`). The 7 scripts themselves are not vitest-covered (no
existing precedent for testing `scripts/` — they're Node CLIs run by GitHub Actions, verified here
via `node --check` on every file plus a careful diff read, not a live run against real QSRSoft
credentials from this sandbox).

## #265 — completeness ledger (`data_completeness_incidents`)

`supabase/schema-data-completeness.sql`, following `schema-coaching-cycles.sql`'s convention (the
newest tenant_id + RLS pattern in this repo, not the tenant_id-less older tables like
`org_events`): `tenant_id uuid default '00000000-0000-0000-0000-000000000001'`, a RESTRICTIVE
per-location policy via `my_locs()`, `classification`/`cause`/`recovery_status` as `check`-
constrained enums (not a real Postgres `enum` type — a `text check (...)` is easier to extend
without a migration, same tradeoff already made elsewhere in this schema).

**Ranked by unrecovered days, not outage length** (`printRanking()` in
`scripts/check-data-completeness.mjs`): `floor((now - detected_at) / 1 day)` for every row still
`recovery_status = 'open'` and not `classification = 'legitimate'`. A 1-day gap sitting open for
200 days outranks a 30-day gap fixed yesterday — outage length alone hides exactly that, which is
the issue's own explicit framing.

**Tolerates the documented legitimate cases** (`KNOWN_LEGITIMATE` in the script, sourced from
`memory/store-events-material-changes.md`, not re-derived): Christmas 2025-12-25 (district-wide),
Sulphur's Easter closure and its 8-day KVS outage, Marietta's single upstream hole, Madill's
isolated day, and the four January-2026-storm store/date pairs. Also excludes any (loc, date)
before that store's first trading day (`FIRST_TRADING_DAY`, currently just Ponce de Leon
2026-03-13) — a store that didn't exist yet is not a gap. **This is explicitly a seed list, not a
claim of completeness** — it covers the incidents already on record, not every legitimate gap that
will ever occur. New ones get classified by a human reviewing an `unclassified` row and are
expected to feed back into this list over time (or, better, into the table itself — see below).

**Scope, stated plainly rather than silently**: ships with **2 of the streams #263 touches**
(`qsr_service_stats`, `qsr_daily_activity`) — the two with documented real incidents against them
in the material-changes register, which is what the tolerance rules above were designed against.
The other five (`qsr_ebos_daily`, `qsr_onhand`, `qsr_variance_stat`/`qsr_waste`/etc.,
`roster_role_counts`/`roster_statistics`, `lifelenz_schedules`) are a real gap in this ledger's
coverage, not touched here because there is no known incident yet to design their own tolerance
rules against — guessing at those risks the same failure mode this whole feature exists to avoid
(a plausible-sounding rule that's actually wrong). Extend `STREAMS` in
`scripts/check-data-completeness.mjs` when the next real incident on one of them justifies it.

**Restricted handling — NOT YET WIRED.** The `notes` column can carry accountability content
(the issue's own words) — a manager's account of why data went missing, potentially naming
someone. Per `memory/project-sage-knowledge-grounding.md`'s handling-notice convention, any UI or
SAGE surface that displays this column must prepend the same mandatory notice restricted
disclosures already carry elsewhere, gated to appropriate roles, generated with the content rather
than bolted on at render. **This issue's scope is the schema and the detection script — no review
UI or SAGE tool reads this table yet.** Building one without the gate would ship exactly the
`finding-padding-and-cash-hunt-2026-08-13.md` exposure risk that memory file warns about. Left
explicitly undone rather than half-built.

**Incident matching is by `(tenant_id, loc, stream, date_start)`, not a full range match.** A
re-run preserves a human's prior `classification`/`cause`/`recovery_status` if the same
`date_start` reappears (so reviewing an incident once doesn't get silently reverted by the next
scheduled run), but if a gap's shape changes non-trivially — a partial backfill splits one run
into two, or `date_end` shrinks — the upsert doesn't reconcile that cleanly. A known first-slice
limitation, not a silent one.

## Verification

`node --check` on all 7 pull scripts, `pull-outcome.mjs`, and `check-data-completeness.mjs`.
`npm test` — 1366/1366 (1358 existing + 8 new for the tracker). `npm run build` — clean, no bundle
impact (scripts/schema/workflow-only change). The new scheduled workflow
(`data-completeness-check.yml`) is added to `sync-failure-watch.yml`'s watched list — verified by
`src/__tests__/sync-failure-watch.test.js` passing, which enforces both directions (unwatched
scheduled workflow fails the suite; a watched name matching no real workflow also fails it).

**Not run against live QSRSoft/Supabase from this session** — both QSRSoft tokens are currently
stale (see the standing note elsewhere in this session's dispatch), and this table has not yet
been created in production (the schema file needs a manual run in the Supabase SQL editor, same
as every other `schema-*.sql` file in this repo).

## Related

- `memory/store-events-material-changes.md` — the source of every `KNOWN_LEGITIMATE` entry
- `memory/project-sage-knowledge-grounding.md` — the restricted-handling convention `notes` needs
- `scripts/lib/pull-outcome.mjs`, `scripts/check-data-completeness.mjs`,
  `supabase/schema-data-completeness.sql`
