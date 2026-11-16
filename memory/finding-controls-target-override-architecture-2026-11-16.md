---
name: finding-controls-target-override-architecture-2026-11-16
description: Owner asked "aren't we computing targets somehow for each location for the controls thresholds... I feel like we can configure them easier through smart targets, looking at data we already have on file, and give me an opportunity to override them as needed." Full audit of what already exists across DEFAULT_TARGETS, Register Audit's target-aware flags, Smart Targets, and the target_overrides scope-cascade system. Fixed a real bug (Register Audit flags were hardwired to the static DEFAULT_TARGETS constant, ignoring any override) and wired the Security Events Manual Pull Trigger off it. Found that NO real persisted-override path exists yet for these 5 Controls metrics specifically, and laid out the options rather than picking one unilaterally.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Controls target override architecture — what exists, what's fixed, what's still open (2026-11-16)

## The 5 metrics in question

Cash O/S %, T-Red Before %, T-Red After %, POS Overring %, Refund % — `tCashOSPct`/`tRedBPct`/
`tRedAPct`/`tPosOverPct`/`tRefundPct` in `DEFAULT_TARGETS` (constants.js). Real per-store values
already baked in for every store (confirmed by reading the file directly).

## What already exists (confirmed by reading the code, not assumed)

1. **Register Audit already flags against these targets.** `src/utils/register-audit.js`'s
   `computeTargetAwareRegisterFlags` (Notes 61 #10/#11, 2026-11-14,
   `memory/finding-register-audit-target-flags-2026-11-14.md`) compares each employee's recent
   (42-day) Cash O/S/T-Red/POS-Over/Refund ratios against `DEFAULT_TARGETS[loc]` and flags
   egregious (≥3x deviation) or repetitive (≥3 days, ≥50% share) patterns. **This is the
   mechanism the owner was recalling** — "we are currently using it to flag potential issues."
2. **Smart Targets already computes a data-driven suggested value for 2 of the 5** (Cash O/S %,
   T-Red After %) — `src/features/smart-targets.js`'s `SMART_METRICS`, trimmed-mean/trend logic
   over `ds.ctrlRows` (manual Controls upload) with a cloud fallback for Cash O/S only.
3. **A real, persisted, scope-cascading override system exists** — `target_overrides` table +
   `src/views/targets-editor.js` + `src/engine/target-overrides.js` (dispatch #132/#135):
   company → state → patch → store precedence, already live, already has a UI.

## A real bug, found and fixed

`targetAwareFlagsForEmployee` (the function behind computeTargetAwareRegisterFlags) read the
**literal `DEFAULT_TARGETS[loc]` constant**, with no path to honor any override at all — the
same "#1221 Targets-panel override silently ignored" bug class this repo has hit before, here
specifically. So even where an override DOES already flow correctly everywhere else (e.g.
`tolMergedTarget`'s DEFAULT_TARGETS → ds.targets → ds.monthlyTargets → settings.targets chain,
which UnifiedTargetsPanel/Smart Targets/the rollup tile all already use), Register Audit's
flagging engine would still silently use the stale baked-in number.

**Fixed, shipped same day:**
- `computeTargetAwareRegisterFlags(allRows, targetsByLoc)` takes an optional second arg — a
  `{loc: mergedTargetObject}` map. Every existing call site (one argument) is unaffected; this
  is purely additive. `src/utils/register-audit.js`.
- `src/views/store-analytics.js`'s `RegisterAuditTab` now passes `tolMergedTarget(ds, loc)`
  through, so a Monthly/Yearly Targets workbook override for any of the 5 fields (the parser
  already captures all 5, confirmed in `src/parsers/index.js`) now actually reaches Register
  Audit's flags.
- New `auditRowsToStoreDayRatios(auditRows, loc)` export — per-store-day Controls ratios
  aggregated across every employee, for Smart Targets or anything else that wants a
  store-level (not per-employee) view of the same raw dollar amounts.
- Tests: `src/__tests__/register-audit-target-flags-2026-11-14.test.js` (new describe blocks —
  override honored, empty map falls back cleanly, the new rollup helper).

## Wired into the Manual Pull Trigger (closes the open item from the earlier session)

`src/engine/manual-pull-triggers.js`'s Security Events gap (previously left open — see
`memory/plan-manual-pull-schedule-2026-11-16.md`'s "known gap" note) is now closed:
`computeSecurityEventsTrigger` calls `computeTargetAwareRegisterFlags(ds.auditRows, targetsByLoc)`
directly, rolls the per-employee result up to one flag per store (any employee at
critical/high riskLevel → red; watch → yellow), and reuses the SAME calibrated thresholds
(42-day window, egregious 3x, repetitive 3-days/50%-share) that engine already ships with —
no new threshold invented. Tested end-to-end including that an override actually changes the
outcome (`src/__tests__/manual-pull-triggers.test.js`).

## What's still genuinely open — a real decision, not mine to make unilaterally

**There is currently NO working, persisted "set/override one of these 5 numbers" UI anywhere in
the app.** Three systems look like candidates and none of them is quite it yet:

- **Smart Targets' "Approve"/override is local component state only** — confirmed by reading the
  whole file: zero `saveUserSetting`/Supabase calls. The only "apply" path today is exporting a
  CSV for the owner to manually re-enter elsewhere. True for ALL of Smart Targets' ~10 metrics,
  not just these 5 — a pre-existing gap, not something this session's work introduced.
- **The Monthly/Yearly Targets Editor** (tasks #61/#62) DOES persist for real (`saveMonthlyTargets`
  → Supabase → `ds.monthlyTargets[loc]`, which `tolMergedTarget` already reads), and the workbook
  parser already captures all 5 fields — but the in-app EDITOR UI doesn't currently expose these
  5 as editable rows (checked `yearly-projections.js`/`performance-reviews.js` directly — no hit).
  If the owner re-uploads a Monthly/Yearly Targets workbook with these columns populated, it
  would already flow through correctly now (post-fix) — but there's no in-app edit box for them.
- **`target_overrides`'s scope-cascade system** (company/state/patch/store, already built, already
  the right SHAPE of what "give me an opportunity to override" sounds like) is explicitly scoped
  to Performance Review metrics: every `TARGET_OVERRIDE_FIELDS` entry requires a `reviewKey` that
  must resolve in `review-engine.js`'s `DEFAULT_REVIEW_CONFIG`, enforced by a real test
  (`target-overrides.test.js`). These 5 Controls metrics aren't Performance Review metrics today.
  Adding them here would mean either also making them scored review metrics (bigger, possibly
  unwanted scope) or loosening that registry's review-tied requirement (an architecture call).

**Options to put to the owner, not decided here:**
1. Add these 5 as plain editable fields to the Monthly/Yearly Targets Editor UI — no new table,
   no architecture change, the data model and parser already fully support it. Simplest.
2. Loosen `TARGET_OVERRIDE_FIELDS`/`target_overrides` to allow a non-review field (drop the
   reviewKey requirement for entries that opt out of review scoring) — gets company/state/patch
   scoping "for free," more work, touches a registry with its own test contract.
3. Build a real "Apply" button in Smart Targets that writes to `settings.targets[loc]` — fixes
   the gap for ALL of Smart Targets' metrics at once, not just these 5, but is the biggest change
   (SmartTargetPanel currently has no settings-setter prop at all; would need threading from
   App.js).

Not picked unilaterally — this is a real product/architecture decision with meaningfully
different blast radii, not a bug fix. Flagged to the owner in chat; revisit once he picks a
direction.
