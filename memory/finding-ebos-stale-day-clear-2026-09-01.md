# eBOS pull: stale day-rows never cleared when QSRSoft reassigns an invoice's date (2026-09-01)

## What triggered this

Owner flagged Mossy Head (37566) August Op Supplies not matching QSRSoft: "QSRSoft is 3326.00,
MBI is 3353.55 (Although this one i feel like we addressed a similar issue last month in another
store perhaps and had to do with a credit or something." Later, after the panel's live value
turned out to have drifted further (measured $3,553.55, then $3,680.69 after a routine re-pull
added an Aug 31 row), the user escalated: "We need to troubleshoot why that is different for this
one location. It is wrong on QSRSoft as well!!"

## Live reconciliation (measured, not reasoned about)

1. Confirmed the netting logic (`PURCHASE_RECORD_TYPES = new Set(['Purchase','Credit','Adjustment'])`,
   the fix behind store 5183's earlier under-reporting bug) is NOT the cause here: a `DUMP_EBOS_FIELDS`
   diagnostic dispatch (store=37566, month=2026-08) showed `Credit` and `Adjustment` both contributed
   **$0** in ops spend that month, and the flat `Purchase`-type-only sum was **exactly $3,326.00** —
   matching QSRSoft's own reported ledger figure to the penny. So whatever was wrong, it wasn't
   record-type netting.
2. But `qsr_ebos_daily`'s stored day-totals for August summed higher, and two date PAIRS carried
   byte-identical totals: Aug 11 & Aug 12 both $140.516; Aug 18 & Aug 19 both $214.172. A control
   store (29760, same window) showed zero repeated values across 8 real delivery days — ruling out
   "sparse delivery schedule coincidence" as an explanation.
3. Added a second diagnostic (`DUMP_EBOS_DATES`) that dumps the individual raw purchase-record line
   items for named dates. Dispatched for `2026-08-11,2026-08-12,2026-08-18,2026-08-19`. Result:
   - **Aug 11: 0 purchase-record items, ops_sub sum $0.**
   - **Aug 12: 79 items, ops_sub sum $140.52** (invoice `30992394`, a full delivery — beef, chicken,
     fish, buns, produce, dairy, etc.)
   - **Aug 18: 0 purchase-record items, ops_sub sum $0.**
   - **Aug 19: 86 items, ops_sub sum $214.16.**

That is the live, current-truth state of QSRSoft's ledger for this store: as of this pull, the
invoices genuinely post to Aug 12 and Aug 19 only, with nothing on Aug 11/18. QSRSoft's own current
data is correct — the "wrong on QSRSoft as well" read was the natural conclusion from what Meridian
displayed, but the live probe shows QSRSoft's CURRENT state agrees with itself and with its own
ledger total.

## Root cause

QSRSoft evidently reassigned these two invoices' `posted_date` sometime between an earlier pull run
(when Aug 11/18 still had this data) and now (when it's Aug 12/19 only) — a normal correction/
finalization on their end, not a data-integrity problem there. But `scripts/qsrsoft-ebos-pull.mjs`'s
persistence was **additive-only**: `aggregateByDate()` only emits rows for dates that have at least
one purchase-record line item in the CURRENT fetch, and the upsert (`onConflict: 'loc,date'`) only
touches dates present in that batch. A date that drops to zero items keeps whatever value was
written on some earlier run **forever** — there was no code path that ever cleared a stale row.
Net effect: every time QSRSoft moves an invoice from one day to another, the old day's row survives
as a ghost, and the monthly rollup silently double-counts the reassigned amount. This is a systemic
gap, not a Mossy-Head-specific one — it will recur on any store, any time QSRSoft reassigns an
invoice's date, silently inflating that store's monthly Op Supplies until someone notices a mismatch.

## Fix

`scripts/qsrsoft-ebos-pull.mjs`, both auth paths (`runWithToken` — the primary/fast path used almost
every run per this session's own measurements — and the Playwright fallback):
- After a successful fetch+aggregate for a store, **delete that store's existing `qsr_ebos_daily`
  rows across the whole pulled `[startDate, endDate]` window**, then upsert the freshly-aggregated
  set. This makes the persisted table reflect QSRSoft's CURRENT ledger state for the window, not an
  accumulation of every day that ever had data across pull history.
- Safety ordering: the delete only runs AFTER a successful fetch for that specific store, so a
  per-store fetch failure never wipes that store's still-good prior data (matches the existing
  per-store try/catch resilience the rest of the script already has).
- Playwright path: since its per-store loop runs inside `page.evaluate` (no access to this process's
  Supabase client), the delete is scoped Node-side using the SAME `failedNsns` set the script already
  derives from parsing the returned log (`#263`'s existing mechanism) — deletes only for stores that
  did NOT fail this run, same safety rule as the direct path.

## What this does NOT change

- No change to `PURCHASE_RECORD_TYPES`/`isPurchaseRecord()` (record-type netting) — proven correct
  by this investigation, not touched.
- No change to `DAYS_BACK`/`DAYS_RECENT` rolling-window sizing (`qsrsoft-ebos-pull.yml`'s own
  defaults, 900/30) — the fix works within whatever window is already being pulled; a date outside
  that window is untouched either way, same as before.
- Historical months no longer inside the rolling `DAYS_RECENT` window are NOT retroactively cleaned
  by this fix on their own — only dates that fall within a pull's `[startDate,endDate]` get the
  stale-clear treatment. The diagnostic dispatches run during this investigation (before this fix
  existed) only ADDED data — they did NOT clear the Aug 11/18 ghost rows, since the delete-before-
  upsert code didn't exist yet at that point. Mossy Head's ghost rows are still live in the database
  as of this fix landing; the very next scheduled/dispatched pull that covers August (today's date
  is within the default 30-day `DAYS_RECENT` window) will clear them as a normal side effect of
  this fix, and the same will happen automatically for any OTHER store's reassigned-invoice ghosts
  going forward.
