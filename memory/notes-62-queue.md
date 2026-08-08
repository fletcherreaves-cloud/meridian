---
name: notes-62-queue
description: Notes 62 field-note queue (2026-08-08) — SAGE capability questions, Graded Visits auto-pull, Local News selectors, Event Tags panel, plus two bugs found in the owner's screenshots (1382ms click handler, 1.2 million % chart).
metadata:
  type: project
---

# Notes 62 — captured 2026-08-08

Field notes die with the session, so the queue lives here. Context: Dialed-In was restored
this session (26/27, all trend columns live) — see [[notes-61-queue]].

---

## Bugs found in the owner's screenshots (not in their written list)

1. **`[Violation] 'click' handler took 1382ms`**, firing on nearly every click. There is exactly
   one document-level click listener: `onActivity` (`App.js:1770`), which calls `refreshDar` on
   click/keydown. It is throttled by `STALE_MS` (30 min), so the fetch itself is rare — the cost
   is almost certainly the `setDarRows` re-render cascade through a very large tree, not the
   query. **Not yet diagnosed. Measure before theorising** — this is the third area this session
   where the obvious suspect was wrong. Directly in scope for
   [[feedback-performance-budget]] ("perceived or otherwise").

2. **6-Week Performance chart renders 200,000%–1,200,000%** (`store-dash.js:321`). `getDOWTrend`
   returns a RATIO from `(cur-ly)/ly`, and the chart correctly does `*100`. A y-axis of 1.2M%
   means the ratio came back ≈12,000, which happens when an LY denominator is tiny but > 0. Real
   data-integrity bug, visible to any user. **Fix needs the guard `getDOWTrend` lacks: reject or
   clamp points where `ly` is implausibly small relative to `cur`.**

---

## DONE

- **Local News location chips** — the panel capped chips at 8 (`byLoc.slice(0, 8)`) while the
  header said "17 locations". All locations with coverage now render, and the header reads
  "N of 27 stores have coverage" so the gap between 17 and 27 is self-explaining (most towns
  simply have no local story).

---

## Notes 62 — owner's list

### Graded Visits
- **Auto-pull the data from McDonald's** (currently manual).
- While in there, look for attainable **documentation for the KB**.

### Local News
- ✅ Location chips fixed (above).
- **Add the standard location selector** + the usual filter options, per
  [[feedback-selector-ui-standard]].
- **Document when/how it updates** — nightly pull at 11:40 UTC via
  `.github/workflows/news-rss-pull.yml`; surface that in the panel rather than only in code.

### Event Tags — follows directly from the v4.910 root cause
The 450-tagged-days finding means the owner has no way to see what is tagged.
- Wants a panel listing **all** events, **sortable by location** and **filterable by date,
  tagged-state, event type, impact**.
- Believes an older panel existed and may have been removed — **check the panel registry and
  `ORPHANS`/`VESTIGIAL_STATE` before building anything new.**
- This is the diagnostic surface for whether those 450 tags are a recurring-registry rule
  over-expanding across the calendar (the rejected LY dates were consecutive Fridays and
  Saturdays, which smells like a rule, not one-off events).

### Items Counted tile
- Keep the existing **EOM** tile as-is.
- Add a **second, always-active tile** feeding Daily / Weekly / Monthly analysis for **FOB,
  Food Cost and Counts**.

---

## SAGE — the owner's eight questions

Owner: *"Let's get SAGE where it can literally see and analyze anything in the app... The answer
to the following all need to be YES. If not, how do we get there?"*

Honest assessment as of 2026-08-08 (`supabase/functions/sage-chat`, `claude-opus-4-8`, 4 live
tools, RBAC-scoped):

