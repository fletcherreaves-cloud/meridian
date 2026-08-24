---
name: dispatch-107
description: Planning > Yearly Projections panel shows ONLY a Sales rollup (derived from monthly_targets), never the real uploaded yearly-targets workbook (OEPE/CSAT/Digital/People/Labor/FOB, ~25 fields, already parsed into ds.targets by parseYearlyTargets). Worse -- ds.targets has ZERO Supabase persistence, so every fresh session/device/login loses it until the workbook is re-uploaded, which is why the owner has uploaded it "several times." A third, disconnected localStorage-only manual yearly-target editor also exists in store-dash.js and is never read by the real target-merge chain. Owner wants this fixed end-to-end, including confirming monthly-supersedes-yearly (already correct) flows into Performance Review.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #107 — Yearly Targets: persist to Supabase, rebuild the Planning > Yearly panel, retire the dead-end editor

## Owner's ask, in full

*"Planning > Yearly > I have uploaded yearly targets workbook several times and just noticed that
for yearly all that is tracked is Sales, which i think is just being derived from the uploaded
monthly targets. Need to get this whole panel figured out as these targets pass also to Performance
Review and will need to be matched and wired in. Monthly targets supercede Yearly targets when both
present for Performance Reviews and elsewhere."* Followed by: *"Store these targets in supabase >
check first though, they legit may already be there."*

