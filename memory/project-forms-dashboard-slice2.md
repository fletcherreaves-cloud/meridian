---
name: project-forms-dashboard-slice2
description: Forms dashboard Slice 2 of 3, done -- the panel. Store-day rollup + per-form summary engine (src/engine/forms-completion.js additions), FormsCompletionPanel (src/views/forms-panel.js), and the App.js/shell.js wiring, kind:'test-kitchen' since Slice 3's pull script hasn't shipped. Per-form threshold defaulting to 80%, resolved-occurrences-only judging, pass-rate always beside the bar, total-day attribution only (no manager attribution -- measured, not assumed). Caught and fixed a real integration bug: the panel was re-running the raw-payload normalizer on already-normalized loader output, silently dropping every row.
metadata:
  node_type: memory
  type: project
---

# Forms dashboard — Slice 2: the panel

**2026-08-21.** Second of three slices (`memory/project-forms-dashboard-slice1.md` is the first),
per the owner's three-slice plan in `memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md`.
Builds the store-day rollup and the panel on top of Slice 1's schema + normalizer — still fully
testable with no live QSRSoft access, since the table is empty in production until Slice 3 ships.

## The rollup engine: additions to `src/engine/forms-completion.js`

Same pure-function discipline as Slice 1 (no Supabase, no fetch, no wall-clock read — the caller
supplies rows and, where relevant, the window). Two new exports.

**`computeFormStoreDayRollup(rows, { thresholds, defaultThreshold })`** groups already-normalized
rows to one entry per `(loc, formId, local day)`. Judged on **resolved occurrences only** —
`statusState === 'open'` rows are excluded from both the numerator and the denominator entirely,
per the dispatch's explicit instruction: including them would make the current day read red at
every store, every day, since a form not yet due always looks unresolved. A store-day with every
occurrence still open produces **no rollup row at all**, not a spurious `0/0`.

Bucketed on `localDayKey()` — local midnight at a **hardcoded UTC-5 (CDT)** offset, matching the
finding file's own measured `completionDetail` request boundary (`05:00:00.000Z`). This is
deliberately **not** `src/utils/date.js`'s `businessDate()` 4am-business-day boundary used
elsewhere in this codebase — a different boundary, on a different host (`forms.home.myqsrsoft.com`
vs the DAR/security hosts), and conflating the two would misattribute a form completion to the
wrong day. Documented inline so a future reader doesn't "fix" it toward the more familiar boundary.

`thresholds` is a caller-supplied `{[formId]: number}` map with a `defaultThreshold` fallback
(0.8, the owner-stated default) — never one global bar, since a 1/day pre-shift form and a
27-45/day Travel Path form can't share a line.

**`computeFormSummary(rollupRows)`** aggregates per form across all store-days. `passRate` is
**Σcompleted / Σresolved**, never a mean of the individual store-day rates — CLAUDE.md's standing
"never average averages" rule, made concrete: a test fixture with a 1-resolved/1-completed store
and a 40-resolved/1-completed store shows the correct weighted answer (4.9%) diverging sharply
from the wrong mean-of-rates answer (51.25%). `storeDaysPassRate` (how many store-days
individually cleared their form's threshold) is tracked and reported as a **separate, legitimately
different** number — the two can disagree in either direction and the panel shows both rather than
picking one. Sorted worst-passRate-first, since that's the number that names a decision.

## The panel: `src/views/forms-panel.js`

`FormsCompletionPanel({ onClose })`. Window selector (7/14/30 days), fetches
`loadQsrFormsCompletion()` (new `src/lib/supabase.js` reader, added just before the district-wide
variance-history block) on mount and on window change, feeds the result into
`computeFormStoreDayRollup` / `computeFormSummary` via `useMemo`.

Per-form row: an editable threshold `<input type="number">` (persisted per-device to
`localStorage['mf_forms_thresholds_v1']` — a device preference, not shared state, so a write
failure is swallowed rather than surfaced), a progress bar, and **the pass-rate percentage
rendered explicitly beside the bar** — CLAUDE.md's "say the number and the decision" standing
rule, sharpened so a reader never has to infer the number from bar width alone. Below each bar:
`{completed} of {resolved} resolved occurrences completed · {storeDaysPassed} of {storeDaysTotal}
store-days ≥{threshold}%` — both readings visible together, matching the summary engine's own
two-number design. Loading/error/empty states are distinct and honest: an empty result renders
"No form completions synced for this window yet," not a blank table indistinguishable from a
fetch that silently failed.

**Total-day attribution only, no manager attribution** — the finding file's own measurement (0 of
3,886 missed rows in the capture carry a person) makes this the correct grain, not a stopgap
pending a future upgrade. The panel never reads `userId`/`completedBy` for scoring.

## A bug the render-based test caught, not the unit tests

The panel's first draft called `normalizeFormsCompletionRows()` on `loadQsrFormsCompletion()`'s
output before feeding it to the rollup — reasoning (wrongly) that the loader might return a raw or
partially-shaped row that needed defensive re-normalization.

