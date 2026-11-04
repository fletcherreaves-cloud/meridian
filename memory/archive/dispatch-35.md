# Dispatch #35 — Register Audit auto-pull: implement against the confirmed endpoint

**Board (2026-08-19), at time of writing:** `main` will be at the commit merging PR #445
(`memory/dispatch-34-phase0a-findings.md`). Read that file's Part 1 in full before starting — it
has the confirmed endpoint, params, real field names, and a translation table flagging exactly
which `saveAuditRows()` columns are confirmed vs. still uncertain. This dispatch is the
implementation step on top of that capture; it does not repeat the technical detail, only the
scope and the guardrails.

**This is the last piece of Phase 0a.** Once this lands, rung 2 of the attribution ladder
(`data-acquisition-shopping-list.md`) closes for real, and `memory/plan-security-loss-prevention.md`
Phase 1 (cash-drawer variance + peer ranking) can start.

---

## What's already done (do not redo)

- Pull-script scaffold: `scripts/qsrsoft-register-audit-pull.mjs` (dispatch #33, PR #444) — auth
  (`getFreshToken()`), backfill/gap-detection (`getLatestDate()`/`getDateRange()`), the local
  `saveAuditRows()` twin of `src/lib/supabase.js`'s function, and coverage/freshness
  instrumentation (`logPartitionCoverage`/`checkFreshness`) are all complete and correct. Only
  `fetchRegisterAuditDay()` and `mapRow()` are unfinished (both currently throw).
- Real endpoint, params, and response field names — captured live, documented in
  `dispatch-34-phase0a-findings.md` Part 1. Do not re-guess or re-probe.

## What this dispatch is

1. **Restructure the pull shape.** The confirmed endpoint takes a date range and ALL 27 stores'
   `nsn`s in one call (comma-separated), not one store × one date per request. The scaffold's
   `pullOneDay()` currently loops per-store — rework this so `fetchRegisterAuditDay()` (or its
   replacement) calls the endpoint once per date range with the full store list, and the row-level
   loop happens after the response comes back, not before the request goes out. Keep the existing
   gap-detection windowing (`getDateRange()`) as the source of the date range to request.

2. **Implement `mapRow()` field-by-field against `parseRegisterAudit`.** Dispatch #34's
   translation table marks several columns as unconfirmed (POS over-ring vs. the newly-seen
   `manOverringAmt`, cash-O/S %, avg check, T-Red rate/avg, `drawerGC`). For each: open
   `src/parsers/index.js:974`'s `parseRegisterAudit` and find how it derives that field from the
   manual Excel export's columns — the API's raw fields (`overShortAmt`, `allNetSales`,
   `transactions`, etc.) are very likely the same underlying quantities the Excel export already
   carries, just under different names, so the derivation logic (rate = qty/transactions, avg =
   amt/qty, etc.) should transfer directly rather than being reinvented. Where a column genuinely
   has no source (e.g. `avgCheck` if `analyzeRegisterAudit` truly doesn't need it), leave it
   `null` and say so in the PR description rather than fabricating a value.

3. **Handle the `nsn` → `loc` conversion.** The response's `nsn` is unpadded (e.g. `3708`).
   Zero-pad to 7 characters (`String(nsn).padStart(7,'0')`) before it touches `audit_rows`' PK
   `(loc, date, emp)`. Add a unit check or assertion for this — this repo has four prior incidents
   from exactly this class of bug (v4.809/823/827/831), and this data is personnel-sensitive, so a
   silent mis-join here is worse than the usual case.

4. **Verify against real rows before trusting the risk-scoring output.** Run the pull against a
   short, already-known window (the owner's own capture covered 2026-08-12 → 2026-08-18 for store
   3708 and others — a good sanity-check range) and manually compare a handful of resulting
   `audit_rows` entries against the source capture, not just against "no errors thrown." A wrong
   overring or cash-short number would silently flow into `analyzeRegisterAudit`'s per-employee
   risk flags — this is exactly the failure mode dispatch #33/#34's caution about personnel-
   sensitive data was protecting against, and it only gets caught by checking real numbers, not by
   a clean build or a passing lint.

5. **Complete the remaining "new automated pull" checklist items** (per `CLAUDE.md`'s standing
   rule, and per the scaffold's own header comment which deferred these until the endpoint was
   confirmed):
   - Add a `schedule:` cron block to `.github/workflows/qsrsoft-register-audit-pull.yml` (currently
     `workflow_dispatch`-only) — match the existing 10:00 UTC cadence alongside DAR/eBOS unless
     there's a reason to differ.
   - Add the workflow's exact `name:` to `.github/workflows/sync-failure-watch.yml`'s `workflows:`
     list — `src/__tests__/sync-failure-watch.test.js` enforces this both directions.
   - Confirm `audit_rows` already has `tenant_id`/RLS (it should, as an existing table) rather than
     assuming.
   - Leave the manual Excel upload path intact — auto-pull is freshest-wins on top of it, not a
     replacement.
6. **Backfill.** Once the pull works end-to-end, run it across as much history as the Register
   Audit report itself retains (check the report's own retention before assuming a fixed window,
   per CLAUDE.md's "data depth is never the limiter" rule) rather than starting the standing table
   from today forward.

## Explicitly not in this dispatch

- Any changes to `analyzeRegisterAudit`'s scoring thresholds — `data-acquisition-shopping-list.md`
  §A already flags these as absolute-count thresholds that need rate-normalizing before this data
  is used to judge a real person, but that's a separate, later piece of work, not part of wiring
  the pull up.
- The Any Transaction Tier B build (`transaction_detail` endpoint) — confirmed viable in dispatch
  #34 Part 2, but build it only when an actual investigation needs it, not speculatively here.
- Anything from Phase 1 of `plan-security-loss-prevention.md` (cash-drawer variance + peer
  ranking, TvA inventory variance) — gated on this dispatch landing first.
