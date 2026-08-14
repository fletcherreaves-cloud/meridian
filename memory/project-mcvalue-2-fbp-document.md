# McValue 2.0 — the Field Business Partner document

**Deliverable:** two versions of the same analysis — one presenting findings only, one arguing a
position. Owner asked for both: *"honestly let's present both, let me see both versions."*

**Deadline: Tuesday 25 August 2026.** Captured 2026-08-14, eleven days out.

**Audience:** the McDonald's Field Business Partner, in person.

**Scope:** all 20 Oklahoma stores, plus **Gary Mornhinweg's** organisation (spelling confirmed by
the owner 2026-08-14 — an earlier "Morhininweg" was voice-input garble).

---

## The claim under test

The owner's observation: McValue changed direction in **May 2026**, producing roughly a
**30–50¢ increase in average check at the cost of a sharper decline in guest counts**.

**That is the hypothesis, not the premise.** If the analysis starts from "clearly not working
well" it will find exactly that. The reference-class design below exists specifically to give the
data a chance to say otherwise.

## Method

**Difference-in-differences against `ly_` twins.** McValue is national — there is no untreated
store cohort, so the control has to be the same stores a year earlier.

### Source: `qsr_cash_sheet`, not the rollup

Confirmed 2026-08-14 by reading the actual JSONB keys rather than assuming a schema (a mistake
already made once this month with `net_sales_amt`). `qsr_cash_sheet.metrics` carries **`ly_`
twins for every key**:

`net_sales_amt` · `billable_sales_amt` / `billable_sales_qty` · `discount_amt` / `discount_qty` ·
`promo_amt` / `promo_qty` · `coupon_a_qty` … `coupon_e_qty` · `emp_meal_discount_*` ·
`mgr_meal_discount_*` · `overring_*` · `treds_before/after_*` · `cash_refunds_*` ·
`cashless_refunds_*` · `actual_dep_amt` · `cash_over_or_short` · `drawer_opens_qty` ·
`petty_cash_reim_amt` — each with an `ly_` counterpart.

Every row is therefore its own matched pair; **no self-join is needed**.

**Coverage (measured):**

| table | from | to | locs |
|---|---|---|---|
| `qsr_cash_sheet` | 2024-04-01 | 2026-08-14 | 27 |
| `qsr_sales_mix` | 2024-04-01 | 2026-08-14 | 27 |
| `qsr_daily_activity_rollup` | 2025-01-01 | 2026-08-14 | 27 |

`billable_sales_qty` is the **transaction count** — the cash-sheet field group is literally
`Billable Sales: Billable Sales Cnt` / `Billable Sales Amt` (`scripts/parse-field-defs.mjs:104`).
So **average check = `net_sales_amt / billable_sales_qty`**, and the value itself is the check on
that reading: a result in the $8–12 range confirms the field; anything else means stop.

### Periods: 14-day Wednesday-anchored blocks, not calendar months

Owner's contribution, 2026-08-14, and it is correct: 7/14/21/28-day blocks are **day-of-week
balanced** — one of each weekday per 7-day block. Calendar months are not (a 31-day month has
three weekdays occurring five times and four occurring four), so month-over-month comparison
carries a DOW-composition confound.

**This is already the house convention, verified in code:**

- `src/constants.js:103` — `weekStartDay: 3, // 0=Sun 1=Mon 3=Wed (McDonald's standard)`
- `scripts/qsrsoft-dar-pull.mjs:260` and `qsrsoft-digital-app-pull.mjs:73` send
  `compType: 'trading', weekStart: '3'` — so the `ly_` values come back **trading-day aligned**
- `src/engine/backtest.js:466,531` already do LY lookups at `addD(row.date, -364)`, with
  variables named `_ly364` — the 52-week convention, not 365

The 364-day point matters: 365 days shifts the comparison by one weekday (two after a leap
year), quietly comparing a Friday to a Thursday. QSRSoft's trading alignment handles this
already, so the inline `ly_` values are correct without recomputation.

**Block layout.** Today is Friday 2026-08-14, so the last complete day is the 13th and the last
complete Wednesday-anchored block ends **Tuesday 12 August**. Block 0 = Jul 30 – Aug 12; indices
step backward in 14-day steps. Block −7 straddles 1 May, so:

- **post** = blocks −6 … 0 → **7 complete blocks**
- **pre** = blocks −13 … −7 → **7 matched blocks**, same length, same DOW balance

