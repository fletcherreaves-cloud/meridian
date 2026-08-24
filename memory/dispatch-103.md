---
name: dispatch-103
description: Record Day Intelligence flagged Tecumseh's 2026-08-24 OEPE as a new record (95s, beating a 97s previous best) while the store's own trading day was still in progress -- the app's own formula, run against the exact live qsr_daily_activity rows that existed at check time, reproduces 95s exactly, but those rows only cover the day through 15:00 (the DAR's last scheduled intraday pull). The owner's own later QSRSoft export for the same day has real data through 17:00, and those two additional hours (141s and 101s -- both slower than 95s) were never in Meridian's number. There is no guard anywhere in record-day.js against flagging a same-day, still-accumulating value as a final "New Record" -- every record type (sales, GC, speed, avg check) has the same exposure. Separately, the owner wants 2-decimal formatting for all dollar and percent values in this panel specifically.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #103 — Record Day Intelligence can flag a same-day record before the day is actually over

**Status:** ready, root cause fully measured and reproduced against live data + the owner's own
QSRSoft export. This is a scoped fix, not an open investigation.

---

## What the owner saw, and the measured mechanism

Record Day Intelligence's "Recent Breaks" list showed:

```
33704 — Tecumseh   Mon, Aug 24, 2026   OEPE   New Record 95s   Previous Best 97s   +2.06%
```

Owner uploaded their own QSRSoft Daily Activity Report export for the same day and didn't see a
95s result in it — correctly suspicious, since the export's own hourly OEPE column never dips
anywhere near 95s (its lowest single hour is 62s at 07:00, and a same-day weighted average across
all its hours lands around 100-103s, not 95s).

**The 95s figure is not fabricated or wrongly computed — it's a correct calculation over
incomplete data.** `loadQsrActSummary`'s OEPE derivation (`src/lib/supabase.js`, ~line 2066,
`oepe: oepeSeconds({dt_untilserve: r._dtTotal, dt_untilstore: r._dtStore, dt_heldtime:
r._dtHeldTime, dt_trans_cnt: r._dtCars})`) sums the raw `dt_untilserve`/`dt_untilstore`/
`dt_heldtime`/`dt_trans_cnt` fields across every hour of the day, then applies the one shared
formula in `src/utils/oepe.js`'s `oepeSeconds()`. Pulled the exact live `qsr_daily_activity` rows
for Tecumseh (33704), 2026-08-24, and ran that exact formula by hand: **result is 95s, exact
match.** But those live rows only have real data through **15:00** — every hour from 16:00 through
28:00 reads all-zero (`dt_trans_cnt: 0`), because the DAR's intraday pull schedule (~8a/10a/2p CT
per CLAUDE.md) hadn't run again since 3pm at the time this was checked. The owner's own QSRSoft
export, pulled later, has real hourly data through **17:00** — two additional hours (141s and 101s,
both *slower* than 95s) that Meridian's database simply didn't have yet when it computed and
flagged the "record."

**Once those two slower hours are included, Tecumseh's true full-day OEPE for 2026-08-24 will
almost certainly come out worse than 95s** — likely back near the ~100-103s a full-day weighted
average of the owner's export produces. The "record" the panel announced is very likely to not
survive the rest of the trading day.

## Root cause: no completeness guard exists anywhere in this file

`record-day.js`'s record-detection loop (~line 230-243) is a straight per-day scan:

```js
if (oepe && oepe<oepeBest){ oepeBest=oepe; rec.speed.oepe={val:oepe,dk}; flagRecent(...); }
```

Every record type in this loop — `sales`, `gc`, `bf` (breakfast), `avgChk`, `oepe`, `kvs`, `r2p`,
plus every DOW variant — has the exact same exposure: the moment TODAY's partial-day value beats
the running best, it's flagged as a new record, with no check for whether today's trading day has
actually finished. A slow start to a shift can make an early "record" that a normal afternoon then
erases, and nothing in this file distinguishes "final, closed-day record" from "record as of
whatever data happens to be loaded right now."

## The fix

