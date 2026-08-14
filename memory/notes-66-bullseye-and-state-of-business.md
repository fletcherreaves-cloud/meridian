# Notes 66 — the bullseye tile and the state-of-the-business engine

Captured 2026-08-14. Owner's ideas, verbatim first, then the design read. He noted these came
to him "last night while trying to go to bed," and added: *"I realize I have a lot of similar
type things. The hope being if I keep brainstorming and along with your help, we eventually land
on an amazing solution we can adopt."*

Both are wanted. Owner on ordering, 2026-08-14: *"I'm indifferent, they both need to be done.
They could be done in parallel as far as I'm concerned or you can do them in the order you
presented."*

---

# 1. The bullseye tile

## Verbatim

> A tile or place to visually show each location based on selected metrics and scores
>
> The thought is a chart (may have to create from scratch) that is like a bullseye in style.
> Inner circle for stores beating target or top performers, first circle for those at target and
> outer band for those not meeting target. Scatter plotted using loc# and metric/score result

## Design read

**What the form is good at, honestly.** The canonical chart for "Δ to target across ~27 items"
is a diverging bar or a dot plot against a baseline — it beats a radial layout for *looking up
one store*, because linear position is easier to judge than distance from a centre.

The bullseye wins at something a sorted bar chart is bad at: **the shape of the district in one
glance.** Is the cloud tight around the centre, or splattered into the outer band? You see that
instantly, and no bar chart gives it to you without counting.

So the right framing is **distribution gestalt, not lookup**. Pair it with the ranked list for
lookup — the Leaderboard tile already does that job well and does not need duplicating.

## Four design decisions the sketch leaves open

### a. Do not waste the angle

The sketch has radius = score and angle = loc#. Ordering stores by loc number is meaningless, so
that dimension carries nothing.

**Use angle for market / org instead** — Oklahoma occupies one arc, Florida another, with a thin
gap between. The tile then answers "is one market carrying the other" at the same glance, which
is a question actually asked here. Within a sector, spread stores evenly by rank so dots do not
pile up on one bearing.

If patch/supervisor grouping is selected instead of market, the sectors subdivide the same way.

### b. Radius = signed distance from target, not raw score

Otherwise the tile cannot mix metrics: OEPE and labor % are lower-is-better, sales and TPPH are
higher-is-better, and a raw-score radius would put good stores on opposite sides depending on
which metric is selected.

Normalise every metric to **performance vs that store's own target** (percent of target, signed
so positive is always good). Centre = at or beating target. Then "closer to the centre is
better" holds literally for every metric, which is the whole promise of the form.

This also reuses `DEFAULT_TARGETS` / `resolveLaborTarget` rather than inventing a second notion
of target.

### c. Equal-area rings, not equal-radius rings

The geometric trap. With evenly spaced radii the outer band has several times the area of the
inner circle, so the top performers — the smallest ring — get the least room and collide, while
the underperformers get a generous field. Backwards for a district where you want to see who is
winning.

**Space the ring boundaries as √ of the cumulative fraction** so each band has equal area. Simple
change, and it removes the crowding without any dodge logic.

### d. Colour is redundant with position — keep it that way

Band membership already encodes above / at / below target. Colouring the dots the same way is
*redundant encoding*, which is correct: identity is never carried by colour alone, and the rings
carry text labels regardless.

**Optional richer version worth considering:** let position encode where a store *is* and colour
encode which way it is *going* (improving / flat / declining vs the prior period). A store in the
outer band and improving is a genuinely different situation from one in the outer band and
declining, and that distinction is invisible in every current tile. Costs a legend and a second
data pull. Flagged as an option, not folded into the base spec.

## Palette — measured, not chosen

Meridian's existing status trio was run through the dataviz validator against the app's own dark
surface `#0f1117`:

```
#10b981, #f59e0b, #f87171   →  FAIL
  normal-vision floor: #f87171 ↔ #f59e0b  ΔE 14.6  (below the 15 hard floor)
  CVD separation:      tritan 8.6
```

**Amber and red are hard to tell apart even with full colour vision**, and they would be adjacent
touching rings in this chart. Swapping only the red fixes it:

```
#10b981, #f59e0b, #f43f5e   →  PASS on separation
  normal-vision floor: 21.6   (was 14.6)
  tritan CVD:          16.6   (was 8.6)
  contrast vs surface: all ≥ 3:1
```

