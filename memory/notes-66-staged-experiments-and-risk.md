# Notes 66 — staged experiments and living risk factors

Owner, 2026-08-14, two ideas that turn out to be one mechanism.

---

## 1. Training confidence ratings (owner's verbatim intent)

> *"While I am currently actively in the scheduling workshop in class teaching, would it help us
> or not for me to provide a snapshot analysis after each class to give you an indication for how
> I thought each restaurant received the training along with my confidence of them actually
> executing it moving forward… as simple as writing them almost like a risk factor of just a
> simple high, low or medium, with high being I highly believe they'll be successful in turning
> the teaching into practice… What I'm not sure of is what additional context would be valuable —
> meaning if I could speak to the fact that I think the GM's on board [but] the scheduling manager
> struggled to understand the concepts."*

### Why it is worth doing — pre-registration, not note-taking

The value is **not** the record of what happened in class. It is that the rating is made
**before the outcome is known**. Scheduling metrics then move, or they don't.

That is a genuine experiment. It is the same structure that made the Holdenville padding work
meaningful and the same structure that let the GM-departure-date prediction be **cleanly
falsified** (predicted Aug/Sept 2025; actual 2025-12-08). A prediction recorded afterwards is a
story; one recorded beforehand is a test.

**Two distinct payoffs, and the second is the underrated one:**

1. **A covariate on the stores.** If high-confidence stores improve on scheduling metrics and
   low-confidence stores don't, the training worked and the read was accurate. If they move
   together regardless, something else is driving it.
2. **A calibration record on the judgment itself.** Over enough cohorts we learn whether
   high/medium/low actually predicts — which tells us how much weight the owner's read deserves
   in future decisions. Almost nobody scores their own forecasts. Doing so is what converts
   intuition into a measured instrument.

### Design answer to "what additional context would be valuable"

**Structured dimensions beat free text**, and the owner's own example is the argument. *"GM's on
board but the scheduling manager struggled"* is not one rating — it is **two**, and they point at
different interventions.

Free text cannot be compared across 27 stores. Named dimensions can:

| dimension | rating |
|---|---|
| GM engagement / buy-in | high · med · low |
| Scheduling-manager comprehension | high · med · low |
| Overall execution confidence | high · med · low |
| *(free-text note)* | optional |

With 27 stores × 3 dimensions there is enough to test **which dimension predicts**. If GM
engagement predicts execution and comprehension doesn't, that is directly actionable — it says
where the next intervention goes. A single composite score can never tell you that.

Keep the note field, but as enrichment. Design as though it will usually be blank.

### Two disciplines that make or break it

1. **Capture immediately after the class.** Recall degrades within hours, and a rating made later
   is contaminated by knowing how the store has since performed. That destroys the whole point.
2. **Lock the rating once entered.** Edits versioned, never silently overwritten. An editable
   prediction is not a prediction.

---

## 2. Living risk factors for food cost and labour

> *"Early on… I put together a fairly comprehensive risk analysis for food cost and labor for all
> the stores… the status is old but probably still [relevant]. It was created somewhere in late
> February to mid March. Can we or should we put together some kind of engine/dashboard/tile/panel
> to keep a current risk factor for these two areas… store it in a table in Supabase for trending
> purposes to see if the store is improving or declining… Even in my head, this sounds like a
> grandiose idea that may just need to be simplified to a simple chip."*

The existing analysis lives in `data/org-structure/Organization_Structure.xlsx` (`Risk Profiles`
sheet + per-store columns), **derived late Feb – mid Mar 2026** — a point-in-time human judgment,
not a live signal.

### The version worth building: two tracks, and the gap between them

Computing a risk score from FOB variance and labour % is easy and, on its own, not very
interesting — it is one more derived number competing for trust. Re-recording human judgement
periodically is useful but subjective.

**The valuable object is both, side by side, and the disagreement between them.**

| track | source |
|---|---|
| **computed risk** | derived from data we already pull (FOB components, labour %, variance, count completeness) |
| **assessed risk** | the owner's / DO's judgement, same high-med-low shape |

Where they agree, confidence is high and nobody needs to look. **Where they diverge is the
signal** — either the model is missing something, or the operator knows something the data does
not. Both are worth knowing, and neither is visible if you build only one track.

This is also the same premise as the state-of-business engine in
`memory/notes-66-bullseye-and-state-of-business.md`: the system supplies evidence, the human
supplies judgement, and the system learns from the difference.

### On "grandiose" — the owner's instinct is right

**Build the storage and the trend first. The UI starts as a chip.** A directional indicator in a
prominent place (improving / flat / declining, with the current level) is the whole product for
v1. Panels can follow if the data proves it earns one.

The value is in *having a timestamped series*, not in how it is drawn. A chip backed by real
history beats a dashboard backed by one snapshot.

---

## 3. Both ideas are one mechanism — build it once

The owner spotted this himself: *"we could obviously copy this to any other experiment if you
will in the future."*

Training confidence and risk assessment are the same shape: **a timestamped, structured human
judgement about a store, on a named dimension, that can later be scored against what actually
happened.**

One table serves both, and every future experiment:

