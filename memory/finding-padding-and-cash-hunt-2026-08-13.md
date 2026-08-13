# Padding / cash-control hunt — 2026-08-13

Everything established, refuted, and left open during the Holdenville + Ada investigation.
Written because the Ada method existed only in a session transcript and was one archive away
from being lost. Related: issues #255 (padding signatures), #257 (inventory count-history pull).

---

## 1. Confirmed — the Ada padding signature

**Store:** Ada, `loc = '0006972'`. **Source:** `qsr_fob`.

| Month | stat% | FOB% | |
|---|---|---|---|
| 2025-06 | 0.91 | 3.78 | |
| 2025-07 | 1.85 | 4.43 | |
| 2025-08 | 1.23 | 3.83 | |
| **2025-09** | **4.75** | **7.50** | spike |
| 2025-10 | 1.35 | 3.85 | |
| 2025-11 | **1.35** | 3.95 | identical to Oct |
| 2025-12 | 1.78 | 4.51 | creep |
| 2026-01 | 2.33 | 5.22 | creep |
| **2026-02** | **4.42** | **8.36** | spike — owner arrives Feb 4 |
| 2026-03 | 1.24 | 4.05 | |
| 2026-04 | 1.27 | 4.24 | |
| 2026-05 | 1.44 | 4.05 | |
| 2026-06 | 1.29 | 3.87 | |

Ada targets: FOB 3.9%, stat loss 1.1%.

**Four-part signature. The conjunction is the finding; no single part is sufficient.**

1. **Monotonic creep in `stat_variance_amt%`** while `unexplained_amt%` sits pinned near zero
   and slightly negative. The pad absorbs variance that should be surfacing.
2. **Identical consecutive months to two decimals.** Oct and Nov both `1.35` stat, both `-0.11`
   unexplained. Real variance does not do that — a number that repeats exactly is being
   *carried*, not measured. Most detectable part, least obvious: everyone watches for the
   spike, nobody watches the suspiciously smooth stretch before it.
3. **Periodic spikes** when a real count lands and the fiction unwinds. Sept 2025 and Feb 2026,
   ~5 months apart. Pad, creep, blow out, reset, repeat.
4. **A correction that holds.** Mar–Jun 2026 is the tightest run in the whole series, sustained
   four months after the GM was held accountable and the store retrained 2026-02-12.

**Reusable query:**

```sql
select left(date::text,7) as mon,
       max(prod_sales_amt) as sales,
       round(100*max(stat_variance_amt)/nullif(max(prod_sales_amt),0),2) as stat_pct,
       round(100*max(unexplained_amt) /nullif(max(prod_sales_amt),0),2) as unexp_pct,
       round(100*max(comp_waste_amt)  /nullif(max(prod_sales_amt),0),2) as comp_pct,
       round(100*max(raw_waste_amt)   /nullif(max(prod_sales_amt),0),2) as raw_pct,
       round(100*max(condiments_amt)  /nullif(max(prod_sales_amt),0),2) as cond_pct
  from qsr_fob
 where loc = :padded_loc and date between :from and :to
 group by 1 order by 1;
```

`FOB% = comp + raw + cond + stat + unexp`.

---

## 2. Confirmed — structural facts about the data

- **`qsr_fob` rows are month-constant.** Every daily row in a month carries that month's final
  value; they do not accumulate through the month. Contradicts the comment at
  `eom-inventory.js:97` describing them as period-to-date snapshots. Consequence: group by month
  and take `max()`, never `avg()` over daily rows. This also partly corrects #228 — the
  *percentages* the FOB Analysis panel reports are correct (identical rows return the pct
  exactly), but `actualDollar`/`diffDollar` are inflated roughly 30x because `totalSales` sums
  thirty copies of the same monthly total.

- **Data coverage floor per stream** (measured 2026-08-13, service-role query):

  | stream | first_dt | last_dt | rows | HVL rows |
  |---|---|---|---|---|
  | `qsr_fob` | 2024-01-19 | 2026-08-12 | 24210 | 937 |
  | `qsr_ebos_daily` | 2024-01-21 | 2026-08-12 | 8459 | 295 |
  | `qsr_daily_activity` | 2025-01-01 | 2026-08-13 | 372074 | 14161 |
  | `qsr_labor_summary` | 2026-06-17 | 2026-08-13 | 1566 | 58 |
  | `cash_sheet_daily` | 2026-07-01 | 2026-08-11 | 1053 | 39 |
  | `daily_glimpse_daily` | 2026-07-01 | 2026-08-11 | 1053 | 39 |
  | `sales_ledger_daily` | 2026-07-01 | 2026-08-11 | 1134 | 42 |

  The three emailed streams start **2026-07-01** — when the server-side email parse pipeline
  (v4.406–v4.426) went live. Before that they parsed client-side into device-local IDB only.
  **Any historical cash or controls analysis before 2026-07 is unreachable through these
  tables.**

- **`cash_sheet_daily` and `daily_glimpse_daily` are missing 3 days district-wide.** 39 rows per
  store over a 42-day span, uniform across all 27 stores; `sales_ledger_daily` has all 42. Not
  store-specific. Worth a separate look — a uniform 3-day gap is a pipeline miss, not noise.

---

## 3. Confirmed — Holdenville (35064) personnel timeline

From owner-supplied QSRSoft Employee Roster exports, Aug–Nov 2025.

- **Rachel D Couffer** — GENERAL MANAGER, store start 2020-02-13, **End Date 2025-12-08**.
- **Lynsey Yahola** — at store since 2024-02-14; **GM job-title start 2025-11-26**. First appears
  in the November roster. Acting GM with no prior management experience.