| # | Question | Today | What closes the gap |
|---|---|---|---|
| 1 | Make it smarter | Partly | Not a model swap — it is TOOL BREADTH. It has 4 tools against ~50 registered metrics. Give it the metric resolver as a generic tool and it can answer anything the app can compute. **Biggest single win.** |
| 2 | Self-learn | **No** | No memory between sessions. Needs conversation persistence + a feedback loop (the 👍/👎 already scoped in `project-sage.md`). "Learns" = retrieves prior answers/corrections, not weight updates. Be precise with the owner about that distinction. |
| 3 | Solve complicated problems | Partly | Bounded by #1. It reasons well; it cannot reach most of the data. |
| 4 | Reason from OUR rules | **No** | The standing rules live in CLAUDE.md and memory/ — SAGE has never seen them. Feed the rule set into the system prompt: auto-first, never average averages, dollar-weight, matched-day vs-LY. This is cheap and high-value. |
| 5 | See the interface | **No** | Text-only. Needs the active panel's state passed as context ("user is on District View, store 3708, week of Aug 5"), NOT screenshots. Then it can comment on what is on screen and pull complementary data. |
| 6 | Real personality | Partly | Purely a system-prompt question. Trivial to add, worth doing deliberately rather than by accident. |
| 7 | Reach the outside world | **No — fully sandboxed** | The Edge Function can make outbound calls; nothing is wired. Web search would need a provider + a cost/abuse boundary. Decide whether this is wanted before building. |
| 8 | Manager-ready action plans | Partly | It writes well but is not grounded in enough data (#1) or the rules (#4). Also needs an explicit output contract: what to do, which store, by when, expected effect. |

**The ordering that matters:** #1 and #4 are cheap and unlock #3 and #8. #5 is a moderate lift
with a large perceived payoff. #2 and #7 are genuine projects. Nothing here needs a better model.

**This is also the strongest argument for the Resolver** ([[notes-61-queue]]) — a generic
"query any metric" tool is exactly what the Resolver's registry provides, and it would serve
SAGE and the report builder from one place.

---

Related: [[notes-61-queue]], [[feedback-performance-budget]], [[feedback-measure-dont-reason]],
[[project-sage]], [[feedback-selector-ui-standard]].

---

## 🔴 RESOLVED DIAGNOSIS — the startup/interaction freeze is React render (2026-08-08)

Five traces, four wrong hypotheses, then a definitive answer.

**Final measurement (v4.918, owner's machine, casual usage):**

```
App tree (render+commit)  34x · worst 9480ms · total 174,272ms
(no click)                86x · worst 9480ms · total 170,394ms
rawStores(buildStore x27) 32x · worst  518ms · total  10,089ms
computeInsights(restore)   1x                ·         305ms
bIdx+bLocIdx               1x                ·          60ms
analyzeRegisterAudit       1x                ·          11ms
```

**React commit total ≈ total long-task time, and the worst case is identical (9,480ms).**
So ~100% of main-thread blocking is React rendering the App tree — 34 commits averaging
~5.1 seconds. Every data-layer computation combined is under 6%.

**Hypotheses that were WRONG along the way** (kept so they are not re-tried):
1. The `onActivity` click listener — throttled to 30 min, cleared by reading it.
2. `rawStores` dependencies being unstable — deps were correct; it is the FREQUENCY of
   legitimate `ds` changes (32 `setDs` sites), and it is only 6% of the cost anyway.
3. Index building (`bIdx`/`bLocIdx`) — I called it a prime suspect at "tens of thousands of
   rows, all synchronous". It is **60ms**.
4. React `<Profiler onRender>` as the instrument — **compiled out of production builds**, so
   v4.917 recorded nothing and the empty section read as "nothing to report".

**The fix direction (not yet done):**
- **Reduce render COUNT.** 32 `setDs` call sites each trigger a full commit. Coalescing
  startup loader updates is the single biggest lever — ~10x fewer commits.
- **Reduce render COST.** `useDeferredValue` is already applied to `rawStores` (v4.915) but the
  App tree still renders synchronously on every `ds` change. Passing `dsDeferred` to the heavy
  view components — not just to the one memo — would let clicks and nav render at full speed
  while the expensive tree updates at low priority.
- Closed panels are already conditional (`showX && h(Panel)`), so they are NOT the cost.

**Also seen and unexplained:** the At-A-Glance "SAGE Scheduled Runs" tile appears twice as the
worst click (5,944ms and 6,224ms in separate sessions). It is `DEF_SECS[0]`, the first tile.
Worth checking on its own.

Tooling built for this: `src/utils/click-trace.js` (`?clicktrace=1`, then `mfClickTrace()`).
