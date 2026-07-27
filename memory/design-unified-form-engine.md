---
name: design-unified-form-engine
description: North-star design note — a single shared "form engine" (typed-field schema + generic renderer + response store) that Perf Reviews, EOM checks, and the printable-forms model all sit on. Distilled from studying QSRSoft's forms schema (2026-07-27). Not urgent; a "when we consolidate" theme. Evaluate before the Perf Reviews template work goes deeper.
metadata:
  node_type: memory
  type: design
---

# Unified Form Engine — north star (2026-07-27)

Owner-approved design direction, distilled after building the Printable Forms feature
and studying QSRSoft's forms schema. **Not scheduled** — a consolidation theme to steer
toward, especially before Perf Reviews templates (#59) go deeper.

## The observation
Meridian already has **three form-ish systems that don't share a spine**:
- **Perf Reviews** — `src/engine/review-engine.js` (`DEFAULT_REVIEW_CONFIG`: competencies,
  weights, thresholds; ratings stored by positional index — a known fragility).
- **EOM diagnosis** — the check registry / `runDiagnosis` (typed checks + verdicts).
- **Printable Forms** — `src/engine/forms-model.js` (typed fields → sections → render).

They're all "typed fields + rules + rendering + captured responses." One engine could
back all three.

## What QSRSoft's schema teaches (borrow)
- **Forms are DATA, not code** — an array of typed fields rendered generically. Validates
  our data-driven direction (`DEFAULT_REVIEW_CONFIG` already leans this way).
- **Small closed field-type set + a loose `settings` bag** — `header/radio/checkbox/
  text/date/time/rating…` + per-field settings → extend by convention, not schema migration.
- **Conditional follow-ups** — an option can reveal a sub-question (their "Needs Action" →
  corrective checklist). Great for: low review score → require note/dev-plan; EOM check
  fails → capture "why".
- **⭐ Forms wired to ACTIONS** — their `allowFollowUpTask` spawns a task from a flagged
  item. The key insight: a checklist that **feeds the Task Queue** turns paper into an
  operational loop. Squarely the "intelligence system, not a data viewer" vision.
- **Scoring** (`points/pointsPossible`) and a **publish lifecycle** (draft → published) —
  map onto reviews + graded visits.

## What to AVOID (their weak spots)
- **Flat array + integer `order` for structure** — reordering = renumbering; sections only
  implied by header position. Same positional fragility as reviews-by-index. → **stable
  field IDs + explicit sections, never positions.**
- **Presentation baked into schema** (color/size/weight per item) — keep look derived from
  semantic type/section; author color = optional hint only (how forms-model.js treats it).
- **Clone sprawl** ("(Copy)", "revised", "(legacy)") — a symptom of no versioning UX. Build
  real versioning so you never get name-suffixed duplicates.
- **Thin validation** (only `required`) — a real capture engine wants min/max/pattern/
  cross-field rules.

## Target shape (when we build it)
One schema: `{ sections: [ { title, color?, items: [ { id, type, label, options?,
required?, followUp?, points? } ] } ] }` + a generic renderer (screen + print, already
half-built in forms-model.js) + a response store (Supabase) + optional Task-Queue wiring
on flagged items.

Then:
- **Perf Reviews (#59)** gains: stable IDs (fixes the index-misalignment risk on reorder),
  conditional follow-ups, clean draft/publish versioning — the exact things being built now.
- **Checklists** become first-class and Task-Queue-wired (fail → auto-ticket).
- **New capture needs = a config, not a new subsystem.**

## Recommendation
Don't adopt QSRSoft's schema wholesale (dated in places) — use it as a reference, not a
blueprint. Steer the Perf Reviews template work toward the shared-engine shape (stable IDs
first — it must precede drag-reorder per #59/Phase C), and chase the **form → Task Queue**
loop when consolidating. Related: `memory/project-forms-library-index.md`,
`src/engine/review-engine.js`, `src/engine/forms-model.js`, EOM check registry.
