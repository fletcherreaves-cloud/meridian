# Dispatch #132 — Performance Review: wire already-captured yearly targets, add Total Profit,
# and build an in-app Targets editor with scope-hierarchy overrides

**Owner's asks (2026-08-25), several messages against the same Performance Review screenshot:**
1. *"Delivery wait target also in yearly targets"*
2. *"Customer complaints in yearly targets"*
3. *"For all metrics without a target, let's setup a place in panel to establish targets so they
   write automatically > Give option to set company wide targets or by store/patch/state/owner"*
4. *"Digital ap gc/r/d and delivery gc/r/d are also in yearly targets"*
5. *"FOB target is monthly target"*
6. *"total profit target should be set to anything positive (for now) add to customizable targets"*
7. *"Shift cert manager + shift leader and is in yearly targets"*
8. *"Total headcount is in yearly targets"*

## Critical finding, confirmed by reading the actual parser — most of this already exists

Before building anything new: `src/parsers/index.js`'s yearly-targets parser (~line 760-819,
`parseYearlyTargets`) **already captures most of these fields from the uploaded workbook** into
per-store target objects (`tMcdWait`, `tDigAppGCRD`, `tMcdGCRD`, `tShiftLeaders`, `tHeadcount`,
`tFOBTarget`, `tCrewStaffing`, `tManagers`, etc. — read the full column list at that location, do
not assume). These already persist to the `yearly_targets` Supabase table per
`yearly-projections.js:182`'s comment. **The real bug is that `src/engine/review-engine.js`'s
`DEFAULT_REVIEW_CONFIG.metrics` (lines 33-64) doesn't read them** — several metrics are hardcoded
`src:'manual'` with either a literal magic-number note (`delivWait`: *"Target = 240 sec (4 min)"*)
or no target-sourcing at all, instead of `src:'auto', field:'<already-captured-field>'` the way
`oepe`/`r2p`/`kvs`/`salesVsTgt`/`digitalGC`/`delivGC` already correctly do.

