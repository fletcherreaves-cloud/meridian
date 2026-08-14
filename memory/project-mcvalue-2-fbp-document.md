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
### ⚠️ Current calendar (Aug 2026 issue) — a RECURRING offer, not just point events

The live calendar carries two standing items the earlier issues did not surface:

```
Now–10/4  Weekly Mass Digital Offers | Free Medium Fry w/ $1 min purchase
          AND $2 Breakfast Sandwich  (redeemable 1x/customer PER WEEK)
Now–9/30  ABS 2.0 promotion — up to $3,000 savings per unit, all purchases  [operator-side]
```

**The Weekly Mass Digital Offers item is the most consequential thing found in any of the calendar
versions**, because it is *recurring* rather than a single date. A weekly free-fry offer gated at a
$1 minimum, running across the measurement window, acts continuously on both headline metrics.

**Issue dated 2026-08-10** (owner). That establishes the offer was live *by* 8/10; it does not
give the start date, since "Now" is relative to publication.

**Inference, and it is only an inference:** the preceding issue did **not** carry it. That issue
listed `7/10 National French Fry Day` as a **one-day** flash offer and had no standing `Now–`
items at all. A recurring weekly offer already running in July would almost certainly have appeared
there in the same standing form the August issue uses. So the likely start is **between mid-July
and 2026-08-10** — placing it in **B7, B8 and the final partial days**, roughly the last two to
three weeks of a sixteen-week post period.

**To pin it exactly:** find whichever issue *first* carried the `Now–10/4` line. That dates it to
within a week. Worth doing before the claim goes in the document, but not blocking.

**What matters most: B1–B3 is clean of this as well.** The headline six-week window closes
2026-06-01, well before any plausible start date. No version of the answer reaches the read the
document leads with — which is a further argument for making B1–B3 the headline rather than the
eight-block average.

**It biases BOTH findings toward conservatism, whichever the answer:**

| finding | direction of the offer's effect | consequence |
|---|---|---|
| check **+10.4¢** | free item at a $1 minimum **suppresses** average check | the gain was measured *against* a check-suppressing offer — **understated** |
| traffic **−4.55pp** | a free item is a **traffic draw** | the decline was measured *against* a traffic-supporting offer — **understated** |

That is the good kind of confound: it works against the conclusion in both directions, so naming it
strengthens the document rather than weakening it.

**`ABS 2.0` is operator-side** (equipment/supply savings, not consumer-facing) so it does not touch
traffic or check — but it is relevant to food-cost and P&L work, and is noted here so it is not
mistaken for a marketing event later.

### Post-cutoff items — context only, not in the data

`8/17` Energy Launch + Coffee LTO · `9/1` Spicy McNuggets LTO · `9/8` **Dual Daypart EVM** ($5
Sausage McMuffin w/ Egg; $8 Big Mac) · `9/15` Arch Card balance in the app · `9/15` Happy Meal #8 ·
`9/18` **National Cheeseburger Day** (free Double Cheeseburger, $1 min) · `10/6` Monopoly ·
`10/20` Happy Meal #9.

**Worth one observation in the document:** the forward calendar is dense with **free-item and
deep-value offers** — weekly free fries, $2 breakfast sandwiches, free Double Cheeseburger, dual
daypart EVMs at $5/$8. A system leaning this hard on discounting is itself consistent with the
demand-side reading, and unlike our own analysis it is McDonald's own published plan rather than
our inference.

---

# ⚠️ TWO DEFECTS IN THE BLOCK LAYOUT, found 2026-08-14 once the launch date was confirmed

The block layout was designed **before the McValue date was known** — anchored to data recency
(working back from Aug 12), not to the intervention. With 4/21 now confirmed from the calendar
itself (`4/21 — McValue 2.0 Launch`, April 2026 issue), two things are wrong.

## Defect 1 — the pre/post boundary is in the wrong place

```
 -9  pre   2026-03-26 → 2026-04-08
 -8  pre   2026-04-09 → 2026-04-22   <-- McValue 4/21 falls INSIDE this block
 -7  pre   2026-04-23 → 2026-05-06   <-- ENTIRELY after launch, labelled PRE
 -6  POST  2026-05-07 → 2026-05-20
```

**Roughly 16 days of post-launch trading sit in the control group.** Block −7 is wholly
post-launch; block −8 straddles the launch.

Direction: this *dilutes* the measured effect, so the true effect is **larger** than reported —
conservative, but indefensible once the date is known. A reviewer spots this in one minute.

**Fix: re-anchor to the launch.** 2026-04-21 is a **Tuesday**, so Wednesday-aligned blocks start
2026-04-22 and give **8 complete post blocks** (one more than the current 7):

