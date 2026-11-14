---
name: finding-register-audit-target-flags-2026-11-14
description: "Notes 61 items #10/#11 -- Register Audit target-relative egregious/repetitive flagging + %-of-sales surfacing. Design, exact thresholds chosen, and why."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Register Audit: target-aware flags + %-surfacing (2026-11-14)

## Owner's ask (verbatim)

> **#10 (flagging):** "as far as we have data for reference and trends, but realistically the
> recent items are what is acted upon. Flags triggered by variation from target or being highly
> repetitive or egregious. Maybe research how to best handle this. Goal is to identify true
> opportunities that need to be acted upon."
>
> **#11 (%-surfacing):** "the big ones are cash +/-, T-Reds before and after, Refunds and
> Overrings."

## What existed before this

`src/utils/register-audit.js`'s `analyzeRegisterAudit(auditRows)` groups audit rows by
`loc::emp` and already computed per-employee sums/averages (cashOSTotal, tRedACnt/tRedBCnt,
posOver, refundCnt, etc.), but its risk score/flags were flat, hardcoded magic numbers
(`avgDrawerOpens>8`, `cashOSTotal<-5`, `avgTRedA>2`, ...) that never referenced the real
per-store targets already sitting in `DEFAULT_TARGETS` (constants.js) -- `tCashOSPct`,
`tRedBPct`/`tRedAPct`, `tPosOverPct`, `tRefundPct`, among others. It was also single-window:
whatever rows the caller (`RegisterAuditTab`, store-analytics.js) passed in -- which is the
toolbar's currently-selected date range -- was the ONLY data the risk score ever saw. No
distinction between a one-off blowout and a real pattern.

## Design

Added `computeTargetAwareRegisterFlags(allRows)` as a new, separate function (NOT a rewrite of
`analyzeRegisterAudit` itself) specifically so the existing engine's period-scoped totals/tests
stay byte-for-byte unchanged (`RegisterAuditTab`'s own date-range test,
`register-audit-date-range-2026-11-05.test.js`, asserts the Overview table's transaction counts
genuinely change with the toolbar's date range -- that has to keep working). The new function
is fed the employee's FULL row history (`allLocRows` in the view, i.e. every date on file for
that store, independent of whatever the date-range toolbar is set to) and returns a separate
map keyed by the same `loc::emp` composite key `analyzeRegisterAudit` already groups by.
`RegisterAuditTab` merges the two: period-scoped $ amounts/counts from the legacy engine (as
before), target-aware risk score/flags/% context from the new one, looked up by `loc::empName`.

All 5 named metrics (Cash O/S, T-Red Before, T-Red After, Overring, Refund) are treated
uniformly as a $-over-sales RATIO compared against the SAME store's own real DEFAULT_TARGETS
%-field -- the identical number used for the self-% columns, so "here's your %" and "here's why
it's flagged" are always the same figure, never two different bases. Cash O/S is the one SIGNED
comparison (being too far over OR under target both matter); the other 4 only flag for
EXCEEDING target.

## The judgment calls (owner explicitly delegated these)

- **RECENT_WINDOW_DAYS = 42 (trailing 6 weeks).** Not a fresh number -- reuses the exact window
  `store-cockpit.js`'s own Cash Controls Cockpit already established for Cash O/S specifically
  (`DAYS_BACK_HEAT`, "Cash Over/Short % — trailing 6 weeks"), so this flagging window matches a
  cadence the owner already signed off on elsewhere, rather than inventing a new one.
- **EGREGIOUS_MULTIPLE = 3.** A single day's deviation from target must be at least 3x the
  target's own magnitude to count as a one-off blowout worth immediate attention -- large enough
  to rule out the ordinary day-to-day noise a target already tolerates, small enough to still
  catch a real one-off before it has a chance to repeat.
- **FLOOR_PCT = 0.005 (0.5% of that day's sales).** An absolute minimum deviation before ANY day
  counts as "over" at all (for either egregious or repetitive purposes). Several real store
  targets here are near-zero (e.g. one store's `tPosOverPct` is 0.0003) -- without a floor, a
  trivial one-cent overring would multiply out to "egregious" against a near-zero target. The
  floor is expressed as a %-of-sales, not a flat dollar amount, so it scales with store size.
- **REPETITIVE_MIN_DAYS = 3 and REPETITIVE_SHARE = 0.5.** "Repetitive" requires BOTH ≥3 notably-
  over days in the recent window AND ≥50% of the employee's sales-bearing days in that window
  being notably over. The count guards against "1 bad day out of 2 worked" reading as a 50%
  pattern; the share guards against a high RAW count that's actually a small fraction of a
  high-volume employee's many shifts.
- **Score weighting: egregious (+25/metric) outweighs repetitive (+15/metric).** A single
  blowout needs same-week attention regardless of history; a pattern still needs coaching but is
  comparatively less urgent. Same 0-100 scale / critical-60/high-30/watch-15 bucket convention
  the legacy score already used, so `riskLevel` reads consistently either way.

## What's verified, not guessed

- Confirmed live against the file (not assumed): T-Red A = **After** (post-transaction void,
  highest risk), T-Red B = **Before** (pre-total correction) -- per the T-Reds tab's own existing
  caption in store-analytics.js.
- Confirmed `DEFAULT_TARGETS`' exact field names and real per-store values by reading
  constants.js directly before writing any comparison logic (not inferred from naming
  convention alone).
- The test file pins the real target values for store `43380` it depends on
  (`tCashOSPct:-0.0004`, `tRedAPct:0.0037`, `tRedBPct:0.0313`, `tPosOverPct:0.00318`,
  `tRefundPct:0.0`) in its own first test, so a future edit to `DEFAULT_TARGETS` that silently
  changes what "egregious"/"repetitive" mean for that store fails loudly instead of quietly
  drifting.

## Left alone, deliberately

- `RegisterAuditNarrative` (the AI-prose paragraph generator just below `RegisterAuditTab` in
  the same file) still reads the LEGACY period-scoped `e.riskScore` for its own narrative text.
  Not updated in this pass -- its narrative is itself period-scoped prose ("out of N employees
  reviewed THIS PERIOD..."), which is still a valid, different signal from the target-aware
  recent-window score. Worth revisiting if the owner wants the narrative to reflect the same
  target-aware signal the table now does, but that's a separate, smaller follow-on, not
  something to fold in unasked.
- `registerTypeBreakdown()`'s per-register-type split rows were NOT given target-aware flags --
  that view only ever showed days/counts/cashOS/discPct, never risk scoring, so there was
  nothing to extend there.
- The T-Reds tab's "Risk Flag" column was updated to read from the new target-aware flags
  (egregious taking priority over repetitive); the Refunds & Overrings and Cash & Discounts tabs
  were left on their existing threshold-colored cells (no "Risk Flag" column existed there to
  begin with) -- extending those too is a reasonable small follow-on if the owner wants parity
  across all four tabs, not done here to keep this change's blast radius to what was asked.
