# Digital Checklists (2026-09-01)

Owner request, verbatim (mid-session, after seeing the QSRSoft "Printable Forms" library
screenshots): *"pull these forms and convert to MBI"* → clarified via follow-up: pull from
QSRSoft (already-existing pipeline, confirmed by the owner: *"pretty sure we converted those
in the picture under printable forms"*), scope = **all forms in the Printable Forms Library**,
target shape = **a new digital-checklist feature** — an actual in-app fillable checklist,
saved to Supabase, not the existing print-only blanks.

## What already existed (found before building anything new)

Per this repo's own standing rule ("check whether a helper exists before writing one"),
`scripts/qsrsoft-forms-pull.mjs` + `src/views/forms-print.js` + `src/engine/forms-model.js`
already pulled and rendered BLANK, print-only templates for exactly the QSRSoft "Printable
Forms Library" screenshotted — but only an 8-form default (6 Pre-Shift + 2 Travel Path),
via a title-regex `DEFAULT_MATCH`. `scripts/qsrsoft-forms-completion-pull.mjs` separately
tracks LIVE completion (did a store finish a scheduled form in QSRSoft's own app), feeding
`src/views/forms-panel.js` — a different question (compliance tracking) from this feature
(actually filling a form inside Meridian).

The owner independently confirmed the full live catalog by pasting a real
`GET forms.home.myqsrsoft.com/api/forms?orgId=...` response mid-session: **~50 published
forms** across many categories (Shift Management Forms, EA Forms, 2026/2025 Operations
Forms, People Development, Legacy, plus a few uncategorized) — far more than the 8-form
default, including RGRV/CFV visit forms, performance reviews, coaching visits, and GM
routines, not just pre-shift checklists. A handful of forms (`MCDOK People` category) are
`publishedStatus: "draft"` and correctly excluded.

## What changed

1. **`scripts/qsrsoft-forms-pull.mjs`** — default target set widened from the 8-form
   `DEFAULT_MATCH` regex to **every published, non-deleted form** in the library. `FORMS_IDS`/
   `FORMS_MATCH` still work as an explicit narrowing override (e.g. to re-pull one form after
   an edit) — they're just no longer the default. `.github/workflows/qsrsoft-forms-pull.yml`
   gained a `forms_match` input to match.
2. **`supabase/schema-checklist-submissions.sql`** (new table `qsr_checklist_submissions`) —
   one row per (store, form, business date), `responses` jsonb keyed by
   `"<sectionIndex>::<itemTitle>"` (items have no stable id in the raw QSRSoft payload;
   `normalizeForm()` already drops it — see `src/engine/forms-model.js`). tenant_id + RLS from
   day one, same pattern as `schema-qsr-forms-completion.sql`. `filled_by` is `auth.uid()`
   only, never a plaintext name (same PII rule that table's header already established for
   this exact data source). **⚠️ Not yet run against the live database** — the owner needs to
   run this file in the Supabase SQL editor once, same as every other `schema-*.sql` in this
   repo (they are not auto-applied migrations).
3. **`src/lib/supabase.js`** — `loadChecklistSubmission()` / `saveChecklistSubmission()`,
   mirroring the existing upsert-by-composite-key pattern (`eom_secondary_review`,
   `target_overrides`, etc.).
4. **`src/views/checklist-fill.js`** (new panel, `ChecklistFillPanel`) — one generic renderer
   drives every form in the library, not per-form UI: `normalizeForm()`'s item shape
   (`kind: 'check' | 'field' | 'text'`) is already uniform across the whole catalog (QSRSoft's
   form builder only has those primitive question types), the same "zero per-consumer wiring"
   design already used this session for the app-wide screenshot Share button. Picker (forms
   grouped by category, from `public/forms/index.json`) → `LocationSelector` (single store) +
   date picker (`businessDate()`, the existing 4am-cutover helper) → renders the form
   interactively (radio-style buttons for `check` items, date/time/text inputs for the rest) →
   Save Draft / Submit, loading/resuming any existing submission for that exact
   (store, form, date) on open.
5. **`panel-registry.js`** — new entry `checklist-fill` / "Digital Checklists" / 📝,
   `section:'forms'` (alongside Printable Forms), **built `route:true` from day one** (own
   `RoutePanelShell`, same treatment dispatch #123 gave `crew-schedule`) — not a later
   conversion. Wired into `App.js` via `lazyPanel()` (CLAUDE.md's speed-check standing rule —
   new panels are lazy by default; the pre-existing sibling `forms-print.js` is NOT lazy, but
   that's its own pre-existing debt, not a reason to add a second static import).
6. Ratchets updated to match: `src/__tests__/panel-registry.test.js`'s pinned `ROUTE_IDS` list
   (32→33) and `src/__tests__/shell-nav-snapshot.test.js`'s exact nav-text snapshot. CLAUDE.md
   and `memory/panel-contract.md`'s `route:true` adoption counts (32 of 93 → 33 of 94).

## What this does NOT do yet

- **The SQL has not been run.** `saveChecklistSubmission`/`loadChecklistSubmission` will fail
  gracefully (console error naming the exact file to run) against a database that doesn't have
  `qsr_checklist_submissions` yet — same `_isMissingTable()` guard every other table-not-found
  case in `supabase.js` uses.
- **The widened forms pull has not actually been RUN against live QSRSoft.** This sandbox has
  Supabase credentials but not QSRSoft ones (confirmed earlier this session) — pulling the full
  ~50-form catalog into `public/forms/*.json` needs a `workflow_dispatch` of
  `qsrsoft-forms-pull.yml` (which commits the refreshed JSON straight to whichever branch
  triggered it), or a local run with `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD`. Only the original
  8 pre-shift/travel-path forms are committed to `public/forms/` as of this commit — the panel
  will show only those until the pull is re-run.
- **No per-form customization.** Every form renders through the exact same generic template
  (check/field/text). A form whose raw QSRSoft type needs richer handling (e.g. an approval
  workflow, a scored rubric — several of the ~50 forms carry `requestApproval`/`approvers`
  fields the normalizer currently ignores) will still render, just without that extra behavior.
  Not scoped for this pass; flagged here rather than silently dropped.
- **No submission history/audit view.** One row per (store, form, date) — re-submitting the
  same day overwrites, by design (matches "fill it once per business day" reality), but there
  is no drill-down UI yet to see past submissions across dates. A natural Slice 2 if the owner
  wants it, not built here.
