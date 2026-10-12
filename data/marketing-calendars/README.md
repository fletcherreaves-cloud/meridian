# Marketing calendars — source of truth for promo windows

McDonald's **national** marketing calendars — corporate documents the owner downloaded, not
documents he authored. Committed because they arrived as chat uploads and would otherwise
have died with the session. These are the input for `org_events` promo tagging.

**Why this matters:** national promo windows are a confound in the training-cohort analysis
(a ~4pp pricing shift attributable to McValue 2.0, not to training) and in any vs-LY or
Signals correlation that spans a promo boundary. Untagged promos read as store performance.

## Files

| file | what it is | shape |
|---|---|---|
| `2025_USMarketingCalendars_REV2_StartStopDates_Approved_11.08.24_adjusted.xlsx` | 2025 OPNAD + Happy Meal | explicit **start/stop dates** — directly usable |
| `2026_McD_Media_Mix_Calendar_11.12.25.xlsx` | 2026 media mix, GCM/HCM/AACM/ACM | **GRP grid by week-start**, not start/stop — needs different parsing |
| `2026_McD_Media_Mix_Calendar_Happy_Meal_11.12.25.xlsx` | 2026 Happy Meal media mix | same grid shape |
| `REV_2__2026_OPNAD_Calendar_10.29.25.pdf` | 2026 OPNAD calendar, **Rev 2 — superseded by REV5 below, kept for audit trail** | extracted 2026-10-01, see `2026-opnad-windows.json` |
| `REV5_US_Marketing_Calendar_-_Start_Stop_Dates_2026_9.22.26.xlsx` | 2026 OPNAD + Happy Meal + Local Pantry, **Rev 5 — current source of truth** | explicit **start/stop dates**, separate All-store (retail) vs Paid Media columns — directly usable, see `2026-opnad-windows-rev5.json` / `2026-local-pantry-windows.json` |
| `REV5_2026MarketingCalendar_atMCD.pdf` | 2026 OPNAD calendar, Rev 5, one-page visual grid | corroborating/visual only — the xlsx above is the parseable source for this revision |
| `2025-opnad-retail-windows.json` | **extracted** 2025 retail windows | `{program, retail_start, retail_end, source_row, suspect?}` |
| `2026-opnad-windows.json` | **extracted** 2026 marketing calendar from the Rev 2 PDF (all tiers + full Happy Meal series) | `{program, tier, start, end, dual_daypart?, note?}` — **superseded by `2026-opnad-windows-rev5.json`, kept for audit trail** |
| `2026-opnad-windows-rev5.json` | **extracted** 2026 OPNAD calendar from the Rev 5 xlsx — 22 programs, both All-store and Paid Media windows | `{program, allstore_start, allstore_end, paid_media_start, paid_media_end, soft_sell_week_of, phase_out}` |
| `2026-local-pantry-windows.json` | **extracted** 2026 Local Pantry (regional LTO) calendar — 6 programs, first time this tier has been captured | `{program, soft_sell_week_of, all_store_sell, start, end, phase_out}` |

## `2025-opnad-retail-windows.json`

16 windows from the `2025 OPNAD Mtkg StartStop` sheet, columns A / C / D
(Program / Retail Start Date / Retail End Date).

**Three rows carried year errors in the source workbook. Corrected 2026-08-13, owner-confirmed.**

| program | as written in source | corrected to |
|---|---|---|
| Core: QPC + line extension | 2025-02-04 → **2024**-03-09 | → 2025-03-09 |
| Retail: Shamrock Shake & Trust | 2025-02-04 → **2024**-03-23 | → 2025-03-23 |
| Core: Snack Wraps | **2024**-07-08 → 2025-08-03 | 2025-07-08 → |

Corrected rows keep the original value under `source_as_written` and carry a `correction`
note, so nothing is lost and the edit is auditable against the workbook.

**These are not plausibility guesses — the sheet's own chronological ordering confirms each
one.** The workbook lists programs in date order. QPC and Shamrock sit between the McValue
window ending 2025-02-09 and Brand Relevance starting 2025-04-01, so both must end inside
Feb–Mar 2025. Snack Wraps sits between the S'mores McFlurry window ending 2025-07-13 and
Brand Relevance starting 2025-08-12, and a 2025-07-08 → 2025-08-03 window is the only
reading that fits that slot. As written, all three rows would have sorted a year out of
place in their own sheet.

## `2026-opnad-windows.json`

29 windows, read directly off the calendar grid in `REV_2__2026_OPNAD_Calendar_10.29.25.pdf`
(Rev 2, 10.29.25) — a visual calendar, not a spreadsheet, so there's no `source_row` the way
the 2025 extraction has; dates are read off each program's own labeled box.

