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
| `REV_2__2026_OPNAD_Calendar_10.29.25.pdf` | 2026 OPNAD calendar | PDF, not yet extracted |
| `2025-opnad-retail-windows.json` | **extracted** 2025 retail windows | `{program, retail_start, retail_end, source_row, suspect?}` |

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

## Not yet done

- Load into `org_events` (the app's Events & Tags UI already syncs to that table).
- Parse the 2026 media-mix grids — different shape, GRPs by week-start rather than
  start/stop pairs, so a window has to be inferred from contiguous non-empty weeks.
- Extract the 2026 OPNAD PDF.
- The `2025 Happy Meal StartStop` sheet parses to 2024 dates in column C with no end
  date; its layout differs from the OPNAD sheet and needs a separate read before use.
