---
name: project-food-cost-labor-enhancements
description: Researched enhancement ideas for food cost and labor — the two P&L lines that are ~50% of sales. Sourced from the QSRSoft KB (208 articles, read directly) plus industry practice. Owner-requested 2026-08-11. Read before proposing anything in FOB, inventory, labor, or scheduling.
metadata:
  type: project
  status: researched, not built
---

# Food cost & labor — researched enhancements

Owner directive, 2026-08-11:

> *"Food Cost and Labor are the 2 single largest line items in our P&L representing ~50% of
> all sales dollars… if I can improve labor by 0.25% - 0.50% or food cost by that or more,
> then I have 2 defined areas to coach and teach and push rather than nickeling and diming
> multiple other small fish to try and get the same return."*

**The test for any feature in this space: does it move tenths of a point in food cost or
labor?** Most dashboard ideas fail it.

Research sources: the `qsrsoft_kb` table (**208 articles**, public-read, queried directly with
the anon key) plus industry labor-variance practice. Two passes — the second found more than
the first, and the biggest find was in it.

---

## 1. The unifying finding: decompose the variance, or people fix the wrong thing

Both sides of the business returned the same structural answer independently.

**QSRSoft, *Base Food Analysis*** — a food cost move has exactly three drivers, isolated by
holding the other two constant:

| Driver | Effect |
|---|---|
| **Pricing** | price increases lower food cost %; promotional decreases raise it |
| **Product mix** | customers buying different items shifts the blended % |
| **Raw cost** | market prices move base food every month |
| *Interaction* | when all three move at once the effects compound |

**Industry labor practice** — *"Labor variance analysis is most effective when it separates
rate, hours, and sales effects; without that distinction, teams often respond to the wrong
problem."*

```
Food cost:  price  ×  mix    ×  raw cost
Labor:      rate   ×  hours  ×  sales
```

Meridian today reports that FOB moved 0.5pp or labor % moved 0.4pp. It cannot say **which
driver**. That is the gap that produces the owner's "more questions than answers" feeling, and
it is the difference between coaching a GM and wasting their time.

---

## 2. ⭐ The biggest find (pass 2): role-based routines

The KB contains McDonald's-endorsed operating cadences **by role**:

```
What is the Owner's Daily / Weekly / Monthly Routine
What is a Supervisor's Daily / Weekly / Monthly Routine
What is a McOpCo Supervisor's Daily / Weekly / Monthly Routine
What is a Department Head's Daily Routine
```

Each is a sequence of **report → filter → what to look for**. Two observations that matter more
than the content:

**(a) The Owner's Daily, Weekly and Monthly routines are the SAME reports at different
filters** — Yesterday / Last Week / Last Month. That is literally `scope × period`, which is
exactly the shell in `project-inventory-control-redesign.md`. Strong independent validation of
that design.

**(b) The guidance tells operators to hand-colour spreadsheets:**

> *"This table can be downloaded as a CSV file to highlight targets and results vs targets.
> Often operators color code data in the table green for exceeding expectations, yellow if
> within a certain range, and red if below the bottom of the yellow range. These results can
> then be shared with their teams."*