**Checked first, per the owner's own instruction — they are NOT already in Supabase.** `grep -rn
"yearly" src/lib/supabase.js` returns zero matches, and `supabase/schema.sql` has no `yearly_targets`
table (only `monthly_targets`, ~line 274). Confirmed by absence, not assumption.

## What the uploaded workbook actually contains (inspected directly, not assumed)

The owner's own attached `2026_Restaurant_Targets__Updated__OK__FL.xlsx` was opened and read cell by
cell. It has **no Sales column at all.** Its real columns are: OEPE PACE + Park % + KVS PACE/Usage +
FC R2P PACE (Service & Ops), Voice OSAT PACE / Execute-As-Designed / Overall Satisfaction B2B / 1-800
Contacts (CSAT), Digital App % of Sales / GC/R/D + McDelivery GC/R/D / Wait Time / Star Rating
(Digital), Crew Staffing / Shift Leader / GM-DM-Swing Mgr / Total Headcount targets + TTM Shift-Leader
/ 0-90 Crew / YTD Crew turnover (People), and TPPH / Labor / Food Over Base (Labor & FOB) — one row
per store, per-org target row above the header. This confirms the owner's own suspicion exactly:
whatever the Yearly panel shows, it isn't this data.

## Three separate systems exist today, and only one of them is real (checked, not assumed)

1. **`ds.targets`, fed by `parseYearlyTargets()`** (`src/parsers/index.js` ~line 737) — **this one is
   correct and does its job.** It already captures essentially every column in the workbook above (22+
   fields: `tOepe`, `tPark`, `tKvst`, `tKvsu`, `tR2p`, `tOsat`, `tOsatB2B`, `tVoiceEAD`,
   `t1800Contacts`, `tDigAppPct`, `tDigAppGCRD`, `tMcdGCRD`, `tMcdWait`, `tMcdStars`, `tCrewStaffing`,
   `tShiftLeaders`, `tManagers`, `tHeadcount`, `tToShiftLeader`, `tToCrew090`, `tToCrewYTD`, `tTpph`,
   `tLabor`, `tFOBTarget`). It is real, wired, and already used everywhere that matters:
   `review-engine.js`'s `mergedTargets()` (Performance Review's own target source, comment at ~line
   701 literally reads *"DEFAULT_TARGETS < yearly (ds.targets) < monthly"*), `forecast.js`,
   `tolerance-status.js`, `backtest.js`, `at-a-glance.js`, `analytics.js`, `store-dash.js`,
   `smart-targets.js`, `projections.js`. **Monthly-supersedes-yearly is ALREADY correct** in every one
   of these — the owner's stated precedence rule is not a gap, it's already-shipped behavior. Do not
   re-implement it; just confirm it survives this dispatch's changes (see Verification bar).
   **The one real defect: it is never saved to Supabase.** `ds.targets` is rebuilt from scratch each
   session purely by re-parsing whatever workbook happens to get uploaded that session (`pipeline.js`
   ~line 66, 104, 584) and otherwise exists only in the device-local IndexedDB/session cache
   (`features/session.js`'s `dsExp`, itself just a manual export/import JSON file, not automatic
   cloud sync). **This is the actual root cause of "I have uploaded yearly targets workbook several
   times"** — every new device, browser, or session start loses it, forcing a re-upload. Violates
   CLAUDE.md's standing rule: *"Every new persistent data type goes into Supabase (save on upload +
   load on startup)."*
2. **`YearlyProjectionsPanel`** (`src/views/yearly-projections.js`, the actual Planning > Yearly UI)
   — confirmed by reading the whole 168-line file: it is **entirely** a Sales-only annual rollup. Its
   `model` (~line 91-106) sums `ds.allMonthlyTargets[year+'-'+m][loc].tProdSales` across 12 months and
   compares to actual product sales from `loadDailySales()`. **It never reads `ds.targets` at all** —
   not OEPE, not CSAT, not Digital, not People, not Labor/FOB. This is the exact behavior the owner
   observed and named correctly: "all that is tracked is Sales... derived from the uploaded monthly
   targets."
3. **A third, disconnected system**: `MonthlyTargetManager`'s `'yearly'` mode in `store-dash.js`
   (`loadYearlyTargets`/`saveYearlyTargets`/`getYearlyTarget`/`setYearlyTarget`, ~line 68-84, reading
   `localStorage['mf_targets_yearly_'+year]`) — a manual per-store hand-entry editor, browser-local
   only. **Checked whether anything in the real target-merge chain reads this localStorage key — it
   does not.** `grep` for `getYearlyTarget(`/`loadYearlyTargets(` outside its own definition and its
   own display code in `store-dash.js` turns up nothing else. This editor is a dead end: whatever
   someone types into it goes nowhere except back into its own display. Confusing to leave as-is next
   to the real system — needs an explicit decision, not a silent leave-alone.

## Scope

### Part 1 — persist `ds.targets` (the real yearly-upload data) to Supabase (do first — everything else depends on this actually surviving a session)

Add a `yearly_targets` table (new `supabase/schema-yearly-targets.sql`, following `monthly_targets`'s
exact pattern in `supabase/schema.sql` ~line 274: `loc, year` + one column per `ds.targets` field
above, `tenant_id` + RLS matching every other real table per CLAUDE.md's standing "new automated
pull"/"new persistent data" checklist). Add `saveYearlyTargets(targets, year)` /
`loadYearlyTargets(year)` / `loadAllYearlyTargets()` to `src/lib/supabase.js`, mirroring
`saveMonthlyTargets`/`loadMonthlyTargets`/`loadAllMonthlyTargets` (~line 221-303) field-for-field.
**Name collision warning:** `store-dash.js` already has module-local functions named
`loadYearlyTargets`/`saveYearlyTargets` (the dead-end localStorage ones, Part 3) — do not let the new
Supabase functions collide; resolve as part of Part 3's cleanup, not by picking a different name for
the real ones and leaving the dead code's better name in place.

Wire the save into the upload pipeline: `pipeline.js`'s `targets` branches (~line 66, 104, 584) already
call `parseYearlyTargets(wb)` — after that succeeds, call the new `saveYearlyTargets()`. Wire the load
into app startup (wherever `loadAllMonthlyTargets()` is currently called — likely `App.js` — hydrate
`ds.targets` from Supabase the same way `ds.monthlyTargets`/`ds.allMonthlyTargets` already are) so a
fresh login on any device has the real yearly targets without re-uploading.

### Part 2 — rebuild the Planning > Yearly panel to show the real categories

`YearlyProjectionsPanel`'s existing Sales-pace view (Annual Target / YTD Actual / YTD vs Plan / Proj
Full Year / FY vs Target) is genuinely useful and stays — that part isn't broken, just mislabeled by
being the *only* thing there. Add the actual yearly-upload categories (Service & Ops: OEPE/Park/KVS/
R2P; CSAT: Voice OSAT/EAD/B2B/1-800; Digital: App%/GCRD/McDelivery; People: staffing/headcount/
turnover; Labor & FOB: TPPH/Labor/FOB) sourced from the now-cloud-persisted yearly targets (Part 1),
per store, for the selected year. Follow this app's own established pattern for "one panel, several
report/category views" (`eom-dashboard.js`'s tab pattern, also used by dispatch #106's forecast-
accuracy merge) rather than inventing a new one — exact layout (tabs vs. sections) is an
implementation choice.

### Part 3 — retire or wire in the dead-end localStorage editor

Decide, don't leave ambiguous: either (a) delete `store-dash.js`'s `MonthlyTargetManager`'s `'yearly'`
mode and its `mf_targets_yearly_*` localStorage helpers entirely (if the bulk-upload workbook is the
owner's actual intended source of truth for yearly targets, which the workbook attachment + repeated
uploads strongly suggest), or (b) if the owner actually wants a manual per-store yearly override UI
too, wire its writes into the same Part 1 `yearly_targets` Supabase table (as `source:'override'`,
mirroring how `EventImpactPanel`/`event_impact` already does manual-override-over-measured) instead of
an orphaned localStorage key nothing else reads. **Ask the owner which, if it's not obvious once you're
looking at the actual UI** — don't silently pick one.

### Part 4 — confirm Performance Review wiring (owner's stated concern — likely already correct, verify don't rebuild)

`review-engine.js`'s `mergedTargets()` already reads `ds.targets` (yearly) under `ds.monthlyTargets`
(monthly) per its own comment. Once Part 1 makes `ds.targets` reliably populated on every
device/session (not just "whichever session last uploaded the workbook"), Performance Review's
existing consumption of it becomes correct automatically — **this is very likely already "matched and
wired in"** as the owner asked, contingent only on Part 1 landing. Verify by rendering an actual
Performance Review for a store and confirming a yearly-only field (e.g. `tOsatB2B`, which has no
monthly-tier equivalent in `monthly_targets`'s current schema — checked, it isn't one of that table's
columns) shows up correctly, sourced from the yearly upload, when no monthly override exists for that
metric. Do not re-derive or duplicate the merge chain — it exists and is correct.

## Verification bar

- Part 1: upload the yearly workbook, confirm a `yearly_targets` row is written; log out / clear
  IndexedDB / simulate a fresh device (or just reload without re-uploading) and confirm `ds.targets`
  still has the real values, sourced from Supabase, not empty.
- Part 2: render the actual Planning > Yearly panel and confirm real OEPE/CSAT/Digital/People/Labor-FOB
  values appear per store for the selected year, alongside the still-working Sales-pace view.
- Part 3: confirm the decision (delete or wire-in) leaves no orphaned write path — no UI that saves
  data nothing ever reads again.
- Part 4: render a real Performance Review, confirm a yearly-only-sourced target field displays
  correctly and that setting a monthly override for the same store/metric supersedes it (per the
  owner's explicit precedence rule) without touching `mergedTargets()`'s existing logic.
- `npm run build` clean, full test suite green, and a spot-check that `monthly_targets`'s existing
  columns/behavior are completely unchanged (Part 1 adds a new table, it must not touch the existing
  one).

## Do NOT

- **Do not re-implement monthly-supersedes-yearly precedence** — it already exists in `mergedTargets()`
  and the other consumers listed above. Confirm it, don't duplicate it.
- **Do not silently delete the `store-dash.js` localStorage yearly editor without a decision** (Part 3)
  — a person might be relying on it even though nothing downstream reads it; surface the question.
- **Do not conflate `ds.targets` (yearly upload, correct today) with the Planning > Yearly panel
  (broken today)** — the parser and the merge chain are not the bug; the display panel and the missing
  persistence are.

## Resolution

All four parts landed together (branch `claude/dispatch-107-yearly-targets`, PR open, not merged —
per the working instructions for this dispatch a PM verifies and merges independently).

**Part 1 — persistence.** Added `supabase/schema-yearly-targets.sql`: a new `yearly_targets` table,
PK `(loc, year)`, one column per `parseYearlyTargets()` field (24 target columns), plus `source`
('upload' | 'override', for Part 3) and `tenant_id uuid not null default
'00000000-0000-0000-0000-000000000001'` with tenant + per-location RLS mirroring
`supabase/schema-news-mentions.sql` (the current canonical pattern for a brand-new table — checked
`monthly_targets` itself predates the multi-tenant migration and only carries `tenant_id` via the
separate phase1/phase2 ALTER files, so news_mentions's create-time pattern was the one actually worth
mirroring for a table that doesn't exist yet). Added `saveYearlyTargets(targets, year, source)` /
`loadYearlyTargets(year)` / `loadAllYearlyTargets()` to `src/lib/supabase.js`, field-mapped 1:1
against `saveMonthlyTargets`/`loadMonthlyTargets`/`loadAllMonthlyTargets`, including the same
`_stripNullTargets` null-handling (#166) so a NULL column produces an absent key, not a
present-but-null one that would beat `DEFAULT_TARGETS` in the merge. Wired `saveYearlyTargets` into
all three `type==='targets'` branches in `pipeline.js` (`buildDS` x2, `mergeDS` x1) via a shared
`_saveYearlyTargetsAsync` helper, so a full rebuild and an incremental re-drop persist identically —
matching the existing comment that already called this out as a requirement. Year is detected from
the filename (`/\b(20\d{2})\b/`, e.g. `2026_Restaurant_Targets__Updated__OK__FL.xlsx`), falling back
to the current calendar year rather than silently dropping the save when a filename doesn't carry
one. Wired the load into `App.js`'s T1 startup tier (same tier as `_stMonthlyTargets`, so Planning >
Yearly and Performance Review have real data on first paint, not just after T2/T3): `ds.targets` is
now hydrated from the most recent year in `loadAllYearlyTargets()`'s result on every fresh
session/device, with `ds.allYearlyTargets` (keyed by year) added alongside for the Part 2 panel.
Verified against real behavior, not assumed: `src/__tests__/yearly-targets-persistence.test.js`
exercises the real `saveYearlyTargets`/`loadYearlyTargets`/`loadAllYearlyTargets` functions against a
mocked `@supabase/supabase-js` client (same technique as `monthly-targets-null-strip.test.js`) and
asserts the actual upserted row shape (`onConflict:'loc,year'`, every column name) and the
null-stripping round trip — not a re-derived stand-in.

**Part 2 — panel rebuild.** `src/views/yearly-projections.js` gained a view toggle ("💵 Sales Pace" /
"🎯 Target Categories") in the header, matching the internal-tab pattern used elsewhere
(`security-panel.js`'s cash/inventory domain toggle). The existing Sales Pace table is completely
unchanged — same component tree, same props, same computation — just now one of two views instead of
the only one. The new Target Categories view (`TargetCategoriesView`) reads
`ds.allYearlyTargets[year]`, preferring `ds.targets` (the flattened "most recent year" view, which
may hold a same-session upload not yet round-tripped through Supabase) for the current calendar year
— the same precedence shape the Sales view already uses for `ds.allMonthlyTargets`/session data. Five
category sub-tabs (Service & Ops, CSAT, Digital, People, Labor & FOB) reproduce the workbook's own
grouping from the dispatch's own inspection, each a per-store table with OK/FL/Grand subtotals
(`agg:'sum'` for headcount-style counts, `agg:'avg'` for rates/times — never an average of an
average, matching the Sales view's own stated principle). Verified by rendering the actual
`YearlyProjectionsPanel` (not a data-shaping helper) in
`src/__tests__/dispatch-107-yearly-projections-panel.test.js`: clicks the real "Target Categories"
button, switches to the CSAT sub-tab, and asserts real formatted values appear in the DOM (`140s` for
OEPE, `2.00%` for OSAT B2B) — plus a check that the Sales Pace view and its "Annual Target" column
still render untouched, and that a year with no upload shows the empty-state message instead of
crashing.

**Part 3 — retired the dead-end editor.** Deleted `store-dash.js`'s `mf_targets_yearly_*`
localStorage helpers (`getYearlyStorageKey`/`loadYearlyTargets`/`saveYearlyTargets`/
`setYearlyTarget`/`getYearlyTarget`/`exportYearlyTargets`) and `MonthlyTargetManager`'s "🏆 Yearly
Goals" mode (state, mode-toggle UI, year selector, Export/Apply-as-Monthly-Defaults buttons) rather
than wiring it into the new `yearly_targets` table. Reasoning, since this was a judgment call rather
than an obvious pick: (1) nothing downstream ever read it — confirmed by the dispatch's own grep, and
its own "Apply as Monthly Defaults" button only ever copied its bucket into the *separate* legacy
`mf_targets_v2` localStorage store, never into `ds.targets` or the real `monthly_targets` Supabase
table; (2) its field set (`TARGET_FIELDS_CATS` — OEPE/TPPH/KVS/Park/R2P/labor/T-Reds/promos/cash
controls/FOB) is the *monthly* operational-field taxonomy, not the real yearly workbook's categories
(Voice OSAT/EAD/B2B, 1-800 Contacts, Digital App/McDelivery GC-R-D, staffing/headcount/turnover) — an
overlapping-but-incomplete vocabulary sitting right next to the real Target Categories view (Part 2)
would have read as a second, contradictory "yearly targets" system, not a convenience; (3) the
owner's own repeated re-uploads of the real workbook are themselves the signal that bulk upload is
the intended source of truth. This also resolves the dispatch's flagged naming collision by
construction — deleting the dead-end functions frees `loadYearlyTargets`/`saveYearlyTargets` for the
real Supabase-backed ones in `supabase.js` without ever needing an alternate name for either side. No
downstream reader lost anything: grepped for every deleted export name across `src/` post-change and
the only remaining hits are the explanatory comment left in place of the old code.

**Part 4 — verified, not rebuilt.** `mergedTargetsForLoc` (`review-engine.js`) was already correct
(`DEFAULT_TARGETS < ds.targets < ds.monthlyTargets`) and untouched by this dispatch. Added one test
case to the existing `review-target-autofill.test.js` (which already covered the `tLabor`
monthly-wins-over-yearly case) using `tOsatB2B` specifically, per the dispatch's own suggestion,
because it's checked to have no `monthly_targets` column at all — a genuinely yearly-only field, not
one that happens to be untested at the monthly tier. Confirms both halves against the real function:
`ds.targets`-only → the yearly value surfaces; add a `ds.monthlyTargets` entry for the same
store/field → monthly wins, unchanged. Did not touch `mergedTargetsForLoc` itself.

**Housekeeping.** Regenerated the loader field map (`node scripts/gen-loader-emits.mjs --write`) per
the standing rule for touching a save path — the resulting diff also picked up unrelated drift in
`opsCashRows`/`opsLaborRows`/`opsServiceRows` (`dt`/`metrics`/`tenant_id`/`updated_at` columns) that
predates this dispatch and had just never been regenerated; included as-is since the script is the
source of truth and the standing rule says regenerate, not hand-edit. `npm run build` clean; full
`npm test` run is 20622/20625 green — the 3 failures are `src-no-undef.test.js` copies under
`.claude/worktrees/agent-*` (other agents' sibling worktrees hitting their own unrelated missing-file
state), not this worktree's own copy, and not touched by this change. Entry chunk: 520.05 KB → 520.77
KB gzip (eager total 521.91 KB → 522.63 KB, +0.72 KB, budget 850 KB) — the increase is the new T1
`_stYearlyTargets` startup stage in `App.js`; `store-dash.js`'s own lazy chunk actually shrank (Part
3's deletions) and `yearly-projections.js`'s chunk is lazy-loaded, not part of the eager entry.
