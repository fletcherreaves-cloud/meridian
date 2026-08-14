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

## How McDonald's views the organization — owner correction, 2026-08-14

This determines which comparison carries the argument, so it is recorded before the method.

> *"as far as McDonald's views all of these operators, they are all run as one organization…
> Oklahoma is run separately with its own DO, Florida is run separately with his own DO as well.
> But the trump card is that for all business planning purposes and potential growth and rewrite
> of lease terms with McDonald's on restaurants, all 27 are viewed as one organization."*

Three levels, and they are not the same unit:

| level | reality |
|---|---|
| **Owner/operator** (Ryan Thorley, Rick/Kathy Thorley, Gary Mornhinweg, Jacob Thorley) | genuinely separate ownership; comparisons across them stand on their merits |
| **Market / DO** (Oklahoma; Florida) | **operationally separate** — each has its own Director of Operations |
| **McDonald's view** | **all 27 are one organization** for business planning, growth, and lease-term rewrites |

**Consequence for the argument.** An early draft leaned on "three independently-run organizations
all landed within 0.38 pp — not an execution story." **That framing fails in the room**, because
McDonald's does not recognise operator as the unit: one organization, one set of practices, of
course they move together.

**The comparison that survives is Oklahoma versus Florida** — two separately-run operations under
different DOs, ~900 miles apart, different competitive sets, weather, and demographics, both
showing the same signature in the same fortnight:

| market | n | traffic DiD |
|---|---|---|
| Oklahoma | 19 | **−4.55 pp** |
| Florida | 6 | **−5.49 pp** |

The three-operator consistency inside Oklahoma becomes a **secondary corroboration**, not the
load-bearing claim.

**Honesty caveat to state in the document rather than let the FBP raise it:** OK and FL are not
fully independent — same ownership umbrella, same BI tooling, same person above both. A strong
control, not a clean one.

**Stakes, for the argue-a-position version only.** Because McDonald's evaluates all 27 as one
organization for growth and lease rewrites, a sustained district-wide traffic decline feeds the
numbers used to assess the organization for expansion — not merely a quarterly performance note.
**Keep this out of the findings-only version**, which stays strictly descriptive.

## Two stores excluded, with reasons

Both are opening artifacts. Documented exclusions, never silent drops.

**43701 Ponce de Leon** — opened 2026-03-13, `ly = 0` throughout. No comparison possible. It also
distorts any district aggregate that includes it: it adds current-year volume against no
last-year counterpart, inflating district vs-LY by roughly **+1.2 pp in the pre window and
+2.4 pp in the post window**. Because it inflates more in post, an uncorrected district series
*understates* the traffic decline.

**43380 Tishomingo** — opened early 2025 (`memory/dar-vs-ops-reconciliation.md:78`;
`constants.js:92` flags "Limited history (503 days)" and `recentOnly: true`). Its LY is an opening
ramp, not steady-state trading — measured, the LY baseline falls **−17.6% in sales and −16.2% in
traffic within 2025** ($7,078/day → $5,830/day). So its pre-window compares against a hot opening
period and its post-window against a cooler one, making the store appear to *improve*. It was one
of only two stores with positive traffic DiD, and the effect is spurious.

**Excluding it strengthens the finding:** All-OK sales DiD −3.36 → **−3.69 pp**, traffic DiD
−4.37 → **−4.55 pp**. It also explains why Ryan Thorley looked better than the other operators
(−3.10 vs −3.48/−3.62) — Tishomingo is his. Excluded, he is at −3.86 and the three-operator
spread tightens from 0.52 pp to **0.38 pp**.

Checked and **kept**: 37566 Mossy Head (+0.63 pp traffic DiD) — established Florida store, no
opening artifact, a genuine outlier.

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

**Coverage (measured) — these are BACKFILL FLOORS, not data floors:**

| table | backfilled from | to | locs |
|---|---|---|---|
| `qsr_cash_sheet` | 2024-04-01 | 2026-08-14 | 27 |
| `qsr_sales_mix` | 2024-04-01 | 2026-08-14 | 27 |
| `qsr_daily_activity_rollup` | 2025-01-01 | 2026-08-14 | 27 |

**Owner, 2026-08-14:** *"We can access all historical data for the restaurants for many many
years in the past, so don't let that be a limiter."* Now a standing rule in CLAUDE.md. If this
analysis wants a longer pre-period — more promo windows in the reference class, a multi-year
baseline for the discount rate — **run a backfill rather than scoping down**. The 2024-04-01
figure is when the ops-pull was first run, nothing more.

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
| **2023** | **Corrected 2026-08-14 — worth having after all.** The original advice ("skip, our data does not reach 2023") was wrong reasoning: QSRSoft holds many years and a backfill reaches 2023 whenever we want it. Value it if the reference class wants more promo windows; the constraint is backfill effort, not data existence. |

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

---