**Why this beats months, stated correctly.** The owner initially estimated 10–20% more data;
the real figure is ~7% (98 days vs 92). **Volume was never the argument.** The gain is
**7 post-break observations instead of 3** — three points cannot distinguish a step change from
a drift, seven can show whether the average-check gain is holding, growing or decaying since
May. For a document arguing a position, that trajectory is most of the argument.

**August is not excluded** — it is included as complete 14-day blocks, which is precisely what
the block method buys. What is excluded is any partial block. A partial period weighted as a
full one is a known error class in this repo; say so explicitly in the document rather than
dropping it silently.

## The reference-class extension (owner idea, 2026-08-14)

> *"I might source the national promotional calendar for last year and potentially even the year
> back from that if it will be useful to see when other national promotions landed to get more
> clarity on how they may have worked versus the current one."*

**Two distinct benefits, the second larger:**

1. **Confound control.** An `ly_` twin is a clean control only if last year's matching period was
   not itself under a promo. If May–Aug 2025 carried a strong national window, the LY baseline is
   inflated and part of the apparent decline is an artifact. This is fair game for the FBP to
   raise, and the calendar closes it.
2. **A reference class.** Turns the document from *"McValue 2.0 hurt us"* into *"here is the
   check-versus-traffic signature of every national promo window in our data; McValue 2.0 sits
   outside it in this specific way."* An objective standard rather than our read of one window —
   much harder to wave off, and it is also what keeps the analysis honest about its own premise.

**Which years are actually worth sourcing:**

| year | verdict |
|---|---|
| **2024** | **Yes.** Data starts 2024-04-01, so Apr–Dec 2024 windows are directly measurable, and they are the LY baseline under the 2025 windows. |
| **2026** | **Already in the repo, unextracted** — `REV_2__2026_OPNAD_Calendar_10.29.25.pdf` covers the period under study, including the McValue 2.0 window itself. Free value; extract before sourcing anything new. |
| **2025** | Already extracted — `data/marketing-calendars/2025-opnad-retail-windows.json`, 16 windows, three source year-typos corrected and owner-confirmed. |
| **2023** | **Skip.** Our data does not reach 2023, so nothing in it is measurable. Only use would be contextualising `ly_` values on the earliest 2024 rows, which this analysis does not lean on. |

The 2026 media-mix grids are a different shape (GRPs by week-start, not start/stop pairs), so a
window has to be inferred from contiguous non-empty weeks.

**Consequence:** promo windows must be tagged so blocks can be classified promo/non-promo. The
marketing-calendar README notes loading into `org_events` is still outstanding — that becomes
load-bearing for this document rather than housekeeping.

## Data access

The anon key reaches Supabase but **RLS returns zero rows** on every table this needs (verified
2026-08-14: `qsr_daily_activity_rollup` → HTTP 200 `[]`, `qsr_cash_sheet` → HTTP 200 `[]`,
`qsr_daily_activity` → HTTP 500 statement timeout). `qsrsoft_kb` **is** readable with the anon
key — useful for field definitions.

So the analysis runs on the **query path**: owner executes SQL in the Supabase SQL editor and
pastes results. Owner chose this over service-role access, which he has deferred until closer to
additional users. This is the first concrete dated need for that key; he has invited reminders.

## Open items

**Owner:**
- [ ] **Exact date of the McValue 2.0 direction change.** He can get it; asked not to be let to
      forget. **Find the break in the data first and use his date as verification** — if they
      agree that is corroboration, if they disagree that is worth knowing before it reaches the
      FBP. Do not use his date as an input that biases the search.
- [ ] **Gary Mornhinweg's six loc numbers.** An earlier session recorded 5183 Chickasha, 11657
      Purcell, 18213 Lindsay-Wal-Mart, 20475 OKC-I240/Sooner, 33704 Tecumseh, 34222 Harrah — but
      CLAUDE.md lists all six under MCDOK, so **do not split the cohorts on that stale note**.
      The Part B query returns every store so the split can be applied after confirmation.
- [ ] Run the two-part analysis SQL (district × block; per-store pre vs post).
- [ ] Source the 2024 national marketing calendar.

**Me:**
- [ ] Extract `REV_2__2026_OPNAD_Calendar_10.29.25.pdf`.
- [ ] Find the break in the data independently.
- [ ] Load promo windows to `org_events` for block tagging.
- [ ] Draft both versions.
