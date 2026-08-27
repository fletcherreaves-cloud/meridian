# Dispatch #166 — DO (and OM-scaffold) tier on Leadership One-Pager's scope dropdown

## Background — corrects a mislabeling from dispatch #158

The owner's original bug report (2026-08-27) said: *"the FOB number in top is staying the same
whether I select either supervisor for FL... May need to add DO to the dropdown with owners as
well and probably OM for future proofing."*

Dispatch #158 investigated this against the **wrong file**. `above-store-onepager.js` (registry id
`above-store`, label "Above-Store One-Pager") has a flat single-tier supervisor-patch `<select>`.
The panel the owner was actually looking at is **`src/views/one-pager.js`** (registry id
`leader-one-pager`, literal "📋 Leadership One-Pager" title) — confirmed by tracing `App.js`'s
`onOpenModal` dispatch table directly, per this repo's "reproduce before fixing" standing rule.
`one-pager.js` already has a **two-tier "Owner:"/"Supervisor:" dropdown** (`src/views/one-pager.js`
around the `Scope:` row — search for `scopeLabel.startsWith('Owner: ')`), populated from
`settings.operators`/`settings.supervisorGroups`. This dispatch is the corrected, properly-scoped
follow-up, targeting the right file.

## What data exists today

Grepped the whole app: **no DO or OM name→store mapping exists anywhere** — not in
`constants.js`, not in Supabase `org_config`. `review-engine.js`'s `ROLE_LABELS` already has
`OM:'Operations Manager'` as a **review role** (person doing a performance review), which is a
different concept from "DO/OM as a scope filter for the One-Pager."

`constants.js`'s `operators`/`supervisorGroups` maps are **hardcoded seed data**, edited via a
self-service Settings UI: `src/views/management.js`, sections `'🏢 Operators'` / `'🗂 Patches'`
(search `activeSection==='operators'`) — add/rename/remove a name and its comma-separated store
list, no code change needed. This is the pattern to mirror, not reinvent.

## Owner-confirmed DO assignment (2026-08-27, mid-session)

> "DO's right now > Hugh Bonner (OK Stores), Brad Denley (FL Stores) dual role currently serves as
> Supervisor for 3 of the FL locations as well"

So:
- **Hugh Bonner** — DO for all 20 Oklahoma stores (union of the 5 OK `supervisorGroups` entries:
  `3708,6972,24471,32525,5183,18213,29760,33222,5985,10422,13113,33109,43380,10915,33704,34222,35064,11657,20475,31357`)
- **Brad Denley** — DO for all 7 Florida stores (`6178,6838,10034,35242,37566,38609,43701`) — **and**
  already appears in `supervisorGroups` as Supervisor for a 3-store subset of those same 7. This is
  intentional, not a bug: a name can and does appear in more than one tier (`operators` already has
  overlapping membership across owners — see the `Ryan Thorley` comment in `constants.js`). Do not
  "fix" the overlap.

Do NOT derive DO membership dynamically from `INV_ORG_COORDS.state` (i.e., don't hardcode
"DO = whole state" as logic) — model it exactly like `operators`/`supervisorGroups`: a plain
`{name: [locs]}` map, editable later via Settings, just seeded correctly today. State-derivation
would work today by coincidence (there happen to be exactly 2 DOs on a clean state split) but
breaks the moment a third DO or a cross-state DO exists — same trap `operators`' own comment
(`Ryan Thorley operates in BOTH orgs`) already warns about for the owner tier.

## Task

### 1. `constants.js`
Add `doGroups` to `DEF_SETTINGS`, seeded with the mapping above, placed next to `operators`/
`supervisorGroups` (same file region, same comment style — OK block then FL block, matching the
existing two).

Add `omGroups: {}` — empty. Per owner's explicit call this session ("scaffold only, empty by
default"): wire the map, the settings shape, and the dropdown UI now, but seed **no names**. The
existing `Object.keys(operators).length ? h('select'...) : null` pattern in `one-pager.js` already
means an empty map renders nothing — confirm this holds for the new OM dropdown too (don't special-
case "hide when empty," reuse the same guard).

### 2. `src/views/one-pager.js`
Add two more `<select>` dropdowns to the existing `Scope:` row (`div({style:{display:'flex',...`
around the Owner/Supervisor `h('select', ...)` calls), same visual style, same `applyScope(label,
list, level)` wiring:
- **DO** — `settings.doGroups`, label prefix `'DO: '`, level tag `'do'` (mirrors `'owner'`/
  `'supervisor'` exactly — `applyScope('DO: ' + name, doGroups[name], 'do')`).
- **OM** — `settings.omGroups`, label prefix `'OM: '`, level tag `'om'`. Renders nothing until the
  owner adds entries via Settings (see item 3) — do not seed placeholder OM names.

Order in the row: Org/OK/FL preset buttons → Owner → DO → Supervisor → OM (rough org-chart order,
top-down). Adjust if a different order reads more naturally once you see it rendered — this isn't
load-bearing, just don't bury DO after Supervisor.

### 3. `src/views/management.js`
Add a `'🏛 DOs'` settings section mirroring `'🏢 Operators'` exactly (same add/rename/remove-row
UI, same `set('doGroups.'+name, ...)` pattern, same "↺ Sync from defaults" reset button reading
`DEF_SETTINGS.doGroups`). Add a `'⚙ OMs'` section the same way for `omGroups`, so the owner can
populate real OM names/store-lists whenever they're ready without another code change — that's the
entire point of the "scaffold only" call.

Reuse the existing `Object.entries(S.operators||{}).map(...)` rendering code as the template — it's
already parameterized enough (just swap `operators` → `doGroups`/`omGroups` and the section key) —
don't hand-roll a second implementation of the same three UI states (list rows, add-new input,
reset button).

### 4. Verification
- A render-based test against `one-pager.js`'s real `OnePagerPanel` component (not just the data
  layer) proving: (a) the DO dropdown renders and shows "Hugh Bonner"/"Brad Denley", (b) picking
  "Hugh Bonner" sets `locs` to exactly the 20 OK store ids, (c) the OM dropdown does NOT render when
  `omGroups` is empty (guards against a future accidental change to the empty-guard breaking this).
  Per this repo's "verification must touch the call site" rule — a test that only imports
  `applyScope`'s logic in isolation doesn't prove the dropdown is actually wired into the panel.
- A `management.js` render test confirming the new `'🏛 DOs'`/`'⚙ OMs'` sections add/rename/remove
  a row and persist through `onUpdate`, same shape as whatever existing test (if any) covers the
  Operators section — check first with a grep for `activeSection==='operators'` in the test dir
  before writing a new one from scratch.
- Full suite + build, standard bar (see `memory/standard-deploy-budget.md` — no extra push needed
  beyond the one PR).

### Out of scope
- Do NOT touch `above-store-onepager.js` — its flat single supervisor-patch dropdown was already
  correctly left alone in dispatch #160 (own scope tier, no owner ask to change it here).
- Do NOT add DO/OM RBAC permission changes — this is a scope *filter* on one panel, not a new role
  tier in `permissions.js`. (RBAC already lists `DO` as a role in CLAUDE.md's table; that's an
  access-control concept and is unrelated to this dropdown, which is purely "which stores' rows do
  I currently see in this report.")
