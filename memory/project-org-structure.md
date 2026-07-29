---
name: project-org-structure
description: How Meridian stores + reads the supervisor→store org structure (supervisorGroups). Now fully data-driven (v4.570) via a live singleton; how to add/edit a supervisor; the retroactive-attribution caveat.
metadata:
  node_type: memory
  type: project
---

# Org structure (supervisor patches)

## Storage
- **Default** org: `DEF_SETTINGS.supervisorGroups` in `src/constants.js` — `{ "Supervisor Name": ["3708","6972",...] }` (unpadded store IDs). OK supervisors + FL (`Brad Denley`).
- **Live/editable** org: `settings.supervisorGroups`, persisted to Supabase **`org_config`** key `app_settings` → shared cross-device. Edited in **Management → Supervisor Patches** (add via "+ Add Supervisor Patch", per-supervisor comma-separated store IDs, ✕ to remove). A full org file upload can also populate it.
- **operators** (owner/ownership) is a SEPARATE map — untouched by supervisor edits.

## v4.570 — fully data-driven (the split-brain fix)
Before v4.570, 5 panels read the HARD-CODED `DEF_SETTINGS.supervisorGroups` (not the live
settings), so a live org edit didn't reach them: **DT Speed of Service, Smart Targets, Labor
Analysis, Skills Matrix, Graded Visits** (3 of them don't even receive `settings`). Fixed with a
**live-groups singleton** in constants:
- `setLiveSupervisorGroups(g)` + `supervisorGroups()` (returns live else default).
- `App.js` syncs it on every settings change: `useEffect(()=>setLiveSupervisorGroups(settings?.supervisorGroups),[settings])`.
- All 5 panels now read `supervisorGroups()`; DT Speed's module-scope `LOC_PATCH` map became a
  live `locPatch(loc)` function.
Panels that already read `settings.supervisorGroups` (One-Pager, EOM Supervisor, Store Dash,
Labor Tools, Projections) were already fine.
**Net:** an in-app add/remove/reassign — or an uploaded org file → org_config — reflects across
EVERY panel + cross-device with no code change.

## ⚠️ Retroactive attribution (known limitation)
supervisorGroups is a CURRENT mapping with **no effective date**. Reassigning stores moves ALL
historical supervisor rollups to the new supervisor (the old supervisor's past patch numbers
shrink immediately). Fine for going-forward management; only matters for historical patch
comparisons. Date-effective patches are on the Notes-33 to-do ([[notes-33-queue]]).

## 2026-07-29 pending change (owner)
Adding an FL supervisor: **Brad Denley 7→3 stores**, new **Mary + 4 stores** (FL only). Brad's
current 7: `6178,6838,10034,35242,37566,38609,43701`. Owner to do it in-app after v4.570 deploys.
