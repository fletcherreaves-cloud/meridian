---
name: finding-qsrsoft-retention-2026-10-17
description: "QSRSoft >7-year data retention probe (owner request, 2026-10-17) -- measured results, EBOS activation-date confound, backfill-driver fix"
metadata:
  node_type: memory
  type: finding
---

## The ask

Owner, live: *"I would like you to run an experiment regarding the 7 year history QSRSoft
claims to hold. Will you go in and see if you can pull any data from more than 7 years back. I
am wondering if they are still retaining the data, just not making it accessible on the front
end web facing side."* Then, after initial findings: *"If there is valuable data to be
retained, then let's get it."*

This was the stated basis for `scripts/qsrsoft-backfill-driver.mjs`'s original 7-year ceiling
(`memory`/owner quote 2026-10-15, before this probe): *"QSRSoft retains data only for 7 years
on a rolling cycle."* That belief is what this probe tested, directly, against the live API.

## Method

Dispatched the existing DAR/OPS pull workflows' `start_date`/`end_date` workflow_dispatch
inputs (already wired for DAR/OPS; added for EBOS in this same dispatch,
`.github/workflows/qsrsoft-ebos-pull.yml`) against real historical windows, via
`workflow_dispatch` + live job logs (never inferred from documentation or vendor claims — this
repo's own "measure it, don't reason about it" standing rule). All runs used real
`QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` → `getFreshToken()` (scripts/lib/qsrsoft-auth.mjs), real
production Supabase.

## Results, by window (control windows included so empty results are measured against a known-working call, not a broken one)

| Window | EBOS | DAR | OPS |
|---|---|---|---|
| 2021 (control, <7yr) | ✅ real rows | ✅ real rows | ✅ real rows |
| 2019-09 (~7yr, boundary) | empty (see EBOS note below) | ✅ real rows | ✅ real rows |
| 2018-02 (~8.7yr) | empty | **empty — confirmed, zero per-unit errors** | **empty — confirmed, zero per-unit errors** |
| 2016 (~10yr) | empty | empty | empty |
| 2010-06 (~16yr) | empty | empty | empty |

**Verdict: the "7 years, rolling, hard cutoff" framing is false for DAR and OPS.** Real,
retrievable sales/DT/labor (DAR) and cash/labor/service/sales-mix/peaks (OPS) data exists for
September 2019 — genuinely more than 7 years before the 2026-10-17 probe date. A February 2018
window came back confirmed empty on the same two report types (zero rows, zero per-unit
errors, not an auth failure or a rate-limit response). **The real floor for DAR/OPS sits
somewhere in the ~18-month gap between 2019-09 (real) and 2018-02 (empty)** — not measured more
precisely than that; narrowing it further (e.g. bisecting that window) was not requested and
would cost more dispatches than the value of a tighter number right now.

## EBOS is a different mechanism entirely — not a retention measurement

EBOS (purchase ledger) came back empty for every window tested, including 2019-09 where DAR/OPS
both returned real data for the same store on the same dates. A debug-mode EBOS pull log
surfaced the actual reason: `GET https://prod.ebos.qsrsoft.com/api/controls/3708/ebos_active_date`
→ `{"ebos_activation_date":"2019-08-08"}`. **EBOS has its own per-store activation date** — when
the purchase-ledger *module* was turned on for that store — completely independent of how far
back QSRSoft's underlying data retention goes. An EBOS-empty result for an old date is evidence
the module wasn't active yet, not evidence about retention. This confound means EBOS cannot be
used to measure retention at all without first knowing each store's own activation date; it was
not pursued further here since the owner's question was about retention, and OPS/DAR already
answered that directly.

## Holdenville NSN 2979 → 35064 (owner's specific follow-up)

Owner note, verbatim: *"Holdenville did [a] transition 2979 -> 35064 2011 (March-April) in
first 12 months increased 500,000 in sales. I am sure this is not totally accurate, but at the
moment it is better than anything else we have to go on."* Relaxed later to a plain percentage
increase being an acceptable substitute for an inflation-adjusted dollar figure.

The current 27-store `STORE_NSNS` array (`qsrsoft-dar-pull.mjs`/`qsrsoft-ops-pull.mjs`/
`qsrsoft-ebos-pull.mjs`) includes `35064` but not the retired `2979` — no production script can
query the old number. A dedicated, read-only probe (`scripts/qsrsoft-store-transition-probe.mjs`
+ `.github/workflows/qsrsoft-store-transition-probe.yml`) was built to query both NSNs directly
against DAR + two OPS endpoints for a spread of sample dates from Dec 2010 through Sep 2011.

**Result, measured (3 follow-up dispatches, same probe/workflow):**

- **NSN 2979** — **HTTP 403 "User does not have access to store 2979"** on every single date
  tested (Dec 2010 – Sep 2011). This is an access-scope wall on the reporting account, not a
  retention measurement — the account's current store-list simply doesn't include a retired
  NSN. Getting real data for 2979 (if QSRSoft even still has any) would need the vendor/account
  side to re-grant visibility to a deactivated store number, which is outside this repo's reach.
- **NSN 35064** — clean `status 200, 0 rows` (no error, no 403 — a real, confirmed-empty
  answer) for every sampled date from **Dec 2010 through Aug 2019** (19 sample points spanning
  that whole span, including the believed March-April 2011 transition window itself). **First
  real data: 2019-09-01** (24 real DAR hour-slot rows + real OPS cash/sales-mix rows, $4,658.32
  net sales that day) — 2019-08-01 is still confirmed empty, so the real floor narrows to that
  one-month window. Not narrowed further than month-level (not requested; a day-level pin would
  be a cheap follow-up if the owner wants it).

**This contradicts the owner's own recollection of a March–April 2011 transition** — which the
owner had already flagged as an imprecise memory going in ("I am sure this is not totally
accurate"). NSN 35064 first reports real QSRSoft data in **September 2019**, not 2011. The
requested $500k-first-year / percentage-increase comparison cannot be built around the 2011 date
as given. If the owner still wants the comparison, the real, data-backed options are: (a)
compare 35064's first 12 months of REAL data (Sep 2019 → Sep 2020) against whatever it traded
at before that (impossible if that's when it first opened/activated in QSRSoft at all — would
need the owner to confirm whether Sep 2019 is plausibly the real Holdenville relocation date,
not 2011), or (b) the owner may be thinking of a different store-number pair/date than
2979→35064 for the 2011 note. This needs an owner decision, not further probing — the data side
is now fully measured.

## The latent bug this surfaced in the backfill driver

`scripts/qsrsoft-backfill-driver.mjs` (built 2026-10-15, before this probe) walked backward
toward a fixed `YEARS_BACK` (then 7) and had no way to tell "this historical chunk is genuinely
empty" apart from "a real error occurred" — both produced a non-zero subprocess exit from the
pull script (`scripts/lib/pull-outcome.mjs`'s `n > 0 && totalSaved === 0` branch always exited
1), and both got the same response from the driver: leave the cursor unchanged, retry the exact
same chunk next time. Once the driver's own daily cron walked back far enough to hit real
empty history — which this probe proves exists well inside its old 7-year ceiling, let alone a
15-year one — it would have retried the same chunk forever, never advancing, never reaching
`done`, with no error surfaced anywhere (a clean subprocess failure, caught and logged, looks
identical to a real outage).

**Fix, same pass:**
- `scripts/lib/pull-outcome.mjs`: new opt-in `QSRSOFT_BACKFILL_PROBE=1` env var (set only by the
  backfill driver when invoking a pull script as a subprocess) — when set AND the chunk recorded
  zero per-unit failures, a zero-rows result exits 0 ("confirmed-empty historical window") instead
  of 1. Every existing scheduled daily pull is unaffected (env var unset → unchanged behavior).
  A sidecar `QSRSOFT_BACKFILL_OUTCOME_FILE` lets the driver learn the real `totalSaved` for that
  chunk without parsing stdout (stdio stays `'inherit'` for full live logs in the Action run).
- `scripts/qsrsoft-backfill-driver.mjs`: new `consecutive_empty_chunks` counter per report type
  (`supabase/schema-qsrsoft-backfill-cursor.sql`, `qsrsoft_backfill_cursor` table). A confirmed-
  empty chunk increments it; a real (non-empty) chunk resets it to 0. Once it reaches
  `CONSECUTIVE_EMPTY_STOP` (default 3 chunks ≈ 9 months) in a row, that report type is marked
  `done` — the driver found the real floor itself instead of trusting an assumed year count.
  `YEARS_BACK` is repurposed as a generous safety ceiling only (bumped 7 → 15) so a genuinely
  confused run still terminates even if the empty-streak logic never trips.
- `.github/workflows/qsrsoft-backfill.yml` renamed `QSRSoft 7-Year Backfill` → `QSRSoft
  Historical Backfill` (the old name asserted a conclusion this probe disproved); new
  `empty_stop` workflow_dispatch input. `.github/workflows/sync-failure-watch.yml`'s watch list
  updated to match the new name (CLAUDE.md's standing rule — an unwatched/mismatched name fails
  `src/__tests__/sync-failure-watch.test.js`).
- `supabase/schema-qsrsoft-backfill-cursor.sql`: added `consecutive_empty_chunks` column.
  **Needs a manual `alter table` run against production** — this session has no direct Postgres
  connection, same pattern as other schema-file-only additions in this repo.

## What this does NOT change

- The three production daily pull scripts' own zero-rows-is-a-failure behavior for a normal
  scheduled run — unchanged, and correctly so (a live daily pull returning zero rows for today
  is never expected to mean "no data exists").
- EBOS's per-store `ebos_activation_date` is not read or used anywhere yet — this probe only
  identified it as the reason EBOS returns empty for pre-activation dates. If EBOS backfill
  value is wanted later, the backfill driver would need to read each store's own activation
  date and stop there per-store, not apply one global floor the way DAR/OPS can.
