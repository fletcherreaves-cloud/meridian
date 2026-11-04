# Target field customization (owner-requested 2026-11-04)

Owner, verbatim: *"Let me know when you have a minute as well how we can add settings to the
targets so they may be customized as needed. Need to be able to add or remove metrics and
categories on monthly and yearly."*

## Two-tier design

**Tier 1 (built now, this dispatch): visibility/relabel/regroup over the existing fixed field
list.** Every field on Monthly Projections (`analytics.js`'s `PROJ_FIELDS`) and Yearly Targets
(`yearly-projections.js`'s `YEARLY_CATS`) is tied to a REAL data column
(`monthly_targets.tProdSales`, `yearly_targets.tOepe`, etc.). There's no backing store for a
genuinely novel metric with no existing column, so Tier 1 does NOT invent new metrics out of
nothing. What it does, with zero schema change:
- **"Remove" a metric** — hide any existing field from the grid without deleting its data.
- **Rename a field's display label.**
- **"Add"/reorganize categories** — regroup fields into owner-named categories, including brand
  new category names typed directly into the editor (a field moved into a name that doesn't
  match any existing group/category simply creates that group).
- A category that ends up with zero visible fields (everything in it hidden or moved out) drops
  out of the rendered list automatically — no empty-shell categories to clean up.

All of this is stored as one JSON config object per surface
(`settings.monthlyTargetConfig` / `settings.yearlyTargetConfig`), through the existing
settings/`user_settings` mechanism this app already uses for every other org-level preference —
no new Supabase table, no DDL.

**Tier 2 (future, NOT built, deliberately deferred): genuinely new custom metrics with no
existing column.** This WOULD need a new column (a JSONB `custom_fields` blob on
`monthly_targets`/`yearly_targets`, or a dedicated table) to actually persist a value nobody has
a column for today — real schema change, which per this repo's standing rule is the owner's own
action in the Supabase SQL editor, never run automatically by an agent session. Left as a named
future option, not attempted this dispatch. If it's ever wanted: the UI shell built here
(`TargetFieldConfigEditor`) could grow an "add a brand-new field" affordance once a backing
column exists; today a config entry can only reshape/hide/rename a field that already has real
data behind it.

## Engine (`src/engine/target-field-config.js`)

Two pure functions, both never mutating their input, both no-op (identity/shallow-copy) when
`config` is null/undefined/empty — day-one behavior for anyone who's never touched this:

- **`applyFieldConfig(items, config)`** — Monthly's shape: flat array, each item has `key` (or
  `k`, so it also works unmodified against a pre-flattened Yearly array) and a group tag `g`.
  `config: {fields:{[id]:{hidden?,group?,order?,label?}}, groups:{[groupName]:{label?,order?}}}`.
  Filters hidden fields, relabels, regroups (an explicit `group` override wins over the field's
  original `g`), relabels groups, and stable-sorts (explicit `order`, else original/first-seen
  position) — so an untouched field/group keeps its original position exactly.
- **`applyCategoryConfig(categories, config)`** — Yearly's nested `{key,label,icon,fields}`
  shape. Flattens to `applyFieldConfig`'s shape (tagging each field with its owning category's
  `key` as `g`), runs the same engine, regroups back into the nested shape every `YEARLY_CATS`
  consumer already expects (drop-in replacement, not a new shape to learn). A renamed/merged
  group's `icon` is borrowed from whichever original category its first surviving field came
  from (a renamed-only group still has one true icon; a merged group picks one reasonably rather
  than going blank).

15 tests: `src/__tests__/dispatch-target-field-config-2026-11-04.test.js`.

## UI (`src/components/TargetFieldConfigEditor.js`)

One shared `ModalShell`-based editor used by both panels (parameterized by `fields`/`config`/
`onSave`/`onClose`/`title`), so there's one customization experience across Monthly and Yearly,
not two. Per field: a visibility checkbox, an editable label, and a category reassignment
control (dropdown of existing categories + a "+ New category…" option that reveals a free-text
box — typing a brand-new name both creates and names that category in one step). Per *original*
category: an editable name box (renames every field currently in it without touching each one).
"Reset to defaults" clears the whole config back to day-one behavior. Deliberately **not** built
in this pass: drag-and-drop reordering — the engine's `order` field supports it, but exposing it
needs its own interaction design and wasn't part of the owner's literal ask ("add or remove
metrics and categories"); a natural fast-follow if he wants finer control over field/category
order later.

## Wiring

- **Monthly** (`analytics.js`'s `MonthlyProjectionsPanel`): the existing legacy toggles
  (`showProjService`/`showProjBonusLabor`/`showProjBonusFood`) are untouched and still filter
  first — the new `settings.monthlyTargetConfig` layers on top via `applyFieldConfig`, so the
  three fast on/off chips keep working exactly as before alongside the new per-field editor.
  "⚙️ Customize" button sits next to those chips.
- **Yearly** (`yearly-projections.js`'s `TargetCategoriesView`): `YEARLY_CATS` is run through
  `applyCategoryConfig(YEARLY_CATS, settings?.yearlyTargetConfig)` to produce the `CATS` array
  the rest of the component already reads from (tabs, table columns, district rollups, print/
  export) — same shape in, same shape out, nothing downstream had to change. "⚙️ Customize"
  button sits in the category tab row. `onUpdateSettings` is threaded down from
  `YearlyProjectionsPanel` (which didn't previously take that prop — `App.js`'s own `common`
  object already included it, just never destructured/passed through here) to
  `TargetCategoriesView`.

Both persist via the existing `onUpdateSettings` → `saveSettings` → `user_settings` round trip —
no new Supabase table.
