# Dispatch #224 — EOM Digest: per-store FOB+components, recount opportunities, Operator rollup

## Context — owner ask, live-confirmed data model, three decisions already made

Owner, after seeing dispatch #219's per-store FOB table land in the real email (screenshot
confirmed, real send): *"Is it realistic to compile each location's snapshot of FOB and components
including targets in a table format for each while also listing the biggest opportunities for each
location... any determined at risk counts that a simple recount could improve... any missing items,
listed out by wrin/description/class... anything deemed a loss during the month that a recount
genuinely won't move the needle is fine to disclude. Bonus if you can roll up fob with components
for each patch/district/market and also add operator to this list both on the digest in the app as
well as option for email."*

Three real decisions, made by the owner directly (not guessed):
1. **Operator becomes a 4th top-level tab** in the EOM Digest — District / Patch / Market /
   Operator, all four available side by side (not a replacement for any existing tab).
2. **Full FOB+components table detail everywhere** — same 5-column shape (Component | Actual $ |
   Actual % | Target % | Δ) per store, in every rollup context, not a leaner version for
   multi-store emails. Accept that a 27-store District email gets long.
3. **Recount opportunities = `state:'never'` or `state:'early'` only** — NOT `state:'stale'`.
   Stale items (last counted a PRIOR period) are the *separate* "Obsolete/Discontinued/Inactive"
   housekeeping bucket (#dispatch immediately before this one trimmed its redundant Action column)
   — a different question ("verify & clear an old residual") from "what could a recount still
   change before this period closes." Keep them out of this section entirely.

## The data — confirmed live/in-code, not assumed (see research citations below)

- **Per-store FOB+components**: `buildStoreFobReport()` (`src/engine/fob-report.js:31`) already
  returns a `comps` array shaped `{ key, label, actualPP, tgtPP, deltaPP }` per component (6
  components: statv/comp/raw/cond/emp/unex) — this is the EXACT data `resend-notify.mjs`'s
  `fobSectionHtml()` (line 81) already renders as an HTML table for a single store. Reuse the data
  shape; the rendering needs to become "once per store in a loop," not "once for the whole email."
- **Recount opportunities**: `diagnoseIncompleteCount()` (`src/engine/eom-inventory.js:268`)
  returns `uncounted[]`, each item `{ wrin, descr, cls, valueAtRisk, lastCounted, state,
  onHandAmt, totalUnits }`, `state` explicitly one of `'never'|'early'|'stale'`. Filter to
  `state !== 'stale'` per decision 3 above. This is structurally SEPARATE from stat-variance/waste
  data (`rankVarianceFollowups()`, a different function reading `qsr_variance_stat` — never
  touches `uncounted[]`), so "everything surfaced here is a genuine open-count item" holds without
  needing to cross-filter against variance/waste some other way.
- **Operator data**: `org_config.app_settings.operators` — confirmed live via service-role read
  today, a flat `{ "Ryan Thorley": ["3708","6972",...], "Jacob Thorley": [...], "Gary
  Mornhinweg": [...], "Rick/Kathy Thorley": [...] }` map, all 27 stores covered by exactly 4
  operators, no gaps. **No live getter/setter exists for this today** — `src/constants.js` only
  has the static seed `DEF_SETTINGS.operators` (line ~148). Mirror the EXISTING
  `supervisorGroups()`/`setLiveSupervisorGroups()` pattern (`src/constants.js` lines 592-652),
  not the fuller `whoRan()`/`groupsAt()` effective-dated timeline machinery — the confirmed
  Supabase shape has no per-operator start-dating, so the simpler flat-map mirror is the correct
  scope, not a guess to save effort. Don't build tenure-tracking that isn't asked for.
- **`buildEomDigest()`** (`src/engine/eom-digest.js:164`): `level: 'patch'|'org'|'district'`
  today; groups by `s.patch`/`s.org` already present on each input row — it does NOT resolve
  patch/org itself, callers pre-resolve it. Mirror this for operator: callers attach
  `operator: operatorOf(u)` per row, `buildEomDigest` gets a 4th `level: 'operator'` branch
  grouping by `s.operator` the same way it groups by `s.patch` today.
- **App tab wiring** (`src/views/eom-dashboard.js`): the District/Patch/Market tabs are 3
  HARDCODED `levelTab()` buttons (line ~3103), not generated from a levels array — same for the
  scheduled-send checkbox row (line ~3121, a separate hardcoded 3-item array). Both need a 4th
  entry added directly; this is not a refactor-to-generic task, just add the 4th case in both
  places, matching the existing style.

## Task 1 — Operator plumbing (`src/constants.js`)

Add, mirroring `supervisorGroups()`/`setLiveSupervisorGroups()` exactly (flat map, no
effective-dating):
- A module-scope `_liveOperatorGroups` variable (mirrors whatever internal name backs
  `supervisorGroups()`), defaulting to `DEF_SETTINGS.operators` (the existing static seed).
- `setLiveOperators(groups)` — sets it from a live-loaded value.
- `operatorGroups()` — returns the current live-or-seed map.
- `operatorOf(loc, fallback = null)` — mirrors `supervisorOf()`'s exact linear-scan-for-loc
  pattern, returns the operator name owning that loc or `fallback`.
Export all four alongside the existing supervisor exports (line ~678).

## Task 2 — Live bootstrap, both consumers

- **Browser** (wherever `App.js`'s startup effect calls `setLiveSupervisorGroups()` today —
  find the exact call site, don't guess a new one): add the matching
  `setLiveOperators(remote.operators)` read from the SAME `org_config` `app_settings` row already
  being read there. One extra field off an already-fetched row, not a new query.
- **Node script** (`scripts/eom-digest-send.mjs`'s `bootstrapLiveOrg()`, lines ~114-124): add
  `setLiveOperators(remote.operators)` alongside the existing
  `setLiveSupervisorGroups(remote.supervisorGroups)` call, same function, same already-fetched
  `remote` object.

## Task 3 — `buildEomDigest()` gets an `'operator'` level (`src/engine/eom-digest.js`)

Extend the level switch (currently `level === 'org' ? 'org' : 'patch'`, line ~171) to a real
3-way (plus district) branch including `'operator'`, grouping by `s.operator` the same way
`'patch'`/`'org'` group by `s.patch`/`s.org`. `UNASSIGNED_KEY` fallback behavior (never dropping a
store, per the existing pattern) applies here too — a store somehow missing from every operator's
list should still surface under `(unassigned)`, not vanish, exactly like patch/org already do.

## Task 4 — Per-store FOB+components + recount opportunities on every `stores[]` entry

Extend `rollupGroup()`'s per-store output (`eom-digest.js` line ~144-158, the `stores: [...]`
array) with two new fields per store:
- `fobComps` — the `comps` array from `buildStoreFobReport()` for that store (reuse the function,
  don't re-derive the math a second time — this dispatch's whole premise is reusing #219's already-
  correct component data).
- `recountItems` — `diagnoseIncompleteCount()`'s `uncounted[]` for that store, filtered to
  `state !== 'stale'` (decision 3), each entry keeping `{ wrin, descr, cls, valueAtRisk,
  lastCounted, state, onHandAmt, totalUnits }` (whatever subset the render layer actually needs —
  state your call on trimming fields, but don't drop wrin/descr/cls, the ask is explicit about
  those three).

Both callers (`eom-dashboard.js`'s `digestStoreRows` build, `eom-digest-send.mjs`'s store-row
build) need to supply whatever raw inputs `buildStoreFobReport()`/`diagnoseIncompleteCount()`
require that aren't already being fetched for the existing digest — check what's already loaded
(`fob`/`fobTarget` are already on `digestStoreRows` per the existing code) vs what's net-new
(raw on-hand rows for `diagnoseIncompleteCount()` — check whether these are already being loaded
anywhere nearby for the existing "biggest opportunities" digest text, or need a new fetch).

## Task 5 — App rendering (`src/views/eom-dashboard.js`)

- 4th `levelTab('operator','Operator')` button alongside the existing 3 (line ~3103).
- 4th checkbox entry in the scheduled-send array (line ~3121) — `['operator', 'Operator']` or
  whatever shape the existing 3 entries use.
- Per store within a rollup group's rendered list: render the FOB+components table (5 columns,
  reuse whatever the app already uses to render #219's per-store FOB table if a shared component
  exists — check before writing a second table renderer) and, below it, the recount-opportunities
  list (WRIN | Description | Class | $ at risk, or similar — match the existing report styling
  conventions in this same panel, don't invent a new visual language).
- Panel-contract check (`memory/panel-contract.md`) since you're touching this panel anyway per
  the standing rule — mobile horizontal scroll on the new wide table specifically.

## Task 6 — Email rendering (`scripts/lib/eom-digest-notify.mjs`, reusing `resend-notify.mjs`
patterns)

For each store inside a rollup group's email body: render the same 5-column FOB table
`fobSectionHtml()` already builds for a single-store email (`resend-notify.mjs:81`) — adapt it to
be callable per-store inside a loop rather than once for a whole email (check its current
signature/call site before deciding whether to extract a shared per-store-table helper both files
import, or duplicate the ~20 lines; prefer extraction if the reuse is clean, don't force it if the
two contexts have diverged enough that sharing costs more clarity than it saves — state your call).
Below each store's FOB table, the recount-opportunities list, same content as the app rendering.
Given decision 2 (full detail everywhere), do NOT collapse this for District-level 27-store emails
— cap total email length only if you hit an actual delivery-size problem (state whether you did),
not preemptively.

## Verification

- Real live measurement: pick 2-3 real stores with genuine open (never/early) uncounted items,
  hand-verify the recount-opportunities list your code produces matches a direct
  `diagnoseIncompleteCount()` call against the same real data, and confirms zero `state:'stale'`
  items leak through.
- Real live measurement: confirm the 4 operators' store counts sum to 27 with zero overlap and
  zero gap via `operatorGroups()`, matching the raw Supabase data live-confirmed in this dispatch's
  Context section.
- Unit tests: `operatorOf()`/`operatorGroups()`/`setLiveOperators()` (mirror whatever
  `supervisorOf()`'s own test coverage shape is — find it, match it, don't invent a different
  testing style for a twin function).
- Unit tests: `buildEomDigest({level:'operator'})` groups correctly, `UNASSIGNED_KEY` fallback
  still works.
- Unit tests: the new `stores[].fobComps`/`stores[].recountItems` fields are correctly populated
  and `state:'stale'` is provably excluded (a fixture with all three states, assert only
  never/early survive).
- Render tests (real consumer, not just engine output) for both the app tab addition and the
  email's per-store table/list — per this repo's "would this verification still pass if the change
  were reverted" rule.
- Panel-contract check per Task 5.
- Standard suite + build, with the entry-chunk budget check explicitly reported (this panel is
  already substantial; report before/after gzip numbers even if the delta is small).
- Version bump (re-check `origin/main`'s current highest changelog version fresh immediately
  before committing).

## Out of scope

- Tenure-dated operator assignment history (`whoRan()`/`groupsAt()`-style timeline) — the
  confirmed data has no such dating; build the simple flat mirror only, per Task 1's explicit
  instruction.
- Any change to `buildStoreFobReport()`'s or `diagnoseIncompleteCount()`'s own math — both reused
  exactly as they exist today, this dispatch only threads their existing output through new
  surfaces.
- A leaner/condensed FOB table variant for large rollups — decision 2 explicitly rules this out.
- Including `state:'stale'` items anywhere in the recount-opportunities section — decision 3
  explicitly rules this out; they stay exclusively in the existing Obsolete/Discontinued/Inactive
  report section, untouched by this dispatch.
- A UI settings screen for which levels' recount-opportunity detail shows — this ships at full
  detail everywhere per decision 2, no new toggle.
