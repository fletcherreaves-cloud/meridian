---
name: project-forms-library-index
description: Backlog idea — extend the Printable Forms feature to index the FULL QSRSoft forms library (not just the 8 pinned Pre-Shift/Travel Path forms) so any form can be made printable on demand. The pull→normalize→render pipeline is already generic; this documents what's already in place and the small deltas needed.
metadata:
  node_type: memory
  type: project
---

# Printable Forms — full-library index (backlog, 2026-07-27)

**Status:** idea captured, not scheduled. "When needed." Owner (Fletcher) asked to
log it after we shipped the 8-form Printable Forms feature (PRs #73/#74/#75).

## The ask
We effectively already fetch the whole QSRSoft forms library to pick the 8 forms.
Could we index *all* forms (the library grows/changes over time) and make any of them
printable the same way, on demand?

## Why it's ~90% already built (generic on purpose)
- **Full list already fetched.** `scripts/qsrsoft-forms-pull.mjs` calls
  `GET forms.home.myqsrsoft.com/api/forms?orgId=…` → **every** form in the library
  (~60 across categories: Shift Management, 2026 Operations Forms, People Development,
  MCDOK People, etc.) with name/formId/category/lastEditedAt. We just filter it to 8
  via `DEFAULT_IDS` + the `DEFAULT_MATCH` regex.
- **Normalizer is schema-driven, not form-specific.** `src/engine/forms-model.js`
  `normalizeForm()` reads the generic question shape (`order`/`type`/`title`/`options`/
  header colors) — already handles any form built from those blocks.
- **Renderer + panel are generic.** `src/views/forms-print.js` groups by `category`
  and lists whatever `public/forms/index.json` contains → drop in 60 forms, it shows 60.

So the only thing scoping to 8 is the target-selection filter in the pull script.

## The elegant shape — two tiers
1. **Lightweight full catalog** — index every form's *metadata* (name/id/category/
   lastEditedAt) from the single list call. Cheap, always current; the "menu" of
   everything available. Could refresh weekly (add a `schedule:` to the workflow).
2. **On-demand detail pull** — when a form is flagged "make printable," pull its
   `/api/forms/questions` detail and render it. Mirrors exactly what we did manually
   (owner picked 8, we pulled those) but self-serve — no need to know a formId.

## Deltas needed (small)
1. Flip pull target from `DEFAULT_IDS`/`DEFAULT_MATCH` to "all published, non-deleted"
   (keep filtering drafts/copies/legacy — already do).
2. **Add a few field-type renderers.** Current type map covers what the checklists use:
   `header`, `radio`/`checkbox`, `textShort`/`textLong`, `datePicker`, `timePicker`.
   The library also has **scored visit/audit forms** (RGRV QSC Visit, Food Safety Visit)
   and **performance reviews** using richer types — rating scales, point weights,
   signatures, matrices. They'd pull fine but render best-effort until the mapper learns
   those types.
3. Optional: an in-panel **"Add this form"** button so it's fully self-serve (browse the
   catalog → pull detail → printable), no script edit.

## Considerations
- **Fit for purpose.** Many library forms are meant to be filled *digitally with
  scoring* (visits, reviews) — a blank printout is less useful for those than for a
  pre-shift checklist. Still valid as printable references; just be intentional.
- **Volume/size.** ~60 forms of JSON is trivial for repo + the category-grouped panel.
- **Noise.** Keep excluding drafts/copies/legacy so the catalog stays clean.

## Bottom line
No re-architecting — the hard part (generic pull → normalize → render) is done. Work is
roughly: (1) widen the pull filter, (2) add scored-form field-type renderers, (3) optional
self-serve "add form" button. Revisit if/when a broader printable-forms need appears.

Related: `memory/project-eom-item-journey.md` (sibling QSRSoft-data feature),
`scripts/qsrsoft-forms-pull.mjs`, `src/engine/forms-model.js`, `src/views/forms-print.js`,
`.github/workflows/qsrsoft-forms-pull.yml`.