```
B1 04-22→05-05   B2 05-06→05-19   B3 05-20→06-02   B4 06-03→06-16
B5 06-17→06-30   B6 07-01→07-14   B7 07-15→07-28   B8 07-29→08-11
pre = 2025-12-31 → 2026-04-21  (8 matched blocks)
```

## Defect 2 — the re-anchored pre-period contains a month-long FREE-ITEM promotion

From the March/April 2026 calendar issue:

> **Month of March — GMA Download Incentive: Free 10 pc McNuggets with $1 min purchase**

A national, month-long, free-item offer gated at a $1 minimum — sitting inside the baseline,
covering roughly **30% of the pre window**.

**This is the first confound found that inflates the headline findings rather than deflating
them**, and it does so on **both**:

| metric | effect on the 2026 pre window | effect on the DiD |
|---|---|---|
| traffic | free item **raises** pre-period traffic → pre-vs-LY inflated | subtracting a larger pre makes the decline **more negative — OVERSTATED** |
| average check | $1-minimum free item **lowers** pre-period check → pre-vs-LY depressed | subtracting a smaller pre makes the gain **larger — OVERSTATED** |

Traffic down and check up is *exactly the signature a free-item promotion ending would produce*,
independent of anything McValue did. That is the challenge this document must answer.

### It may cancel — and that is measurable, not a matter of opinion

