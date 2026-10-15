# QSRSoft 7-year rolling retention + the metered backfill campaign

**Owner, live, 2026-10-15:** *"Important learning today, also. QSRSoft retains data only for 7
years on a rolling cycle. Every day drops a day. Good to know. I will eventually want to backfill
all stores data for that period. Set it up whenever convenient and meter the data in if that
works best for limits and such."*

**This is new information, not previously recorded anywhere in this repo** — confirmed by a
targeted research pass across every memory file and code comment mentioning QSRSoft retention,
backfill, or history depth before this dispatch. CLAUDE.md's existing "Data depth is never the
limiter — backfill it" standing rule (and the ops-pull 27-month backfill it cites) was written
without knowing QSRSoft itself has a hard, moving floor — those backfills assumed the data would
simply sit there waiting to be pulled on whatever schedule was convenient. It doesn't: every day
that passes, the oldest day QSRSoft still has falls off by exactly one day. **There is a clock on
this** that didn't exist in any prior framing of "just backfill it."

## What shipped (this dispatch)

1. **`scripts/qsrsoft-ebos-pull.mjs` gained `QSRSOFT_EBOS_START_DATE`/`QSRSOFT_EBOS_END_DATE`.**
   Measured via a dedicated research pass: DAR and OPS already had this exact override
   (`QSRSOFT_DAR_START_DATE`/`END_DATE`, `QSRSOFT_OPS_START_DATE`/`END_DATE`) and already looped
   one day/request at a time; EBOS was the one exception — it did a single unbounded per-store
   API call for however wide a range `getDateRange()` picked, with no backfill override at all.
   CLAUDE.md's blanket claim that "every pull script honours a `*_START_DATE`/`END_DATE`
   override" was **not actually true for EBOS** before this fix.

2. **`scripts/qsrsoft-backfill-driver.mjs`** — the missing auto-advancing cursor. Per-report-type
   (`ebos`/`dar`/`ops`) state lives in the new `qsrsoft_backfill_cursor` table
   (`schema-qsrsoft-backfill-cursor.sql`). Each scheduled run:
   - reads (or bootstraps, from the real destination table's own `MIN(date)`) each type's
     `earliest_date_pulled`,
   - computes the next ~90-day chunk walking backward toward `today - 7 years` (`nextChunk()`,
     a pure function — see `scripts/__tests__/qsrsoft-backfill-driver.test.mjs`),
   - spawns the real pull script as a **subprocess** with that chunk's env vars (importing it
     in-process is unsafe: each pull script calls `process.exit()` at the end of its own
     top-level `main()`, which would kill the driver),
   - advances the cursor only on success — a failed chunk is retried verbatim next run, the same
     idempotent-upsert safety every pull script's own daily re-pull already relies on.
   Marks a type `done` once its cursor reaches the (continuously recomputed, never frozen) 7-year
   floor.

3. **`.github/workflows/qsrsoft-backfill.yml`** — daily cron (`0 12 * * *`, staggered clear of the
   existing DAR/OPS/EBOS daily pull windows at 08:00/10:00 UTC so it never fights them for a
   freshly-minted Cognito token mid-run) + `workflow_dispatch` for a manual kick, with
   `only`/`chunk_days`/`years_back`/`dry_run` inputs. Added to `sync-failure-watch.yml`'s watched
   list (CLAUDE.md's "Adding a new automated pull" standing rule, item 1).

## Why daily / ~90-day chunks ("meter it")

**There is no documented QSRSoft rate limit anywhere in this repo** — the research behind this
dispatch confirmed the only throttling that exists is self-imposed politeness delays already
inside the three pull scripts (150ms/day in DAR, 120ms/request in OPS), which this driver changes
nothing about. So the "meter" knob here is a judgment call, not a measured constraint:
**one ~90-day chunk per report type per day**, deliberately conservative. At that pace, 7 years
(2,555 days) per report type finishes in roughly a month — slow enough to be invisible
operationally (no burst of load, no risk of tripping some undocumented limit), fast enough that
"eventually" in the owner's own phrasing resolves in weeks, not never.

Speeding it up is a one-line change once real-world behavior is observed with no issues:
`QSRSOFT_BACKFILL_CHUNK_DAYS` (bigger chunks) or the workflow's cron (more runs/day) — or a
manual `workflow_dispatch` with `chunk_days` set high for a one-off catch-up run.

## The one measured rate this is sized against

`qsrsoft-ops-pull.mjs`'s own backfill-mode comment (and CLAUDE.md) measured **~6.6 s/day** for a
27-store, 6-endpoint OPS pull. At that rate, 7 years alone is **~4.7 hours for OPS** — essentially
GitHub Actions' entire 6-hour job ceiling for ONE of the three report types, which is exactly why
this can't be "just set `start_date` to 7 years ago and run it once": it structurally cannot fit
in a single workflow run, and nothing in this repo had ever metered a campaign this large before
(every prior backfill — the ops-pull 27-month one — was a human manually re-dispatching
`workflow_dispatch` chunk by chunk). DAR and EBOS have no measured per-day rate of their own; the
90-day chunk size and 90-minute job timeout are sized with headroom against the one rate that
IS measured, not against DAR/EBOS numbers that don't exist yet.

## Store list

All three pull scripts (and most of the ~30 other `qsrsoft-*-pull.mjs` scripts) carry an
**independently copy-pasted, identical hardcoded 27-NSN array** — there is no shared constants
file or `org_config` read for it. Not touched by this dispatch (out of scope — the backfill
driver reuses whichever store list each underlying pull script already has baked in), but worth
centralizing if this ever needs changing in more than one place at once.

## What to watch once this is live

- `qsrsoft_backfill_cursor` is the source of truth for progress — `select * from
  qsrsoft_backfill_cursor` shows each type's current `earliest_date_pulled`, `done` flag, and
  the most recent run's status/error.
- A `last_status = 'error'` row with a stale `last_run_at` means a chunk has been failing
  repeatedly — the driver retries the exact same chunk every day until it succeeds, so a
  persistent failure (bad credentials, a QSRSoft-side change) needs a human, not more patience.
- Once all three types show `done = true`, the campaign is complete and the daily workflow run
  becomes a no-op (three "already done" log lines) — fine to leave running or disable at that
  point; it costs one near-instant GitHub Actions run per day either way.
