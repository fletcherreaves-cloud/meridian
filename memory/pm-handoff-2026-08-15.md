---
name: pm-handoff-2026-08-15
description: HANDOFF — full PM state as of 2026-08-15 15:30 UTC. Role, disciplines, PR board, engineer queue, owner action list, in-flight analysis threads, security debts, and the corrections register. Read this first if you are picking up the PM seat.
metadata:
  type: handoff
---

# PM handoff — 2026-08-15

Written at the owner's request because the PM session had grown too long and compacted badly (one
compaction retry lost the whole window). **Everything a successor PM needs to keep the tag-team with
the senior engineer running is in this file or linked from it.** Nothing here is inferred; every
number was measured or read off the repo/API.

---

## 1. The arrangement

Fletcher Reaves (**he/him**) owns and builds Meridian, a BI platform for ~27 McDonald's stores
(20 Oklahoma / 7 Florida, org **RKT Inc.**). He runs a two-session split:

- **PM (this seat)** — plans, prioritizes, scopes, writes issues and dispatches, reviews PRs by
  **independent measurement**, merges, and keeps `memory/`.
- **Engineer (separate session)** — implements, opens **draft** PRs, never self-merges.
- **Fletcher relays between the two.** He brings notes/screenshots/captures to the PM first; the PM
  writes the dispatch; he pastes it to the engineer.

Full rules, file ownership table, and the PM review checklist: **`memory/feedback-pm-worker-split.md`**
— read it, it is short and it is binding. The parts that get violated first:

- **PM never pushes to `main`.** PM lands its own docs by opening a PR from its branch and merging
  that (precedent: #293, #264, #258). Standing merge clearance is granted.
- **PM never writes `MERIDIAN_CHANGELOG`.** The engineer owns it. PM only verifies an entry exists.
- **One engineer task in flight at a time.** Queue the rest.
- **Before any merge: re-fetch `main`, read the DIFF, not the PR body.** Spot-check at least one
  concrete factual claim per PR.
- Build must pass and stay within **2.8 MB / 850 KB gzip** entry budget. Last measured on the #293
  merge: **509.64 KB gzip, 340.36 KB headroom**, 1370/1370 tests.

### Disciplines that carry forward (CLAUDE.md standing rules — do not relitigate)

Measure it, don't reason about it · no second guesses (a disproven hypothesis is followed by a
measurement, not another hypothesis) · data depth is never the limiter, backfill it · API over email
(email ingestion is forward-only) · auto/emailed-first, freshest-wins; manual is last-resort fill ·
never average averages, dollar-weight aggregates · source metrics through `metric-source.js` /
`vs-ly.js`, never raw rows in a panel · commit every `memory/` file in the same commit as the work
citing it · a commit body is the durable handoff — spell out what was deferred and why · **cite PR
numbers, not commit hashes, in anything that outlives a branch** (§7) · never break working features ·
speed check on every change.

**PM-specific discipline that has repeatedly mattered:** when the PM asserts something with a tidy
justification, the engineer should check it. Four times on 2026-08-10 a five-minute look would have
settled something the PM asserted from inference. See the corrections register in §7.

---

## 2. Where the code stands

**Merged in the last two days:** #280 (v5.011), #284, #282 (v5.012), #293 (docs).

**Merged 2026-08-15 (this session):** #297, #298 (v5.014), #301 (v5.015, +#306), #307, #308,
#310 (v5.017), #321 (v5.018), #309 (v5.019), #323 (v5.020), #325 (v5.021).
`main` at `799c8709`. Build **508.55 KB gzip / 341.45 KB headroom**, **1371/1371** tests.

> **Version numbering is not dense and that is fine.** v5.016 is unused — #309 was authored as
> 5.016, sat open while #310 and #321 landed as 5.017/5.018, and had to renumber to 5.019 to avoid
> walking `window.__MERIDIAN_VERSION__` backwards. `changelog-version.test.js` guards **desync
> between `changelog-data.js` and `changelog-latest.js`, NOT monotonicity** — a backwards version
> ships green. Check the ordering by hand on every changelog-touching PR; this was the single most
> recurring near-miss of the session.

### Open PRs — the live board

| PR | What | PM state |
|---|---|---|
| **#292** | #291 Product Mix real pull | **REVIEWED 08-15, held** — `nsd=d` is now a code test, not a capture request; see below |
| **#286** | v5.013 — #276 step 2, lone-red → `var(--crit)` | **HELD** — needs rebase **and renumber** (5.013 is now eight versions below `main`) |
| **#269** | #263 + #265 pull-failure detection + completeness ledger | **HELD** — owner must run the SQL; plus one residual |

### The OT/labor thread, closed out (#322 → #323 → #324 → #325)

Owner reported OT Cost reading `—` everywhere, then `0.0`/`$0` after the first fix. Three distinct
causes stacked, found in order, each only visible once the one above it was removed:

1. **#323 (v5.020)** — `qsrsoft-ops-pull.mjs` read `process.env.QSRSOFT_TOKEN` directly: a ~1h-TTL
   Cognito token in a GitHub secret, stale ~23 of every 24 hours. Converted to `getFreshToken()`,
   made the cache expiry-aware (decodes the JWT `exp`, 5-min margin) because the script is
   backfill-capable and a ~1.5h backfill outruns a ~1h token. Owner authorized a full backfill:
   **36,913 rows** added, gaps closed to 2024-01-01.
2. **#325 (v5.021)** — the data then reached `ds.opsLaborRows` and stopped. `LaborAnalyticsPanel`
   never called the resolver; `grep -n opsLaborRows src/views/labor-tools.js` returned **one** hit,
   a comment on the *other* panel. Five metrics routed through `metricAvg`; `otCostEst`'s
   `hrs×0.5×rate` estimate retired (1647/1647 rows carry the real dollar figure).
