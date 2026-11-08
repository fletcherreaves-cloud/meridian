---
name: plan-count-cycle-surfaces-and-spotcheck-ruler-2026-11-08
description: Two linked asks from the owner, 2026-11-08 — (A) where else count-cycle/missing-item intel belongs ("tiles, sections, or otherwise... bring it to life"), and (B) a reusable "Count Spot-Check Ruler" — a standard follow-up conversation framework built from a real example the owner sent Ashley re: Holdenville's FOB and weekly inventory. Design-only — no src/ touched, nothing built.
metadata:
  type: project
---

# Count-cycle intel: where it belongs, and a Spot-Check Ruler

## A. Where the count-cycle/missing-items intel belongs (open Q5)

Everything below reuses an engine or surface that already exists — none of this needs new
infrastructure, only new wiring. Ranked by how little it costs to build.

1. **GM Coaching Letters** (`src/engine/coaching.js`'s `GMCoachingBrief`, already wired to
   `gm_letters` KB article today) — the AI-drafted letter can name the exact missing items for a
   near-miss count ("you're at 88% on Paper — Pour Spouts, Clamshell Boxes... still need counting")
   instead of a generic nudge. The letter already pulls real data into an AI draft; this is one
   more fact source, not a new mechanism.
2. **Huddle's "Memory"/"The Save"** (`memory/plan-huddle-phase2-2026-11-08.md`, already scoped) —
   this is the FIRST real, concrete use case for both concepts that doc proposed in the abstract:
   - **Memory**: "3rd week in a row Paper landed under 90%" is exactly the trailing-window pattern
     that doc's §1 describes, now with real data to feed it (`coveragePct` per session, already
     shipped).
   - **The Save**: when a store's count completeness genuinely improves (88% → 100% Paper over
     two cycles), that is a literal, measurable "the pattern stopped" event — log it to the
     Recommendation Ledger (`source:'count_cycle'`) and let a huddle note call it out as a win,
     the exact mechanism that doc's §2 proposed, now with a real trigger condition instead of a
     hypothetical one.
