# Dispatch #35 — Register Audit: implemented against the confirmed endpoint

2026-08-19. `memory/dispatch-35.md`, on top of dispatch #34's live capture
(`memory/dispatch-34-phase0a-findings.md` Part 1). The last piece of Phase 0a
(`memory/plan-security-loss-prevention.md`) — Phase 1 (cash-drawer variance + peer ranking)
can start once this lands.

**Same environment blocker as dispatch #33, re-confirmed before starting**: no QSRSoft
credentials, network egress to `api.reports.myqsrsoft.com` still blocked (403). Everything
below is buildable and testable without live access EXCEPT the one thing dispatch #35 itself
calls out as needing real rows — item 4, verifying the risk-scoring output. That could not be
done here; see "Not done" below.

## 1. Restructured the pull shape

Replaced the scaffold's per-`(loc, date)` loop with `chunkDateRange()` + `runAll()`: one HTTP
call per date-range chunk, covering ALL 27 stores in a single comma-separated `nsn` param
(matching dispatch #34's captured request shape exactly), with the row-level work happening
after the response comes back. Chunked into 21-day windows — not because the confirmed endpoint
requires it (the captured sample used a 7-day range in one call), but matching
`lifelenz-pull.mjs`'s own chunking convention so a 90-day-or-larger backfill doesn't risk one
oversized/timing-out response.

## 2. `mapRow()` implemented field-by-field, cross-referenced against the actual consumer

Before mapping anything, read `src/utils/register-audit.js`'s `analyzeRegisterAudit` in full to
find out which fields it ACTUALLY reads (not which columns exist in the schema) — this settled
every one of dispatch #34's flagged uncertainties with evidence rather than another guess:

- **`manOverringAmt` vs `posOverAmt`** — resolved by checking `parseRegisterAudit`'s own column
  list: the manual Excel export already has these as two SEPARATE columns ("Manual Refund/
  Overring $" vs "POS Overrings $"/"POS Overrings Cnt"). `manOverringAmt` maps to `manualRefAmt`
  (the manual-refund concept), not folded into `posOverAmt` (`overringAmt`/`overringQty`, the
  POS-overring concept) — they were never the same thing.
- **`drawerGC`** — dispatch #34 called this "no obvious source field." `analyzeRegisterAudit`
  answers it directly: it's the denominator of the engine's OWN `avgCheck = totalSales/totalGC`
  computation, so it has to be a guest-count-shaped field. `transactions` is the only response
  field that fits — parseRegisterAudit's own Excel header for this column is literally
  "Drawer GC"/"GC" (guest count), the standard meaning of "transaction count" in this codebase.
- **`avgCheck`, `cashOSPct`, `promoPct`, `tRedBPct`/`tRedBAvg`, `tRedAPct`/`tRedAAvg`** —
  confirmed **none of these five are read by `analyzeRegisterAudit` at all** (it recomputes its
  own `avgCheck`, and never touches `r.cashOSPct`/`tRedBPct`/`tRedAPct`/`tRedBAvg`/`tRedAAvg`/
  `promoPct`). Also confirmed `parseRegisterAudit`'s manual path doesn't derive these either —
  it just READS them as QSRSoft's own pre-computed Excel columns (`findCol(h,'T-Red Before
  Pct')`, etc.), so "mirror its derivation logic" wasn't literally available; there is no
  derivation logic in the parser to mirror, only column-reading. Derived here the way dispatch
  #34/#35's own text suggested as the natural fallback (rate = qty/transactions, avg = amt/qty,
  pct = amt/sales) — populated for schema completeness/future panels since they're honest,
  well-defined ratios, not fabricated values, and explicitly documented as non-load-bearing for
  today's risk scoring.
- **Employee identity (`empID` vs `empName`)** — resolved by checking what `audit_rows`' PK has
  always meant: `parseRegisterAudit`'s manual-upload path has keyed `emp` on the NAME string for
  as long as it's existed. Using `empID` for the auto-pull path would split-brain the
  `(loc,date,emp)` history for the same real person between manually-uploaded rows (keyed by
  name) and auto-pulled rows (keyed by ID) — they'd never merge, breaking the freshest-wins
  continuity every other stream in this app relies on. Kept `empName`, matching existing history.
  A same-name collision at one store is an existing risk this doesn't introduce or worsen.
- **`refundCnt`** — dispatch #34's own table already gave this as high-confidence (sum of
  `refundCashQty` + `refundCashlessQty`); implemented as given, no further resolution needed.

## 3. `nsn` → `loc` conversion

`nsn7(n) = String(n).padStart(7,'0')`, applied once inside `mapRow()` before the row ever
touches `saveAuditRows()`. Covered by a dedicated test case (4-digit and 5-digit `nsn` both pad
correctly) given this repo's own four prior incidents (v4.809/823/827/831) from exactly this bug
class.

## 4. Verify against real rows — NOT done, same blocker as dispatch #33

This is the one item from dispatch #35's own checklist that could not be completed from this
session. What WAS done instead, as the best available substitute: 12 unit tests
(`src/__tests__/register-audit-pull.test.js`) against a fixture row shaped exactly like dispatch
#34's documented field list, covering every derivation above plus zero-denominator safety
(a zero-transaction row derives `null`, never `NaN`/`Infinity`) and the `nsn` padding. This
verifies the MAPPING LOGIC is internally consistent and matches the documented field names — it
does **not** verify the mapping is correct against what the real API actually returns, since
that requires a live call this session cannot make. **Before trusting any risk-scoring output
built on this data, run the pull once via `workflow_dispatch` and manually compare a handful of
resulting `audit_rows` entries against dispatch #34's own captured window (2026-08-12 →
2026-08-18, store 3708 and others)** — the workflow's own header comment repeats this.