# McValue launch date CONFIRMED: 2026-04-21 (owner, from the May OPNAD Calendar Optimizations deck)

Owner also reports **an updated push in July 2026**, which he reads as an early corporate
acknowledgment of weakness. (I could not extract text from the PDF in this environment — poppler is
unavailable — so the date and the July push are on the owner's reading of the deck, not my own.)

## This settles the satisfaction question, and it favours the document

The district OSAT decline (`memory/qsrsoft-report-catalog.md`) begins around **March 2025** —
**thirteen months before McValue launched.** Regressing the survey-weighted monthly series:

| window | months | slope | t |
|---|---|---|---|
| **pre-launch** (2024-01 … 2026-04) | 28 | **−0.286 pp/month** | **−4.33 — significant** |
| **post-launch** (2026-05 … 2026-08) | 4 | **+0.586 pp/month** | +1.11 — not significant, n too small |

12 months before launch: **79.7%**. Since launch: **76.8%**.

Monthly around the launch:

```
2025-12  75.4%
2026-01  77.2%
2026-02  80.6%
2026-03  75.2%
2026-04  74.7%   <- McValue launches 4/21 — the series TROUGH
2026-05  76.6%
2026-06  76.8%
2026-07  76.0%
2026-08  78.8%
```

**Satisfaction fell significantly for 28 months, bottomed in the launch month, and has been
flat-to-rising in the four months since.**

## What that does to the traffic argument

The obvious challenge to the document — *"traffic fell because service got worse, not because of
McValue"* — **does not survive this**:

1. The satisfaction decline **predates the launch by 13 months**, so it cannot have been caused by
   McValue, and it was already significant long before.
2. A **steady** secular decline is differenced out by the DiD design, which compares the *change*
   in the vs-LY gap. That is what DiD is for.
3. What DiD cannot absorb is an *accelerating* decline. Satisfaction did not accelerate downward
   after launch — the slope flipped positive. So a worsening-service story cannot explain the
   post-launch traffic deterioration.

**Traffic kept deteriorating (−2.91% → −4.72%) while satisfaction stabilised.** That divergence is
the strongest form of this argument: whatever is pulling traffic down is *not* a service-quality
problem, because service perception stopped falling at exactly the point traffic kept going.

Raise this in the document explicitly. A reader who knows the business will wonder about service;
answering it with the measurement is far stronger than leaving it unaddressed — and the answer
happens to help.

## ⚠️ Design consequence: the post period contains TWO events

The **July push** sits inside the post-launch window. Blocks after mid-July therefore reflect
launch **plus** refresh, not launch alone. Options, in order of preference:

1. Report the post period split at the July push date — pre-push blocks and post-push blocks
   separately. The trajectory table already runs block-by-block, so this is a labelling change, not
   new analysis.
2. At minimum, **name the July push in the document** and note which blocks it touches. An
   unmarked second intervention inside a post period is exactly the kind of thing that invalidates
   a finding when someone else spots it first.

The owner's read — that a July refresh signals corporate awareness of softness — is plausible
context but is **not evidence**; keep it as framing, not as a finding.

## The post-launch window is NOT a clean treatment period — six national events sit inside it

Owner supplied the 2026 marketing calendar (June–August). Mapping it onto the 14-day blocks from
launch (2026-04-21), against data running to 2026-08-13:

| block | window | national activity |
|---|---|---|
| **B1** | 04-21 → 05-04 | **— clean —** |
| **B2** | 05-05 → 05-18 | **— clean —** |
| **B3** | 05-19 → 06-01 | **— clean —** |
| B4 | 06-02 → 06-15 | **U.S. FIFA World Cup Happy Meal begins (6/9)** |
| B5 | 06-16 → 06-29 | Fried Apple Pie LTO, all-store sell (6/23) |
| B6 | 06-30 → 07-13 | **McValue 2.0 REHIT (7/7)** — under-$3: $1.50/$2 Sausage Burrito, $1.50/$2 McChicken **+ National French Fry Day flash offer (7/10)** |
| B7 | 07-14 → 07-27 | Happy Meal #6 (7/14); Breakfast Flavor News (7/21); Chicken Flavor News — Caesar Snack Wrap / McCrispy / Dip Cup (7/21) |
| B8 | 07-28 → 08-10 | — clean — |

*(Beverage Rehit 8/17 and Happy Meal #7 8/18 fall after the data cutoff.)*

**The July push is precisely dated: 2026-07-07, "McValue 2.0 Rehit", landing in B6.**

### What this means for the document

**Blocks 1–3 are the only clean McValue read** — six weeks, launch effect alone, nothing else
national running. That is the window in which "McValue did X" can be said without qualification.
**Report it separately.** It is the strongest evidential unit in the whole analysis and it is
currently buried in an eight-block average.

**B4 onward is confounded by at least five distinct national events**, one of which — a **FIFA World
Cup Happy Meal in a World Cup year hosted in North America** — is potentially a large traffic
driver in its own right. Any statement of the form "in the post-McValue period, traffic did X"
without that caveat is over-claiming, and a reader who works for McDonald's will know the calendar
better than we do.

### The framing this unlocks — and it is stronger, not weaker

The trajectory finding is that traffic **deteriorated** across the post period (−2.91% → −4.72%,
flattening only in the final block). Set against the calendar, the early blocks are the clean ones
and the later blocks carry the World Cup Happy Meal, an LTO, the McValue 2.0 rehit, and two flavour
launches.

**Traffic got worse as national marketing support increased.** That is a materially harder result
than the headline number alone, and it is the honest reading rather than a spin: the period with
the most promotional support is the period with the worst traffic performance.

It also reframes the July rehit. The owner reads it as corporate acknowledgment of weakness; the
data says traffic continued deteriorating *through* B6 and B7, i.e. **the rehit did not arrest the
decline** in the six weeks we can observe. That is a finding, where "corporate seems worried" is
only an impression.

### Required edits before 25 August

1. **Split the post period**: report B1–B3 (clean) separately from B4–B8 (confounded), and say why.
2. **Name every national event in the window**, with dates, in the methodology section.
3. **State plainly that the post period is not a clean treatment window** and that the clean read is
   six weeks long. Owning that limitation is what makes the B1–B3 result credible.

## FIFA World Cup Happy Meal — a DEMAND failure, not an execution failure (owner-confirmed)

Owner, 2026-08-14: the World Cup Happy Meal was *"a huge fail for us"*, and on the execution
question — *"your restaurants ran it fine, customers didn't buy it"* — **"correct."**

The satisfaction series supports it independently. Across the promotion window every dimension held
or improved:

| month | OSAT | Accuracy | Fast | Clean | Quality |
|---|---|---|---|---|---|
| 2026-05 | 76.6% | 79.3% | 75.1% | 71.2% | 75.3% |
| **2026-06** (WC HM from 6/9) | 76.8% | **81.0%** | 76.1% | 71.9% | 75.7% |
| 2026-07 | 76.0% | 80.2% | **76.8%** | **72.3%** | **76.0%** |

No service degradation anywhere — accuracy actually **peaked** in June. A tentpole promotion that
strains a kitchen shows up as slower service and worse accuracy. This one did not.

### Correction to an earlier framing in this file

An earlier note argued *"traffic got worse as national marketing support increased."* **Retract
that.** It assumed the support converted. With the World Cup Happy Meal confirmed as a commercial
failure, blocks B4–B8 carried *nominal* support that did not translate, so the later-block
deterioration has a rival explanation that is not McValue. The line was too clever and the owner's
operational knowledge corrects it.

**Consequence: stop extracting a McValue signal from B4–B8.** At least two candidate causes —
McValue's effect decaying, or a failed tentpole dragging — and nothing in our data separates them.
**B1–B3 is the defensible read and should be the headline.**

## The through-line for the document — three independent lines, one conclusion

This is now evidenced from three directions that do not depend on each other:

1. **Traffic DiD −4.55pp, check +10.4¢** — customers visiting less often, spending more per visit.
2. **Satisfaction stable through the period** (slope flipped positive post-launch; every dimension
   held during the tentpole) — operations are not the problem.
3. **A World Cup Happy Meal, in a World Cup year, in a host country, failed to move traffic** —
   demand is not responding to promotional stimulus.

**The convergent conclusion is that this is a demand-side problem, not an execution problem.**

That matters for how the document lands. It moves the conversation from *"your operators need to
execute better"* to *"the offer is not working"* — and each leg is independently defensible, so
challenging one does not collapse the argument. Point 2 in particular is the pre-emptive answer to
the most likely pushback, and it is measured rather than asserted.


### Calendar revision — a seventh event, and it cuts against the check finding

A later issue of the calendar (owner, 2026-08-14) adds one item the first version did not carry:

**7/10 — National French Fry Day (Flash Offer): free medium fries with $1 minimum purchase,
redeemable 1× per customer.** Falls in **B6**, alongside the McValue 2.0 rehit.

**This works against the check result, which makes that result more conservative.** A free-item
offer gated at a **$1 minimum purchase** manufactures a day of unusually low tickets by design.
Wherever it lands it drags average check down, so the measured **+10.4¢** check gain is if anything
**understated** in the affected block — the promotion pushed the metric the opposite way from the
finding.

Worth one line in the document. A limitation that biases *against* your own conclusion is the
cheapest credibility you can buy, and a reader who knows the calendar will spot the date anyway.

**Note on the World Cup Happy Meal:** the later calendar issue does not list it (its June section
begins at 6/23), almost certainly because that issue only carries forward-looking items. It is not
a retraction — the owner independently confirms the promotion ran and *"was a huge fail for us."*
The 6/9 start date stands, and the B4 mapping is unchanged.