One token changes. Green and amber stay exactly as they are, so this is a one-line edit to the
status palette rather than a redesign — and it is worth doing app-wide, not just here, since the
same trio is used across At-A-Glance.

The validator also reports a Lightness-band FAIL on every variant tried. That check exists for
*categorical* palettes, which need a consistent lightness band; a status palette is deliberately
non-uniform in lightness because lightness is part of the signal. Recorded rather than chased —
it is the wrong check for this job, and the tool's own scope note says so.

## Base spec

- Metric selector (reuse the Leaderboard's metric list — same `META` shape)
- Scope: All → State → Org/Patch → Store, per the standing selector UI
- Radius = signed % vs target, clamped; centre = best
- Angle = market/org sector; even spread by rank within sector
- Three equal-**area** bands: beating / at / below target, each labelled in the ring
- Dot ≥ 8px with a 2px surface ring so overlaps stay readable
- Per-dot hover tooltip: store name, loc, metric value, target, Δ, rank
- Click → existing store drill-down
- Lazy panel per the performance budget; measure entry chunk before/after

---

# 2. The state-of-the-business engine

## Verbatim

> Another state of the business generated from all of the data we have by groupings
>
> Walks an above store user through an interactive process to review, diagnose and create a plan
> of action based on what they feel is important using our data as a backbone for decision making.
>
> We could present findings and point in directions while allowing the user to structure the plan
> using actual real life knowledge so that it becomes a buy in from them to actually go and take
> action.
>
> I would allow for selections to be made for the user to include or not the data available.
> While also allowing for comments that, if utilized by the user (not forced of course) could
> help us learn from behaviors and actions and help us to derive better recommendations moving
> forward.
>
> Presentation > not sure yet how to best make this into a useable engine
>
> But, I think it's worth pursuing

## What is genuinely new here

The owner flagged the overlap himself, and he is right that there is some: Morning Brief,
Coaching, Management and Visit Readiness all touch review → diagnose → act.

**The difference is who authors the conclusion.** Every existing panel asserts one — here is your
number, here is the flag, here is the recommendation. This engine deliberately does not. It
supplies evidence and lets the operator build the plan.

That is not a softer version of the same thing. It is a different claim about where judgement
lives, and it targets the actual failure mode of BI tools: a system-authored plan gets read and
ignored, because nobody owns it. His word for the fix is exactly right — **buy-in**. A plan the
operator assembled from evidence they chose to include is a plan they will work.

**The second new thing is the learning loop.** Optional comments on what the user included,
excluded, and decided feed back into future recommendations. Nothing in Meridian currently
learns from a human's *reasoning*; the forecast models learn from outcomes only. This is a
different and much scarcer signal.

## Design constraints that follow

1. **The system never writes the plan.** It proposes evidence, ranked. The user includes,
   excludes, reorders, and writes the actions. If a build starts auto-drafting the action list
   "to be helpful," the premise is gone.
2. **Exclusion is data.** A user dismissing a finding is as informative as accepting one, and it
   is the cheaper signal to collect because it needs no typing. Capture it whether or not they
   comment.
3. **Comments are never required.** Stated explicitly by the owner. Any design that gates
   progress on a text box will be abandoned.
4. **Groupings are the spine** — "by groupings" is in the first line. State → org → patch →
   store, the same hierarchy as every selector. The walkthrough should work at any level.
5. **The output is an artifact.** A plan that lives only inside a modal is not a plan. It needs
   to persist, be revisited, and be checkable later against what actually happened — which is
   also what makes the learning loop measurable rather than merely collected.

## Honest risks

- **Sparse comments → weak learning.** If comments are optional and most users skip them, the
  learning loop starves. Include/exclude telemetry is the fallback signal and should be treated
  as the primary one from the start, with comments as enrichment.
- **Walkthroughs get abandoned.** A multi-step wizard has drop-off at every step. Fewer, denser
  steps beat more, simpler ones for this audience — this is a power-user tool.
- **Sensitivity.** A "state of the business by grouping" walkthrough for an above-store user is
  precisely where personnel-adjacent findings surface. The facts-vs-judgments rule (#272) and the
  handling notice apply here, and need to be part of the design rather than retrofitted.

## Not yet decided

Presentation. The owner said so plainly — *"not sure yet how to best make this into a useable
engine"* — and that is the right place to stop capturing and start prototyping. Recorded here
without a chosen form so the idea survives the session with its intent intact.
