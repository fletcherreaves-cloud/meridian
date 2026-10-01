---
name: finding-corp-calendar-sep-nov-2026
description: McDonald's corporate "What You Need to Know" newsletter — September-November 2026 dated calendar items (national promos, IT/NRBES compliance deadlines, training sessions, Price Round 3 timing). Source digest for deciding which items belong in Meridian's org_events calendar.
metadata:
  node_type: memory
  type: finding
---

# Corporate calendar — Sept/Oct/Nov 2026 ("What You Need to Know" newsletter, sent to kathy.lopez-thorley@partners.mcd.com)

Screenshotted by the owner from the McDonald's corporate newsletter email. Raw dated items
below, grouped by whether they're candidates for `org_events` (feed the forecast event-factor
system via `promo`/`other` event types) or purely informational.

## National promos — sales-relevant, candidates for org_events (`event_type: 'promo'`)

These are national, all-store promotions — the kind `EVENT_TYPES.promo` (`src/constants.js`)
and the event-factor system (`computeEventFactors`/`_evFactor` in forecast.js) exist to learn
from. None of these are in `org_events` yet (not checked against live Supabase this pass — see
"Not yet done" below).

- **Now–9/30**: Weekly Mass Digital Offers — Free Medium Fry w/ $1 min purchase + $2 Breakfast
  Sandwich (redeemable 1×/customer/week); the newsletter also separately lists this running
  **Now–10/4** in a later screenshot — treat 10/4 as the more current end date.
- **9/22**: Monopoly pre-registration opens in the McDonald's App (awareness-building, not a
  sales day itself).
- **10/6**: **Monopoly All Store Sell** — the national Monopoly promotion start. Historically
  McDonald's Monopoly is one of the largest annual traffic/sales drivers; worth tagging as its
  own `promo` event once a real end date is known (not given in this newsletter — watch for a
  follow-up).
- **10/20**: **Happy Meal #9 Begins**.
- **11/3**: **Beverage All Store Sell (New Holiday Flavors)**.
- **11/9**: **National Fried Chicken Sandwich Day (Flash Offer)** — $2 McCrispy, redeemable
  1×/customer, **one day only**. Single-day event, same shape as the existing holiday/sports
  single-day factor calc (not the multi-day DiD closure-engine path).

## Pricing — context only, no manual entry needed

Price changes already auto-detect from real `ds.pmixRows` via `src/engine/price-events.js`
(`computeEventFactors`'s `_withPriceEvents`, additive merge into `userEvents` — see
`src/app/changelog/5.062.js`). These dates explain WHEN a detected price step this quarter will
have happened, not something to hand-enter:
- **9/24**: Deadline for price changes before Price Round 3.
- **10/12**: 2026 Price Round 3 recommendations available on the Portal; Deloitte Price Round 3
  webcast same day.

## IT / NRBES compliance — operational reminder, not a Meridian forecasting change

- **10/1**: NRBES requires non-server devices (registers, KVS controllers, etc.) to run Windows
  10 LTSC or higher.
- **10/13**: Order an Extended Security Update (ESU) for non-compliant devices; non-server
  devices **stop receiving security updates** on this date unless upgraded, replaced, or
  covered by an ESU.
- These don't touch Meridian's data model, but a POS/KVS device going unpatched or falling over
  is exactly the kind of thing that could show up as a stream-freshness gap or a data-quality
  anomaly later — worth remembering as a possible root cause if `qsr_daily_activity`/DAR data
  goes strange for a specific store after mid-October.

## Operational / IT launches — awareness only

- **9/23**: DMB 2.0 Automated Closed Daypart launches (Digital Menu Board automation) — could
  plausibly affect overnight/closed-daypart sales patterns at stores running it; not something
  to model without first confirming which of the 27 stores actually run DMB 2.0.

## Training / webcasts / surveys — not sales-relevant, informational only

Weekly Harri Mastery Nugget Sessions (9/22, 9/29, 10/6, 10/13, 10/20, 10/27, 11/3, 11/10, every
Tuesday 3pm CT), NABIT Webcast (10/7), Restaurant Pulse Survey (10/13–11/3), DMB 2.0 Office
Hours (9/23, 9/30, 10/14, 11/12), LIFELENZ Workforce Mastery Series (10/14, 11/11), 2026
National People Experience Lead (PEL) Summit (11/10), ABS 2.0 promotion (vendor rebate program,
Now–9/30, up to $3,000/unit), Global Volunteer Month (Now–9/30).

## Checked against live `org_events` (service-role Supabase read, 2026-10-01)

**The established convention**: `loc:'*ALL*'`, `scope:'all'`, `scope_locs:` the full 27-store
list, `event_type:'promo'`, a freeform `category` (e.g. `'Happy Meal'`), `verification:
'Confirmed'`. 2025 has a complete, sequential Happy Meal series (`#1`–`#11`, each a date range
covering the whole year with no gaps, `entered_by:'lto-import'`, `method:'bulk upload'`). **2026
has NO Happy Meal series, no Monopoly, no Beverage promo, and (before this pass) no Fried
Chicken Sandwich Day entries at all** — only a handful of fixed-date holidays (Easter, Mother's/
Father's Day, Memorial Day, July 4th, Black Friday) are seeded for 2026. So the annual LTO
series that was clearly maintained for all of 2025 has not been continued into 2026 yet.

**Added this pass** (id 6144): **National Fried Chicken Sandwich Day** — `2026-11-09`,
single day, `category:'LTO / Promo'`, `event_type:'promo'`, all 27 stores. This is the one item
from the newsletter with a fully unambiguous date (explicitly "one day only" in the source), so
it was safe to enter directly, matching the Black Friday-style single-day convention exactly.

**NOT added — real data gap, needs the owner or another source**: Monopoly All Store Sell
(start 10/6, no end date given), Happy Meal #9 2026 (start 10/20, no end date given — the 2025
analog, `#9`, ran 2025-10-21→2025-11-03, 14 days, which is suggestive but not a stated fact for
2026), Beverage All Store Sell/holiday flavors (start 11/3, no end date given). Guessing a
window for a month-scale national promo and writing it into `org_events` risks biasing the
event-factor learning for every store if the guess is wrong — these need either the Portal's
official promo calendar (same place Price Round 3 recommendations come from) or the owner
confirming the real end dates before they're entered.