`normalizeFormsCompletionRow()` is Slice 1's **raw-API-payload** normalizer: it reads
`raw.location`, `raw.status` (the polymorphic field), `raw.scheduledAt`/`raw.completedOn`. But
`loadQsrFormsCompletion()` reads back `qsr_forms_completion`'s own columns, which **are already
normalized** — that normalization happens exactly once, at ingest, in Slice 3's pull script (once
it exists) before a row is ever written to the table. The loader's output uses `loc`,
`occurrenceKey`, `statusState` — none of which exist under those names on a raw payload, and none
of which `normalizeFormsCompletionRow` was reading for (it was looking for `raw.location`,
`raw.scheduledAt`, etc.). Every row's `isUsableRow()` check failed silently, and the panel would
have shipped as **always empty** in production, indistinguishable from "no data yet."

Every pure-engine unit test (Slice 1's `forms-completion.test.js`, Slice 2's
`forms-completion-rollup.test.js`) stayed green throughout, because each tests one function in
isolation with the shape that function actually expects. Only `src/__tests__/forms-panel.test.js`
— which mocks `loadQsrFormsCompletion` and renders the real `FormsCompletionPanel`, per this
repo's "would this verification still pass if the change were reverted?" standing rule from the
#366 postmortem — exercised the actual call chain and caught the mismatch on the first run.

Fixed by removing the re-normalization: the loader's output is fed directly into
`computeFormStoreDayRollup`, matching what the rollup's own tests already assumed as its input
shape. `normalizeFormsCompletionRow`/`normalizeFormsCompletionRows` remain exactly what Slice 1
built them as — the raw-payload boundary, called from exactly one place (Slice 3's pull script,
once it exists), never from the panel.

## Wiring

`src/app/panel-registry.js`: `{ id:'forms-completion', label:'Form Completions', icon:'✅',
perm:'analytics.store', kind:'test-kitchen', section:'forms' }` — `section:'forms'` set truthfully
from day one per the dispatch #56-era standing rule, even though `kind:'test-kitchen'` means it
doesn't render there yet. `kind:'test-kitchen'` (not `'nav'`) because Slice 3's pull script — the
data source — doesn't exist yet; shipping as `kind:'nav'` would put an always-empty panel in front
of every user by default. `App.js`: lazy import, `showFormsCompletion` state, the
`anyModalOpen`/dispatch/escape-hatch/render five-point template (matching the `fcst-ref`/
`showSecurity` precedent). `shell.js`: `navPBeta('forms-completion')` added to the ⚗ Test Kitchen
list.

`src/__tests__/shell-nav-snapshot.test.js`'s Test Kitchen census ratchet updated **10 → 11** (a
legitimate new member, verified by walking through the promotion test too — `forms-completion`
renders correctly under its own `'forms'` section header when `kind` is simulated as `'nav'`).

## Verification

`src/__tests__/forms-completion-rollup.test.js` (11 tests, pure engine, already-normalized
camelCase fixtures — no raw-payload shape and therefore no PII surface at all): resolved-only
judging, all-open-day-produces-no-row, default/override thresholds, the local-midnight boundary
(one second before/after), independent per-`(loc, formId, day)` grouping, empty/null input, the
never-average-averages worked example, the `storeDaysPassRate`-vs-`passRate` divergence example,
worst-form-first sorting.

`src/__tests__/forms-panel.test.js` (6 tests, mocks `loadQsrFormsCompletion`, renders the real
`FormsCompletionPanel` via `react-dom/client` + `act`): empty state, error state, the pass-rate
number rendered beside the bar through the real rollup+summary chain, open rows excluded from the
denominator through the panel (not just the engine), worst-form-first ordering with a threshold
input per form, and the window-pill re-fetch.

1944/1944 tests (12 net new). Build clean, entry chunk unchanged at 511.10 KB gzip (the panel is
lazy via `lazyPanel()`, so it costs nothing until a user with betaMode opens it).

## Next

**Slice 3** (separate PR, last, gated on the owner's own auth capture): the pull script for
`forms.home.myqsrsoft.com`. Auth is still unverified — `sec-fetch-site: same-site` on the captured
request means a cookie could be attached invisibly, so a curl transcript alone can't settle it the
way it settled the security host's token-only auth. Two-path auth (direct token, Playwright
fallback) per the standing pattern, plus the full new-pull checklist: `sync-failure-watch.yml`
entry, per-stream staleness (not pooled `Math.max` — #171's own lesson), manual-upload fallback.
Per the owner's own framing, if auth surprises the capture only the transport in Slice 3 changes —
the schema and normalizer built in Slice 1, and the rollup/panel built here, don't move. Once
Slice 3 lands and the owner has seen the panel live against real data, promoting
`forms-completion` to `kind:'nav'` is two edits (flip `kind:` in the registry, delete the
`navPBeta('forms-completion')` line in `shell.js`) per the standing promotion caveat — not a
one-field flip yet.
