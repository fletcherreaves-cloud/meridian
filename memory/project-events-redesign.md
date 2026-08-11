---
name: project-events-redesign
description: Design for consolidating Events & Tags, Calendar Manager, Event Impact Registry and Anomaly Scan into one loop. Owner design conversation 2026-08-11, decisions signed off. Read before touching any events/tagging surface.
metadata:
  type: project
  status: designed, not built
---

# Events, Calendar & Impact — one loop, not four panels

Design settled with the owner on 2026-08-11 (Notes 65). Nothing built yet. Every decision
below carries an explicit owner answer — do not re-litigate them, and do not start building
from the Notes 65 bullet list, which this supersedes.

---

## 1. The classification that unlocked it

The owner's framing was *"I know there is a solution that makes this top-notch but am having
a hard time figuring it out."* The blocker was that **several structurally different things
share one storage model** (`(loc, date, type)` rows).

The operative test — the only question the forecast actually asks:

> **Was this same condition true on the day the forecast compares against (~52 weeks back)?**

| Type | Definition | In LY? | Storage | Forecast treatment |
|---|---|---|---|---|
| **A — Recurring calendar condition** | Calendar-determined, knowable a year ahead, recurs on a cycle | Yes | One **rule**, not rows | **Learn** the impact — excluding it throws away signal |
| **B — One-off store-day incident** | One store, one day, unpredictable | No | One row per `(loc, date)` | **Exclude** if the day's own value is a measured outlier |
| **C — Bounded period / structural change** | Spans weeks or months | May contaminate the LY *window* | `(loc, startDate, endDate)` | Depends — see Competition below |

**The owner's real categories against it:**

- **A:** Holiday, Black Friday (already handled outside tags via `isHoliday()`/`getHolidayAdj()`);
  School Year Begins/Ends, Break, No School, Early Release *(recurs, but on shifting dates —
  see §2)*
- **B:** all Weather types, Power Outage, Utilities, Technology, Maintenance, Staffing Issue,
  Public Emergency, Major Local Event, CFV/EcoSure/RGR
- **C:** Road Closure, Construction *(owner: "likely one-offs … but still impacting if it is
  measured to have actually impacted sales" — measurement-gated, consistent with the shipped
  measured-anomaly rule)*; **Competition** — see §2
- **LTO/Promo — its own shape.** Scheduled and district-wide like A, but non-recurring. Owner:
  *"because they are not on the same dates … the following year would likely not have the
  impact if there is no new LTO at same time, even then it would be a mixed signal with a
  whole different LTO."* Decision: **available to the calendar AND tracked as a known event
  for impact purposes.**

## 2. Three mechanisms the owner's answers exposed

These are forecast-engine problems, not display problems. Each is invisible to the existing
outlier test.

**LTO asymmetry — the outlier test structurally cannot catch this.** If LY ran an LTO and
today does not, LY's value is *legitimately* elevated: the day is not anomalous, the
**comparison** is contaminated. `_robustCandidates` (`forecast.js:453`) compares candidate
days against each other, so if the whole LY window sits inside one LTO, nothing reads as an
outlier and it passes clean. Needs an explicit **asymmetry check** — *was an LTO running then
and not now, or vice versa* — not a statistical test.

