# #374 acceptance-criteria verification — recipe_item column, 2026-08-18

## Context

#374 (Topic 6 rescue: `r.recipeItem === true` in `src/engine/count-cycle.js`'s `isActive()`)
merged this session as changelog 5.055, but the app-side fix shipped ahead of its data: the
`qsr_onhand.recipe_item` migration (`supabase/schema-onhand-active-flag.sql`) was only half
run — the `active` column existed, `recipe_item` did not. The `qsrsoft-onhand-pull` workflow
correctly fail-fast-guarded on the missing column (no silent corruption) and #374's own
acceptance criteria (Tecumseh Paper before/after, per-store active-vs-full table, re-graded
27-store diff, Topic 6 overlap) could not be computed until it was fixed.

Owner ran `alter table public.qsr_onhand add column if not exists recipe_item boolean;` in the
Supabase SQL Editor. Confirmed live (`recipe_item` column returns, not a 42703 error), then
re-triggered `qsrsoft-onhand-pull.yml` (run 32139266797, succeeded). Verified data landed:
7,347 rows for period `2026-08` (the current month, matching what `count-cycle-panel.js`
actually loads — `period = new Date().toISOString().slice(0,7)`), all with `recipe_item`
populated. **Note:** the pull only refreshes the current period — `period=2026-07`'s ~7,146
rows are untouched and `recipe_item` stays null there; this is expected (each pull writes only
the current month) and doesn't affect the live panel, which only ever reads the current period.

## Method

Pulled all `qsr_onhand` rows for `period=2026-08` directly via the anon-key REST API (RLS
permits it), mapped to the exact shape `loadQsrOnHand()` in `src/lib/supabase.js` produces, and
ran the real `detectSessions`/`cycleCompliance`/`cycleSummary` functions from
`src/engine/count-cycle.js` twice: once with `recipeItem` forced to `null` on every row
(simulating the pre-migration state, where the column never existed) and once with the real
`recipe_item` values (the fixed, post-migration state). `asOf = '2026-08-18'`.

## Topic 6 overlap (re-measured, supersedes the pre-migration probe)

| | pre-migration DUMP_RAW_FIELDS probe (2026-08-17) | live production (2026-08-18, this verification) |
|---|---:|---:|
| active=false items | 2,316 | 2,368 |
| recipeItem=true rescue | 144 (6.2%) | 167 (7.1%) |
| stores with at least one rescue | 23/27 | 25/27 |

Close to the original probe, not identical — expected, since the probe hit the live QSRSoft
API directly on a different day/moment than this pull. The mechanism and rough magnitude both
hold: Topic 6 is real, consistent, and district-wide, not a one-store artifact.

## Tecumseh (33704) Paper before/after

| | active denominator | counted | date |
|---|---:|---:|---|
| BEFORE (no rescue) | 67 | 61 | 2026-08-15 |
| AFTER (with rescue) | 78 | 61 | 2026-08-15 |

The rescue adds 11 active Paper items to Tecumseh's denominator (67→78) — the count itself
(61) is unchanged, so the displayed completion fraction moves from 61/67 (91%) to 61/78 (78%),
a materially more accurate — and less flattering — read on how complete that count actually
was. Tecumseh's overall status is `crit` (`weekly-overdue`) either way — the rescue affects the
Paper-class denominator shown, not the store's headline compliance status.

## Per-store ACTIVE vs FULL item count (period 2026-08, all 27 stores)

| store | loc | full | active | rescued (active=false but recipeItem=true) |
|---|---|---:|---:|---:|
| OKC-I240/Sooner | 20475 | 295 | 195 | 4 |
| Tecumseh | 33704 | 290 | 197 | 12 |
| Seminole-Milt Phillips | 10915 | 283 | 200 | 9 |
| Holdenville | 35064 | 282 | 202 | 10 |
| Cottondale | 35242 | 281 | 195 | 8 |
| Chickasha-So 4th | 5183 | 280 | 189 | 7 |
| Purcell | 11657 | 280 | 189 | 8 |
| Pauls Valley-Ballard Rd | 31357 | 280 | 192 | 9 |
| Ada-Country Club | 6972 | 278 | 191 | 3 |
| Defuniak Springs | 6838 | 277 | 195 | 9 |
| Bonifay | 10034 | 277 | 198 | 8 |
| Ponce de Leon-Hwy 81/I-10 | 43701 | 277 | 196 | 13 |
| Ardmore-Broadway | 3708 | 276 | 191 | 2 |
| Duncan-Hwy 81 | 29760 | 274 | 193 | 7 |
| Mossy Head | 37566 | 274 | 192 | 7 |
| Elgin | 33222 | 273 | 193 | 8 |
| Chipley-St Rd 77 | 6178 | 270 | 192 | 9 |
| Lindsay-Wal-Mart | 18213 | 269 | 183 | 8 |
| Freeport | 38609 | 269 | 191 | 4 |
| Harrah | 34222 | 265 | 184 | 7 |
| Durant-US Hwy 70/22 | 5985 | 264 | 187 | 3 |
| Marietta | 33109 | 264 | 184 | 2 |
| Ardmore-Cooper/12th | 24471 | 261 | 186 | 0 |
| Atoka-Mississippi | 10422 | 260 | 186 | 3 |
| Madill-Hwy 70 | 13113 | 256 | 182 | 5 |
| Sulphur | 32525 | 256 | 183 | 2 |
| Tishomingo-Main & Refuge | 43380 | 236 | 180 | 0 |

Two stores (Ardmore-Cooper/12th, Tishomingo) show zero Topic 6 rescue this period — not a bug,
just no active=false-but-in-recipe items landed for them in the current pull.

## Re-graded 27-store diff

**0/27 stores changed `status` or `exceptions` after the Topic 6 rescue.** District summary
identical before/after: `{stores:27, ok:0, warn:0, crit:27, paperMissing:11, overdue:27}`.

This is expected and correct, not a sign the fix did nothing: `status`/`exceptions` come from
session *dates* (`weekly-overdue`, `weekly-incomplete`, `mid-month-paper`) via
`cycleCompliance()`, not from the exact active/full ratio. The rescue changes the
**denominator** shown in `perClass` (as Tecumseh's Paper case above demonstrates — a real,
visible change to what a GM sees) without changing which stores are flagged as overdue. The
fix is doing its documented job — correcting completion percentages — and the compliance-status
logic it doesn't touch is untouched, exactly as designed.

**All 27 stores currently read `crit` / `weekly-overdue` district-wide** — a separate, striking
finding from this pull, unrelated to the recipe_item fix itself. Not investigated further here;
flagged for whoever looks at Count Cycle compliance next, since a 100% overdue rate across every
store on the same day is either a real district-wide problem or a sign the compliance windowing
needs a second look.