**ALL loadable windows from this file are now in `org_events` (2026-10-01, do not re-load).**
Three were loaded in the prior pass (Monopoly, Happy Meal #9, the November BEVS window — ids
6145-6147, see `memory/finding-corp-calendar-sep-nov-2026.md` for the full story, including why
the BEVS entry is `verification:'Estimated'` rather than `'Confirmed'` — its retail start date,
from a separate corporate newsletter, precedes this calendar's media window by 6 days, so the
retail END date isn't independently confirmed by either source). The remaining 26 (the rest of
the Happy Meal series, Brand Relevance ×3, BEVS ×2 more, BEEF, BFAST ×2, CHICKEN, HOT HONEY,
McVALUE ×2, Shamrock Event, $5 Brk Meal & $8 ROD Meal, $5MD+BOAO) were loaded this pass as ids
6148-6173, `verification:'Confirmed'`, non-HM labels disambiguated with a month range (e.g.
"BEVS (May–Jun)") since several programs repeat on the calendar. The single exception is the
"Happy Meal: Clean-Up" window that pre-dates the visible calendar (`start: null`) — it has no
real start date to load and was left out, not a gap to close later.

## `2026-opnad-windows-rev5.json` + `2026-local-pantry-windows.json` (2026-10-12, Rev 5)

The owner uploaded Rev 5 of the national calendar (both the xlsx and a one-page visual PDF),
superseding the Rev 2 PDF this directory previously relied on. The xlsx's `2026 OPNAD Calendar
StartStop` sheet gives **explicit cell values for two distinct windows per program** — "All-store
Start/End" (when the product is actually sellable in-restaurant — the retail window) and "Paid
Media Start/End" (the advertising flight, usually shorter and offset later). The Rev 2 PDF has
only ONE date range per program box on its visual grid, and **re-measuring against Rev 5 shows
the PDF reading had actually captured the Paid Media window for most programs, not the retail
one** — e.g. Big Arch's true all-store window is 2026-03-03 → 2026-05-17 (75 days), but the PDF
read (and the org_events row that came from it) had 2026-03-09 → 2026-03-29 (21 days, the ad
flight only). For sales-forecast purposes the retail window is what matters — that's when guests
can actually buy the item.

**`org_events` was corrected and extended live against this gap (2026-10-12, service-role writes,
do not re-run):**
- **12 existing rows updated** (ids 6147, 6149, 6151, 6152, 6154, 6155, 6157–6162) — date
  corrections (several non-trivial — e.g. id 6155 "Beverage Launch" grew from a 35-day paid window
  to its true 103-day all-store window) and/or label corrections where the Rev 2 PDF's generic
  tier label (e.g. "Beef", "McValue (Sep–Oct)") didn't match the program's real name (now "Big
  Arch", "Dual Daypart EVM"). Each updated row's `note` states both the old and new value and why.
- **12 new rows inserted** (ids 6515–6526): 5 OPNAD programs the Rev 2 PDF extraction had missed
  entirely (Fried Apple Pie LTO, McValue 2.0 Rehit, Spicy McNuggets LTO, Taste & Quality $8 QPC
  EVM, Value (Dec)); the pre-calendar "Happy Meal: Clean-Up" window (2026-01-13 → 2026-01-26,
  previously skipped for lack of a start date — Rev 5 gives one); and the entire 6-program **Local
  Pantry** tier, loaded into `org_events` for the first time (`category:'Local Pantry / LTO'`,
  noted as market-optional, not a company-wide confirmation any of our 27 stores ran it).
- **The full Happy Meal #1–#11 + 2 Clean-Up series matched exactly between Rev 2 and Rev 5** —
  zero changes there, which cross-validates both extractions for that tier.
- Same `loc:'*ALL*'`/`scope:'all'`/27-store `scope_locs`/`tenant_id`/`entered_by:
  'claude-code-calendar-import'`/`method:'manual'` convention as every prior row.
  `verification:'Confirmed'` throughout, including id 6147 which was previously `'Estimated'` —
  Rev 5's explicit All-store End column now confirms its real retail end date (2026-12-27, not
  the 2026-11-29 paid-media end it had carried).
- **42 total 2026 national-calendar rows now in `org_events`** (was 30). Do not re-load this pass.

## Not yet done

- Parse the 2026 media-mix grids — different shape, GRPs by week-start rather than
  start/stop pairs, so a window has to be inferred from contiguous non-empty weeks. Lower
  priority now that the Rev 5 xlsx already gives clean start/stop dates for the same programs.
- The `2025 Happy Meal StartStop` sheet parses to 2024 dates in column C with no end
  date; its layout differs from the OPNAD sheet and needs a separate read before use.