The DiD compares 2026 against `ly_` twins. **If March 2025 carried a comparable offer, the LY twin
absorbs it and the confound largely cancels.** This is precisely the reference-class extension
already flagged in this file (owner's own idea) — now on the critical path rather than a nice-to-have.

**Two things to get, in order:**

1. **The March 2025 calendar issue** (ideally Jan–Apr 2025, covering the whole pre window's LY
   twin). Settles whether the confound cancels.
2. **Measure it directly:** pull DAR traffic and check for March 2026 vs March 2025. A month-long
   free-item promo leaves a visible footprint. If March 2026 shows a traffic spike and a check dip
   versus its LY twin, the confound is live and quantifiable; if not, it is inert. **This does not
   require the calendar** — it can be run now.

**Do not publish the DiD numbers until defect 1 is fixed and defect 2 is either measured or
excluded.** Both are cheap. Both are the kind of thing that, found by a reader first, costs the
whole document its credibility — and found by us first, becomes a methodology section that
demonstrates rigour.

---

# ⚠️ TWO MENU PRICE ROUNDS LAND INSIDE THE POST WINDOW — this threatens the check finding

Full calendar coverage (Mar–Oct 2026) obtained 2026-08-14. Rebuilt against launch-anchored blocks:

```
 B1  04-22 → 05-05   05-05 Happy Meal #4 begins
 B2  05-06 → 05-19   05-06 Beverage Launch (all-store sell)
                     05-14 DEADLINE for price changes ahead of 2026 PRICE ROUND 1
 B3  05-20 → 06-02   06-01 McDonald's Worldwide convention (6/1-6/4)
                     06-01 2026 Price Round 2 recommendations available on portal
 B4  06-03 → 06-16   06-09 FIFA World Cup Meal (dual-daypart) + Happy Meal #5
 B5  06-17 → 06-30   06-23 Fried Apple Pie LTO
                     06-26 DEADLINE to submit recommendations: PRICE ROUND 2
 B6  07-01 → 07-14   07-07 McValue 2.0 REHIT · 07-10 French Fry Day · 07-14 Happy Meal #6
 B7  07-15 → 07-28   07-15 MENU ITEM SEQUENCING begins deploying · 07-21 flavour news ×2
 B8  07-29 → 08-11   — clean —
```

## The pricing problem, stated plainly

**Two menu price rounds sit inside the measurement window.** Round 1 changes were due 5/14; Round 2
recommendations landed 6/1 with submissions due 6/26. Both take effect *after* McValue launched.

**Average check +10.4¢ on a roughly $10 check is about 1%. A menu price round is typically 1–3%.**
So the entire measured check gain could be **price**, not mix — a complete alternative explanation
for a headline number, and one a franchisee reader will think of immediately because they took the
same rounds.

**This is answerable, not a data limitation.** The owner sets his own pricing. **The question to
answer before publishing: did the stores take price in Round 1 and/or Round 2, on what effective
dates, and at roughly what percentage?**

**The decomposition that saves the finding:** **B1 (04-22 → 05-05) closes before the Round 1
deadline**, so whatever check movement appears in B1 cannot be price. B1 is therefore the clean
read on the McValue *mix* effect — which is what the document actually wants to claim. If B1 shows
the check gain and later blocks show more, the extra is plausibly price; if B1 shows nothing and
the gain only appears from B2, the finding is probably pricing and the claim must change.

**Run that block-level check-versus-price decomposition before the 25th.** It is the difference
between a defensible finding and one that collapses on the first question.

## Correction — "B1–B3 is clean" was wrong

An earlier note in this file called B1–B3 a clean six-week window. **With full calendar coverage
that is not true.** B1 carries a Happy Meal rotation, B2 a Beverage Launch and the Round 1 price
deadline, B3 the Worldwide convention and Round 2 recommendations.

The honest statement is narrower: **B1 is the cleanest block** — one routine Happy Meal rotation
(which rotates on a similar cadence in the LY twin and therefore largely cancels in a vs-LY design)
and **no pricing action**. Everything from B2 onward carries either a promotional launch or a
pricing event.

I asserted the clean window before having the calendar for it, then had to narrow it twice as
coverage arrived. Recorded so the file shows the correction rather than only the conclusion.

## Also new

**`7/15 — Menu Item Sequencing begins deploying`** (B7). An operational deployment changing order
flow, not a promotion. Potentially relevant to service times and throughput, and therefore to both
the DAR service metrics and any traffic read on B7 onward. Nothing else we track would have flagged
it.

**`9/8 — McValue 2.0 Rehit`** (Breakfast under $3: $1.50/$2 Sausage McMuffin; ROD under $3:
$1.50/$2 Cheeseburger) — a **third** McValue action, after the data cutoff. Note that two calendar
issues describe 9/8 differently (one as a McValue rehit, one as a Dual Daypart EVM at $5/$8);
worth resolving if 9/8 ever enters an analysis window.

---

# PRE-PERIOD CALENDAR (Jan–Apr 2026) — two findings that change the claim

Obtained 2026-08-14. The pre-period was **not** a quiet baseline.

## Finding 1 — the free-item offer is MONTHLY and covers the ENTIRE pre-period, then stops

| month | GMA Download Incentive |
|---|---|
| Jan 2026 | **Free Big Mac** w/ $1 min purchase |
| Feb 2026 | **Free Large Fry** w/ $1 min purchase |
| Mar 2026 | **Free 10 pc McNuggets** w/ $1 min purchase |
| **Apr–Jul 2026** | **no equivalent line appears in any issue** |
| Aug 2026 | *Weekly* Mass Digital Offers — free medium fry, $1 min, **1×/customer per week** |

**This supersedes the earlier note that treated March's free-McNuggets as the confound.** It is not
a March event — it is a **standing monthly programme running through the whole pre-window**
(pre = 2025-12-31 → 2026-04-21, i.e. Jan, Feb and Mar entirely).

And it appears to **stop after March**, with no standing free-item offer visible Apr–Jul, returning
in a *weekly* (4× more frequent) form by the 2026-08-10 issue.

**If that pattern is real, it is the strongest confound found and it inflates both headline
findings:**

- pre-period carries a monthly free item → **traffic up, check down** in the baseline
- post-period (Apr 22 → ~Jul) carries none → traffic down, check up **relative to it**
- DiD therefore reports **traffic falling and check rising** — *exactly the observed result* — with
  no McValue effect required at all

⚠️ **Caveat, and it matters: absence from a calendar listing is not proof the offer stopped.** The
Apr–Jul issues may simply not repeat standing items. **Verify before relying on this** — it is the
same "absent document ≠ absent event" error already made twice in this file.

**The decisive question is unchanged and now sharper: did Jan–Apr 2025 carry the same monthly GMA
Download Incentive?** If yes, the `ly_` twin absorbs it and the confound cancels. This is now the
single highest-value item in the whole calendar exercise.

## Finding 2 — McValue was ALREADY RUNNING in the pre-period

> **2/2 — McValue Marketing re-hit**

McValue 1.0 was live and being re-marketed during the baseline. **The pre/post comparison is
therefore McValue 2.0 versus McValue 1.0 — not McValue versus no-McValue.**

**This changes what the document can claim.** *"McValue hurt us"* and *"McValue 2.0 underperformed
McValue 1.0"* are different statements, and only the second is supported. The second is also more
credible and harder to dismiss — it is a like-for-like comparison of two versions of the same
platform, which is a fairer test than comparing a value platform against its absence.

State it explicitly. A reader who knows McValue 1.0 was running will otherwise conclude the
document's authors did not.

## The pre-period was promotionally dense

`1/6` $5 Sausage McMuffin EVM + $8 2-Snack-Wrap EVM advertising · `1/27` Happy Meal #1 + Core Hot
Honey AM/ROD LTOs · `2/2` **McValue re-hit** · `2/2–2/16` **EVM Accelerators** (audience-segmented
digital wallet offers, targeted by recent EVM behaviour) · `2/10` Double Filet-O-Fish local LTO ·
`2/17` Shamrock Shake + Oreo McFlurry · `3/2` National Egg McMuffin Day flash offer · `3/2–3/8`
**GMA Delivery Accelerator** (segmented by GMAD order behaviour) · `3/3` Core Beef Campaign ·
`3/31` Dual-Daypart Brand Relevance advertising begins.

**The baseline is not a control period.** Any framing that treats "pre" as normal trading and
"post" as the intervention is wrong on the facts. The honest framing is two differently-promoted
periods compared against their own LY twins — which is what a DiD is for, but it has to be said.

The **segmented accelerators** deserve a note of their own: they target individual customers by
recent purchase behaviour, so their effect is **not uniform across stores or customers**. That is a
source of variance no store-level analysis can see or control for.

## Price Round 1 — the dates CONFLICT across issues

- `2/5` — "Deadline for price changes before Price Round 1"
- `3/20` — "2026 Price Round 1 Deadline to submit price recommendations on the portal"
- `5/14` — "Deadline for Price Changes Ahead of Price Round 1"

Three different issues, three different Price-Round-1 dates. Either these are sequential gates in
one process or the date moved. **Do not cite a Price Round 1 date from the calendar** — the owner
knows what his stores actually did and when it went effective. That remains the question to answer.

## Corroboration — the monthly free-item programme really does end after March

A **March-issue** "Next 60 Days Calendar" (forward-looking, covering Mar/Apr/May) lists
`Month of March — GMA Download Incentive: Free 10 pc McNuggets` and shows **no April and no May
equivalent**.

That is a second, independent issue reaching the same conclusion, and it is the stronger form of
the evidence: a forward-looking calendar that lists March's monthly offer would list April's if
one existed. **The earlier caveat is now substantially reduced** — this is no longer inference from
a document that simply didn't cover the period.

**Also in the pre-period: the Big Arch launch.** `3/3` all-store sell, `3/9` advertising begins. A
major new product introduction, plus `3/31` Dual-Daypart Brand Relevance advertising and Happy Meals
#2 (3/10) and #3 (3/31).

*(Naming inconsistency across issues, again: `3/3` appears as "BIG ARCH All Store Sell" in one
issue and "Core Beef Campaign All Store Sell" in another; `3/9` likewise. Almost certainly the same
campaign under two names — another reason #290 must keep issues append-only rather than deduping.)*

## The synthesis — and why the 2025 calendar is now CRITICAL PATH

Laying the two periods side by side:

| | promotional support |
|---|---|
| **pre** (Jan–Apr 21) | monthly free-item offer (Big Mac / Large Fry / 10pc McNuggets) · **Big Arch product launch** + advertising · McValue 1.0 re-hit · EVM Accelerators · GMA Delivery Accelerator · Egg McMuffin Day · Shamrock Shake / McFlurry · Double Filet-O-Fish · Core Hot Honey LTOs · Dual-Daypart Brand Relevance |
| **post** (Apr 22 – Aug 13) | McValue 2.0 · Beverage Launch · **World Cup Happy Meal (failed)** · Fried Apple Pie LTO · McValue 2.0 rehit · French Fry Day · flavour news ×2 · weekly digital offers (from ~Aug) |

**The pre-period had stronger promotional support than the post-period** — a major product launch
and a standing monthly free-item offer, against a post-period whose tentpole failed.

Comparing a strongly-supported baseline to a weakly-supported treatment period will show traffic
down and check up **whether or not McValue did anything**.

**The `ly_` twin design is what is supposed to neutralise this** — but only if the 2025 pre and post
periods had a *similar relative* promotional intensity to each other. If 2025 was flat across both,
the 2026 imbalance passes straight through into the DiD.

**So the 2025 calendar (roughly Dec 2024 – Aug 2025) is no longer a "reference-class extension"
nice-to-have. It is the item that determines whether the headline numbers mean what the document
says they mean.** Specifically:

1. Did Jan–Apr **2025** carry the same monthly GMA Download Incentive? (settles the largest confound)
2. Was there a comparable major product launch in the 2025 pre-window? (Big Arch's counterpart)
3. What was running May–Aug **2025** — the LY twin of the post period?

If the answer to all three is "similar to 2026", the confounds cancel and the findings stand as
measured. If 2025 was materially different, the DiD is measuring calendar asymmetry and the
document's claim has to be rebuilt around B1 and the like-for-like McValue-2.0-vs-1.0 framing.

**This is the single highest-value item remaining before 25 August.**