3. **#327 ✅ SHIPPED v5.022** (was: Labor % on At A Glance reads "No labor data" while Labor
   Analytics shows 22.47%). `laborPct` got a `derive` fallback — crew labor $ ÷ DAR sales — on
   `tpph`'s precedent. Both legs were wrong in the first pass and were corrected against real
   data: `gross_dollars` includes salaried-manager pay (store 6178, gross 2978.60 vs crew 2661.50,
   a $317.10 gap that IS that day's `salaried_manager_dollars`), and `net_sales_amt` carries a
   ~0.2–0.3pp low bias where `product_sales_amt` reconciles. Units confirmed as a fraction, so
   `d/s` not `d/s*100`.

   **Shipped knowingly at 89.8%** (582/648 store-days within 0.001). The deciding fact: the derive
   is **last-resort only** — `metric-source.js:491` skips it whenever a real source answered — so
   it can only ever replace a **blank**, never a better number. "Within 0.1pp nine days in ten vs
   nothing" is an easy yes; it would have been a hard no if it could displace a real value.

   ⭐ **The verification took two passes and the first was a tautology — this is the reusable
   lesson.** It built `glimpseRows` into the `ds` and compared `metricSeries('laborPct')` against
   Glimpse. But the derive is a *fallback*, so the resolver returned **Glimpse's own value** and
   the comparison was Glimpse against itself: a perfect 192/192 that **would have passed with the
   derivation deleted.** Two tells caught it: 8 stores × 24 days = *exactly* 192 with zero gaps
   anywhere (real float division across two tables never agrees to 4dp on 100% of a sample), and
   the engineer had already used the strip-`glimpseRows` trick for their `avgRate` check but not
   for the reconciliation. **Ask of any verification: would this still pass if the feature were
   removed?** The honest re-run (582/648, 66 documented misses) is a *better* result than the
   perfect one. The 192/192 is preserved in-code as a documented retraction.

4. **#330 (open)** — the residual 10.2%. `laborPct`'s derive divides a **calendar-day numerator by
   a trading-day denominator**: `labor-summary` pulls `compType:'calendar'`
   (`qsrsoft-ops-pull.mjs:94`), the DAR `daily-activity-raw` pulls `compType:'trading'`
   (`qsrsoft-dar-pull.mjs:260`).

   ⭐ **UPGRADED 2026-08-16 — the owner supplied the missing number: the business day runs
   4:00am → 4:00am.** That turns an abstract "different buckets" story into a specific **4-hour
   offset on both ends**: calendar day N's labor carries 00:00–04:00 of N (which belongs to
   business day N−1) and omits 00:00–04:00 of N+1 (which belongs to business day N), while the
   sales denominator covers 04:00 N → 04:00 N+1. The 00:00–04:00 block is overnight close/clean
   and late-night volume — staffed but low-sales — so the mispairing is between blocks of
   *unequal* labor-to-sales density, which is why the error is day-specific (heavier Fri/Sat
   late-nights) rather than a fixed per-store offset. That is exactly the measured shape: 66 misses
   over 25/27 stores, none at 100%, mean **+0.0050**, skewed 58 positive / 8 negative.
   Now recorded in **CLAUDE.md's Organization Context** as a standing fact, not just a #330 detail.

   🔻 **PARTLY REFUTED SAME DAY by prior art the owner remembered having done.** He said *"I feel
   like I addressed this in a previous session"* — he had, in three places, and searching for them
   first was worth more than the hypothesis was:
   - **`src/utils/date.js:101,117`** — `businessDate()` / `lastClosedBusinessDay()` already
     implement the 4am ABC cutover. Recurred **five times** as "signature #4"
     (`plan-data-integrity-sweep.md`) before becoming one shared helper. Never re-derive it.
   - **`memory/dar-vs-ops-reconciliation.md` (2026-08-07)** already tested the boundary for this
     exact denominator and **ruled it out**: DAR `hour_slot` runs `05:00 → 28:00`, 24 slots
     covering 04:00→04:00 — *"DAR **is** business-day aligned."* Corroborated by
     `project-hourly-projection-accuracy.md:81`.

   **So the denominator is not the misaligned leg.** What survives: `compType:'trading'` ≈ the 4am
   business day (supported — the DAR uses it and is confirmed aligned). What's left of #330's
   original story: only whether `labor-summary`/`'calendar'` is midnight-aligned, on the
   **numerator** side. Still unconfirmed.

   🔴 **Better-fitting hypothesis, from that same doc — test FIRST because it costs one query.**
   Its ~0.01% deltas hold only *"on days with a complete 24 slots"*. A DAR day **missing slots**
   understates the sales denominator and **inflates** derived `laborPct` — which predicts positive
   skew (measured 58/8), day-specific not per-store (measured, 25/27 stores none at 100%), and a
   minority of days (measured, 66/648). It also explains store 31357 on 07-19, where #329 found
   *neither* sales column reconciles — a short day explains that, a boundary offset doesn't.
   `qsr_daily_activity` is keyed `(loc, dt, hour_slot)`, so it's `count(hour_slot)` per store-day,
   no re-pull and no writes. If confirmed, the fix is a **completeness guard** (don't derive on an
   incomplete DAR day; return null so the tile reads "—"), which is also more consistent with
   #303/#309's null-vs-zero work than shipping a confidently inflated ratio.

   ⚠️ **Do NOT collapse two findings that wear similar percentages.** `dar-vs-ops`'s 77→87%
   agreement and #329's 89.8% invite "same phenomenon." The arithmetic refutes it: that doc's
   residual is ~0.01% on sales → ~0.002pp on a labor %, three orders of magnitude short of the
   +0.5pp here. The definitional sales gap is real, documented and accepted; it does not explain
   #330. Test is one parameter and proven in-repo (`qtr-hr-sales`
   uses `trading` in the same script). **Do not flip it in production first** — `compType` is
   shared by five sub-endpoints there, and three of them feed tiles that currently reconcile fine.
   Re-measure the 89.8% if it lands; that number lives in three files.