## 5. "New automated pull" checklist

- **Cron enabled**: `.github/workflows/qsrsoft-register-audit-pull.yml` now has `schedule: cron:
  '0 10 * * *'`, matching DAR/eBOS's 10:00 UTC cadence, per dispatch #35's explicit instruction.
  Enabled without live verification (see #4 above) because the dispatch asks for this checklist
  item unconditionally, not gated on #4 — flagged prominently in the workflow's own header
  comment as the tradeoff being made, with a clear recommendation to spot-check a manual run
  first.
- **`sync-failure-watch.yml`**: added `QSRSoft Register Audit Pull` to the `workflows:` list
  (alphabetical position, after `QSRSoft Product Mix Pull`). `sync-failure-watch.test.js` passes.
- **`audit_rows` tenant_id/RLS**: already confirmed live in dispatch #33's own session (a
  minimal anon-key query returned real rows including a populated `tenant_id` column) — nothing
  about the table has changed since, re-confirming wasn't necessary.
- **Manual Excel upload fallback**: untouched — `parseRegisterAudit`, the upload UI, and
  `MANUAL_FED_SOURCES` were not modified.
- **Two-path auth**: added a Playwright fallback (`viaPlaywright()`), mirroring
  `qsrsoft-ops-pull.mjs`'s exact `runAll`/`resolveToken`/re-mint-on-401 pattern, even though
  dispatch #35's own checklist didn't explicitly re-list this (dispatch #33's did). CLAUDE.md's
  standing rule requires it for every new automated pull, and `qsrsoft-ops-pull.mjs` proves this
  same host (`api.reports.myqsrsoft.com`) sometimes still needs it despite #312's direct-token
  fix — added the workflow's Playwright install step to match.

## 6. Backfill — not run

No live access to run it. `DAYS_BACK` stays at the dispatch #33 default (90) rather than
widening it, since checking the report's own retention window (per CLAUDE.md's "data depth is
never the limiter" rule) also requires the QSRSoft UI. Flagged as an open follow-up, not
silently assumed.

## What's needed to close this out for real

A session (or the owner) with real QSRSoft credentials + network access needs to: (1) run
`workflow_dispatch` once against the 2026-08-12 → 2026-08-18 window, (2) spot-check a handful of
resulting `audit_rows` rows against dispatch #34's own capture, (3) confirm the response envelope
shape (`fetchChunk()`'s array/`.result`/`.data` fallback is a defensive guess, not confirmed),
(4) confirm or fix the Playwright fallback's guessed UI navigation URL
(`v3.myqsrsoft.com/reports/mcd/controlsCash/regAudit`) if the direct-token path ever needs it, and
(5) resolve the `refundCnt` semantic drift flagged below.

**PM verification pass, 2026-08-19 (PR #448 review, before merge):** independently re-checked the
load-bearing field-mapping claims against `main`'s actual `src/utils/register-audit.js` and
`src/parsers/index.js`, not just the summary text. `drawerGC`/`avgCheck`, the five confirmed-
unconsumed pct/avg fields, and `manualRefAmt` vs `posOverAmt`/`posOverCnt` staying distinct all
checked out exactly as claimed. CI's `verify` job passed independently, corroborating the
1596/1596-tests/clean-build claim.

**One real, non-blocking finding from that pass — `refundCnt` semantics diverge between manual
and auto rows.** `analyzeRegisterAudit`'s own comment (directly above `e.refundCnt+=(r.refundCnt
||0)`) explains the manual-upload path's `refundCnt` is cash-only *by construction*:
`parseRegisterAudit`'s Excel schema has no cashless-refund-**count** column
(`refundCnt: fc(h,'Refund Cnt','Cash Refund Cnt')`, only a cashless-refund-**dollar** column,
`refundCashless`). This dispatch's `mapRow()` sums `refundCashQty + refundCashlessQty` from the
real API (which does carry both counts) — a reasonable reading of dispatch #34's own guidance
(refundCnt was marked "high-confidence: sum of both"), which didn't cross-check this against the
comment already sitting in the consumer. Net effect: the same real employee's `refundCnt` will
mean "cash refunds only" on manually-uploaded rows and "cash+cashless refunds" on auto-pulled
rows, for dates that can sit side-by-side in `audit_rows` under the freshest-wins model.
**Not currently a scoring bug** — `avgRefundCnt`/`refundCnt` isn't one of the fields
`analyzeRegisterAudit` feeds into its risk score (only `avgDrawerOpens`, `cashOSTotal`,
`avgTRedA`, `avgTRedB`, `manualRef`, `posOver` do) — but it is a real, silent inconsistency in a
displayed metric, worth resolving during the live-verification pass above: either match the
manual path's cash-only convention for consistency, or keep the richer auto-pull definition and
document the historical undercounting explicitly. Not decided here.

## Verified

- `node --check`: clean. Confirmed the module imports cleanly WITHOUT Supabase env vars set
  (fixed a real bug before it shipped: the module previously called `createClient()`
  unconditionally at top scope, which would have crashed `mapRow()`'s own unit tests the same
  way dispatch #33's `src/lib/supabase.js` import crash did — guarded it the same way).
- 12 new tests (`register-audit-pull.test.js`) + `sync-failure-watch.test.js` re-run directly.
- 1596/1596 full suite passes (12 new). Build clean, unaffected (`scripts/` isn't bundled).
