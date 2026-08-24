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
