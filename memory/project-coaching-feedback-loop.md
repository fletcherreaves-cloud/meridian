---
name: project-coaching-feedback-loop
description: The closed coaching loop — identify, coach, measure, verify — and why it is the thing that turns Meridian from a reporting tool into a management system. Owner-originated 2026-08-11. Read before building anything in Needs Attention, Task Queue, or Performance Reviews.
metadata:
  type: project
  status: designed, not built
---

# The coaching feedback loop

Owner, 2026-08-11, immediately after the gap was named:

> *"I think you may have just struck gold… we need to structure something somewhere that
> explicitly lays out this feedback loop that is attainable for stores even if it's only me
> using it right now, to where I can get very specific feedback to a location and then follow
> up to see if that feedback pushed the needle, and provide the follow up in app, and let's
> see what happens with our identification of needs attention items."*

Captured the same session it was raised, per the standing rule.

---

## 1. Why this matters more than another metric

Economic context the owner supplied, and the reason this sits above almost everything else:

> *"Food Cost and Labor are the 2 single largest line items in our P&L representing ~50% of
> all sales dollars… if I can improve labor by 0.25% - 0.50% or food cost by that or more, then
> I have 2 defined areas to coach and teach and push rather than nickeling and diming multiple
> other small fish to try and get the same return."*

Margins are thin. Everything outside those two lines is, in his words, *"just supporting how
much profit we stand to make."*

**Today Meridian tells the owner what is wrong. It never tells him whether what he did about
it worked.**

```
identify  →  assign  →  intervene  →  measure  →  verify
   ✅          ⚠️           ✅          ✅          ❌
```

The last link is the whole value. Without it, coaching is unmeasured effort and the app is a
reporting tool. With it, the app becomes a management system — and it **compounds**, because
over time it learns which interventions actually work, per component and per store.

## 2. The object

A **coaching cycle** record:

| Field | Notes |
|---|---|
| `loc` | store |
| `metric` | **specific** — "condiment %", not "food cost" |
| `baseline` | the metric's value over the N days BEFORE the coaching date |
| `coached_at` | date |
| `note` | what was actually said/asked |
| `review_at` | auto-set (default +30 days) |
| `result` | the metric's value over the N days AFTER |
| `verdict` | improved / held / no change / worse — **measured, never self-reported** |

Cloud-persisted with `tenant_id` + RLS, like every other stream. Never device-local.

## 3. Five rules that decide whether this survives contact with real use

These are what separate a loop that gets used from a form that gets abandoned.

1. **Baseline is auto-captured, never typed.** At the moment of coaching the app snapshots the
   trailing value from `metric-source.js`. If the owner has to enter numbers, this dies in a
   week.
2. **The follow-up comes to him.** The review lands in **Needs Attention** on its due date. He
   does not go looking for it. Needs Attention is already the "what needs me" surface — this is
   a new item type there, not a new panel.
3. **It starts from an identified item.** Coaching originates from an existing Needs Attention
   finding, so store and metric are already known. **Two taps, not a form.**
4. **The verdict is measured, not graded.** The app compares the after-window to the
   before-window through `metric-source.js`. The owner never marks his own homework.
5. **Single-user first.** No GM logins, no acknowledgement workflow, no notifications to
   stores. He coaches in person or by phone and logs it. Multi-user is a later layer — the loop
   must be fully useful with exactly one user, which is the state today.

## 4. The statistical honesty requirement — do not skip this

"Did it move the needle" is meaningless without knowing whether the change exceeds normal
variation. A verdict that fires on noise is worse than no verdict, because it teaches false
lessons about which interventions work.

This repo already has the tools and the precedent:
- `_robustCandidates` (`forecast.js:453`) — median ± k·MAD outlier logic
- The swing alarm's **-10% over two consecutive weeks**, derived from **676 measured
  store-weeks** — not a number that felt right
- The count-completeness **0.75** threshold, derived from a measured bimodal distribution

**Derive the "real change" threshold the same way**: pull the actual distribution of 30-day
metric movements per component across all 27 stores, and set the bar where a move stops looking
like ordinary drift. State the measurement in the code comment so it can be re-derived and
challenged. See `memory/feedback-measure-dont-reason.md`.

Expect this to differ by component — condiment % is probably far tighter than raw waste.

## 5. The part the owner named that makes it more than tracking

> *"let's see what happens with our identification of needs attention items"*

**The loop should make identification smarter, not just record coaching.**

- An item coached and **not** improved should **escalate or re-diagnose** — not silently re-fire
  identically next month.
- A store repeatedly flagged for the same item that coaching never fixes is evidence the item
  is **mis-specified** or the problem is **structural** (equipment, layout, staffing model),
  not behavioural. That is a different conversation and the app should be able to say so.
- Interventions that repeatedly work become **recommendations** — "this worked at 4 stores"
  is the strongest coaching input available, and nothing else in the app can produce it.

## 6. Where it plugs in

| Piece | Status |
|---|---|
| **Identify** | **Needs Attention** (`attention-now.js`) — exists |
| **Assign** | **Task Queue** / **Performance Reviews** — exist, not linked to measurement |
| **Measure** | `metric-source.js` / `vs-ly.js` — exist |
| **Verify** | **MISSING — this is the build** |
| **Learn** | falls out of the above once cycles accumulate |

Most of the loop is already in the app. The missing piece is the cycle record plus the review
that lands back in Needs Attention.

## 7. Scope discipline

Start with **food cost and labor only**. That is where the money is (§1) and a loop proven on
two line items generalises later. Resist opening it to every metric on day one — the value is
in coaching a few things well, which is the owner's whole point about not nickel-and-diming.

## 8. Related

- `memory/project-inventory-control-redesign.md` — the shell this reports into; §4 there records
  that the shell must be **generic enough to host Labor as well as Food Cost**, which is what
  makes this loop cover the full 50% rather than half
- `memory/feedback-measure-dont-reason.md` — the threshold-derivation discipline in §4 above
- `memory/project-events-redesign.md` — same confirm/dismiss-queue shape as the anomaly loop
  there; the two should share an interaction pattern rather than invent two
- #201 — Patch Heatmap; worst-of-N names the failing dimension, which is the natural entry
  point for "coach this"