**#324 CLOSED 2026-08-15, owner-confirmed on his own screen** — `OT HRS/DAY 1.5`,
`OT COST $24,352`, `ACT VS NEED +3 hrs`, and per-store OT cost varying store-by-store
($1,358 / $773 / $457 / $392 / $173 / $73) with the colour thresholds firing. The per-store column
is the real proof: it was `—` on **every** row before. Holding the issue open for his screen rather
than closing it on the engineer's (correct, real-resolver) numbers was the right call — v5.020 had
already been correct-and-still-broken once.

Expected and **not** a failure: a store with genuinely $0 OT still renders `—` per-store, because
that cell gates on `otCost>0`. Pre-dates #325, left alone on purpose. The district total
distinguishes null from zero correctly. Next null-vs-zero pass should convert the per-store row.

### Open issues that are now the real queue

| Issue | What | State |
|---|---|---|
| **#312** | Mint the QSRSoft Cognito token at runtime | **probe dispatched 08-15** — see §3 note 1 |
| **#296 step 2** + **#303** | Remaining ~265 white-alpha sites; `actVsNeed` sourcing | **dispatched 08-15**, land together |
| **#311** | Fallback masks token expiry | **superseded in part by #312** — do #312 first |
| **#306** | Bullseye dark-mode tab | ✅ closed via #301 |
| **#348** | Scheduling/Opportunity Need+Scheduled+Labor% all wrong | ✅ **FIXED v5.029 (#354)** — engine helpers exported + imported, as prescribed |

**#348 is root-caused — it is a formula diff, not a debugging job.** `views/scheduling.js` and
`engine/schedule-summary.js` compute the same three figures from the same `schedRows`, differently.
Schedule Summary is right (tested against LifeLenz); Opportunity is wrong three ways:
`schedHrs` omits `schFloor` (`:452`); `needHrs` uses `needVLH` where the forecast is `projVLH` **and**
omits `projFloor` (`:451`); `avgLaborPct` (`:475`) is a plain mean of daily percentages with no
`normLaborPct` 3–70% band, so one mid-day partial row (labor accrued, sales not yet landed → 400%+)
produces the 655.24% on screen. Duncan `0029760`, week of Aug 12: Need **705 vs 1541**, Scheduled
**2204 vs 2329**, Labor % **655.24% vs 23.35%**.

The fix is to **export `schedHrsOf`/`fcstHrsOf`/`normLaborPct` from the engine and import them** — not
to patch three lines. Two panels disagreeing on the same number from the same rows *is* the defect, and
this file already proves a private copy doesn't hold: `wAvgLaborPct` sits at `scheduling.js:22`,
written for exactly this, exported, and not called by the broken line 45 lines below it.

