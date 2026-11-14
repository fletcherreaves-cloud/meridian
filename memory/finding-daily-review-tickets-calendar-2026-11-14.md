---
name: finding-daily-review-tickets-calendar-2026-11-14
description: "Task #155 -- Tickets/Calendar section built for the GM Daily Review panel (Notes 75's 2nd routine item), deferred since the rest of the panel shipped. What was built, what was deliberately left out, and the real multi-day-event bug caught by checking live org_events data before writing render code."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Daily Review Tickets/Calendar section (2026-11-14)

Closes task #155 -- Notes 75's 2nd GM routine item, flagged in `daily-review.js`'s own header as
"deliberately NOT built this pass -- cheap, well-scoped follow-on" when the rest of the engine
shipped (v4.751).

## Owner spec (verbatim, memory/notes-75-queue.md)

> - Review Tickets and make sure any pending maintenance and repair items are logged (Maintenance
>   and Technology)
> - Review Calendar
>   - Current and upcoming Promotions (Expected impact)
>   - Current and upcoming events
>   - Payroll Released as needed (You can use every other Wednesday starting on 11/18/26)
>   - Truck Orders (Martin Brower) - Store specific order days
>   - Other calendar events (Games, concerts, community events, impacts, etc.) - List expected impacts

## What shipped

New `buildTicketsCalendar(ds, loc, today)` in `src/engine/daily-review.js` + `TicketsCalendarCard`
in `src/views/daily-review.js`, wired into `DailyReviewPanel` after the FOB section card.

- **Promotions + Events** -- both read the same `ds.orgEventRows` (the raw `loadOrgEvents()` rows
  App.js already stores) through `orgEventsToDayMap()` (`events-import.js`), the SAME
  scope-expansion helper every other calendar consumer in the app already uses. Split by
  `type==='promo'` vs everything else; log-only types (`staffing`/`training`/`comp_*`/etc, per
  `defaultVisibilityFor()`) are excluded -- this is the customer-facing calendar the owner's spec
  describes, not the internal incident log. Window: today through +21 days, the same "upcoming"
  convention `above-store-onepager.js`'s own "Upcoming Impacts" list already uses.
- **Payroll Released** -- pure date arithmetic, not a data pull. Anchor 2026-11-18 (confirmed a
  real Wednesday), every 14 days from there. Shows the next release date and flags
  today/tomorrow.
- **Truck Orders (Martin Brower)** -- `INV_ORG_COORDS[loc].del` (e.g. `'Wed/Sun'`) already existed
  as a real field but had never been parsed anywhere -- every prior reader (e.g. `inventory.js`)
  only ever displayed the raw string. Parsed into a day list + today/tomorrow flags.
- **Maintenance/Technology Tickets -- deliberately NOT built.** No automated or manual data
  source exists for it. QSRSoft's own Equipment/Tickets sub-app (`/equipment/tickets`) is
  WAF-blocked to every tested auth path (`memory/notes-74-queue.md`'s own finding). Surfaced as an
  explicit "not available" line (`maintenanceTickets.available:false` + a real reason string), not
  silently dropped -- same discipline the (now-fixed) Paper Cost gap used while it was open.

## Real bug caught by checking live data before writing render code

Queried `org_events` directly (service-role credentials available this session) before assuming
any field shapes. Found a real, currently-live 55-day promo campaign (id 6147, "Beverage All Store
Sell (New Holiday Flavors)", 2026-11-03..2026-12-27, `scope:'all'`). Running it through
`orgEventsToDayMap()` confirmed the expansion works correctly (store `10422` gets a real entry for
every day in range, including today) -- but the FIRST version of `calendarEventsFor()` iterated
the day-map directly and would have rendered this single campaign as up to 21 separate rows (one
per day inside the lookahead window), each carrying the same label with an incrementing
"(Day N of 55)" suffix. Fixed by routing through `groupEventRanges()` (`events-import.js`), the
same multi-day collapse `above-store-onepager.js`'s own "Upcoming Impacts" list already uses --
confirmed this is exactly the kind of case that function's own header comment exists for. A
dedicated regression test (`'collapses a multi-day campaign spanning the window into ONE row, not
one row per day'`) uses this exact real campaign shape as its fixture.

## Verification

- 10 new tests in `src/__tests__/daily-review.test.js` (`buildTicketsCalendar()` describe block) --
  no mocking needed; this section reads real `orgEventsToDayMap()`/`groupEventRanges()` and real
  `constants.js` fields, not stubs of them.
- Full suite passing, build clean within the entry-chunk budget.
- Live-verified the `org_events` row shape and the scope-expansion behavior against real Supabase
  data (not guessed from the loader code alone) -- see the bug above.

## Deliberately left for the owner / a future pass

- The 21-day "upcoming" window is a convention borrowed from `above-store-onepager.js`, not
  something the owner specified a number for. If he wants a different horizon for the Daily
  Review specifically, that's a one-line change (`CALENDAR_WINDOW_DAYS` in `daily-review.js`).
- The panel's own footer note at the bottom of `DailyReviewPanel` still says Paper Cost % "has a
  target but no live source" -- that gap was closed in a separate, parallel change (task #152/#154,
  a different branch) not touched here to avoid merge conflicts; whoever merges both should update
  that sentence.
