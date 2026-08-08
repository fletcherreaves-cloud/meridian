---
name: notes-61-queue
description: Notes 61 field-note queue (2026-08-08) — mobile perf, District View fixes, the Resolver engine concept, SMG metric definitions, and the owner's deferred questions about deployment and in-app calculation.
metadata:
  type: project
---

# Notes 61 — captured 2026-08-08

Field notes die with the session they are pasted into, so the queue lives here. Owner's
framing: *"hopefully mostly QW's. I'd like to get these and then start the plan mode... best
to put us in a really good place prior to a redesign."*

---

## DONE

- **#1 Mobile performance** — v4.901. Entry chunk 3518 → 2722.5 KB (-22.6%), per-panel
  Suspense boundaries, 4 dead imports removed. All three reported symptoms (slow load,
  6-7 taps to open the menu, 20-30 s white screen on app-switch) traced to one measured
  cause: 3.0 MB of statically imported source. Full detail in the v4.901 commit body.
  **Remaining:** `analytics.js` is 692 KB and stays in the entry chunk because `AtAGlance`
  lives inside it — extracting the home screen is the next real reduction and belongs with
  the UI/UX redesign.
- **`MANUAL_ONLY_METRICS` verified 0** — 50 registered metrics, 7 derived, `compute6wk`
  resolving 28/28 with zero raw `avg6`. Now a standing audit in
  [[feedback-performance-budget]].
- **Speed-check policy** — written as a standing rule with a measured budget, same file.
- **Register Audit units bug (District View #9)** — v4.903. Reported as "fix rounding to 2
  decimals"; it was not rounding. `refundCnt` (a count) had `refundCashless` (dollars, column
  `'Refund Cashless $'`) summed into it. The cents were the mild symptom — the real damage was
  the table's `>3`/`>5` amber thresholds firing on dollar amounts, so anyone with cashless
  refund activity looked like a refund outlier. Split into 'Refunds (count)' + 'Refunds $
  (total)'. Mutation-verified guard.
