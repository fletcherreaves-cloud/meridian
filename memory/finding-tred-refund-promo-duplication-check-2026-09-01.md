---
name: finding-tred-refund-promo-duplication-check-2026-09-01
description: Follow-up to memory/finding-audit-rows-registertype-duplication-2026-08-28.md's flagged, NOT-fixed lead. Confirmed the prior meal-$ fix's exact mechanism (lives in metric-source.js, not register-audit.js -- meal $ was never routed through register-audit.js at all). For the requested fields (T-Reds before/after, cash/cashless refunds, promo) -- register-audit.js's analyzeRegisterAudit DOES sum all three (cashier/manager/preparer) register-audit API calls for every one of them, structurally identical to the already-confirmed-duplicated posOverAmt. But the live-data reconciliation needed to CONFIRM duplication (the same method #181/#183 used) could not be run in this session -- this session's own environment refuses any Bash command that references SUPABASE_SERVICE_ROLE_KEY or even the non-secret VITE_SUPABASE_URL, confirmed by direct test (unrelated hosts work fine; those two names specifically are refused). No code change shipped as a result, per this repo's own "measure it, don't reason about it" rule -- shipping an unverified fix to a security/loss-prevention engine is exactly the mistake dispatch #59 already made once (its own "posOverAmt is safe, no change needed" claim, made confidently without measurement, was proven wrong six days later by #183's actual measurement).
metadata:
  type: finding
---

# T-Reds / refunds / promo -- duplication check, blocked on live-data access (2026-09-01)

## What this picks up

`memory/finding-audit-rows-registertype-duplication-2026-08-28.md`'s own "Related, unfixed" section
named this explicitly as follow-up work: *"which specific summed fields in
`register-audit.js`/`security-baselines.js` are Manager==Preparer duplicates vs. genuinely
additive... `t_red_a_dollar`/`t_red_b_dollar`/`refund_cash`/`refund_cashless`/`promo_amt`... were
not checked at all."* `src/engine/metric-source.js`'s own comment at the `_auditCashierOnly` site
repeats the same instruction: *"before assuming register-audit.js's other summed fields are safe."*

## Step 1 -- confirmed the prior fix's exact mechanism (read the code, not the task's paraphrase)

The prior ("meal-$") fix is **not** in `src/utils/register-audit.js` at all. `analyzeRegisterAudit`'s
accumulator (`newAccumulator`/`accumulateRow` in that file) has no meal-$ fields whatsoever -- they
were never routed through that code path (confirmed by reading the accumulator's full field list:
`totalSales`, `totalGC`, `drawerOpens`, `cashOSTotal`, `tRedACnt`/`tRedBCnt`/`tRedADollar`/
`tRedBDollar`, `manualRef`, `posOver`/`posOverAmt`, `refundCnt`/`refundCash`/`refundCashless`,
`promoAmt` -- no `empMealAmt`/`mgrMealAmt`/`mgrMealCnt` anywhere).

The real fix lives in `src/engine/metric-source.js` (dispatch #183,
`memory/finding-audit-rows-registertype-duplication-2026-08-28.md`), fixing a DIFFERENT bug shape
than what this task's background description assumed:

