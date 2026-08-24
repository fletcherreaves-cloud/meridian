---
name: dispatch-101
description: Form Completions (src/views/forms-panel.js) already pulls rich per-occurrence data -- store, form, date, completion %, time-to-complete, who completed it, score, reviewed-with, assigned-to -- via qsr_forms_completion/loadQsrFormsCompletion(), but the panel only ever renders a form-level rollup (aggregate pass rate + store-days count). None of the per-occurrence detail is surfaced anywhere, there's no location selector at all (though the loader already supports one), and the only "date" control is a relative trailing-window dropdown (7/14/30 days), not a real date-range picker. Owner wants more of the already-pulled data visible, plus a date selector and location selector.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #101 — Form Completions: surface the detail already being pulled, add date + location selectors

**Status:** ready, no further owner decision needed on the core ask. Independent of the Inventory
Control (#97-#99) and Security panel (#100) dispatches — different file, safe to run in parallel.

---

## What's already pulled vs. what's shown — the actual gap

`loadQsrFormsCompletion()` (`src/lib/supabase.js`, ~line 3231-3247) already returns, per occurrence:

```
loc, formId, formTitle, occurrenceKey, statusState, completionRatio, missed, hasResponse,
scheduledAt, startedAt, completedOn, timeToCompleteMs, userId, score, reviewedWith, assignedTo
```

That's store, form, date (three of them — scheduled/started/completed), completion %, time to
complete, and a completer identifier — nearly everything the owner asked about ("completed by,
store, form, date, pct complete, time to complete") is **already in the data model and already
being pulled.** Confirmed by grep: `src/views/forms-panel.js` never references `userId`,
`completionRatio`, `timeToCompleteMs`, `score`, `reviewedWith`, or `assignedTo` anywhere — the panel
computes `computeFormStoreDayRollup`/`computeFormSummary` (`src/engine/forms-completion.js`) and
renders ONLY the resulting form-level aggregate (`FormSummaryRow`: form title, pass rate bar,
threshold input, "`X of Y` store-days ≥threshold%"). **The per-occurrence detail is discarded after
rollup, never rendered.** This is a real, measured gap — the data exists, the pull already runs
(Slice 3, dispatch #71), only the UI is missing.

Also confirmed:
- **No location selector exists.** `loadQsrFormsCompletion({ start, end, locs })` already accepts a
  `locs` filter, but nothing in `FormsCompletionPanel` passes one — the panel is always
  district-wide.
- **No real date-range control.** `windowDays` (`WINDOW_OPTIONS = [7, 14, 30]`) is a relative
  trailing-window dropdown, not a from/to date picker — there's no way to look at a specific past
  week or a custom range.

## The fix

1. **Add a per-occurrence detail view.** Below (or as a drill-down from) the existing form-level
   summary rows, surface the individual occurrences: store (resolve via `sName`/`STORE_NAMES` per
   this repo's convention, not a bare loc code), form title, the relevant date (`completedOn` if
   present, else `scheduledAt`/`startedAt` — check `forms-completion.js`'s own header comment for
   which date field is the canonical one before picking), `completionRatio` (pct complete),
   `timeToCompleteMs` (formatted as a duration, not raw milliseconds), and `statusState`/`missed`.
   Follow this repo's "panels don't reimplement math the engine already owns" rule (already stated
   in this file's own header comment) — if a new per-occurrence view needs its own light
   transformation (formatting, sorting, filtering), consider whether that belongs in
   `forms-completion.js` as a new pure export rather than inline in the panel.
2. **"Completed by" (`userId`) needs a real identity resolution before display, not a bare ID.**
   Check what `userId` actually contains on live data (pull a real sample via
   `SUPABASE_SERVICE_ROLE_KEY`) — if it's a QSRSoft internal user ID rather than a name, look at
   whether this repo has an existing name-resolution path for a similar case (the Security panel's
   `RevealName`/`reveal_employee_identities_bulk` mechanism in `src/views/security-panel.js` handles
   an analogous "resolve an opaque token to a real name, permission-gated" problem — check whether
   that pattern or its underlying data applies here, or whether Forms uses a completely different
   identity system that needs its own lookup). **Do not display a raw ID as if it were a name, and
   do not guess a lookup table exists without checking.**
3. **Add a location selector** — All → State → Org → Store, matching this repo's documented
   standard (`feedback-selector-ui-standard.md`, same standard dispatch #100 is wiring into the
   Security panel) — feeding `locs` into `loadQsrFormsCompletion()`, which already accepts it.
4. **Add a real date-range control** alongside (not necessarily replacing) the existing
   7/14/30-day quick-window buttons — a from/to picker that feeds `start`/`end` into
   `loadQsrFormsCompletion()`, which already accepts both. Keep the quick-window buttons as a
   convenience shortcut on top of the real range control, not remove them.

## Verification bar

- Render the actual `FormsCompletionPanel` consumer and confirm: the per-occurrence detail view
  shows real store/form/date/completion%/time-to-complete/completed-by values from a live pull, a
  location selection actually filters what's shown, and a date-range selection actually changes
  which occurrences appear — assert on real filtered output, not just "the controls render."
- Confirm the existing form-level summary rollup (`FormSummaryRow`, pass rate, threshold, store-days
  count) is completely unchanged — this is additive, not a replacement.
- If `userId` needs a name-resolution call, verify it's permission-gated the same way the Security
  panel's reveal mechanism is (not a blanket, ungated identity exposure) — check with real role data
  whether Forms completion data carries the same sensitivity assumption Security's does, don't
  assume either way.

## Do NOT

- **Do not remove or change the existing form-level summary view** — additive only.
- **Do not display a raw `userId` as a name without checking what it actually resolves to.**
- **Do not touch `src/views/eom-dashboard.js` or `src/views/security-panel.js`** — unrelated files,
  no reason to overlap with the #97-#99 or #100 dispatch chains.
- **Do not invent a new location-selector pattern** — match the existing 4-level standard other
  panels already use (see dispatch #100 for the same instruction on a different panel).

---

## Resolution (2026-08-24)

**Shipped all four parts, additive only.** `src/views/forms-panel.js` and `src/engine/forms-completion.js`.

### Part 1 — per-occurrence detail view

Each form's existing `FormSummaryRow` gets a "▸ Occurrences" toggle that expands a new
`OccurrenceDetailTable` showing that form's individual rows: store (`sName`/`STORE_NAMES`, never a
bare loc code — with a `loc === 'NaN'` guard for the `NOLOC` no-store sentinel, which
`loadQsrFormsCompletion`'s own `String(parseInt(r.loc,10))` mapping turns into the literal string
`"NaN"`, shown as "No location" rather than the confusing `sName('NaN')` output), form title, date,
status, completion %, time-to-complete, and completed-by. Capped at 300 rendered rows (Travel Path
alone runs 27–45×/store/day) with a "showing first N of M" note when truncated.

**Which date field, decided from the file's own header comment, not guessed:** `occurrenceKey`
(`raw.scheduledAt || raw.completedOn`) is already the field `computeFormStoreDayRollup` buckets
every "store-day" on — so showing anything else would make an occurrence's detail-row date
disagree with which rollup bucket it counted toward. Exported `localDayKey` (previously internal)
so the panel formats it on the identical America/Chicago boundary, not a second inline
implementation.

New pure engine exports (`src/engine/forms-completion.js`, per this file's own "panels don't
reimplement math the engine owns" rule):
- `formatDuration(ms)` — `timeToCompleteMs` as `"1m 50s"` / `"2h 15m"`, not raw milliseconds.
- `sortOccurrencesForDisplay(rows)` — newest-occurrence-first, then store, then form title; a pure
  passthrough (no rows dropped, unlike the rollup's exclusion of `'open'` rows — a reader looking
  at individual occurrences should still see what's currently scheduled).

### Part 2 — "completed by" (`userId`): measured, and it does NOT resolve through RevealName

Pulled a real sample of `qsr_forms_completion` via Supabase REST with `SUPABASE_SERVICE_ROLE_KEY`
(the post-rotation `sb_secret_…` key — confirmed working, `content-range: 0-14/458` on a
`status_state=eq.completed&user_id=not.is.null` filter). **`user_id` on completed rows is a
QSRSoft/Cognito account UUID** (shape `848854c8-30f1-7076-c6f7-dcf35091bd06`), never a name or
email — matching `normalizeFormsCompletionRow`'s own header comment that the plaintext
`completedBy` name QSRSoft actually returns is deliberately never read or stored. This settles the
dispatch's own open question: `userId` is **not** already human-readable.

**Checked, not assumed, whether Security panel's `RevealName`/`reveal_employee_identities_bulk`
applies — it does not, and the reason is structural, not a missing permission.** That RPC resolves
tokens in Meridian's own `employee_identity_vault`, populated *only* by routing a plaintext name
through `get_or_create_employee_token()` at ingest (`src/engine/identity-vault.js`) — e.g.
register-audit rows, which carry a plaintext `emp` field. Forms' own ingest normalizer explicitly
never reads `completedBy` at all (its own comment: *"deliberately never read here and never appears
in the output"*), so no vault row for any Forms `userId`, or for any name behind it, has ever been
created. Calling the reveal RPC with a Forms `userId` would simply find nothing — a different
identity system, not a permission the caller lacks.

**Decision: no resolution call was added**, because none is possible without a new ingest/schema
change (tokenizing `completedBy` at Forms-pull time, or an unconfirmed join through the QSRSoft
employee-roster's `geid` — a different, unverified ID space per
`memory/finding-qsrsoft-employee-roster-endpoint-2026-08-21.md`) — out of scope for this additive
UI dispatch, and building it unreviewed risked a second, unreviewed PII-handling decision. Flagged
here as real follow-up work, not silently dropped.

**What ships instead, matching Security's gating discipline even though nothing here is a name:**
a `null` `userId` (missed/open rows — 0/3,886 in the finding file's own capture, reconfirmed by
this pull) always shows `—`. A real `userId` shows the same `—` to every role except the privileged
tier (`userRole === 'admin'`, the single DB role Developer/Admin/Owner collapse to, per CLAUDE.md —
the same tier Security's dispatch #50 Part B gives frictionless identity access), which sees a
short, explicitly-labeled diagnostic fragment (`ID 848854c8…`, full UUID in a title tooltip) —
never the bare UUID printed as if it were a name.

### Part 3 — location selector

Wired the shared `LocationSelector`/`buildLocationHierarchy`/`locationSelectorLocs`
(`src/components/PanelControls.js`) — the same All → State → Patch → Store control
`opportunity-dollars.js` and `top-bottom-performers.js` already use, per
`feedback-selector-ui-standard.md` — rather than hand-rolling a new one or copying
`security-panel.js`'s own in-progress (All+State only, no Org/Store yet, per a fresh `git log`
check — dispatch #100's brief had merged but not its implementation as of this work) scope
picker. Feeds the resolved `locs` array into `loadQsrFormsCompletion`'s existing `locs` param.
`FormsCompletionPanel` now takes `stores`/`userRole` props (`src/app/App.js`'s existing
`h(FormsCompletionPanel, ...)` call site updated to pass both — `stores` and `userRole` were
already in scope there, used by sibling panels).

### Part 4 — real date-range control

`DateRangeControl` (same shared file) in custom-range-only mode (`presets: []`, `allowCustom:
true`) — a single "Custom…" toggle revealing from/to date inputs + Apply, so it adds a real range
picker without a second, confusing row of preset pills next to the existing (unchanged) 7d/14d/30d
buttons. The picked calendar days route through `apiWindowForDays()` (already existed in
`forms-completion.js`, unused until now) so a custom range lands on the *same* America/Chicago
local-midnight boundary the rollup buckets days on — not a second, inline, possibly-disagreeing
window calculation. Picking a preset pill clears any active custom range (and vice versa isn't
needed — Apply always sets `customRange`); a "Clear" pill returns to window-pill mode.

### Verification — the real panel, not isolated engine tests

19 new/updated tests (`src/__tests__/forms-panel.test.js`, `src/__tests__/forms-completion-rollup.test.js`),
all against the actual `FormsCompletionPanel` render path (mocked `loadQsrFormsCompletion`, same
pattern the existing suite already used), per this repo's "would this verification still pass if
the change were reverted" standing rule:

- Expanding a form's "▸ Occurrences" toggle renders real store (`"6178 — Chipley-St Rd 77"`, not a
  bare loc), form title, date (`localDayKey` output), completion % (`fPct`), time-to-complete
  (`formatDuration`), and status text from a mocked occurrence row — asserted on actual rendered
  text, not "the control exists." The pre-existing rollup assertions (`100.0%`, `"1 of 1 resolved
  occurrences completed"`) are re-run in the SAME test, unchanged, so a revert that broke the
  rollup while leaving the detail view would still be caught.
- A missed row with `userId: null` renders `—`, never a fabricated name.
- A real-shaped `userId` never appears (full or partial) anywhere in the rendered text for
  `userRole: 'manager'`; the same fixture, same component instance (role switched via re-render,
  proving state — including "already expanded" — survives a props-only update, not a remount),
  renders `ID 848854c8…` for `userRole: 'admin'` — and the full UUID is asserted absent from the
  text in BOTH cases (privileged sees the short fragment only, never the raw ID printed as a name).
- Clicking a store pill in the location selector re-fetches: `loadQsrFormsCompletionMock`'s call
  count goes 1 → 2, and the second call's `locs` arg is asserted to equal exactly `['3708']` — a
  real, filtered fetch parameter, not just "a click happened."
- Applying a custom date range (`2026-08-19` → `2026-08-19` via the real `<input type="date">`
  elements + Apply button) re-fetches with `start: '2026-08-19T05:00:00.000Z', end:
  '2026-08-20T04:59:59.999Z'` — the exact `apiWindowForDays` output for that day, asserted on the
  mock's actual call args — and "Clear" returns to window-pill mode (a third fetch).
- New engine tests for `formatDuration` (edge cases: null/negative/sub-minute/hour+, and the
  finding file's own measured max of 6,878s), `sortOccurrencesForDisplay` (ordering, passthrough,
  does not drop `'open'` rows), and `localDayKey` (matches the day the identical `occurrenceKey`
  buckets into via `computeFormStoreDayRollup`, proving the two never disagree).
- All 8 pre-existing `forms-panel.test.js` tests (empty state, error state, rollup math, open-row
  exclusion, worst-form-first ordering + threshold inputs, freshness reading, window-pill re-fetch)
  pass unmodified — confirming the existing form-level summary rollup is completely unchanged.

### Test/build results

- `npm test`: **2273/2273 passing, 217/217 files** — no regressions. (One pre-existing ratchet test,
  `scroll-table-width.test.js`, initially flagged the new occurrence table's `width:'100%'` inside
  its `overflowX:'auto'` wrapper — fixed to `width:'max-content', minWidth:'100%'`, matching
  `analytics.js`'s `MonthlyProjectionsPanel` table, before the final run.)
- `npm run build`: clean. Entry chunk **519.62 KB → 519.64 KB gzip (+0.02 KB, negligible)** — the
  panel is lazy-loaded (`lazyPanel()`), so the new code lives in its own chunk
  (`forms-panel-*.js`, 10,176 bytes raw) rather than the eager entry. Eager-payload budget check:
  521.50 KB of 850 KB (328.50 KB headroom) — within budget.

### Not touched, per the dispatch's "Do NOT" list

`src/views/eom-dashboard.js` and `src/views/security-panel.js` — confirmed by `git diff --stat`
before commit: neither file appears in this change. No new location-selector pattern was invented
— the shared `PanelControls.js` components were used as-is. The existing form-level summary view
(`FormSummaryRow`'s threshold input, pass-rate bar + number, store-days count) is unchanged in
shape; the only addition to it is the new expand toggle.

### Genuine follow-up, not filed as a bug against this dispatch

Resolving a real human name for "completed by" needs an ingest-side decision (tokenize
`completedBy` into `employee_identity_vault` at Forms-pull time, most likely, mirroring
`register-audit`'s own pattern) — a schema/pull-script change, deliberately not built here. The
QSRSoft employee-roster's `geid` is a plausible alternate join key but its relationship to Forms'
`userId` is **unconfirmed** (different capture, different endpoint family) — do not assume they are
the same ID space without measuring it directly first.

**Version:** v5.140 (`src/app/changelog/5.140.js`).
