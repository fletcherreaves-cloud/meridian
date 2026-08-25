# Dispatch #122 — Events & Tags: holiday sub-filter + print shows full filtered list

**Owner's ask, verbatim (2026-08-25):** *"Events and Tags > for Holidays, once selected, add
another selector for which holiday and show results based on selection > Also, for print, show
all results in one view."*

## Where, confirmed by reading the actual component

`EventCalendar` in `src/views/store-dash.js` (~line 3241 on), wired as the `events`/"Events &
Tags" nav panel (`panel-registry.js`, `App.js`'s `showEvents`). Not `event-impact.js` ("Event
Impact Registry") — that's a separate, unrelated panel; do not touch it.

1. **Holiday sub-filter.** The panel already has a single-level `typeFilter` (`EVENT_TYPES`
   select, ~line 166) — selecting the "🎉 Holiday" type pools EVERY holiday-tagged day together
   (New Year's, Independence Day, Thanksgiving, etc. all show as one undifferentiated list). Each
   holiday event already carries a stable, consistent name, though: `buildHolidays()`
   (`src/utils/holidays.js:46`, the `add(d, label, impact, opts)` helper) assigns a fixed `label`
   per holiday (e.g. `"New Year Day"`, `"Independence Day"`, `"Valentines Day"`), and the
   auto-tag flow in `EventCalendar` writes that label straight into the tagged event's `note`
   field (`note:hol.label`, ~line 129) when auto-tagging. So a second-level "which holiday"
   selector is a matter of deriving the distinct `note` values present among the currently
   type-filtered (`holiday`) events and filtering to the one selected — the data already carries
   what's needed, no new field/schema change required.
   - Scope this to when `typeFilter==='holiday'` specifically (or `'holiday_major'` too if that
     type is in active use — check `EVENT_TYPES` and the auto-tag code's `evType` logic, ~line
     125, for whether `holiday`/`holiday_major` are one type or two in practice) — other event
     types (sports, promo, weather, etc.) don't have this "pooled distinct-name" problem the same
     way and are out of scope here unless you find the identical pattern genuinely recurs there.
2. **Print — show the full filtered list, not just what's scrolled into view.** Confirmed: this
   panel has **no print functionality at all today** (grepped the whole component, zero matches
   for `print`/`window.print`). The events list renders inside a `flex:1, overflowY:'auto'`
   container (~line 203) capped by the modal's own `maxHeight:'92vh'` — a browser's native
   print (Ctrl+P / Cmd+P) on a scrolled `overflow:auto` region only captures what's currently
   visible in the scrolled viewport, not the full list, which is exactly the "doesn't show
   everything" problem being reported. Add a real print affordance that renders the FULL current
   result set (after both the type and, when applicable, the new holiday sub-filter are applied)
   in one unscrolled view for printing — follow this repo's own existing print pattern rather
   than inventing a new one: several panels already build a dedicated printable HTML view and
   open/print it (e.g. `visit-readiness-report.js`'s `storeReportHTML()`/`printStoreReport()`, or
   a simpler `window.print()` off a `@media print` stylesheet that temporarily un-scrolls the
   results — pick whichever fits this panel's existing structure with the least new code).

## Scope

`src/views/store-dash.js`'s `EventCalendar` function only. Do not touch `event-impact.js`,
`src/utils/holidays.js`'s holiday definitions/calibration logic, or the auto-tag flow's actual
tagging behavior — this is a filter-UI and print-presentation dispatch, not a data or forecast
change.

## Verification bar

- With a realistic multi-year, multi-holiday tagged dataset, select the Holiday type filter and
  confirm a second selector appears listing the distinct holidays present, and selecting one
  narrows the results to just that holiday (across whatever stores/years are in scope).
- Confirm the second selector doesn't appear (or is inert/hidden) for other event types where it
  doesn't apply.
- Render/trigger the print path and confirm the FULL currently-filtered result set is present in
  the printable output, not just what would be visible in the scrolled modal viewport — verify
  against a filtered set large enough to have overflowed the modal's scroll area before this fix.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean.

## Do NOT

- Do not touch `event-impact.js` ("Event Impact Registry") — different panel, not in scope.
- Do not change how holidays are tagged, their `label`/`impact`/`fullClosure`/`partialClosure`
  definitions, or any forecast-calibration logic that reads tagged events.
