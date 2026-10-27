---
name: finding-yearly-targets-are-dinner-peak-2026-10-27
description: Owner-clarified, 2026-10-27 -- the station-speed targets in DEFAULT_TARGETS (tOepe/tKvst/tKvsu/tR2p, sourced from the "Yearly Targets" workbook upload) are PEAK-PERIOD targets, specifically dinner (5pm-7pm clock time), not whole-day blended targets. Surfaced while building the Night-Shift Performance Plan doc, which had assumed whole-day. Also records the owner's daypart definitions for future reference.
metadata:
  type: finding
---

# `tOepe`/`tKvst`/`tKvsu`/`tR2p` are dinner-peak targets, not whole-day targets

## The mistake this corrects

While building a night-shift (4pm-close) performance analysis, the station-speed targets in
`src/constants.js`'s `DEFAULT_TARGETS` (`tOepe` drive-thru, `tKvst`/`tKvsu` kitchen,
`tR2p` front counter -- all sourced from the "Yearly Targets" workbook via `parseYearlyTargets()`,
`src/parsers/index.js:760-845`) were assumed to be whole-day blended targets, same as
`tTpph`/`tCrewLabor`. **They are not.** Owner, 2026-10-27, directly: *"those night targets are
specifically for the peak periods... dinner is defined as 5pm to 7pm."* Every one of these
station-speed figures in the yearly targets workbook is a **peak-period** target -- for night-shift
work specifically, that means **dinner, 5pm-7pm clock time**, not a 24-hour average.

This matters for any analysis comparing night/closing-shift actuals against these targets: the
correct apples-to-apples comparison is actuals during the 5pm-7pm dinner peak specifically, not
the full post-5pm-to-close window. Comparing a wider window (e.g. 5pm-to-close) against a
dinner-peak-only target is not a fair "vs. target" read -- it mixes a peak-calibrated number
against a window that includes slower off-peak late-night hours the target was never meant to
grade.

## `hour_slot` mapping for the dinner peak

`qsr_daily_activity.hour_slot` is the END time of each hourly block (established elsewhere:
`hour_slot='06:00'` = the 5am-6am block). Dinner (5pm-7pm clock time) therefore maps to
`hour_slot IN ('18:00','19:00')` (the 5-6pm and 6-7pm blocks) -- confirm against a live sample
before trusting this in a new analysis, this file is documentation, not a guarantee the mapping
hasn't drifted.

## Full daypart taxonomy (owner-stated, for future reference)

- **Breakfast:** owner's stated time was unclear in the original message (likely a voice-to-text
  garble, transcribed as "8:53 AM") -- **do not guess this one**, ask the owner directly before
  building anything breakfast-daypart-specific.
- **Lunch:** 11am-2pm.
- **Dinner:** 5pm-7pm.

Owner noted (2026-10-27) he may elaborate further on per-daypart targets and extend this to more
metrics (TPPH, labor%, etc.), not just the station-speed trio -- if/when he does, update this file
rather than letting the new definitions live only in a chat thread or a one-off doc.

## Where this was first applied

`memory/project-night-shift-analysis.md` (if created) or the "Night-Shift Performance Plan — OK &
FL" Claude Docs artifact (https://claude.ai/artifact/Rv4YELfaNxM2ZFc2R14zVr) -- corrected in place
once this was flagged, rather than left standing with the whole-day assumption.