3. **At A Glance tile** — a compact "Count Discipline" tile (worst 3 stores by trailing
   coverage %, same visual language `AtAGlance`'s existing tiles already use) — the quickest pure
   "new tile" option, but the least differentiated; 1 and 2 reuse something the owner already
   reacted well to (the Huddle work) rather than adding a 9th tile to a page already under its
   own "lean and mean" review (task #111/Notes 73 #5).
4. **Visit Readiness driver** (`src/engine/visit-readiness.js`) — count discipline as a named
   risk driver alongside the existing composite score inputs. Bigger lift (that engine's weights
   are a deliberate, owner-set formula — Speed/Accuracy/Quality/Leadership) and a real product
   call about whether count compliance belongs in that specific composite or stands alone. Flagging
   as a candidate, not a recommendation, for that reason.
5. **The Spot-Check Ruler itself (§B below)** — the richest answer to "bring it to life," since
   it turns the missing-item/coverage data into an actual conversation a DO or supervisor has
   with a GM, not just another number on a screen.

**Recommendation, if picking a starting point:** #1 (GM Coaching Letters) and #2 (Huddle Memory/
Save) are both near-zero-new-code wiring into systems the owner already has and already likes —
start there before a new tile.

## B. The Spot-Check Ruler

### Where this came from

The owner sent this to Ashley re: Holdenville's FOB and weekly inventory, as an example of "what a
general follow-up flow looks like":

> - What was FOB after you counted? — Answer should be 3.29%–3.37%. They have to know the answer.
> - What were your biggest variance/stat items? Looking for Nuggets, Espresso Beans, Fish, Steak.
> - What items did you recount? — Answer is none, but get an answer. Instills the importance of
>   recounting top variance items.
> - How confident are you in your counts? — Establishes not rushing, double-checking accuracy.
> - Did you look at your reports (FOB, On Hand, Variance/Stat)? If so, what did you learn?
>
> The count took a little over 3 hours, which is good. Nuggets, Espresso Beans, Beef Steak and
> others grew in count — $800 between the 3 items improved FOB by 1.72%. Had those three been
> even at +/-0, FOB would have been 5.09% — much more realistic. So either she actually found
> product or it is a miscount.

That last paragraph is the real insight: **the diagnostic isn't just "ask 5 questions," it's
"compute the counterfactual and let the size of the swing tell you whether to trust the count."**
A GM who can't explain why 3 items alone moved FOB by 1.72 points hasn't actually reconciled their
count — they've just typed in numbers that happened to make the report look better.

### What's auto-computable TODAY, with zero new engines

Every one of the 5 questions already has a real data source in this app — this is a presentation/
assembly problem, not a new-math problem:

1. **"What was FOB after you counted?"** → `qsr_fob`, same source every FOB report already reads.
2. **"What were your biggest variance/stat items?"** → **already built and running** —
   `eom-diagnosis.js`'s `runDiagnosis()` has a `variance-top5` check (`id:'variance-top5'`) that
   sorts `qsr_variance_stat` rows by `|dolDiff|` and surfaces the top 5 by dollar swing RIGHT NOW.
   This is the exact question Ashley's answer (Nuggets/Espresso Beans/Fish/Steak) was checking
   against — the Ruler doesn't need a new ranking, it needs to SHOW this existing ranking as the
   question's real answer key.
3. **"What items did you recount?"** → from this session's new count-cycle work: `inv_count_sessions`
   already has multiple dated sessions per (store, class) across a period. A second session on the
   same class, later in the period, inside the close window IS a recount — detectable today, no
   new column needed (distinct from the missing-items work, which is about WHICH items, not
   WHETHER a second pass happened).
4. **"How confident are you in your counts?"** → genuinely qualitative, not auto-computable. The
   Ruler's job is to ASK it and log the answer, not derive it — exactly the owner's own point
   ("the answer is none, but get an answer... instills the importance").
5. **"Did you look at your reports? What did you learn?"** → also qualitative by nature, but the
   Ruler can hand the GM a direct link to the real FOB/On-Hand/Variance reports for that exact
   store+period (same `createEomShareLink`/report-deep-link pattern Count Cycle's own share button
   already uses) so "go look" is one click, not a hunt.

**The counterfactual math** (the $800/1.72pp/5.09% calculation) is new, but small: for the top-N
variance movers (same `variance-top5` list), sum their `dolDiff`, express it as a % of sales
(reusing `fobComponentDeltas()`'s own `amt/sales` pattern), and show FOB-as-reported vs.
FOB-without-those-N-items side by side. The GAP SIZE between those two numbers is the real signal
the owner's example is teaching: a tiny gap means the count and the report agree on its own
merits; a 1-2+ point gap means the conversation needs to happen, because either real product
turned up or the count has an error large enough that pretending otherwise is dishonest.

### Proposed shape

A generated, printable/shareable worksheet, one per store per count period (weekly or EOM), with:
- The 5 questions, in order, each pre-filled with its real computed answer where auto-computable
  (1, 2, 3) and left blank with the real report links attached where it's inherently a
  conversation (4, 5).
- The counterfactual box: top-N variance movers, their combined $ and FOB-point swing, FOB
  as-reported vs. FOB-without-them, and a plain-language flag when the gap crosses a threshold
  worth discussing (not graded pass/fail — this is a coaching prompt, not a compliance check,
  same distinction task #126 just drew between identification and compliance elsewhere).
- A field for the DO/supervisor's own notes from the actual conversation (what the GM said for
  Q4/Q5), loggable — the natural tie-in to the Recommendation Ledger / Huddle "Memory" work above:
  did this conversation happen, and did the pattern it was aimed at actually improve next period.

### Open questions for the owner, before building

1. Scope: EOM only, or every weekly count too? The owner's example was EOM-flavored (FOB-after-
   count), but the same 5-question shape and counterfactual math work for any count period.
2. Where it lives: a new standalone report (Reports Hub-style), a tab inside Count Cycle, or
   generated as a one-off share link per the existing `createWeeklyShare`/`createEomShareLink`
   pattern (closest to "something you hand to Ashley," matching how this was actually used)?
3. Does the "recount detection" (question 3) need to be literal (a second logged session) or does
   it also cover "recounted within the same session, before submitting" — which this app's data
   can't currently distinguish (same structural limit as everything else keyed off `last_counted`,
   not a submission-event log)?
4. Threshold for flagging the counterfactual gap as "worth a conversation" — a $ amount, a FOB-
   point swing, or scaled to the store's own sales (so a swing that's material at a small store
   doesn't get buried at a big one, or vice versa)?

### Owner's answers, 2026-11-08

1. ✅ **RESOLVED — "Both, please."** Build the Ruler for every weekly count AND every EOM count,
   not EOM-only. No scope-narrowing needed in the build.
2. ✅ **RESOLVED — Curated Home, timed to prompt, plus a durable report.** Owner: *"maybe the new
   hub we created (Curated Home), somewhere in there that makes sense as it would or should
   prompt it in a timely manner, but also logged as a report that can be used whenever as well."*
   Two surfaces, not one: (a) a Curated Home prompt that fires when a count just happened (the
   natural trigger — a new `inv_count_sessions` row for that store/period), not a static tile
   anyone has to remember to go check; (b) a standing, re-visitable report (Reports Hub-style or a
   Count Cycle tab) so a DO can pull up any past store/period's Ruler on demand, not only the one
   that happened to prompt. Both read the same underlying worksheet data — this is a delivery-
   surface decision, not two different computations.
