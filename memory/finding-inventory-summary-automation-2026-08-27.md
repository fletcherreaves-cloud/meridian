---
name: finding-inventory-summary-automation-2026-08-27
description: Dispatch #178 — investigated both leads for automating qsr_inventory_summary before the 2026-08-29 EOM count. Lead A (a real QSRSoft "Inventory Usage"/Ending report) is strongly evidenced via the KB article's exact field match and the reporting/v2/food/ endpoint family already in use for FOB, but this session had ZERO QSRSoft credentials (verified via full env dump) so the endpoint could not be discovered/confirmed live. Lead B (deriving from qsr_onhand + qsr_raw_item_detail) is measured feasible only for a thin, non-representative WRIN slice (~9% of the catalog) and was not shipped because it can't be validated at full-catalog scope. Neither shipped. Panel's existing empty-state/manual-upload path reconfirmed working, unmodified.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Dispatch #178 — `qsr_inventory_summary` automation: what was found, why neither lead shipped

**2026-08-27, best-effort ask ahead of the 2026-08-29 EOM physical count.** Bounded investigation
of both leads named in `memory/dispatch-178.md`. Verdict: **neither ships today** — Lead A is
credential-blocked in this session (not a dead end, an unfinished one); Lead B is measured
feasible only for a slice too thin to safely relabel as `qsr_inventory_summary` two days before a
count the owner will act on. This file is the handoff for whoever picks either lead back up.

## Lead A — the report almost certainly exists; this session could not reach it

**The KB match is exact, not suggestive.** `qsrsoft_kb` (public-read Supabase table, queried live
with `SUPABASE_SERVICE_ROLE_KEY`, `content-range: 0-19/20` on a title search for "inventory") has
a real (non-video) article, **"Inventory Usage"**
(`https://support.qsrsoft.com/hc/en-us/articles/34843604092695-Inventory-Usage`), whose body text
defines the report as:

> Actual Usage is Starting Inventory + Purchases +/- Transfers - Waste/Promo - Ending Inventory.
> Usage per Day is Actual Usage divided by number of days on the report. Usage per thousand is
> Actual Usage divided by the product net sales... Filters: Class, Item number/description,
> Starting Business Date (up to 60 days), Ending Business Date, Display as Cases.

That is field-for-field `qsr_inventory_summary`'s shape (`startInv`/`purchases`/`endInv`/
`actualUsage`/`usagePerDay`/`daysSupply`/`caseSz`/`cost`) — Transfers and Waste are the only two
legs the target schema doesn't carry a column for (folded into `actualUsage` upstream, same as the
report does). The dispatch's named article ("Video - Inventory Summary and Usage Report",
`body_len: 260`, video-only) is a companion/marketing entry for this same real report — the actual
substance lives in the non-video "Inventory Usage" article.