Add a same-day completeness check before a CURRENT day (as opposed to a historical, already-closed
day) is allowed to set a new record. Concretely:
- A historical day (any date before "today," per this repo's real business-day boundary —
  `businessDate()`/`lastClosedBusinessDay()` in `src/utils/date.js:101,117`, **the existing 4am
  cutover helper — do not re-derive this inline, CLAUDE.md's own standing rule**) is always safe to
  evaluate as-is; it's closed, its data won't change.
- For the CURRENT (still-open) business day specifically, either (a) exclude it from record
  detection entirely until it closes, or (b) allow it to show as a **provisional** record with a
  visible "still accumulating, may change" indicator distinct from a normal confirmed record — pick
  whichever matches how this panel is actually meant to be used (a same-day heads-up "you're on
  pace for a record" might be genuinely useful information, just not presented with the same
  confidence as a closed-day record). If unclear which the owner wants, default to (b) — visibly
  flagged as provisional — since silently hiding today's number entirely is a bigger behavior change
  than adding a caveat label, and check with the owner before shipping if there's real ambiguity.
- Apply this uniformly to every record type in the file (sales/GC/breakfast/avg-check/OEPE/KVS/R2P
  and their DOW variants) — this is one mechanism, not six separate ones.

## Second, smaller item — 2-decimal formatting (owner, same panel)

*"For Record days, use 2 decimals for all dollar and any percents."*

Measured current state: `record-day.js` imports `f$` from `src/utils/fmt.js`
(`export const f$ = n => '$' + Math.round(n||0).toLocaleString()`) — **zero decimals**, whole
dollars only. Percent formatting is inconsistent within the file: the Recent Breaks "Change" column
already uses `.toFixed(2)` directly (~line 524, matches the owner's ask), but other percent/dollar
displays in the file may use `fPct`/`fP` from `fmt.js` at their default decimal counts (`fPct`
defaults to 1 decimal, `fP` defaults to 2) — audit every dollar/percent render in this file and
make them consistently 2 decimals.

**Scope this to `record-day.js` only — do not change `f$`'s global default.** `f$` (0 decimals) is
used broadly across the app; changing its default would silently reformat every other panel that
imports it. Use a local 2-decimal dollar formatter in this file instead (e.g. a small
`f$2 = n => '$' + (n||0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})`
or equivalent), and pass an explicit decimal count to `fPct`/`fP` calls rather than relying on
their defaults.

## Verification bar

- Render the actual `RecordDayPanel`/`RecentBreakersTab` consumer (not an isolated helper) against
  a fixture where "today" has a fast-but-partial OEPE and a later, slower hour would still land —
  confirm today's record either doesn't fire or renders visibly provisional, while a genuinely
  closed historical day's record still fires normally. Per this repo's "would this verification
  still pass if reverted" standing rule.
- Confirm every dollar and percent value rendered in `record-day.js` shows exactly 2 decimals,
  without changing `f$`'s behavior anywhere else in the app (grep other consumers of `f$` and
  confirm their output is byte-for-byte unchanged).
- Re-check Tecumseh's OEPE entry specifically once the fix ships and the trading day in question has
  actually closed — confirm the "record" claim is now consistent with the full, closed day's data
  (this may need a live re-check after 2026-08-24 has fully closed, not something verifiable purely
  from a unit test).

## Do NOT

- **Do not change `f$`'s default decimal count globally** — scope the 2-decimal formatting to
  `record-day.js` only.
- **Do not re-derive the business-day boundary inline** — use `businessDate()`/
  `lastClosedBusinessDay()` from `src/utils/date.js`, already the standing shared helper.
- **Do not silently drop today's data from the panel** without picking (a) or (b) above deliberately
  — check with the owner if genuinely unclear which behavior is wanted, per the dispatch's own
  default-to-(b) guidance.
- **Do not assume the DAR sync gap is itself a bug to fix** — the intraday pull schedule (~8a/10a/2p
  CT) running behind "now" on any given day is expected and already documented elsewhere in this
  repo; the fix here is making the panel behave correctly given that reality, not chasing the sync
  timing itself.