- **Brooklyn Southers** (GM, 2023-04-17) and **Matthew Timperley** (Dept Mgr I, 2023-11-24) present
  throughout.

**Two caveats that change how these dates read:**

1. **Termination dates are batch-processed to accounting-period boundaries**, not actual last
   days. Repeated cluster dates across the roster: 2025-09-02, 10-07/08, 11-09, 12-06/07/08/09,
   2026-01-01, 02-04, 03-21. Seven crew all "terminated" 2025-11-09. The real handover is better
   read from Lynsey's 2025-11-26 title change than from Rachel's 2025-12-08 end date.
2. **The roster export's End Date is current-state, not point-in-time.** Rachel shows End
   2025-12-08 in the *August* workbook; some rows carry 2026 end dates. Requesting a past period
   does not give you that period's status.

---

## 4. Confirmed — identity mapping gap

- Roster `Payroll ID` is **null for all 68 people** in the Holdenville exports.
- eBOS `eID` format (`eo975737`, `e0031281`) does **not** match QSRSoft `GEID` format
  (Rachel = `4349852`).
- Therefore #257 will give **pseudonymous but consistent** counter identity — enough to detect
  "one person does all counts", "the counter changed here", "this counter's variance differs
  systematically" — but **not** enough to attach a name without owner recognition or a separate
  eBOS employee endpoint.
- Already visible in a 13-day sample for 35064: essentially every `MobileApp` count row carries
  a single eID, with one exception. One person is doing the counting.

---

## 5. Confirmed — new endpoint (see #257)

```
GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/physinv/inventory_history
    ?start_busn_dt=&end_busn_dt=&select_preset=All
```

Same eBOS host/token as the on-hand, variance and purchase pulls — `QSRSOFT_EBOS_TOKEN` and the
existing three-rung auth ladder already work. Returns **count events**, not levels: one row per
item per count session with `si_id`, `eID`, `save_time`, `count_source` (`MobileApp` / `Auto`),
and per-item `variance_pct`. Rows are sparse — only on dates a count happened.

**`variance_pct` carries garbage at the top end.** Real values from one store, 13 days:
100883% (KETCHUP/BULK), 2556% (TANGY BBQ SAUCE CUPS), 592% (SYRUP/CHOCOLATE), 496% (Caesar Sauce
Cups). Unit-conversion breakage, not shrink. Also `case_count: 946` / `1360` on F600 VEGETABLE
OIL BULK with `case_qty: 1`. Any detector reading this field must handle these explicitly.

---

## 6. Terminology

**Lapping** (deposit lapping) — covering a missing deposit with subsequent receipts, staying one
day ahead of the count. Distinct from straight theft: the signature is a gap that opens and
closes rather than a monotonic loss. Owner's field experience is that it co-occurs with small
register-level reductions (promos, refunds, over-rings, voids) when someone is short on cash.

---

## 7. Refuted — patterns that did NOT bear out

Recorded so nobody re-runs them.

1. **Holdenville GM departed Aug–Sept 2025.** Falsified by roster data. Actual: end date
   2025-12-08, successor's GM title 2025-11-26. The prediction was explicit ("anything after
   October breaks it") and it broke.
2. **The 2025-11-09 seven-person termination cluster is an event.** It is not — it is accounting-
   period batch processing. Multiple such clusters exist across the series.
3. **Near-identical-consecutive-months as a standalone padding detector.** Fires on 9 of 27
   stores. Strongest single tell in the Ada signature, but not sufficient alone.
4. **District-relative differencing reduces noise.** Measured ~1.0x on all five components — no
   reduction.
5. **Longer measurement windows reduce noise.** Flat or worse.
6. **Florida and Oklahoma are on different trajectories** (an 8–12 point traffic gap). Collapsed
   to near zero once Ponce de Leon was excluded — one new store opened March 2026 was driving the
   entire apparent divergence.

---

## 8. Open

- **Holdenville FOB series not yet run** — query in §1 with `loc='0035064'`,
  `2025-04-01`..`2026-08-31`. This is the live test of the pre-registered prediction on #255.
- **`inventory_history` retention depth unprobed.** Probe via `workflow_dispatch` (the Action
  already holds `QSRSOFT_EBOS_TOKEN`); do not wait on a laptop. See #257 step 0.
- **Does `qsr_daily_activity` carry register-level controls back to 2025-01?** If refunds /
  promos / voids / over-rings are reachable there, the register-leak half of the cash theory is
  testable for the 2025 window even though `cash_sheet_daily` is not. Unverified — check before
  assuming either way.
- **Back-filling the three emailed streams before 2026-07** — currently the only route to
  historical cash and controls. Unknown whether the source emails still exist.

---

## 9. Method notes

- **Pre-register predictions.** The Holdenville GM date was stated with explicit falsification
  criteria before the roster arrived, which is the only reason it could be cleanly scored as
  wrong. Do this for every subsequent claim in this investigation.
- **Four confident magnitude/direction errors landed in a single day, all optimistic** — the
  FL/OK trajectory gap, a bundle-work sizing estimate off by ~6x, a delivered-KB figure off by
  2x, and the GM date off by ~3 months. Common shape: a story built ahead of the measurement,
  matching a pattern from a previous incident. Reinforces the standing rule in
  `feedback-measure-dont-reason.md`.
- **Scattered error vs directional error is the discriminator that matters here.** Incompetence
  and concealment both produce bad counts, bad variance and messy cash. An inexperienced acting
  GM predicts exactly the same summary-table mess as a bad actor. Errors that consistently favour
  one side of the ledger are the signal; errors that scatter are not. No name gets attached to a
  finding that has not cleared that bar.
