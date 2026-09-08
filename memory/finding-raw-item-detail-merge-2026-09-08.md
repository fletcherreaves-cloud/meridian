---
description: qsr_raw_item_detail's per-pull upsert was a blind full-array REPLACE, not a merge — an item that drops out of the daily top-50 actionable-WRIN selection had its stored count history frozen with no trace of anything that happened while excluded. Fixed with mergeRawItemHistory().
---

# qsr_raw_item_detail now merges, doesn't overwrite (2026-09-08)

## The ask

Owner, same day as the variance sign-flip and Items Recounted tile fixes: *"The data in raw
item detail persists on my end in QSRSoft. No reason we can't keep this data in check as new
pulls come in. Only overwrite what's changed — in the event of an edit to an inventory count,
which can happen although not very often."*

## The gap, measured

`scripts/qsrsoft-variance-pull.mjs` fetches `raw_detail/{itemId}` only for that day's top-50
*actionable* WRINs per store (`Math.abs(dolDiff) >= 50`, ranked, `.slice(0, 50)`) — a **relative**
ranking against every other item's $ variance THAT DAY. An item can rank in the top 50 on Monday,
drop out on Tuesday–Thursday (because other items had bigger swings that week, not because
anything changed about it), and re-enter Friday. While excluded, `qsr_raw_item_detail`'s stored
row for it was never touched — fine, on its own. The bug was the write path: the upsert did
`history: m.history` — a straight replace of the WHOLE `history` JSONB array with whatever that
one day's fetch returned. Since the API's own range is always `period-start..today` (never
narrows), re-entering the top-50 on Friday would normally re-capture the full month-to-date
history correctly — but there was no defense against a single day's fetch being incomplete
(a transient API hiccup, pagination cutoff, etc.) silently erasing previously-good stored data,
and no way to independently confirm the app's copy tracked QSRSoft's own persistent record
faithfully rather than just "whatever the last successful fetch happened to contain."

## The fix

`mergeRawItemHistory(existing, incoming)` (`src/engine/eom-parsers.js`) unions instead of
replacing:
- Every event in `existing` (this pull) is preserved unless `incoming` has an event with the
  same identity — never silently dropped by a narrower/incomplete fetch.
- An `incoming` event sharing a key with an `existing` one **wins** — so a QSRSoft-side edit to
  a historical count (owner: "which can happen although not very often") is correctly picked up.
- Keyed on `sourceId + source + dt + tm`, not `sourceId` alone: a live capture (Madill,
  2026-09-08) showed QSRSoft reuses ONE `source_id` across an inventory count event and its
  paired auto-generated `pos_sales` adjustment — keying on `sourceId` alone would wrongly
  collapse those two different events into one.

`scripts/qsrsoft-variance-pull.mjs` now does **one batched read** per store (`select
wrin,history from qsr_raw_item_detail where loc=X and period=Y and wrin in (...)`, not one
query per item) before building `detailRows`, and merges each item's freshly-mapped history
through `mergeRawItemHistory()` before the upsert.

## Verification

5 new regression tests (`eom-parsers.test.js`): existing-event preservation, incoming-wins on a
shared key (the edit case), the real sourceId-collision shape from the live capture, first-pull
passthrough, and a null-sourceId case (`pos_open` events). Full suite 4648/4648, build clean,
538.02 KB / 850 KB budget. Syntax-checked the pull script directly (`node --check`) since it
isn't otherwise covered by vitest, and its own `runMode`/`isDailySlot` test
(`qsrsoft-variance-pull-window.test.js`, which imports the module directly) still passes.