```
store_assessments
  loc            text
  assessed_at    timestamptz     -- when the judgement was made, not the period it covers
  assessor       text/uuid
  program        text            -- 'scheduling_workshop_2026', 'food_cost_risk', 'labor_risk'
  dimension      text            -- 'gm_engagement', 'execution_confidence', 'overall'
  rating         text            -- 'high' | 'medium' | 'low'  (ordinal, keep it 3-valued)
  note           text            -- optional
  tenant_id      uuid
  -- immutable: corrections are new rows, never updates
```

`program` is what makes it general. A new experiment is a new value, not a new table.

**Design notes:**

- Keep ratings **three-valued**. Five points invite false precision on a judgement call, and
  three is what the owner asked for.
- `assessed_at` is the **judgement date**, distinct from the period being judged. Both matter:
  the Feb–March risk profiles are useful *because* we know when they were made.
- Immutable rows. Scoring a prediction requires knowing what was predicted, not what someone
  later wished they had predicted.
- Seed it with the existing Feb/March risk profiles, dated correctly. That gives the trend a
  starting point on day one rather than starting from empty.

## 4. Sensitivity — this is personnel-adjacent by construction

*"The GM's on board but the scheduling manager struggled to understand the concepts"* is an
assessment of named individuals' capability. It falls squarely under #272's rule: raw facts
follow parity, **derived judgements are supervisor-and-above with the handling notice attached.**

An assessment row is a derived judgement from the moment it is written. Gate it at write time,
not at render — and the handling notice travels with it, per
`memory/project-sage-knowledge-grounding.md`.

This is also precisely the failure the owner named when setting that policy: *"a GM specifically
is researching their own restaurant and they get called out on a finding about themselves."* A
low execution-confidence rating with a note naming their scheduling manager is exactly that
object.

## 5. Outcome metrics — LOCKED before any rating (owner, 2026-08-14)

> *"The goal is for the stores to meet labor projections by scheduling within 1.5% – 2% above
> forecast labor. Tracked by % and hours +/-. Should not be extreme swings but consistent and
> stepped improvements toward the goal."*

**The workshop teaches scheduling, so the primary outcome must be a scheduling metric.**

| | metric | why |
|---|---|---|
| **primary** | `(scheduled − needed) / needed`, in **% and hours**, target **+1.5% to +2%** | directly what was taught |
| **secondary** | actual labour % vs target; VLH over/under | downstream — mixes scheduling quality with day-of execution, call-offs and forecast error |
| **third** | **volatility** — swing magnitude, shrinking | the owner's own criterion: *"not extreme swings but consistent and stepped improvements"* means success is **convergence**, not just level |

Using actual labour % as primary would blame the wrong person: a store can schedule exactly right
and still miss on actuals through nothing the scheduling manager did.

**The data already exists.** `qsr_daily_activity_rollup` carries `total_scheduled_hours`,
`total_needed_hours` and `actual_punched_hours` — the primary metric is computable today with no
new pull, and each store's **pre-workshop baseline can be established retroactively**, which is
what makes a before/after comparison possible at all.

## 6. Cohort status — all 20 stores usable

8 of 20 taught as of 2026-08-14 (4 in the last two days, 4 the prior week). **The owner has not
checked progress on any of them.**

That matters more than the timing does. Two contamination risks, and only one is serious:

- **Outcome contamination** — rating after seeing how a store is tracking. Destroys the
  prediction. **Absent on all eight**, because he hasn't looked.
- **Recall decay** — a week on, memory of the class is fuzzier. Adds *noise*, not bias.

So nothing is retrospective. All 20 are pre-registered with respect to outcome.

**Record `days_since_class` on every rating** rather than excluding the older four. That converts
recall decay from a worry into a measurable covariate: if week-later ratings predict worse than
same-day ones, we learn how long a useful read survives. If they don't, we stop worrying with
evidence instead of assumption.

**The one discipline that carries the whole thing: rate all eight BEFORE looking at any
scheduling data.** After the ratings are locked, look at anything.

## 7. Honest expectation

Twenty stores across three confidence levels is roughly four per cell — **directional evidence,
not statistical significance.** Say so up front rather than discovering it later.

The calibration value compounds **across** programs, not within one. This is entry number one in
a record that becomes genuinely powerful after five or ten. Which is exactly why
`store_assessments` must be general from the start rather than built for scheduling.

**To be unambiguous, since these two points sat in one paragraph and read as one** (owner asked,
2026-08-14: *"aside from high med and low what are you suggesting here? Leave it at that."*):

- **The rating scale is high / medium / low and stays there.** Three values, permanently. Nothing
  else is being proposed for it.
- **"General from the start" is about the `program` column only** — name the table
  `store_assessments`, not `scheduling_workshop_ratings`, so the next experiment is a new *value*
  rather than a new table. It has zero effect on what the assessor types.

The dimensions are the one place there's more than a single rating per store, and they are still
just high/med/low applied to named facets. One store's complete entry:

```
Tishomingo   gm_engagement             high
Tishomingo   sched_mgr_comprehension   low
Tishomingo   execution_confidence      medium
```

Three lines, three words, plus an optional note designed to be usually blank. Eight taught stores
= 24 words.

## 8. Still open

- Whether the DO / supervisors also rate, giving inter-rater comparison. Powerful, but only if
  ratings are taken independently and not after discussion.
