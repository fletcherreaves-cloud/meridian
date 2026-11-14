# Squadle checklist record shape — measured live, and the Phase 2 UI built from it (2026-11-14)

## Context

Task #105's Squadle pull (`scripts/squadle-pull.mjs`) shipped 2026-11-13 with the data flowing
into `squadle_checklist_records` and loaded client-side into `ds.squadleChecklistRows`
(`loadSquadleChecklistRecords`, `src/lib/supabase.js`), but deliberately with **no consuming
engine or panel** — see `memory/finding-hme-squadle-integration-2026-11-06.md`'s "Phase 2:
surface the data" note, which floated "Squadle's compliance rollup likely extends or parallels
the existing Forms Completion feature" as an unverified hunch. This pass verifies that hunch and
builds the panel.

## The real shape (measured live against 42 records / 21 stores / 2 dates — 2026-11-14)

Top-level DB row: `tenant_id, loc, squadle_location_id, dt, shard, created_on, data, pulled_at,
updated_at`. `data` (JSONB):

```
data: { brand, squad, location, createdOn, shifts: { "0".."9"-"16": <shift> } }   // 9-17 shifts/record
shift: { name, startTime, endTime, tags, meta, tasks: { "0".."N": <task> } }
task:  { kind: 'regular' (the ONLY kind seen across 3,961 real tasks), name, tags, points,
         actions: { "0".."N": <action> } }
action: { type, label, using, value, optional, lastEdited, firstEdited, description,
          triggers: { "0".."N": <trigger> }, attributes, options, formula, attachedFile, ... }
trigger: { type: 'range'|'match'|'formula', lowerRange/upperRange (range) | matchValue (match) }
```

**11 real action `type`s**: number, toggle, radio, formula, select, readOnly, text, attachment,
textarea, checkbox, photo. `readOnly` carries no `using`/`value`/`optional` at all — pure
instructional text (e.g. *"Check should be completed approximately one hour after the first run
of Breakfast Sausage has been cooked..."*) — NOT completable, excluded from every rollup.

**`optional` is a real boolean**, present on 13,139/18,505 (71%) of non-readOnly actions; the
other 29% had neither true nor false. Treated as required unless explicitly `optional:true` (fail
toward the stricter reading, same convention `scope`/`sensitivity` classification already uses —
`memory/plan-knowledge-backbone-2026-11-03.md` §3).

**Completion signal is `value` (non-empty), NOT `lastEdited`** — measured: 1,560 of 12,887
genuinely-completed actions (12%) carry a real value with no `lastEdited` timestamp at all.
`lastEdited`-only would silently undercount completion by more than one in ten.

**3 real trigger types**: `range` (number/formula actions — e.g. `{lowerRange:'30',
upperRange:'34'}`), `match` (toggle/select/radio — e.g. `{matchValue:'No'}`, flags a "bad"
answer), and `formula` (e.g. `stringcompare(#0,Shut Down)`, referencing ANOTHER action's answer
by index). Only `range` and `match` are evaluated in the engine below — evaluating `formula`
would mean inventing a formula-language interpreter from one example, which is guessing, not
measuring. An action with only a `formula` trigger reads as `flagged: null` (unknown), never
`false` (confirmed-fine) — the two are kept distinct on purpose.

## What was built

`src/engine/squadle-checklist.js` — pure functions, same raw-row → flat-row → store-day-rollup →
district-summary shape `src/engine/forms-completion.js` already uses for the unrelated QSRSoft
Forms feature (confirms the deferred note's hunch was right, after checking, not before):

- `flattenSquadleRecord`/`flattenSquadleRecords` — one row per action, drops `readOnly`.
- `evaluateActionFlag` — range/match evaluation, `null` for formula-trigger/no-trigger/no-value.
- `computeSquadleStoreDayRollup` — per (loc, dt): `requiredCount`/`requiredCompletedCount` (drives
  `completionRate`), `optionalCount`/`optionalCompletedCount` (tracked separately so an optional
  field never drags completion down), `flaggedCount`/`flaggedItems` (counts a flagged action
  regardless of optional-ness — a bad temperature matters whether or not the field was marked
  optional).
- `computeSquadleSummary` — Σcompleted/Σrequired across stores, **never a mean of store rates**
  (CLAUDE.md's standing rule) — verified with a test where a naive mean would read ~50% against
  the real ~2% Σ/Σ answer. Per-store breakdown sorted worst-first.
- `extractFlaggedItems` — drill-down list, newest-edited first.

`src/views/squadle-checklist-panel.js` — new panel (`id:'squadle-checklist'`,
`kind:'test-kitchen'`, `route:true`, `section:'forms'`, `perm:'analytics.store'`, same tier as
`forms-completion`/`forms-reviews`). Reads `ds.squadleChecklistRows` directly (already loaded, no
separate fetch) — LocationSelector + a Today/7d/30d window, district summary cards, per-store
table, flagged-reading drill-down table (capped at 200 rows in the DOM, matching
`forms-panel.js`'s own `MAX_OCCURRENCE_ROWS` pattern — the underlying rollup still reflects the
full set).

## Live end-to-end verification (not just unit tests)

Ran the real engine against all 42 live records before calling this done:
- 18,139 flattened action rows, 42 store-day rollup groups.
- District: 15,818 required actions, 12,594 completed → **79.6%** completion, **462** flagged
  readings.
- Worst 2 stores by completion were **18213** (Lindsay-Walmart, closing 2026-11-10 per
  `constants.js`) at 12.6% and **44689** (the new Lindsay, not yet open per the owner's own
  2026-11-14 confirmation) at 15.0% — both make complete sense (a closing/not-yet-open store
  naturally has the thinnest real checklist activity) and are a genuine sanity check that the
  completion metric behaves correctly on real data, not a bug.

## HME (not this pass's primary target, per directive)

`src/views/dt-speedofservice.js` already reads `ds.hmeDtRows` (confirmed, not assumed) — it has a
real UI consumer already, unlike Squadle. Did not dig further into whether that integration is
complete; out of scope for this pass per the directive's own instruction not to let HME
scope-creep the Squadle build.

## Open / for the owner

- Squadle's pull has only 2 days of real history as of this measurement (2026-11-12/13) — too
  thin to judge long-run data quality yet. Worth a fresh look once a week or two of history exists.
- The `optional`-undefined-on-29%-of-actions case is treated as required by this pass's default.
  If that reads as too strict once real managers are looking at this panel's completion numbers,
  it's a one-line change (`evaluateActionFlag`'s/`flattenSquadleRecord`'s `optional === true`
  check) — flagged here rather than silently guessed at.