- **Snack daypart (District View #1)** — v4.903, in store-analytics.js and morning-brief.js.
  **Left alone:** `dt-speedofservice.js:49` also labels a daypart 'PM' but over 14:00-16:00, a
  different window — renaming it would be a guess. **Owner should confirm.**
- **Dialed-In 1W/2W/4W/6W trend** — v4.904. `calibrateStore` read `ds.laborRows` raw. That is
  cloud-backed (`labor_rows` table) but MANUAL-fed, and measured 16 days stale on 2026-08-08
  (newest 07-23) while `qsr_labor_summary` had all 27 stores through 08-08. The 1W filter
  therefore matched zero rows → null → "—". Now sourced through `metricSeries('sales')`.

## 🔴 Resolver was manual-first in 30 of 35 chains — fixed v4.905

Found because the owner caught a sentence in my summary: I described v4.904 as "manual still
wins where it exists and auto fills the gap" and they replied **"Not our rule. need to fix
please."** They were right, and I had the rule backwards twice in one session — I also called
the `sales` chain ordering "legitimate" earlier because `laborRows` has a Supabase loader.

**Being in Supabase does not make a stream auto.** `labor_rows` / `ops_rows` / `ctrl_rows` /
`audit_rows` all have loaders and tables, but are POPULATED BY AN UPLOAD, so they go stale the
moment uploading stops. What feeds the table is the test, not where it lives.

Audit found **30 of 35 multi-source chains put a manual stream ahead of an auto one** —
`sales`, `gc`, `oepe`, `kvst`, `tpph`, `actHrs`, `actVsNeed`, all the Controls metrics. The
file header documented the inverted doctrine as if intended. Every one of those metrics
preferred a stale manual value on any day both tiers covered.

Fixed by stable partition (auto in existing relative order, then manual), so deliberate
ordering AMONG auto sources is untouched — `laborPct` still prefers Glimpse because Glimpse is
confirmed punched. Now guarded structurally by `src/__tests__/metric-source-order.test.js`
against the exported `MANUAL_FED_SOURCES` list, mutation-verified.

**Six existing tests failed on the fix because they asserted manual-wins** — they had encoded
the bug as intended behaviour, including one I wrote an hour earlier. All rewritten to assert
auto-wins AND that last-resort fill still works.

**⚠️ The owner should eyeball values where both tiers cover the same day** — this changes
displayed numbers for those 30 metrics wherever manual and auto disagree.

## ⚠️ Live data-pipeline finding, 2026-08-08 — needs the owner

Measured freshness across every stream:

| stream | newest | |
|---|---|---|
| `labor_rows` | **2026-07-23** | **16 days stale — manual Labor Report upload** |
| `qsr_labor_summary` | 2026-08-08 | 27 stores |
| `qsr_daily_activity` | 2026-08-08 | |
| `qsr_fob` | 2026-08-08 | |
| `sales_ledger_daily` / `daily_glimpse_daily` / `cash_sheet_daily` / `qsr_ebos_daily` | 2026-08-07 | |

Every auto stream is current. **Only the manual-fed one is stale.** v4.904 routes the Dialed-In
calibration around it, but **anything else still reading `laborRows` raw has the same 16-day
hole.** Per the standing rule that manual sourcing is temporary, `labor_rows` wants an automated
feed — `qsr_labor_summary` already carries the same days for all 27 stores. **Worth a sweep for
other raw `ds.laborRows` readers.**

---

## District View — visual review, 2026-08-08

Owner's caveat: *"Some of these may be completed earlier today... This is just me visually
reviewing live this morning."* Verify each is still broken before fixing.

| # | Item | Notes |
|---|---|---|
| 1 | Store Tiles → Daypart Pace: rename **PM → Snack** | pure label |
| 2 | Forecast Table → **Biggest Miss** counts the current partial day | Same class of bug as the swing alarm counting a part-finished day as whole. Either exclude today, or — better — wire in the hourly Sales/GC projections we already have. **Same fix needed in Backtest Accuracy.** |
| 3 | Period forecast (bottom): last complete day has **no labor** at 10:00 am | Populate from what is available, update as finals land |
| 4 | Scorecard: **missing 2-WK averages** | |
| 5 | Intelligence Brief: **all pastel, including the text** — unreadable | contrast pass |
| 6 | Action Plan: *"I like it… anything new to enhance?"* | open question, not a bug |
| 7 | Shift Analysis: **TPPH not populating** in several places; **missing Parked at Dinner** | TPPH is now a derived metric — check it is sourced through `metric-source.js` |
| 8 | 3-Peaks: **missing Parked at Dinner** | |
| 9 | Register Audit: **Refunds total not rounded to 2 dp** | |
| 10 | Register Audit: **drill into each employee** — "since we can" | |
| 11 | Register Audit: **surface ALL audit metrics we already have.** For any without a %, compute `event $ ÷ total drawer sales` | biggest item in this block |
| 12 | **Tishomingo (43380)** shows "new model store", forecast model health null — open >1 yr, should be fixable. **Ponce de Leon (43701)** genuinely new (opened March), leave it | |
| 13 | **Records** should be all-time, not limited to the date selection. Wants top 3 per category + most recent record broken + near misses | |
| 14 | District Overview: make the **Critical chip clickable** → list all critical items. Same for **Watch flags** | |

---

## The Resolver engine — owner's idea, assessed 2026-08-08

Owner's ask: *"a resolver engine to make sure all of our data is always wired to the correct
data stream and in the correct order. Built in failsafes and fallbacks included with
notifications when something breaks... a final test and reality check... It takes the idea
and makes it law, as well as puts a check and balance in place AND is fully auditable."*

**Assessment: realistic, and roughly 60% already built without that name.**
`src/engine/metric-source.js` IS a resolver — declarative per-metric source chains, auto-first
ordering, derivations, fallback to manual as last resort. `vs-ly.js` is the same idea for
matched-day comparisons. The generated chain guard (`scripts/gen-loader-emits.mjs`) already
proves at test time that every declared chain points at a field a loader actually emits.

**What is genuinely missing — this is the real scope:**

1. **Runtime health, not just build-time.** Today a chain that silently falls through to
   manual produces a number with no complaint. Needs: per-metric/per-loc/per-date coverage,
   which tier actually answered, and an alert when a metric drops a tier.
2. **The audit surface.** "This number came from `qsr_daily_activity`, tier 1 of 3, 27/27
   stores, freshest 2026-08-07" — visible to any user, for any number. The **Metric Lineage**
   panel is the natural home and the obvious seed.
3. **Admin UI to inspect and change chains.** Currently editing `METRIC_SOURCES` requires me.
4. **Report builder** on top of the registry.

**On the owner's key point** — *"eventually everyone else won't have access to you directly
unless you tell me I'm wrong"* — **they are right, and it is the strongest argument for the
Resolver.** Every metric wiring change today routes through a Claude session. That does not
survive a second operator. The Resolver converts "Claude edits a JS object" into "an admin
picks a source in the UI, and the system proves it is sound." Admin-and-above, as requested.

**Does it serve the earlier requests?** Yes — it is the enforcement mechanism for the standing
rules that are currently honour-system: auto-first, freshest-wins, never average averages,
dollar-weight aggregates. Rules in a markdown file get violated. Rules in a resolver cannot be.

---

## Owner's questions — answered 2026-08-08

**Q: "Should I assume that as far as auto pulled data, we are selectively only pulling
specific metrics?"** — **Yes, correct.** Measured: the DAR pull hand-maps 61 fields into 63
columns; `QSR_DAR_FIELDS` declares 29 for client use. Nothing is captured that is not
explicitly named. A new metric requires four steps: (1) map it in the pull script, (2) add the
SQL column, (3) emit it from the loader, (4) declare a chain in `METRIC_SOURCES`. **Those four
steps are exactly what the Resolver would make visible and manageable** — today, step 4 has a
generated guard and steps 1-3 do not.

**Q: In-app calculation to limit data flow — worth exploring?** — **Yes, and it is already
started, but it is not primarily a bandwidth win.** The 7 derived metrics compute client-side
from pulled atoms. The right principle: **pull atoms, derive aggregates.** Caveat from measured
evidence — the real cost driver has been row volume and payload, not arithmetic (a 1000-row
page of `qsr_raw_item_detail` is 16 MB at 22.5 KB/row; `loadDailySales(405)` fired ~274
simultaneous requests against a 257k-row table). Some rollups must stay server-side. So: derive
rather than store wherever inputs are already pulled, but do not move large aggregations into
the client.

---

## Still open

- **Dialed-In Calibration: no trend data for 1w/2w/4w/6w.** Owner: *"This one is very important
  to me."* Highest-priority functional item outside the District View block.
- **SMG/VOICE metric definitions.** Owner supplied OSAT: `count(5 ratings) ÷ count(all ratings)`
  — only a 5 counts. Need to determine B2B, EPB2B and the rest, then add all to Metric Lineage.
- **Complete listing of every metric we have access to.** Owner wants it to help wire data and
  design new things. Should be generated from the registry, not hand-written — and is a natural
  first deliverable of the Resolver.

## Deferred by the owner (captured so they are not lost)

- **Role-framed experiences.** Supervisor view: Sales + GC; service times (OEPE w/o Park, KVS
  Time, R2P, KVS Healthy Usage); Labor %; scheduling (Act vs Need, Act vs Sched, FLH, Floor).
- **Full back-end flow write-up** — every linked app and machine setup, what it means for
  deployment. Owner's real questions: *am I the only one needing this setup? what happens if my
  computer goes down or offline? should we be running a backup?* (Note: the daily pulls run on
  GitHub Actions, not their machine — that answers part of it, but the full map is owed.)

Related: [[feedback-performance-budget]], [[data-sourcing-standard]],
[[feedback-measure-dont-reason]], [[notes-60-queue]].
