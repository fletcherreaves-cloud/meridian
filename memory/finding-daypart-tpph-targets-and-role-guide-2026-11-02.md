---
name: finding-daypart-tpph-targets-and-role-guide-2026-11-02
description: "Day-part TPPH targets (Targets system item #2) and the role-filtered Workflow Guide (#65's remaining half) -- what was already built vs. what was actually missing, per owner decisions 2026-11-02."
metadata:
  type: finding
---

# Day-part TPPH targets + role-filtered Workflow Guide (2026-11-02)

## Daypart taxonomy correction (important — read before touching either feature)

My first AskUserQuestion round offered a 4-way Breakfast/Lunch/Dinner/Late-Night split for TPPH
targets, without knowing the app already has a canonical, owner-vetted **5-way** taxonomy —
`DAYPARTS` / `daypartOf()` in `src/engine/labor-standard.js`: **Breakfast 5a-11a | Lunch 11a-2p |
Afternoon 2p-5p | Dinner 5p-11p | Late Night 11p-5a** — explicitly commented "do not re-derive,"
already reused by the VLH guide, the labor-allocation analysis, and `security_rules` (daypart
waste bucketing). Caught before building and re-asked; owner confirmed: **use the existing 5-way
split, not a new one.** If a future dispatch is tempted to invent daypart boundaries for anything
TPPH/labor-related, grep for `daypartOf` first — this is the second time this exact app has a
single-source-of-truth daypart definition that's easy to miss and re-derive wrong.

## Daypart TPPH targets — what was already built vs. what was actually missing

The "actual daypart TPPH" half of this feature **already existed** — `allocationByStoreDaypart()`/
`allocationDistrict()` (`labor-standard.js`) already compute `tpph` per `(loc, daypart)` from
`qsr_daily_activity`'s existing hourly rows (`dt_trans_cnt` ÷ `actual_punched_hours`), wired into
`src/views/labor-allocation.js`'s "By Store" tab — just never rendered as its own column there
(only surfaced for Late Night specifically, inside the Overnight tab). What was genuinely missing
was the **target** half.

Deliberately did NOT fold this into `target_overrides`/the Targets Editor (`schema-target-
overrides.sql`), despite that registry's own "generic enough to extend by adding one row" framing
in `targets-editor.js`'s header comment. Every existing `TARGET_OVERRIDE_FIELDS` entry carries a
`reviewKey` tied to a real Performance Review metric, cross-checked by
`src/__tests__/target-overrides.test.js` — daypart TPPH isn't review-scored, it feeds Labor
Allocation, a different consumer. Forcing it in would mean either a fake `reviewKey` (fails that
test) or an untested "reviewKey is optional" assumption for every other consumer of that registry.

Built instead as a small, dedicated table — same shape/reasoning as
`weekly_count_day_overrides` (`schema-weekly-count-day.sql`), which itself replaced an earlier
`org_config`-JSON-blob draft for the exact stated reason "per-store data belongs in per-store
rows, not buried inside one config row":

- `supabase/schema-daypart-tpph-targets.sql` — `daypart_tpph_targets(loc, daypart, target_tpph)`,
  flat per-store (no Company/State/Patch cascade in v1 — add later if wanted, not guessed at now).
  **Uses `public.current_tenant_id()` + a `set_tenant_id` trigger, NOT a hardcoded tenant UUID
  literal** — deliberately avoiding the exact anti-pattern
  `memory/project-multitenant-onboarding.md`'s 2026-11-02 correction flagged on 51 other schema
  files, including (ironically) `schema-weekly-count-day.sql` itself, this table's own closest
  analog.
  ✅ **CONFIRMED LIVE 2026-11-03 — owner ran the SQL, do not re-raise as pending.** Verified via
  service-role `curl` against `daypart_tpph_targets?select=loc,daypart,target_tpph`:
  `200`/`content-range: */0` (table exists, zero rows — nobody has set a target through the UI
  yet). Calibrated against a deliberately wrong column name on the same table, which correctly
  returned `400`/`42703` ("column ... does not exist") rather than another silent `*/0` — the
  same three-way-style check this repo's own "measure, don't reason" rule expects, so this is a
  real confirmation, not a masked failure.
- `loadDaypartTpphTargets()` / `saveDaypartTpphTarget()` (`src/lib/supabase.js`) — degrade to
  `{}`/`{saved:false}` like every other guarded read until that table exists.
- `src/views/labor-allocation.js`'s "By Store" tab: new TPPH / Target TPPH / vs Target columns.
  Target cell is click-to-edit inline (type a number, blur or Enter to commit), optimistic local
  update + fire-and-forget persist — same pattern `RolesTab`'s panel-toggle editing uses.

Test: `dispatch-labor-allocation-panel-render.test.js`'s new case (mounts the real
`LaborAllocationPanel`, not the engine functions in isolation).

## Role-filtered Workflow Guide (#65's remaining half)

Owner decided "different content per role," not a new checklist/progress-tracking build — so
this extends the EXISTING static Workflow Guide modal rather than building a second tool.
Extracted it into its own exported `WorkflowGuidePanel({userRole, orgRoles, onClose,
onStartTour})` (`src/app/App.js`, same pattern `PanelManagerPanel`/`TroubleshootingPanel` already
use — it was inline modal JSX before, untestable without mounting the whole `App()` root).

Each section in the now-module-level `WORKFLOW_GUIDE_SECTIONS` array carries an optional
`maxLevel` (DEFAULT_ROLES' "lower = more authority" scale) — the WEEKLY/MONTHLY district-wide
lock cadence and the AS-NEEDED automation overview are `maxLevel:4` (owner/admin/vp/do/manager/om
see them; area_supervisor/gm/sm_am_dm don't, since they don't run that workflow). DAILY and KEY
FEATURES carry no `maxLevel` — relevant at every level. Fails OPEN (shows every section) when the
role can't be resolved — an onboarding guide should never go blank over a data hiccup, unlike a
security-relevant gate.

Test: `dispatch-workflow-guide-role-filter-2026-11-02.test.js` — renders the real
`WorkflowGuidePanel`, checks an owner sees everything, a GM sees only DAILY/KEY FEATURES, an OM
(level 4, the cutoff) still sees the district-wide sections, and an unresolvable role fails open.
