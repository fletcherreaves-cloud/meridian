# Dispatch #172 — Investigate cash-handling field discrepancy (cash O/S, refunds, POS-over)

## The open finding (dispatch #165's audit, `audit-emailed-stream-redundancy-2026-08-27.md`,
## explicitly flagged NOT to treat as redundant / not to chase down in that dispatch)

Sampled 135 real store-days, comparing each emailed field against its API-pulled "same quantity":

| comparison | match rate | note |
|---|---|---|
| `glimpseRows.cashOS` vs `qsr_cash_sheet.cash_over_or_short` | **1 / 135 (0.7%)** | near-total, systematic disagreement |
| `cashRows.cash_os` vs `qsr_cash_sheet.cash_over_or_short` | 101 / 135 (75%) | max observed diff 2,592 on one outlier day, not chased |
| `cashRows.posOverAmt` vs `qsr_cash_sheet.overring_amt` | 106 / 135 (79%) | |
| `cashRows.cashRefAmt` vs `qsr_cash_sheet.cash_refunds_amt` | **60 / 135 (44%)** | weakest measured |

By contrast, promo/POS-over/channel-mix fields from the same streams reconcile at 97–98%+ — so
this isn't generic pipeline noise, it's specific to cash-handling fields. This dispatch is the
"investigate the disagreement itself" follow-up #165 explicitly deferred, not a fix — you may not
find a clean fix at all; a well-measured "here's what's actually different and why" is a
legitimate, valuable outcome on its own.

## Two concrete leads already surfaced — start here, don't re-derive from scratch

1. **`glimpseRows.cashOS`/`cashRows.cash_os` are two INDEPENDENTLY-parsed values, not one shared
   pipeline.** `scripts/qsrsoft-email-parse.mjs`'s `mapGlimpse()` and `mapCashSheet()` (both
   ~line 83-124) each pull `cash_os`/`cash_os_pct` from `r.cashOS`/`r.cashOSPct` — i.e., the
   Daily Glimpse email report and the Cash Sheet email report EACH carry their own "Cash
   Over/Short" column (see `src/parsers/index.js`'s column-matching, multiple `cashOS:fc(h,'Cash
   Over/Short'...)` entries across different parser functions for different report types). **Has
   anyone confirmed `glimpseRows.cashOS` and `cashRows.cash_os` agree with EACH OTHER, for the
   same (loc, date)?** This comparison was never made in #165's audit (which only compared each
   emailed field against the API side) — do it first. If the two EMAIL reports disagree with each
   other too, that points to a genuine definitional difference in how QSRSoft itself computes
   "cash O/S" per report type, not a pull-script bug on Meridian's side. If they agree closely
   with each other but BOTH disagree with the API, that narrows the search to the API side (or a
   day-boundary mismatch between the email export and the API snapshot).
2. **The API-side field's day-boundary alignment was flagged as unverified, not confirmed, by
   dispatch #164 (this same session).** `qsr_cash_sheet.cash_over_or_short` comes from the
   `cash-sheet-extract` endpoint (`scripts/qsrsoft-ops-pull.mjs:92`, `compType:'calendar'`).
   Dispatch #164 directly measured `compType:'calendar'` as 4am-business-day-aligned — but ONLY
   for the `labor-summary` endpoint; its own PR body explicitly lists `cash-sheet-extract` among
   the endpoints "suggestive given the shared reporting engine/param, not independently measured."
   **Given `glimpseRows.cashOS`'s near-total 0.7% mismatch is far worse than the ~75-79% seen for
   the other cash fields from the same table**, a boundary mismatch (one side reading a slightly
   different day than the other) is a strong, cheap-to-test candidate — do the SAME measurement
   #164 already did for `labor-summary` (re-bucket independent raw ground truth two ways — plain
   midnight vs. 4am ABC — and see which one actually matches `cash_over_or_short`), reusing
   `dar-vs-ops-reconciliation.md`'s and #164's own method rather than inventing a new one. If no
   independent raw ground truth exists for cash drawer counts the way `qsr_punch_times` did for
   labor, say so and explain what you tried instead.

## What to actually do

1. Direct three-way comparison for a real sample of store-days: `glimpseRows.cashOS`,
   `cashRows.cash_os`, `qsr_cash_sheet.cash_over_or_short` — all three, same (loc,date), side by
   side. Look for a PATTERN in the mismatches, not just a match rate: is it a fixed offset, a sign
   flip, a scale factor (10x/100x — a %/$ confusion would show up this way), or does it correlate
   with something (a specific store, a day of week, an amount magnitude)? A near-0% match rate is
   unusual enough that a purely-random/noise explanation is unlikely — look for a mechanical cause
   first.
2. Repeat the same three-way structure for `posOverAmt`/`overring_amt` (79%) and
   `cashRefAmt`/`cash_refunds_amt` (44%) — these may share a root cause with cash O/S (same report,
   same pull script) or may be independent; don't assume either way.
3. Test the boundary hypothesis per lead #2 above.
4. Write up findings as a `memory/finding-*.md` file per this repo's standing documentation
   convention, whether or not a clean explanation is found — a well-measured "still unexplained,
   here's what was ruled out" is a valid, valuable outcome (matches #164's own precedent of a
   focused, honest investigation write-up).
5. **Only fix code if the investigation finds an unambiguous, narrow bug** (e.g., a units mismatch,
   an obviously-wrong field alias, a confirmed boundary bug with a clear correction). Do NOT
   reorder `METRIC_SOURCES` chains, deprecate a stream, or change which source "wins" based on a
   partial finding — #165's audit already flagged that as premature ("do not read the cash-field
   percentages... as mostly redundant... a real, unexplained discrepancy"), and this dispatch
   should not walk that back without a real answer in hand.

## Out of scope

- `empMealAmt`/`mgrMealAmt` (a separate, not-yet-reconciliation-tested gap #165 flagged) — different
  dispatch if wanted.
- Any pull-script deprecation or `METRIC_SOURCES` chain reordering — per point 5 above.
- Re-verifying `labor-summary`'s own boundary alignment — #164 already did that; only
  `cash-sheet-extract` (and, if time allows, the other endpoints #164 flagged as unmeasured) are
  this dispatch's subject.