**So this dispatch is mostly WIRING, not new data capture** — for delivery wait, headcount,
digital/delivery GC/R/D specifically. Confirm each field name against the actual parser before
wiring it (don't assume the field name from this dispatch text is exact — re-read
`parsers/index.js`'s current column list, it may have shifted).

## Per-ask resolution — confirm each, don't assume

1. **Delivery Wait** — `tMcdWait` already exists in the yearly-targets parser. Wire
   `review-engine.js`'s `delivWait` metric (line 39) from `src:'manual'` + hardcoded 240s note to
   `src:'auto', field:'mcdWait'` (or whatever the resolved field name is once you check how
   `field:` values map to target keys elsewhere — e.g. `field:'oepe'` resolves to `tOepe` for the
   `oepe` metric; follow that exact existing pattern for consistency, don't invent a new one).
2. **Customer Complaints** — **NOT confirmed to exist yet.** The parser has `t1800Contacts` ("1-800
   Contacts") which may or may not be the same thing as "Complaint Contacts/100K" (a rate, not a
   raw count — the "/100K" suggests it's normalized per 100K guest count, which `1800Contacts`
   alone doesn't obviously provide). Investigate: check the actual yearly-targets workbook's real
   column headers (or ask the owner if you can't determine it from data alone) before deciding
   whether to reuse `t1800Contacts`, derive the rate from it + a guest-count denominator, or add a
   genuinely new target field. State plainly which you found and why.
3. **Targets management UI (the big new piece)** — build a real editor, not a re-upload-the-whole-
   workbook workflow, for any target field that's currently missing or that the owner wants to
   adjust without a new Excel upload. Requirements:
   - **Scope hierarchy**: company-wide default → override by State → override by Patch/Org →
     override by individual Store (owner said "store/patch/state/owner" — "owner" here almost
     certainly means the org-level grouping already in this app, i.e. MCDOK/Emerald Arches — verify
     against `getStoreOrg`/`supervisorGroups` naming rather than guessing a new "owner" concept).
     A store-level value wins over patch, which wins over state, which wins over the company
     default — standard override cascade. Reuse the EXISTING hierarchy this app already models
     (`LocationSelector`'s `mode:'progressive'` — State→Patch/Org→Store — and `org_config`'s
     territory/patch groupings) rather than inventing a new scope taxonomy.
   - **Where it writes**: figure out whether this should write into the existing `yearly_targets`
     table (as if it were another "workbook row," just editable in-app) or a new companion table
     (e.g. `target_overrides` with `scope_type`/`scope_id`/`field`/`value`/`year`) that
     `mergedTargetsForLoc` (already resolves yearly-vs-monthly precedence per
     `yearly-projections.js:182`'s comment — read that function in full) is extended to also
     resolve against. A new overlay table is very likely the safer choice (doesn't corrupt the
     workbook-sourced data, keeps provenance clear — "this store's target came from an override,
     not the uploaded sheet") — but this is a real architecture decision, make the call and state
     your reasoning, don't silently default to overwriting `yearly_targets` rows.
   - **Which fields get this treatment**: start with the fields this dispatch is actually about
     (delivery wait, complaints, digital/delivery GC/R/D, FOB, total profit, shift cert/leader,
     headcount) rather than building a generic "every possible target field" editor in one pass —
     the UI/data-model should be generic enough to extend later, but ship real coverage for these
     first, not a placeholder shell.
4. **Digital App GC/R/D and Delivery GC/R/D** — `tDigAppGCRD`/`tMcdGCRD` already exist in the
   parser. `review-engine.js`'s `digitalGC`/`delivGC` metrics (lines 49-50) are ALREADY
   `src:'auto'` with `field:'digitalGC'`/`field:'delivGC'` — check whether that `field:` resolution
   actually reads `tDigAppGCRD`/`tMcdGCRD` today or falls back to something else/nothing (this is
   why the owner is flagging it — likely a broken or missing resolution, not a missing source
   column). Fix the resolution path, don't re-add what's already declared `auto`.
5. **FOB target is a MONTHLY target, not yearly** — `review-engine.js`'s `foodOB` metric uses
   `field:'fobDollar'` ("Auto from FOB report"). Both the yearly-targets parser (`tFOBTarget`) AND
   the monthly-targets parser (`parsers/index.js:650`, also `tFOBTarget`) capture a FOB target
   value. Confirm `mergedTargetsForLoc` (or wherever `fobDollar`'s target actually resolves from)
   correctly PREFERS the monthly value over the yearly one for the currently-reviewed period, per
   the owner's explicit correction — if it's currently sourcing yearly only, that's the bug to fix.
6. **Total Profit** — genuinely missing, confirmed (no matching column in the yearly-targets
   parser). Owner's explicit interim rule: *"should be set to anything positive (for now)"* — i.e.
   until a real numeric target exists, score `totalProfit` as passing/4 whenever the actual value
   is positive (>0), regardless of magnitude, rather than leaving it a blank manual-entry field.
   ALSO add it to the new Targets-editor UI (item 3) so a real numeric target can be set per scope
   once the owner wants one — the positive-only rule is a fallback default when no override target
   has been set at any scope level, not a permanent replacement for a real target.
7. **Shift Certified Manager(s) + Shift Leader** — `tShiftLeaders` ("Shift Leader Target") exists
   in the parser. "Shift Certified Manager" is NOT clearly represented — the closest candidate is
   `tManagers` ("GM/DM/Swing Mgr Target"), but that's conceptually a headcount-style target for a
   different role set, not obviously "count of shift-certified managers." Investigate the actual
   workbook columns; if genuinely no matching field exists, treat it the same as Total Profit
   (add to the new customizable-targets UI, flag as needing a real value) rather than guessing a
   wrong mapping. `review-engine.js`'s `shiftCert` metric (line 59, "# Shift Certified Managers")
   is the one to wire once you've confirmed the correct source field — do not assume it's
   `tManagers` without checking.
8. **Total Headcount** — `tHeadcount` already exists in the parser. Wire `review-engine.js`'s
   `headcount` metric (line 61) from `src:'manual'` to `src:'auto', field:'headcount'` (verify
   exact field-key convention against the working examples first, same as item 1).

## Scope

`src/engine/review-engine.js` (metric config wiring), `src/parsers/index.js` (only if a genuinely
new column needs capturing, e.g. for Complaints/100K or Shift Certified Managers, confirmed
missing), `mergedTargetsForLoc` or wherever target-precedence resolution lives (FOB monthly-over-
yearly fix), and a new Targets-editor UI (new panel or a tab on an existing targets-related panel —
your call where it fits best in the nav, state your reasoning). Do not touch the review scoring
math itself (`rateMetric`, weight calculations) beyond what's needed to source real target values.

## Do NOT

- Do not build a brand-new target-capture system that duplicates `yearly_targets`/
  `monthly_targets` — extend/wire into what already exists.
- Do not guess field mappings for Complaints/100K or Shift Certified Managers — investigate the
  actual workbook columns (or state plainly that you couldn't confirm and why) before wiring
  anything, rather than silently mapping to a plausible-but-wrong existing field.
- Do not invent a new "owner" scope tier without confirming it maps to this app's existing
  org/state/patch/store hierarchy — check `getStoreOrg`/`supervisorGroups`/`org_config` first.

## Verification bar

- State plainly, per numbered ask above, what you found (already wired, needed wiring, genuinely
  missing) and what you did about it — this dispatch is explicitly uncertain about items 2 and 7,
  don't paper over that uncertainty in the PR.
- Render the Performance Review monthly grid for a real store with a real yearly-targets upload
  and confirm delivery wait / headcount / digital GC/R/D / delivery GC/R/D targets now populate
  automatically (no longer blank "Tgt" placeholders) where the source data exists.
- Demonstrate the new Targets editor: set a company-wide default, override it at one scope tier
  (e.g. a specific patch), and confirm a store within that patch resolves to the override while a
  store outside it still resolves to the company default.
- Confirm FOB's target now prefers a monthly value over yearly when both exist for the same
  store/period.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean;
  report before/after entry-chunk size if the new editor is a new panel.