**Operators are manually RAG-colouring CSV exports.** Meridian can simply do it. This validates
the Patch Heatmap (#201) outright — it is not a design flourish, it is the automation of a
documented manual routine.

**The opportunity:** organise the app around the owner's *routine* rather than around data
types. Instead of 40 panels, "here is your daily routine, four checks, here is what is off."
Meridian already has RBAC roles that map to these cadences. This is a candidate organising
principle for the whole UX coherence pass.

---

## 3. Food cost ideas, ranked

### 3.1 Data-discipline score — cheapest, and it makes every other number trustworthy
QSRSoft's *Food Cost Routines* leads with: enter raw and completed waste **daily, minimum once
per shift**, and *"if waste is missing, follow up with managers to address procedural issues."*

**Unrecorded waste does not vanish — it lands in `Unexplained`.** A store with 9 missing waste
days has an inflated Unexplained and a FOB number not comparable to anyone else's. So this is
foundational, not cosmetic.

QSRSoft shipped exactly this in April 2026 as **Missing Counts** and **Missing Waste** insight
cards — confirmation the target is right. We already pull `qsr_waste` and count status: this is
counting, not new data.

### 3.2 Low-supply / depletion projection
Their **Low Supply card** = on-hand + average daily usage + next delivery date → items
projected to deplete first. We have `qsr_on_hand`, usage, and `qsr_ebos_daily` for deliveries.
Real money: a stockout forces an emergency buy at retail, one of the fastest ways to wreck food
cost in a week.

### 3.3 Masking detection — already built, needs surfacing
Their Variance card catches *"large positive growth and loss offsetting each other"* — a
net-clean variance hiding two large opposing errors, usually a counting problem. **Meridian
already has a masking check** in the FOB Report (it is in the CSV export headers). Surface it.

### 3.4 Price / mix / raw-cost decomposition — needs Product Mix
The §1 framework applied. **This is the strongest argument yet for pulling Product Mix**
(Notes 25 #1 / 28 #5): without mix you cannot separate "customers bought differently" from
"we are wasting more," so `Unexplained` stays genuinely unexplained. The one new data source
that earns its cost.

Note the KB also has **Menu Items - Recipes**, which implies recipe-level theoretical usage is
available in QSRSoft — worth investigating as the other half of this.

---

## 4. Labor ideas, ranked

The KB has **zero** labor articles — searched, none exist. Labor insight is entirely external
plus our own data.

### 4.1 ⭐ Split the labor gap three ways — best labor idea, no new data
`qsr_daily_activity` already carries `total_needed_hours`, `total_scheduled_hours` and
`actual_punched_hours` — **hourly**.

```
Needed  → Scheduled   =  planning accuracy   →  coach the scheduler / the forecast
Scheduled → Actual    =  execution           →  coach the shift manager
```

Most operators see only the combined number. Splitting it says **which of two different people
to coach.** The execution half catches what the industry sources describe: *"unplanned
extensions, missed cuts, or employees clocking in early and stacking labor before volume
arrives."*

### 4.2 Rate / hours / sales decomposition of labor %
The most commonly misdiagnosed thing in the business: **labor % rises because sales fell**, and
the GM gets coached on labor when the problem is traffic. All three inputs exist today.

### 4.3 Intraday deployment heat map
An **hour × day-of-week** grid per store, coloured by needed-vs-actual gap. Hourly data
supports it exactly; CSS grid, **no charting library** (same technique as #201, no budget
impact). Turns "labor was 0.4 over" into "you are consistently two hours heavy at 2–4pm
Tuesdays."

---

## 5. Other finds worth having (pass 2, from the *Insights / Did You Know?* engine)

| Idea | Why it matters | Have the data? |
|---|---|---|
| **Product Outage** | menu items not being sold — usually broken or unclean equipment. Direct revenue leak, and a waste driver | Needs the POS Product Outage function; investigate |
| **Open Late / Close Early** | compares scheduled vs actual open/close. Opening late loses sales; staying open late with no volume is pure labor cost | Hourly sales yes; scheduled open/close times need checking |
| **Business Day Close** | locations that have not closed the business day, and for how many days. Incomplete days corrupt every downstream number | Same family as §3.1 — a data-trust metric |
| **Watch Lists** | a saved focus subset of stores (max 4). Lightweight, and pairs naturally with the coaching loop | Trivial |

---

## 6. What QSRSoft has that we already match — do NOT rebuild

- **CoachQ** is an **AI chat assistant with scheduled prompts** — not a coaching feedback loop,
  despite the name. Meridian is at parity via **SAGE** (live tools, RBAC-scoped, streaming,
  `sage_prompts` + scheduled runs).
- **Therefore `project-coaching-feedback-loop.md` is genuinely novel** — QSRSoft does not have
  measure-and-verify coaching. That is a real differentiator, not a catch-up feature.
- Their **Insight Cards** are attention-directing summaries — Meridian's **Needs Attention**
  occupies the same slot.

---

## 7. Sequencing

1. **§3.1 data discipline** and **§4.1 labor three-way split** — both use data already pulled,
   both directly serve coaching, and §3.1 makes everything else believable.
2. **§4.3 intraday heat map** — the visual payoff, cheap.
3. **§3.2 low supply**, **§3.3 masking** (surfacing only).
4. **§3.4 Product Mix pull** — the one genuinely new data source.
5. **§2 role-based routines** — feeds the UX coherence pass rather than being a panel.

**Four of the seven main ideas are surfacing problems, not build problems.** Consistent with
everything else found this session: the capability is in the codebase and the call sites do not
use it.

## 8. Related

- `memory/project-coaching-feedback-loop.md` — the measure-and-verify loop these ideas feed
- `memory/project-inventory-control-redesign.md` — the shell; §2(a) here validates its
  scope × period model, and §4 there records that it must host Labor too
- #201 — Patch Heatmap; §2(b) here is the documented manual routine it automates
- Notes 25 #1 / 28 #5 — the Product Mix pull, now strongly justified by §3.4

**Sources:** `qsrsoft_kb` articles *Base Food Analysis*, *Food Over Base*, *Food Cost Routines
— Quick Bullet Points*, *April 8 2026 — Food Over Base Enhancements*, *What is the Owner's
Daily/Weekly/Monthly Routine*, *CoachQ Quick Start Guide*, *Insights — Did You Know?*; plus
Restaurant365, 7shifts and Lavu on labor variance analysis.