3. 🔶 **PARTIALLY RESOLVED, and surfaces a REAL open engineering question, not a design pick.**
   Owner: *"It should be both, I believe... We just have to find a way to better dial in our
   ability to auto detect recounts, even within the perceived same session. We could start
   looking at the variance of an item and make a calculated guess as to whether a subsequent
   recount was due to an erroneous result or a mis-entry... we chould be able to do better than
   what we currently have."* So the ANSWER to the open question is "both" (confirmed), but
   answering it honestly exposes that detecting a WITHIN-session recount isn't a data-availability
   problem to design around, it's a genuine signal-detection problem: `qsr_onhand`/
   `inv_count_sessions` are both keyed off `last_counted`, a single timestamp with no revision
   history, so two entries of the same item on the same submission leave no direct trace. The
   owner's own proposed approach — use the item's OWN variance (`qsr_variance_stat`'s `dolDiff`/
   `variance`, the same field `variance-top5` already ranks by) as a heuristic signal for "this
   number looks like a correction, not a fresh count" — is a real, buildable idea, but it's
   RESEARCH, not a known formula to wire in: what variance shape actually distinguishes "GM caught
   a mis-entry and fixed it" from "the recount found real product" from "ordinary day-to-day
   count noise" is an empirical question that needs real `qsr_variance_stat` history to measure
   against, the same "measure it, don't guess" discipline every threshold in this codebase
   (COVER_FRAC, TOUCHED_FLOOR, the 90% streak default two sections up) was built on. **Not
   something to silently invent a formula for here** — this is its own follow-on: pull a sample of
   stores' variance history around known recount events (the ACROSS-session recounts this file's
   §"What's auto-computable TODAY" already detects are the ground truth to calibrate against) and
   see whether a real signal shows up before committing to a detection rule. Logged as a dedicated
   next step, not blocking the Ruler's first build — the Ruler ships with across-session recount
   detection (already real, already works) and reports "not detectable from today's data" for the
   within-session case until that research lands, rather than guessing at a threshold with no
   measurement behind it.
4. 🔶 **PARTIALLY RESOLVED, same shape as #3 — a real base plus a real open research question.**
   Owner: *"Targets are generally a good threshold... any wayward swing in an unreasonable amount
   should be flagged... Targets are a solid base to judge against and then anomalies would close a
   close second as well as things we just know can not be correct must always be flagged."* Three
   tiers, in the owner's own priority order:
   - **Targets, as the primary threshold — buildable NOW, no research needed.** Every store
     already has real per-metric targets (`DEFAULT_TARGETS`/Smart Targets/Monthly Targets,
     already Supabase-persisted). The counterfactual box's "worth a conversation" flag should
     compare FOB-as-reported (and FOB-without-the-top-movers) against the store's own FOB target,
     not a single district-wide $ or point number — this directly answers the sales-scaling half of
     the original open question (a target is already store-specific) and is a straight wire-in to
     data this app already has.
   - **Anomaly detection, as a second signal — this is the SAME open research question as #3's
     within-session recount detection**, not a separate one: "a wayward swing in an unreasonable
     amount" is exactly what Signals' Scanner (`correlation-stats.js`'s effect-size + Benjamini-
     Hochberg FDR guardrails, already live) was built to catch for metric-pair correlations — reuse
     that statistical machinery's SHAPE (a measured effect-size floor, not a guessed cutoff) rather
     than inventing a second threshold engine, but it needs the same real-history calibration pass
     as #3 before it's trustworthy for this specific use (variance swings, not correlation pairs).
   - **"Things we just know cannot be correct" — buildable NOW, no research needed either.** This
     is a HARD rule, not a statistical threshold: a few concrete, named impossibilities (negative
     on-hand, a swing larger than the item's own on-hand dollar value, a per-unit price that
     changed implausibly between counts) that should always flag regardless of any threshold math.
     Worth enumerating as an explicit list once the Ruler's variance data model is in hand, same
     spirit as `isStaleDeadRow()`'s existing "this specific shape is never real" rule in
     count-cycle.js.
   **Net effect on the build:** ship the Ruler with target-based flagging (tier 1) and the
   hard-impossibility list (tier 3) in its first pass; tier 2 (anomaly detection) and question #3's
   within-session recount heuristic are the SAME follow-on research task — logged as its own
   backlog item rather than guessed at here, since both need real historical variance data to
   calibrate against before either is trustworthy enough to show a GM as a real finding.