- Condition: `_auditCashierOnly = r => (r.registerType || 'cashier') === 'cashier'` -- filters the
  `auditRows` leg to cashier-type rows only, dropping Manager/Preparer rows entirely (not a
  `Manager == Preparer` equality check at the row level -- it's "keep cashier, drop the other two").
- Mechanism: a new 4th tuple element `'sum'` on a `METRIC_SOURCES` entry's `srcs` tuple, resolved by
  `_resolveLeg()`, which sums `field` across every row at a `(loc,date)` key passing the row filter
  -- replacing the old "first row with a value wins" resolution (which also silently mis-resolved
  `auditRows`' per-employee grain, a second, independent bug `_resolveLeg` fixes at the same time).
- Applies to exactly three chains: `empMealAmt`, `mgrMealAmt`, `mgrMealCnt` (all via their
  `auditRows` leg only -- `glimpseRows`/`ctrlRows` legs on the same chains are untouched).
- `manualRefAmt`'s `auditRows` leg is explicitly **unchanged** -- the #183 finding says its real
  sampled values were too close to $0 to say anything about its duplication behavior either way.

**register-audit.js itself has never had this fix applied to anything**, because it never carried
the meal-$ fields to begin with. What it DOES share with the fixed chains is the SAME underlying
root cause (`register_type` duplication in the QSRSoft register-audit report for certain field
classes) manifesting as a DIFFERENT bug shape: `accumulateRow` sums every field it tracks --
including `tRedACnt`/`tRedBCnt`/`tRedADollar`/`tRedBDollar`/`refundCnt`/`refundCash`/
`refundCashless`/`promoAmt`/`posOverAmt` -- across all three register-type rows unconditionally,
with no cashier-only filter anywhere in the file.

## Step 2 -- what's already independently established (read, not re-derived)

`src/engine/metric-source.js`'s own comment block (right above `_auditCashierOnly`) states the
scope precisely, and is worth quoting verbatim since it settles which fields are known-safe vs
known-affected vs unknown:

- **Known safe, measured**: `drawerSales`/`drawerGC` -- "measured genuinely different per type,
  e.g. one employee's Manager-call sales != their Preparer-call sales the same day." This is
  dispatch #59's original audit, and per the comment it actually WAS measured for these two fields
  specifically (not just asserted).
- **Known affected, measured**: `empMealDisc`/`mgrMealAmt`/`mgrMealCnt` (dispatch #183, live
  Supabase measurement, Manager-type total == Preparer-type total exactly at every one of 27
  stores).
- **Suspected affected, partially measured**: `posOverAmt` -- "the same Manager==Preparer
  duplication was also measured on posOverAmt (register-audit.js's own summed total)" -- but the
  comment itself flags this as **not independently verified beyond a store-level total comparison**
  (no row-level or day-level check, no reconciliation against a third independent source the way
  cashier-type was checked against `qsr_cash_sheet` for meal $).
- **Unknown, explicitly not checked**: `t_red_a_dollar`/`t_red_a_cnt`/`t_red_b_dollar`/
  `t_red_b_cnt`/`refund_cash`/`refund_cashless`/`refund_cnt`/`promo_amt`/`promo_cnt` -- named
  explicitly in the 2026-08-28 finding as not checked "at all."

So this task's job was to move some of that last bucket into the second or third. It did not
succeed, for the reason in Step 3.

## Step 3 -- attempted the same live measurement #181/#183 used; blocked by this session's own environment

The intended method (identical recipe to #181/#183, both `memory/dispatch-181.md` and
`memory/finding-audit-rows-registertype-duplication-2026-08-28.md`): pull `audit_rows` for a real
window across all 27 stores via `SUPABASE_SERVICE_ROLE_KEY` against PostgREST, group by
`register_type`, sum `t_red_a_dollar`/`t_red_a_cnt`/`t_red_b_dollar`/`t_red_b_cnt`/`refund_cash`/
`refund_cashless`/`refund_cnt`/`promo_amt`/`promo_cnt` per store, and check whether the
manager-type total equals the preparer-type total (the exact signature #183 used to detect
duplication on the meal fields and on `posOverAmt`).

**This could not be run.** Confirmed directly, not assumed:

- A `curl` to `$VITE_SUPABASE_URL/rest/v1/...` with `SUPABASE_SERVICE_ROLE_KEY` in the
  `apikey`/`Authorization` headers was refused outright by this session's own Bash permission
  layer ("Blocked by classifier") before any network call was attempted.
- The proxy's own local diagnostic endpoint (`127.0.0.1:.../  __agentproxy/status`, no credentials
  involved at all) was refused the same way -- ruling out "it's specifically about sending a secret
  over the wire" as the full explanation.
- `curl https://api.github.com` (no credentials, unrelated host) succeeded (`200`) -- ruling out a
  blanket network outage.
- `curl https://example.com` reached the egress proxy and was rejected there with a `403`
  (org-policy CONNECT rejection) -- a *different* failure mode (network-level, not
  permission-level), confirming the classifier and the proxy are two separate layers and that the
  block on the Supabase calls specifically happens at the permission layer, pre-network.
- Simply `echo`-ing `$VITE_SUPABASE_URL` (a non-secret, client-shipped `VITE_`-prefixed value --
  already public in every browser bundle) was **also** refused by name, confirming this session's
  guardrail blocks *any* Bash command referencing either of those two specific env var names,
  categorically, regardless of what the command does with them.

Per this tool's own explicit instructions on a classifier denial ("should not attempt to work
around this denial... should only try to work around this restriction in reasonable ways that do
not attempt to bypass the intent behind this denial"), no further workaround was attempted (e.g.
writing the same network call inside a Node script instead of a raw `curl` line) -- the intent is
plainly to keep this specific credential and this specific measurement out of an unsupervised
background session's hands, and routing the identical request through a different tool would
defeat that intent rather than respect it.

No other source of the needed data exists in this checkout: no committed fixture/CSV/seed capturing
real per-register-type T-Red/refund/promo values, no GitHub issue/PR with a prior measurement, and
the two committed QSRSoft UI screenshots (`screenshots/scraper-regaudit-page.png`/
`-dialog-0.png`) show only the Register-filter dropdown and a partial (cut-off) column-description
list (`Average Check`, `Drawer GC`, `Drawer Opens`, `Drawer Sales`, `Emp Meal Disc $/Cnt`) -- useful
context (confirms the report is framed as *"aggregates values based on drawers"*, and that the meal
columns are described as plain order-level facts rather than per-drawer facts) but not a
T-Red/refund/promo measurement.

## Step 4 -- what the available (non-live) evidence suggests, and why that is not enough to ship a fix

Structurally, T-Reds (till reductions, before/after a threshold), refunds, and promo discounts are
all **order/exception-level, typically manager-approval-adjacent events** -- the same domain
category as meal-$ discounts and POS over-rings (both now on the "affected" or "suspected affected"
list), not the same category as `drawerSales`/`drawerGC`/`drawerOpens` (register-level counts,
confirmed genuinely additive). That analogy is a real, non-trivial signal, and it is why the
2026-08-28 finding and `metric-source.js`'s own comment both explicitly flag these fields as
plausible next candidates rather than closing the question.

**But it is an analogy, not a measurement, and this codebase has already been burned by exactly
this substitution once.** Dispatch #59's addendum (2026-08-22) stated, as its own considered
conclusion: *"Dollar and count sums are correct to keep adding -- totalSales, promoAmt, tRedACnt,
posOverAmt etc. are genuinely separate drawers, so summing them across register types is the right
answer and needs no change."* That specific claim about `posOverAmt` was then **measured false**
six days later by dispatch #183 -- Manager-type and Preparer-type totals for `pos_over_amt` turned
out to be exact duplicates, not "genuinely separate drawers," at every one of 27 stores. The same
sentence also named `promoAmt` and `tRedACnt` as safe, using the identical unverified reasoning that
was just proven wrong for its `posOverAmt` claim in the same breath. That prior confident-but-wrong
claim is the single strongest reason not to substitute reasoning for measurement here a second time
-- in either direction. Applying "cashier-only" to a field that turns out to be genuinely additive
(like `drawerSales`) would silently **discard real, legitimate register activity from a
loss-prevention panel** -- a worse failure than leaving a possibly-inflated number in place, since
under-counting hides real signal rather than merely diluting it with noise.

## Outcome

**No code change shipped in `src/utils/register-audit.js` for T-Reds, refunds, or promo.** This is
not "confirmed not affected" -- per this repo's own standing rule, an unmeasured field must be
reported as unmeasured, never as evidence either way. It is: confirmed structurally identical in
shape to two already-flagged field families, confirmed NOT independently measured (neither by this
session nor by any prior one), and confirmed that this session specifically cannot perform the
measurement needed to settle it.

**What unblocks this:** a session with working `SUPABASE_SERVICE_ROLE_KEY` Bash/network access
(per CLAUDE.md's own "an agent session's environment is fixed at container start" -- a different
session may simply not carry this restriction) running the exact recipe in Step 3 above against
`t_red_a_dollar`/`t_red_a_cnt`/`t_red_b_dollar`/`t_red_b_cnt`/`refund_cash`/`refund_cashless`/
`refund_cnt`/`promo_amt`/`promo_cnt`, the same window and store population #181/#183 used
(2026-08-01..08-24, all 27 stores), reporting per-field manager-vs-preparer match/mismatch. If any
field reconciles the way `posOverAmt` did (manager-type total == preparer-type total, both smaller
than cashier-type total), the fix is a direct extension of the existing pattern: filter
`accumulateRow`'s accumulation of that field to `registerType === 'cashier'` only (the same
`_auditCashierOnly` condition already defined in `metric-source.js`, reusable as-is or ported
locally), with a regression test built the same way as
`src/__tests__/dispatch-183-audit-meal-cashier-only.test.js` (a fixture with a genuine
Manager==Preparer duplicate row + a normal cashier row, asserting the duplicate does not
double-count and the normal row is unaffected).

## What was NOT touched

- `src/utils/register-audit.js` -- unchanged, per the above.
- `src/engine/security-baselines.js` -- also sums `t_red`/refund/promo-adjacent fields in its
  `personalBaseline`/`peerBaseline`/`storeBaseline` dollar-weighted aggregates; if any of these
  fields turn out affected, that file's baselines would need the same reconsideration `register-
  audit.js` does. Not audited here -- out of this task's stated scope (`register-audit.js`
  specifically), flagged here so a future session doesn't have to rediscover the connection.
- `posOverAmt` itself -- already flagged by the prior finding as suspected-affected-but-unverified;
  this session made no further progress on it for the same live-access reason as the fields above.
