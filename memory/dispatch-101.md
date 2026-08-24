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
