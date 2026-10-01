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

## Resolved (2026-10-01, same day): `data/marketing-calendars/` already had the end dates

The owner pointed out these documents were already uploaded and committed to the repo —
`data/marketing-calendars/REV_2__2026_OPNAD_Calendar_10.29.25.pdf`, the official 2026 OPNAD
Marketing Calendar (Rev 2, 10.29.25), previously listed in that directory's own README as "PDF,
not yet extracted." Extracted it this pass. It gives the full 2026 national marketing calendar
with explicit start/stop dates — the exact gap the three held-back entries above needed:

| Program | OPNAD window | Newsletter start | Match |
|---|---|---|---|
| MONOPOLY | **10/6 – 11/1** | 10/6 | Start dates agree exactly — high confidence |
| HM #9 | **10/20 – 11/2** | 10/20 | Start dates agree exactly — high confidence |
| BEVS (Nov) | **11/9 – 11/29** (media window) | 11/3 (retail "All Store Sell") | Retail date precedes media window by 6 days — plausible (product reaches restaurants before the ad campaign), but NOT a confirmed retail end date |

**Added to `org_events`** (ids 6145-6147, same `loc:'*ALL*'`/`scope:'all'`/27-store/`category`/
`verification` convention as every other entry):
- **Monopoly All Store Sell**, 2026-10-06 → 2026-11-01, `verification:'Confirmed'` (two
  independent sources agree on the start; OPNAD gives the end).
- **Happy Meal: #9**, 2026-10-20 → 2026-11-02, `verification:'Confirmed'`, same label format as
  the 2025 series so it continues cleanly.
- **Beverage All Store Sell (New Holiday Flavors)**, 2026-11-03 → 2026-11-29,
  `verification:'Estimated'` (not `'Confirmed'` like the other two) — start is the newsletter's
  real retail date, end is OPNAD's adjacent media-window end, not an independently confirmed
  retail end date. Noted explicitly in the row's own `note` field for anyone auditing it later.

## Full 2026 OPNAD Marketing Calendar — ALL windows now loaded (2026-10-01, do not re-load)

Every window the PDF shows, by funnel tier. As of this pass **the entire 2026 OPNAD calendar is
in `org_events`** — the owner asked to load the rest after the three newsletter-dated promos
above were entered. 26 new rows inserted (ids 6148–6173), on top of the 4 already there
(6144–6147), for 30 total national 2026 marketing-calendar rows (29 OPNAD windows + the single-day
Fried Chicken Sandwich Day flash offer, which isn't on the OPNAD calendar itself). One window —
"Happy Meal: Clean-Up" pre-dating 1/27, whose start falls before the visible calendar and so has
no real start date — was **not** loaded; there is nothing to measure for it, not a gap to fill.

- **Generalists — Brand Relevance**: 3/31–4/26 (id 6153), 6/9–7/19 (id 6156), 12/1–12/20
  (id 6162) (all "Dual Daypart")
- **Generalists — other**: BEEF 3/9–3/29 (id 6152) · BFAST 7/20–8/9 (id 6157) · BFAST 11/2–11/22
  (id 6161)
- **Specialists**: HOT HONEY 2/2–3/1 (id 6149, Dual Daypart) · CHICKEN 7/27–8/23 (id 6158) ·
  BEVS 5/11–6/14 (id 6155) · BEVS 8/24–9/13 (id 6159) · BEVS 11/9–11/29 (already represented by
  id 6147, with the retail dates 11/3–11/29 per the newsletter — see the discrepancy note above,
  not re-entered as a 30th row)
- **Foundation**: $5 Brk Meal & $8 ROD Meal 1/6–2/2 (id 6148, Dual Daypart) · $5MD+BOAO 2/17–3/8
  (id 6150, Dual Daypart) · McVALUE 4/28–5/24 (id 6154, Dual Daypart) · McVALUE 9/8–10/4
  (id 6160, Dual Daypart) · MONOPOLY 10/6–11/1 (id 6145, Dual Daypart)
- **Other**: SHAMROCK EVENT 2/23–3/22 (id 6151)
- **Family (Happy Meal), full 2026 series**: Clean-Up (pre-1/27, **not loaded**, no start date) ·
  HM#1 1/27–3/9 (id 6163) · HM#2 3/10–3/30 (id 6164) · HM#3 3/31–5/4 (id 6165) · HM#4 5/5–6/8
  (id 6166) · HM#5 6/9–7/13 (id 6167) · HM#6 7/14–8/17 (id 6168) · HM#7 8/18–9/14 (id 6169) ·
  HM#8 9/15–10/19 (id 6170) · HM#9 10/20–11/2 (id 6146) · Clean Up 11/3–11/9 (id 6171) · HM#10
  11/10–12/14 (id 6172) · HM#11 12/15–1/4/27 (id 6173)

**Non-HM labels disambiguated with a month range** (e.g. "BEVS (May–Jun)", "Brand Relevance
(Mar–Apr)") since the same program name recurs 2-3×/year on this calendar and a bare repeated
label would be ambiguous in any UI or query that lists events by name. HM labels keep the plain
`"Happy Meal: #N"` / `"Happy Meal: Clean Up"` form, matching the 2025 series exactly (confirmed
live against `org_events` ids 5897-5899 before inserting, same `category:'Happy Meal'`,
`verification:'Confirmed'`, `tenant_id`). Non-HM rows use `category:'LTO / Promo'` (same as
Monopoly/Fried-Chicken-Day/BEVS-Nov), with the OPNAD tier (Foundation/Specialists/Generalists/
Other) and Dual-Daypart flag recorded in each row's `note` instead of a separate column — there
is no tier column on `org_events`. All rows: `verification:'Confirmed'` (read directly off the
official calendar PDF, same standard already applied to Monopoly/HM#9's end dates),
`entered_by:'claude-code-calendar-import'`, `method:'manual'`, `loc:'*ALL*'`, `scope:'all'`,
27-store `scope_locs`.

`data/marketing-calendars/README.md` updated in the same pass to reflect all windows loaded.