`memory/qsrsoft-kb-digest.md`'s own "Food Inventory" summary corroborates from the reporting-UI
side: *"three tabs to use to view/track your inventory: Ending, On Hand, and Statistics. The
Ending Inventory provides inventory totals... On Hand... Inventory Stat compares expected usage
versus actual usage."* `On Hand` = already-pulled `qsr_onhand`; `Statistics`/`Inventory Stat` =
already-pulled `qsr_variance_stat` (theoretical vs actual, via `qsrsoft-variance-pull.mjs`'s eBOS
eastward path). **`Ending` is the one tab with no producer** — and its description ("inventory
totals... viewed as a chart") matches the KB article's start/end/usage shape, not a point-in-time
snapshot like On Hand.

**Where it likely lives, by pattern-matching already-confirmed endpoints (not verified live):**
`scripts/qsrsoft-pull.mjs` and `scripts/qsrsoft-explore.mjs` already hit a confirmed-working
`GET https://api.reports.myqsrsoft.com/reporting/v2/food/actual-food-over-base
?catalogType=actualFoodOverBase&nsd=d&nsn=<csv>&orgId=…&enterpriseName=McDonalds
&startDate=…&endDate=…&dsd=d&compType=calendar&daysOfWeek=1,2,3,4,5,6,7&weekStart=3`
— the exact reporting API family (`api.reports.myqsrsoft.com`, `X-Auth-Token`, `catalogType`-driven)
that `qsrsoft-ops-pull.mjs` and the four `finding-qsrsoft-*-endpoint-*.md` files also confirm for
`service/statistics`, `people/employee-roster`, etc. A sibling path under `reporting/v2/food/`
(something like an `ending-inventory`/`inventory-usage` route with a `catalogType` such as
`endingInventory`/`inventoryUsage`/`foodInventoryEnding`) is the natural place to look — but **this
is a hypothesis from pattern-matching, not a confirmed endpoint, and must not be treated as one.**

**Why it stops here: this session has zero QSRSoft credentials.** Checked directly (the standing
"measure it" rule) — a full `env | cut -d= -f1 | sort` dump (137 vars) contains
`SUPABASE_SERVICE_ROLE_KEY`/`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and nothing else
QSRSoft-related: no `QSRSOFT_TOKEN`, `QSRSOFT_USERNAME`, `QSRSOFT_PASSWORD`, or
`QSRSOFT_EBOS_TOKEN`. Every existing endpoint-discovery finding in this repo
(`finding-qsrsoft-service-statistics-endpoint-2026-08-21.md` and its three siblings) is explicitly
**"owner-captured"** — a human with a live QSRSoft session pulled the request from DevTools. That
is the established discovery method for a *new* endpoint in this repo, and it is not something an
agent session without QSRSoft credentials can do by itself, no matter how much time is spent. This
is a credential gap, not a time-budget one — the "few hours, not multiple days" the dispatch
allotted would not have changed the outcome.

**What a focused follow-up needs:** the owner (or a session with `QSRSOFT_USERNAME`/
`QSRSOFT_PASSWORD`, or a fresh `QSRSOFT_EBOS_TOKEN`/`QSRSOFT_TOKEN` capture) opens
`v3.myqsrsoft.com` → Reports → Food Inventory → **Ending** tab, opens DevTools → Network, and
captures the exact request URL + response shape — the same capture method that produced every
other `finding-qsrsoft-*-endpoint-*.md` in this repo. Once that capture exists, wiring it into a
new `qsrsoft-inventory-summary-pull.mjs` (mirroring `qsrsoft-ops-pull.mjs`'s `ENDPOINTS` pattern)
should be mechanical — the field mapping to `saveQsrInventorySummary` is already a near-exact
match per the KB article above.

## Lead B — derivable, but only for ~9% of the catalog; not safe to ship as `qsr_inventory_summary`

Measured live (service-role key) against store 3708 (the same store used throughout this repo's
other inventory findings):

- **`qsr_onhand`** upserts on `(loc, period, wrin)` — **one row per WRIN per MONTH, rolling-latest
  within that month**, not a daily series. Two periods exist so far: `2026-07` (259 WRINs for
  store 3708, `last_counted` clustered at `2026-07-30` — i.e. the last snapshot taken before the
  month rolled over, a reasonable end-of-month proxy) and `2026-08` (288 WRINs, still accumulating,
  `last_counted` dates scattered through the month as items get counted). So **`startInv` for the
  current period CAN be approximated** from the prior period's last on-hand snapshot per
  `(loc, wrin)` — but only back to 2026-07, since the pull itself only started then; there is no
  deeper history to backfill from (this table's own retention starts when the pull started, unlike
  the API-backed streams CLAUDE.md's backfill rule covers).
- **`qsr_ebos_daily`** confirmed (live row shown) to carry `food_purchases`/`paper_purchases`/
  `ops_purchases`/`hm_purchases`/`other_purchases` **per store per day, aggregate only** — no WRIN
  column at all. Cannot supply a per-WRIN `purchases` leg without inventing an allocation (splitting
  a category dollar total across dozens of WRINs by some assumed weight) — that would be
  fabricating data, not deriving it.
- **`qsr_raw_item_detail`** confirmed (live row shown, store 3708, period 2026-08) to carry **only
  27 WRINs** — matches the dispatch's "top ~20" description almost exactly (`|$| >= 50` actionable
  filter, capped at 20, dispatch #179 proposes widening to 50 but **has not landed** — checked:
  `ca6eb6a` only added the four `memory/dispatch-17{6,7,8,9}.md` files, no code). Each covered WRIN
  does carry a real per-event `history[]` (`pos_open`/`pos_sales`/`waste`/`comp_waste`/`invoice`
  entries with signed `qtyChange`) that a precise `actualUsage` COULD be summed from directly —
  more precise than an onhand-diff, in fact, since it doesn't need the start/end proxy at all.

**The math that rules it out:** 27 of 288 WRINs at store 3708 = **~9% catalog coverage**, and that
27 is deliberately the highest-`|$|`-variance subset, not a random or representative sample — it's
selection-biased toward exactly the items most likely to look anomalous. Writing a derived table
into `qsr_inventory_summary` (the exact table name the panel already reads as "the real thing") at
9%, non-representative coverage, two days before a physical count the owner is about to run
against the FULL catalog, risks the opposite of the intended help: a panel that looks fully
populated but is silently missing ~91% of items, with no per-row signal distinguishing "real for
this WRIN" from "not covered at all" (a covered-vs-uncovered WRIN looks identical — both are just
absent rows either way, no way to render "derived, thin" vs "cloud, complete" per the dispatch's
own bar: *"clearly distinguishable from a real pull in the data/UI"*, which a 9%-coverage table
cannot satisfy without also making every OTHER WRIN's total absence look like normal missing data
rather than "not attempted"). That is the "risky, rushed pull" the dispatch explicitly said not to
force. A derivation limited to the already-`qsr_raw_item_detail`-covered WRINs would also just
duplicate what the Diagnose / Item Journey panel already shows for those same WRINs from the same
table — no new coverage, just a second, partial view of data already visible elsewhere.

**What would make Lead B shippable later:** either (a) Lead A lands and supersedes this path
entirely, or (b) `qsr_raw_item_detail`'s per-WRIN coverage widens from the current top-20/27
toward the FULL catalog (dispatch #179's top-50 is one step in that direction but still far short
of "full catalog" — store 3708 alone has 288 WRINs), at which point the same `history[]`-summing
approach becomes a real full-catalog derivation instead of a 9% slice.

## Confirmed unaffected — panel's existing fallback path

Did not touch `src/views/inventory.js`, `src/lib/supabase.js`, or
`src/parsers/inventory-parse.js`. Re-ran the panel's existing cloud-wiring test suite unmodified as
a smoke check: `npx vitest run src/__tests__/inventory-cloud-wiring.test.js` → **12/12 passing**,
covering the "☁ no cloud data yet" empty-state badge, `mapInvClass` synonym handling, and the
manual-upload merge-as-gap-fill logic from #214. No code change in this dispatch; nothing to
version-bump.

## Related

- `memory/dispatch-178.md` — the task spec this answers.
- `memory/dispatch-179.md` — the top-20→top-50 `qsr_raw_item_detail` widening; not yet implemented,
  referenced above as a Lead B precondition it does not fully satisfy on its own.
- `memory/project-inventory-auto-wiring-214.md` — the panel wiring this finding's "confirmed
  unaffected" section re-verifies.
- Four `finding-qsrsoft-*-endpoint-*-2026-08-21.md` files — the established owner-capture method
  Lead A's follow-up should reuse.