**School calendar — the "yin-yang" effect** (owner's word, and it is the right one). School
starts Aug 14 this year, Aug 16 last year. Aug 14 compares a school day against a summer day;
two days later it inverts. Both errors, opposite directions, neither an outlier. Fix: match LY
by **school-calendar position** (day 1 of school vs day 1 of school), not by date.

**Competition — not an event at all.** A competitor opening does not reduce sales *on a day*,
it reduces them *from then on*. Tagging a date is actively wrong; it must shift the store's
baseline forward from that date. Owner: *"you are big time right. It changes everything
potentially."* **DECISION: split into its own issue and reference it** — it is a forecast
change wearing an events costume, and bundling it would double this project.

## 3. Why there are 25,783 events

Not data. A **materialized rule**. Every row in the owner's screenshot ends
`[rule; US federal holiday calendar]` — a rule generated them and wrote **27 rows per date**
into the ledger. `Possible duplicates (0)` is technically correct and useless: those 27 Black
Fridays are one fact wearing 27 costumes.

**Roll-up-with-expand treats the symptom. The fix is to not materialize Type A at all** — a
rule can answer "is 2026-11-26 at Ardmore a Black Friday?" on demand. The ledger then contains
only what a human actually entered (Type B/C): hundreds, not 25,783.

Roll-up-with-expand is still the right display for the **impact** view, because impact is
genuinely per-store (Elgin's Black Friday is not Ardmore's) — owner confirmed an expanding row
is what he wants there.

## 4. The loop

Four panels are really one cycle:

```
rules generate expectations
    → anomalies flag unexplained days
        → owner confirms a cause          ← THE NEW PART
            → impact is learned per store
                → forecast improves
```

**Invert the workflow.** Today the owner must *remember* to tag. Instead anomaly detection
proposes candidates — *"Aug 3, Tishomingo, sales −32%, nothing tagged — weather shows a storm.
Tag it?"* — and he confirms or dismisses. Tagging stops being a chore he falls behind on and
becomes a queue he clears. Owner: **"Yes!"**

This is also what he was reaching for in Notes 65 with *"how much of all of this … can they be
correlated and useful for each other and integrated?"*

## 5. Build status — four of five legs already exist

| Leg | Status |
|---|---|
| Rules generate expectations | **Exists** — but materializes 25,783 rows; needs de-materializing |
| Anomalies flag unexplained days | **Exists** — see §6 |
| Owner confirms a cause | **NEW — the real build** |
| Impact learned per store | **Exists** — Event Impact Registry (only Sports wired; see #192 P0) |
| Forecast improves | **Exists** — `eventFactor` + the measured-anomaly exclusion (v4.924) |

The genuinely new work is the **confirm/dismiss queue** and the **de-materialization**. This
is much smaller than "rework Events & Tags," which is why it should go before any big-bang
redesign.

## 6. Anomaly Scan — built, hidden, not lost

Two different panels, which caused real confusion; both facts are true:

- The **old "Anomaly Detection" panel** was a genuine `orphan` (*"renders, but NOTHING opens
  it"*). Retired in #127 (v4.957); its one real capability — excluding weather-tagged days
  from the day-by-day sales baseline so a multi-week disruption can't drag down what counts as
  "normal" — was **harvested into the AI Backtest Scanner**.
- **"Anomaly Scan"** (`aiscan`, `src/app/panel-registry.js:41`) is `kind:'optional'` —
  *"Panel Manager registry, hidden by default (`constants.js OPTIONAL_PANELS`)"*. Section
  `intelligence`, perm `analytics.ai`. This is the owner's "unused panels" list.

So it is **fully built, permission-gated, and one Panel Manager toggle from visible** — and it
is the panel that *received* the retired one's capability, i.e. the most capable version that
has ever existed. The investigate leg is not a build; it is a **wire-in**:

> anomaly flagged → "Investigate" → opens Anomaly Scan **pre-seeded with store + date**

which is close to what the owner had before (*"I had an option to AI scan prebuilt with the
event as criteria and the location"*). The scanner was never the missing piece — the entry
point and the seeding were.

**DECISION:** keep the standalone optional panel as-is (don't disturb Panel Manager setups)
**and** add the seeded entry point. Same code, two doors. Owner: *"No one else using, won't
break, let's loop it in."*

## 7. The panel shape

The owner did not describe a ledger. Asked what he comes to the panel to do, he named:
add one-offs; see upcoming impacts; investigate why a day was weird; audit tags — *"but would
more so like to get this function setup to be done through rules and/or automatically."*

Four views, one home:

1. **Upcoming — the default.** What's coming, which stores, expected impact.
   **DECISION: 30-day default, with a custom range selector.** Nothing today does this; it is
   the biggest gap between what exists and what he asked for.
2. **Log** — Type B/C only, fast entry. Small, because Type A no longer materializes here.
3. **Investigate** — seeded Anomaly Scan (§6).
4. **Rules** — where auto-handling is configured. **Auditing moves here, off the ledger.**

Calendar Manager and Event Impact Registry fold in as views rather than staying separate
panels — the owner's *"should get their own home and dashboard."*

## 8. Decisions log (owner, 2026-08-11)

| Question | Answer |
|---|---|
| Invert to a confirm/dismiss queue? | **Yes** |
| "Upcoming" horizon | **30 days default + custom range selector** |
| Competition / baseline shift | **Split into its own issue, reference it** |
| Loop Anomaly Scan in? | **Yes — no one else using it, won't break** |
| Keep standalone optional panel too? | **Yes — same code, two doors** |
| Roll-up display | **One row, expands to per-store impact** |
| LTO | **Available to calendar AND tracked as a known event for impact** |

## 9. Still open

- **Event Impact Registry only populates Sports.** Other categories declared but never wired
  (#192 P0). This loop depends on impact being learned, so that gap is now on the critical
  path rather than a nice-to-have.
- **School-calendar LY alignment** — needs the school calendar as structured data with
  per-year dates. `loadOrgSchoolConfig` exists; not yet checked whether it carries enough.
- **Retail/Shopping Events import** confusion from Notes 65 (*"keep: Black Friday
  (skip: Black Friday)"*) is almost certainly the materialization problem showing through the
  import preview. Re-check after de-materializing before designing a fix.
- **Calendar "52 more" unreachable** (#192 P0) — likely also a symptom of ledger volume.

## 10. Related

- #192 — Notes 65 triage (P0s: false all-clear, FOB loc keying, stale tagged-days banner)
- `memory/feedback-measure-dont-reason.md` — the standing rule that produced the corrections
  in this session
- `forecast.js:440-460` — `_robustCandidates`, the measured-anomaly exclusion this design
  builds on
- The **stale tagged-days banner** (`store-dash.js:3530`, `calendar.js:1600`) still tells the
  owner heavy tagging can leave a store with no LY comparison. That is **false** since v4.924
  and is a P0 in #192 — fix it before anyone reads this design and re-derives the old model.