**Shipped as v5.029 (#354)** exactly as prescribed — helpers exported from the engine and imported,
not three patched lines; regression test on the real Duncan rows, confirmed red against stashed
pre-fix code. **One residual, filed as #361:** the panel now reads 23.29% where Schedule Summary
reads 23.35%. `rollup()` weights `laborPct` by `fcstSales`; `wAvgLaborPct` weights by actual sales.
Since `laborPct = labor$/actualSales`, actual-sales weighting is the leg that reconstructs
`Σlabor$/Σsales` exactly — **the newly-fixed panel is right and the engine is the wrong one**, so
the follow-up belongs in `rollup()`. Merged over 0.06pp rather than holding a good fix.

**Contaminated by it:** `distTot` (`:484`) → the district story (`+$207,944`, `27 stores over target`),
and `scheduling-deck.js:59-63` renders those totals into the **exported slide deck**, so wrong numbers
have been leaving the app. **Separate, file it:** `TA_DATA` (`scheduling.js:55`) is a hardcoded
"Jun 1–28, 2026" literal — the source of `2,455 missed shifts`, and it will read as current forever.

**#296 step 2 is not the low-urgency half, and the reason is an identity, not a threshold.**
White-alpha over a white surface *is* that surface, so every alpha from `.01` to `.85` composites to
the identical pixel on the two pure-white light themes (`command`, `dualbrand`) — measured against the
built `dist`. Of the 265 remaining sites, **23 are colour-role: invisible TEXT**, which reads to a user
as "no data" rather than as a rendering fault. Light is the shipped default (owner-confirmed), so this
is the default path. **`at-a-glance.js:2134` is not a colour fix** — it shares `actVsNeed` with #303,
both panels bypass `metric-source.js`, and `at-a-glance` additionally calls `avgOf` without `anyMode`,
dropping every negative and zero. It biases the number positive and then paints positive white-on-white,
so fixing only the colour would surface a systematically wrong value. Route both through
`metricAvg(ds,loc,range,'actVsNeed')`.

**#292's blocker, quantified:** a primary key of `(loc, date, item)` drops **127 of 441 rows (29%)**
and retains only **42% of dollars**, non-deterministically — and the rows it drops are exactly the
**price tiers the issue exists to measure**. The PK must include the price point.

> ⚠️ **CORRECTION (2026-08-15, verified on the branch): the PK rebuild is DONE. Do not dispatch it.**
> `supabase/schema-product-mix.sql` on `claude/issue-291-product-mix-pull` declares
> `primary key (loc, date, item, price)`, and `savePmixRows` upserts on
> `onConflict: 'loc,date,item,price'` to match. The engineer corrected it *before* this handoff was
> written; the board entry above was never updated. This is the CLAUDE.md "verify against the actual
> code before assuming a next-up item is undone" rule earning its place a second time — dispatching
> the rebuild would have been a duplicate reimplementation of work already sitting in the PR.
>
> **#292's real remaining blocker** is the one the PR body flags itself: `mapRow()`'s
> `loc: nsn7(r.storeNum ?? r.nsn ?? '')` is a **guess**. #293's capture was single-store, so the field
> QSRSoft uses to identify the store in a genuine multi-store response is unconfirmed. If wrong it
> fails closed — drops rows rather than misattributing them — and silently upserts **zero** rows with
> no error beyond a debug log. Needs a real multi-store capture (**strip `x-auth-token`**) or a
> watched first live run. #292 needs a PM review, not an engineer dispatch.

> ⚠️ **UPDATE (2026-08-15, measured on two new owner captures): the multi-store capture arrived, and
> it reframes this blocker.** The store field was never missing because `mapRow()` guessed the wrong
> name — it was missing because **`nsd=s&dsd=s` asked the API to roll the stores and dates away.**
> Evidence, all measured: a `product/outages` call with **`nsd=d&dsd=d`** returned 27 stores × 14 days
> in one request with **`storeNum` and `date` on every row** — neither of which was in `selectCols`,
> so the API supplies grain columns once the grain is requested. A `menuPriceComparison` call with
> `nsd=d` returned `nsn` per row. Both existing `product-mix-bundles` captures used `nsd=s&dsd=s` and
> returned neither. Separately, the owner's 2,485-row Product Mix payload was **proven** to be a
> multi-store roll-up by price-book cross-match (list-price dollar share 23.9% against one store's
> book → 39.2% against three; Big Mac at 12 price points where three stores list three).
>
> **The test is one capture: re-run `product-mix-bundles` changing only `nsd=s&dsd=s` → `nsd=d&dsd=d`.**
> If it confirms, #292 is one request per day rather than 27 and `mapRow()` reads a real field. If it
> refutes, #292 must pull one NSN per request and stamp `loc`/`dt` from the request parameters, never
> from the response. **This is a hypothesis with a named test — do not build on it until the capture
> lands.** Full evidence table in `memory/qsrsoft-report-catalog.md`.

**#269's residual:** in `scripts/check-data-completeness.mjs`,
`if (inc.date_start < startDate || inc.date_end > endDate) continue;` means an out-of-window incident
can **never** close. `DAYS_BACK` defaults to 60; `printRanking()` lists *all* open incidents ordered
by `detected_at` ascending.

### Engineer queue (dispatch order, as sent)

#295 ✅ → #296 step 1 ✅ → #294 ✅ → #312 probe ✅ → #321 ✅ → #323 ✅ (+ backfill) → #325 ✅

**Next: #292, #286, #269** — with **#330** (the `compType` boundary mismatch) available whenever
someone wants a self-contained, well-scoped piece. #330 is *not* urgent: v5.022 already closed the
user-facing gap, and #330 only tightens the residual 10%.

**The stop-condition pattern worked and should be reused.** #327's dispatch stated the blocking
measurement as a stop condition, not a suggestion — *"if Glimpse is current through Aug 15 the
premise is refuted; re-diagnose, don't build anyway."* The engineer measured it first
(`max(date) = 2026-08-11`) and reported it before writing code. Write dispatches that way.

**Note the column names differ across these tables** — `daily_glimpse_daily` uses `date`,
`qsr_labor_summary` uses `dt`. Cost a round of 42703 errors; check before querying.

**The PM environment cannot verify any of this.** Anon returns `[]` on `qsr_labor_summary`,
`daily_glimpse_daily`, `cash_sheet_daily`, `sales_ledger_daily`. Confirmed that is RLS and not
absence with the discriminating test — `qsr_labor_summary` returns `content-range: */0` for
**2026-08-11**, a date #323 measured at 135 rows via service-role. **Run that test before treating
any empty anon result as a finding**; it is two seconds and it is the difference between a
measurement and a fabrication.

**Held deliberately, do not dispatch:**
- **#312 scope 4** (deleting the `QSRSOFT_TOKEN` / `QSRSOFT_COGNITO_TOKEN` secrets) — waits until
  the converted pulls run green on their *real* schedules for several consecutive days. A
  `workflow_dispatch` run proving out is not the same as the cron proving out.
- **#311** stays open until all 14 QSRSoft scripts convert. Two done (`turnover-pull`, `ops-pull`),
  **12 queued** behind the same several-days bar.
- Both were converted on the same premise; converting the remaining 12 before that premise is
  tested on a real schedule would multiply an unverified change by twelve.

---

## 3. What the owner owes (his action list — keep it in front of him)

1. ✅ **Cycle the QSRSoft session — DONE 2026-08-15**, and both token secrets rotated. **Do not
   re-raise the cycle itself.** Strip `x-auth-token` from every capture regardless; never write one to
   a file or a commit.
   ⚠️ **But rotation is a stopgap that cannot hold, and this is the important part.** The two secrets
   are **one credential** (owner-confirmed; `qsrsoft-variance-pull.mjs:176` falls back
   `COGNITO || TOKEN`), and it is a Cognito **ID token with a ~1h TTL**
   (`qsrsoft-variance-pull.mjs:74-77`). A stored secret is therefore expired for ~23 of every 24
   hours, so **all 14 QSRSoft scripts have been running on the Playwright fallback permanently, by
   construction** — the leg CLAUDE.md records as unreliable as of 2026-08. This was already visible
   and mis-filed as a performance note on 2026-07-28 (*"stale/401 — refresh for faster runs, not
   blocking"*). **#312 is the fix**: mint the token per-run via Cognito `InitiateAuth`, delete both
   secrets, and the "paste a live token" exposure stops existing as a category. Config is already
   known — pool `us-east-1_OdhPNFLDP`, client `2vt4qrqcakbeo9sh0ivli3lbui`, `us-east-1`, using the
   existing `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD`. Confirmed clear: not federated SSO
   (`qsrsoft-ops-pull.mjs:197-201` fills a plain email/password form, no IdP redirect) and **MFA is
   off** (owner-confirmed). Expect SRP rather than `USER_PASSWORD_AUTH`.
2. **Run `supabase/schema-data-completeness.sql`** — this is the only thing blocking #269.
3. Rate the **remaining 12 stores** — the cohort closes **2026-09-03**.
4. **Reconcile the 5-of-20 binary to exactly five** *before* looking at scheduling data.
5. Send the **marketing-calendar archive URL** (weekly, archived; #290).
6. **Confirm actual price actions and effective dates** — he has said participation was minimal:
   *"WE DID NOT PARTICIPATE IN THE WHOLE PRICE CHANGE STRATEGY."*
7. Find the **1-800 external source**; assign the **CRCP designee** (`customerfeedback@myqsrsoft.com`).
8. **Delete the roster workbooks** — they carry SSNs, DOBs, addresses.

**WITHDRAWN — do not re-ask:** "send a capture with `discAmt` in `selectCols`." There is no `discAmt`
field. The identity is **`adjPmixSales = dollarsSold − offerAmt`**, verified at two levels on the real
export (Hamburger subtotal 777.91 − 15.76 = 762.15; the $1.89 tier 253.26 − 5.67 = 247.59). Select
`adjPmixSales` and the subtraction happens server-side.

**Also closed:** "one capture with `poo` ≠ Combined" — his UI screenshot answered it. `poo` is
**Combined / Delivery / Non-Delivery**, a delivery flag. It is **not** point-of-origin; Product Mix
cannot split drive-thru vs front counter vs kiosk. That line of inquiry is closed negatively.

---

## 4. The captures he sent just before the session died — all processed

All landed on `main`. **Cite them by PR number, not by commit hash** — #304 was squash-merged, so the
four hashes its own body cited (`6d732fd`, `771b186`, `7a7611a`, `e181773`) never existed on `main` and
resolve nowhere once the branch ref is gone. Pre-squash → landed mapping, recorded once for anyone
decoding an older reference: all four collapsed into **`0359b4e` (#304)**.

- **#293** (`a0d9c7e`, a true ancestor of `main`) — `product-mix-bundles` / `menuitems` / `qtr-hr-sales`.
  Endpoint `/reporting/v2/product/product-mix-bundles`, `catalogType=productMix`. Grain is
  **(item, price point)**, not item — 441 rows over 314 item numbers, 116 items at >1 price. So
  **never** recover realized price as `dollars ÷ units`; it would read a mix shift as a price change.
  `dollarsSold == price × soldQty` exactly (0/441 exceptions) → gross, carries no discount, overstates
  net by 2.9% on that store-day and the overstatement *is* promotional intensity. `promoQty` and
  `offerAmt` are different measures (15 rows have one without the other and vice versa) — carry both.
  `promoQty` gives **direct free-item detection**, which turns the FBP monthly-GMA-offer confound from
  an assumption into a measurement. Volume: ~11,900 rows/day district-wide, ~4.3M/year; 21 rows per
  store-day are `soldQty 0` catalog placeholders (filter on ingest).
- **#304** — the UI filter surface and the **hierarchical Excel export**. Measured
  on 535 items / 4,539 rows: subtotal row + detail rows + a grand-total row. Naive summation gives
  Units Sold **311,769 vs a true 103,923 (×3.00)** and Units Wasted **13,911 vs 1,205 (×11.54)**.
  `parsePMixData` does exactly the naive thing. Detecting the subtotal by "Price contains a range"
  misses 80 single-price items — group by item number, take the first row, drop the grand total by its
  empty `Desc`.
- **#304** — **`api.sso.myqsrsoft.com/user/settings` returns EVERY report's
  `*/defaultColumns`**, not just the one requested. That is the canonical API field vocabulary for 13
  reports; read field names from there instead of reverse-engineering Excel headers (the export renders
  `priceRange` as "Price" and `adjPmixSales` as "Adj PMIX Sales", neither of which `selectCols` wants).
  Gap-closers found in it: `operationsReport/controls` carries **`overTimeHours`, `overTimeDollar`,
  `avgRate`, `actualVsNeeded`** — the exact inputs Labor Analytics is missing; `analysisSummary` carries
  per-position over/under; `mcDelivery3POReport` carries per-vendor `avgCSat`; `dailyGlimpse` carries
  `dtCars_*` peak car counts.
  **PII: `storePeoplePunches` lists `ssn`. Never select it, never let it reach Supabase, never log it.**

All of it lives in **`memory/qsrsoft-report-catalog.md`** (1,590 lines) — the single best artifact of
the last three days.

---

## 5. PM debts

**Cleared while writing this handoff — both were unfiled and both are now issues:**

- **#302 — `parsePMixData` sums a hierarchical export as if it were flat.** A commit body in #304 had
  declared this "Filed separately" and it never was; that dangling claim is now closed. Panel family
  totals **×3.00**, waste **×11.54**, and on a default export `Family Group` is absent so every row
  falls to `'Other'` and the by-family breakdown silently collapses into one bucket. Three of the four
  failure modes are live in production today. The API path is unaffected (flat rows, `familyGroup`
  inline), but a fallback that is 3× wrong is worse than no fallback.
- **#303 — Labor Analytics renders OT COST as "$0" for all 27 locations.**
  `src/views/labor-tools.js:1764` falls to `0` when `otHrs` or `avgRate` is missing, while the adjacent
  OT HRS/DAY column correctly renders "—" from the same missing data. Filed together with the At A
  Glance "No labor data" vs Labor Analytics 22.47% inconsistency, the "+0 hrs" Act-vs-Need column, and
  the #304 finding that `operationsReport/controls` already exposes `overTimeHours`,
  **`overTimeDollar`** (the actual figure, not this panel's `hrs × 0.5 × rate` estimate), `avgRate` and
  `actualVsNeeded`.

**Still owed:**

1. **Promo/Discount ROI reads negative for every store** — suspected denominator artifact from
   promo-heavy classification. Investigate, then file.
2. **Re-post consolidated #291/#292 guidance** covering the UI filter surface and the workbook
   structure.
3. **McValue FBP document edits before 25 August** — split B1 out, name the calendar events, state the
   LY-asymmetry bound. Workspace: `memory/project-mcvalue-2-fbp-document.md`. **This has a hard
   external deadline and is the only externally-dated item on the board.**

Already filed and needing no further PM work: **#299** (FOB Root-Cause Matrix claims to exclude Base
Food, then ranks it #1/#3/#5 — `analytics.js:3178`, the `actionable` flag is set on zero of the 10
`FOB_COMP` entries; one-line fix) and **#300** (6-Week District Sales Trend has no completeness guard
on either window — one week reads **+391.69%** and flattens the other five; `at-a-glance.js:1349`).

---

## 6. In-flight analysis threads

- **McValue 2.0 FBP document — due 25 August 2026.** `memory/project-mcvalue-2-fbp-document.md`.
  Method: difference-in-differences on **14-day Wednesday-anchored blocks** against inline `ly_` twins,
  **364-day** LY alignment. Both headline findings are **overstated** by a confound the PM found: the
  monthly GMA free-item incentive ran continuously through 2025 but only Jan–Mar 2026, so it cancels in
  the pre-period and **not** in the post-period. FIFA World Cup HM was a **demand** failure, not an
  execution failure — owner confirmed. The +10.4¢ check gain is **1.05% of a $9.909 average check**
  (independently cross-validated against At A Glance's $9.94).
- **District OSAT decline.** Measurement-artifact explanations closed from both directions: volume
  (MoM r=0.137, ns) and channel mix (DT share recovered algebraically as
  `dtShare = (overall − fcPct)/(dtPct − fcPct)`, ~42% and flat, t=1.47, ns). Florida is **66.1% over
  7.5 months, 3.9pp below** its flat 0.70 target — and that flat 0.70 is a sheet-population artifact
  from initial target setting, not a considered decision. Targets are **per-store** (OK 0.82–0.92) and
  live in the yearly targets Excel; never grade VOICE against a flat threshold.
- **`store_assessments` rating schema — FINAL.** `loc, assessed_at, assessor, program, dimension,
  rating, note, tenant_id`; **immutable — corrections are new rows, never updates**. Three dimensions:
  GM engagement / Scheduling-manager engagement / Execution confidence, all three-valued. "Compared to
  average" was dropped. Multi-rater (DO/supervisors rating independently) is **deferred to a future
  program** — his decision. `memory/notes-66-staged-experiments-and-risk.md`.
- **Light-mode theme debt.** 427 hardcoded white-alpha values vs 1135 correct `var(--bdr…)` sites —
  **73% adoption**. Meridian is dark-first so the four light `html[data-theme][data-mode]` blocks are
  effectively unreviewed. #295/#296 came out of one phone screenshot.

---

## 7. Corrections register — mistakes already made, do not repeat them

Recorded because they are the cheapest thing a successor can inherit.

- **Graded VOICE against a flat ≥90% OSAT threshold.** Targets are per-store and in the workbook.
- **Concluded "Florida is at target" from 13 days.** Over 7.5 months it is 3.9pp below. Short windows
  land on the right number by chance; that is the exact trap.
- **Inferred Florida got 0.70 "because it had no history to individualize from"** — read an empty
  spreadsheet cell as a fact about the world. It has history.
- **Nearly reported Aug-vs-YTD +1.9pp as recovery** — n=723 → SE 1.52pp, so 1.25 SE, *and* YTD
  contains August.
- **Speculated `poo` was point-of-origin and called it "a bigger unlock than the price question."**
  Wrong; closed by a screenshot. An explicit ⚠️ CORRECTION is written into the catalog.
- **Suspected #282's dots would render black.** Measured with Playwright instead of asserting: `var()`
  resolves in the React attribute path too (`rgb(16,185,129)`). The engineer's *code* was right; only
  their *stated mechanism* was wrong. Recorded in the merge commit rather than silently dropped.
- **A script reported a global ×3.000 ratio while item 1 plainly showed ×2.** Printed the rows instead
  of theorising and found the grand-total row. That is the habit.
- **Could not measure Supabase contents** — the anon key returns zero rows under RLS. That is RLS, not
  absence. Never report an unverifiable count as confirmed.
- **Wrote a stale blocker into this handoff without checking the branch — in the document whose whole
  purpose is to prevent that.** §2 said #292's primary key still needed rebuilding and "do not merge
  until the rebuild lands." The engineer had already fixed it: the branch declares
  `primary key (loc, date, item, price)` with a matching `onConflict`. The next PM caught it before
  it became a duplicate dispatch, which is the review gate working. This is the CLAUDE.md rule
  *"before assuming a 'next up' item is undone, verify against the actual code"* — a rule added after
  a near-duplicate reimplementation — earning its place a second time, and the second time it was the
  PM who tripped it. **A handoff board entry is a snapshot; verify any 'still open' item against the
  branch before dispatching from it.** Owner's own note on this: the register is more useful than the
  board.
- **Framed an expected database behaviour as a caveat.** Reported `qsr_daily_activity` timing out on
  an unfiltered `select=*` as though it constrained how a measurement should be scoped. It is a table
  of 27 stores × hourly slots × years with a dedicated index file
  (`supabase/schema-qsr-daily-activity-index.sql`, indexed on `dt`) — an unfiltered scan timing out is
  what that table is supposed to do. Filter by `loc` and a date range. Scope a query around the index,
  not around the symptom.
- **Cited pre-squash commit hashes in durable docs, then squash-merged them out of existence.** This
  handoff and issues #302/#303 pointed at `6d732fd` / `771b186`; #304 squashed four commits into
  `0359b4e`, so those SHAs were never on `main` and every citation was dead on arrival. It was invisible
  from the authoring session because that container still had the branch checked out — the hashes
  resolved locally and nowhere else. **Rule: in anything that outlives a branch — memory files, issue
  bodies, PR bodies — cite the PR number.** PR numbers survive squash, rebase, and branch deletion;
  branch SHAs survive none of them. If a hash is genuinely needed, verify it with
  `git merge-base --is-ancestor <sha> origin/main` **before** writing it down, and never verify a
  cross-session reference from a working copy that still holds the branch.
- **⭐ Told the owner a metric had "no cloud stream behind it" — about his own auto-pulled data.**
  Wrote in #322 that `otHrs`/`otDollar` source only from `opsLaborRows`/`ctrlRows`/`laborRows`, "all
  three manual uploads." Owner: *"not accurate and has been an ongoing patch to data sources… All of
  this data is auto pulled as well."* He was right. `loadOpsLaborSummary` (`src/lib/supabase.js:2242`)
  reads `qsr_labor_summary` — an **auto** table — and maps `over_time_total_hours`/`_dollars` straight
  into `opsLaborRows`. The chain was built and correct; it was *empty*, for an unrelated reason
  (#323's token). **A source name in `METRIC_SOURCES` does not tell you whether it is manual or auto
  — follow it to its loader before characterising it.** Worse, `changelog-data.js:434` already
  documented this. The correction was written into #322 as a banner rather than a silent edit.
- **Diffed a PR against `origin/main` and nearly rejected a good one.** #309 showed 40 files /
  1,359 deletions — including my own memory docs — because the branch was behind `main`. Real diff
  via `git merge-base`: **4 files, 39 insertions.** `git diff origin/main..branch` is a lie for any
  behind-main branch. Always `MB=$(git merge-base origin/main <branch>); git diff $MB..<branch>`.
- **Dispatched an instruction the engineer refused, and the engineer was right.** Told them to remove
  `QSRSOFT_COGNITO_TOKEN` from `qsrsoft-inventory-history-pull.yml`; they measured instead of
  complying. `scripts/lib/ebos-auth.mjs:116` reads it as the primary env var. **An engineer pushing
  back with a measurement outranks a PM dispatch written from a grep.** Verify, then concede plainly.
- **Declared a question "closed for good" before testing the one control that could reopen it.** Said
  the Product Mix store question was settled; the owner found a `Show Location Names` toggle minutes
  later. His test confirmed the original conclusion — *and that is not exoneration.* A conclusion that
  turns out true is not evidence the reasoning behind it was sound. Retracted in writing anyway.
- **Asked the owner to re-capture a request with modified parameters.** He runs the reports **from the
  website**, not from DevTools — he cannot edit a query string. Route parameter experiments to the
  engineer as a code test; ask the owner only for what a UI can actually produce.
- **⭐ A verification that would still pass with the feature removed (caught at review, #329).** The
  reconciliation built `glimpseRows` into the `ds` and compared `metricSeries('laborPct')` against
  Glimpse — but the derive is a **fallback** (`metric-source.js:491` skips it when a real source
  answered), so the resolver returned Glimpse's own value and the test compared Glimpse to itself.
  It reported a flawless **192/192**. The honest re-run was **582/648**. **Standing question for
  every verification, yours and the engineer's: would this still pass if the feature were deleted?**
  The tells were both statistical and behavioural — 8 stores × 24 days = *exactly* 192 with zero
  gaps (real division across two tables never agrees to 4dp on 100% of a sample), and the author had
  already applied the strip-the-winning-source trick to a *different* check in the same PR. **A
  suspiciously perfect number deserves more scrutiny than a mediocre one**, and 66 documented misses
  is a better deliverable than a perfect result nobody can reproduce.
- **⭐ Built a hypothesis on a question the repo had already answered, and wrote it into CLAUDE.md
  before searching (#330, 2026-08-16).** The owner supplied "the business day runs 4am–4am"; I
  turned it into a 4-hour-offset story about DAR sales and committed it. *He* then said *"I feel
  like I addressed this in a previous session"* — and he had:
  `memory/dar-vs-ops-reconciliation.md` had tested that exact boundary on that exact denominator on
  2026-08-07 and ruled it out (*"DAR **is** business-day aligned"*), and `src/utils/date.js:101`
  already carried a `businessDate()` 4am helper that had itself been consolidated after recurring
  five times. Half my mechanism was refuted by a file already in the repo, and the search that
  found it took one grep. **Search `memory/` and `src/utils/` for prior art BEFORE writing a
  mechanism into a durable doc — especially when the fact feels newly learned.** CLAUDE.md's
  "check whether an affordance already exists before adding one" covers code; it applies just as
  hard to *explanations*. The owner's vague recollection outranked my fresh reasoning.
- **Nearly flagged a false discrepancy on that same PR.** Grepped for `192/192` expecting it removed,
  found it in three files, and almost reported the fix as incomplete — the engineer had kept it as a
  *documented retraction* ("an earlier draft reported a tautological 192/192"), which is the practice
  this register itself recommends. **Read the context around a grep hit before calling it drift.**
- **Floated a shared-cause theory between #348 and #340 before looking at either file.** Guessed the
  Scheduling panel was dropping a subset of stores, the way #340's tile does. The owner refuted it in
  one screenshot — Schedule Summary shows all 27 stores sane on the same rows. Fifteen minutes later a
  plain `grep` of the two files produced the actual cause (three formula differences, `scheduling.js`
  vs `engine/schedule-summary.js`). **When two panels disagree on the same number from the same data,
  diff the two computations first.** Reasoning from the symptom is what the measure-don't-reason rule
  exists to stop, and a cross-issue resemblance is the most seductive form of it.
- **⭐ Wrote "these five days are gone for good" about data that was sitting in another table.** #360
  reported `sales_ledger_daily` empty for Aug 12–16 and framed it, twice, as permanently lost —
  reasoning from the API-over-email rule's *"nothing recovers what was never emailed."* But that rule
  is about the **stream**, not the **data**: the same PR that surfaced the gap (#347) had already
  measured `qsr_sales_mix` holding **135 rows for the identical window**, and I quoted that number in
  the same issue without connecting it. The owner corrected the whole class: *"If you detect anything
  missing, you may simply back pull the data needed to close the gap. Should not keep coming up as an
  issue."* **A gap in one stream is a work item, not a finding** — check whether a sibling API source
  already covers it before writing a word about loss. The real finding was always the silent alarm
  (#171), not the rows. CLAUDE.md's backfill rule now says this explicitly.
- **⭐ Blocked a good PR on a memo-staleness diagnosis that did not reproduce (#366).** Held #171's
  fix claiming `autoItems` could "silently never fire" because its dep array tracked only
  `laborRows` while the new code read ten `ds` fields. Structurally that reads like a bug. The
  engineer **tested the claim** — stashed the fix, ran the new panel test against the pre-fix dep
  array — and it passed: `allLocs` (`at-a-glance.js:239`, a bare `.filter().map()` with no
  `useMemo`) is a fresh array every render, so the memo had been recomputing unconditionally all
  along and the failure mode could not exist. **I reasoned from a dep array to a behaviour without
  rendering anything** — the same forward-from-symptom move this register keeps recording, applied
  to React instead of SQL. Two lessons: the consolidation was still worth keeping on structure, and
  the engineer documented it as *not* a red-before/green-after guard rather than dressing it up as
  one, which is the correct handling of a reviewer's wrong call. The mechanism that refuted me is a
  genuine perf defect (~20 memos in that file never memoize) and is filed as **#369** — the second
  time in two days that reproducing a stated diagnosis beat accepting it.
- **⭐ The pattern behind most of this register, named.** Reasoning forward from a symptom to a cause
  has been near-worthless here — #337 alone burned seven refuted hypotheses. Asking *"what single
  query, grep, or diff would discriminate between the possibilities?"* has been reliable. The
  difference is not effort or care; it is which question gets asked first. **Ask the discriminating
  question before forming the theory, and when a theory dies, the next step is a measurement — not
  another theory.**

---

## 8. Security constraints (verbatim intent — preserve on every future handoff)

- **Strip `x-auth-token` from every capture.** Never write one to a file or a commit. The session
  cycle is ✅ **done (2026-08-15)** — do not re-raise it. The standing constraint is the stripping,
  not the cycle.
  **Sequence any future capture request behind a rotation**, never alongside one: asking for a
  capture asks the owner to handle a live token again, so a request that unblocks work would
  otherwise be the same thing keeping the exposure open. **#312 removes the need entirely** by
  minting the token per-run — treat it as a security item, not a performance one.
- **Never pull or persist `ssn`.** `geid` + `payrollID` identify a person adequately for every analysis
  Meridian performs. Roster workbooks carrying SSNs/DOBs/addresses are to be deleted.
- Supabase **anon/publishable key is public by design**; the **service-role key is exported into the
  owner's shell only** — never written to a file, never committed. **Never put a secret key in a
  `VITE_`-prefixed variable.**
- **The engineer must not execute production writes** even with service-role access — read-only
  measurement only. The owner executes any write.
- **PM never pushes to `main`; the engineer opens draft PRs and never self-merges.**
- Never disable TLS verification or unset `HTTPS_PROXY`.
- Do **not** put the model identifier in commits, PR titles/bodies, or any pushed artifact.

---

## 9. First actions for the successor PM, in order

1. **Review #298, #301, #297** — three engineer PRs are sitting unreviewed and each hour open is
   drift. Fetch `main`, read the diffs, build, test, spot-check one factual claim each, then merge.
2. **Chase the owner's list in §3**, leading with the token cycle and the #269 SQL run.
3. **Dispatch #292's PK rebuild** to the engineer once #298/#301/#297 are merged (one task in flight).
   #302 and #303 are now filed and unassigned — they are good candidates for the queue behind
   #286/#269, and #303's first half is small and self-contained.
4. **Start the McValue FBP edits** — 25 August is close and it is the only externally-dated item.
5. **Investigate the Promo/Discount ROI all-negative suspicion** and file it if it holds.

Related: [[feedback-pm-worker-split]] · [[feedback-measure-dont-reason]] ·
[[feedback-performance-budget]] · [[qsrsoft-report-catalog]] · [[project-mcvalue-2-fbp-document]] ·
[[notes-66-staged-experiments-and-risk]] · [[data-acquisition-shopping-list]]
