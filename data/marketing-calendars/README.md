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
| `REV_2__2026_OPNAD_Calendar_10.29.25.pdf` | 2026 OPNAD calendar | **extracted 2026-10-01**, see `2026-opnad-windows.json` |
| `2025-opnad-retail-windows.json` | **extracted** 2025 retail windows | `{program, retail_start, retail_end, source_row, suspect?}` |
| `2026-opnad-windows.json` | **extracted** 2026 marketing calendar (all tiers + full Happy Meal series) | `{program, tier, start, end, dual_daypart?, note?}` |

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
the 2025 extraction has; dates are read off each program's own labeled box. Three of these
(Monopoly, Happy Meal #9, the November BEVS window) are already loaded into `org_events`
(ids 6145-6147, see `memory/finding-corp-calendar-sep-nov-2026.md` for the full story,
including why the BEVS entry is `verification:'Estimated'` rather than `'Confirmed'` — its
retail start date, from a separate corporate newsletter, precedes this calendar's media window
by 6 days, so the retail END date isn't independently confirmed by either source). The other
26 windows (the rest of the Happy Meal series, Brand Relevance, BEVS ×2 more, BEEF, BFAST ×2,
CHICKEN, HOT HONEY, McVALUE ×2, Shamrock Event, $5 Brk Meal & $8 ROD Meal, $5MD+BOAO) are
extracted here but not yet loaded into `org_events` — nothing asked for them yet.

## Not yet done

- Load the remaining 26 windows from `2026-opnad-windows.json` into `org_events`, if wanted —
  the app's Events & Tags UI already syncs to that table, or go direct via the service-role key
  matching the existing `loc:'*ALL*'`/`scope:'all'`/27-store-list convention.
- Parse the 2026 media-mix grids — different shape, GRPs by week-start rather than
  start/stop pairs, so a window has to be inferred from contiguous non-empty weeks. Lower
  priority now that the OPNAD PDF already gives clean start/stop dates for the same programs.
- The `2025 Happy Meal StartStop` sheet parses to 2024 dates in column C with no end
  date; its layout differs from the OPNAD sheet and needs a separate read before use.
