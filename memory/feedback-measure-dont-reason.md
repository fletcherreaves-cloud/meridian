---
name: feedback-measure-dont-reason
description: Standing rule — diagnose by measuring, never by reasoning from plausibility; and verify a command's OUTPUT before reporting what it did. Both halves earned from real failures on 2026-08-07.
metadata:
  type: feedback
---

# Standing rule: measure it, don't reason about it

Two halves. Both were violated repeatedly on 2026-08-07 and every correction that day
came from measurement rather than thought.

---

## Half 1 — Diagnose by measuring, not by plausibility

**The rule:** when something is broken, reproduce it against the real system before
forming a theory. A plausible cause that matches a remembered incident is the most
dangerous kind of wrong, because it feels like expertise.

**What it cost (2026-08-07, the Items Recounted tile showing "No ledger detail"):**

1. First theory — *RLS is filtering rows to zero.* Wrong. `accessible_locs` is NULL for
   both live profiles, so `my_locs()` returns NULL and the restrictive policy passes.
2. Second theory — *`tenant_id = current_tenant_id()` is unwrapped, so it evaluates per
   row.* This felt certain: this repo HAS a documented 590ms-per-row incident from exactly
   that pattern. The owner ran `EXPLAIN ANALYZE` and it was refuted outright — Postgres
   hoisted the function to an InitPlan on its own, 6.1ms, whole scan. **Acting on that
   theory would have meant a pointless migration across 18 tables.**
3. What actually worked: replaying the exact failing requests with `curl`. The answer
   appeared in seconds — a console diagnostic firing ten unfiltered `count(*)` scans on
   every login, two of which exceeded the statement timeout.

The same day, three more things were only found by measuring:
- `_partial` markers were being destroyed by `.map()` — proven by running
  `[1,2,3].map()` and printing the property, not by reading the code.
- `qsr_raw_item_detail` rows average **22,582 bytes** (JSONB history), so a 1000-row page
  is a 16 MB request. Measured, not estimated.
- Store 10422's numbers differed between two checks. The owner guessed a DAR refresh; a
  per-day diff confirmed it exactly — 13 days byte-identical, only today changed. That led
  to a real bug: the alarm was counting a part-finished day as a whole one.

**Thresholds get measured too, not chosen for feeling round:**
- Swing alarm: 676 store-weeks of real vs-LY data → two consecutive weeks ≤ -10% isolates
  exactly the one struggling store. Not "about 20% sounds bad."
- Count completeness: guessed 0.5, then measured the distribution — sharply bimodal, 69
  class-sessions at 0-10% and 77 at 80-100%, near-empty between. Moved to 0.75.

## Half 2 — Verify the OUTPUT, don't report the intent

**The rule:** after running something, read what it actually printed before saying what it
did. Running a script is not the same as the script succeeding.

**What it cost, same day:**
- Ran a changelog sort script, then wrote a commit body stating the changelog was "re-sorted
  strictly descending." The script had **thrown partway through** on an entry versioned
  `4.18x`. The commit shipped with the entries still out of order AND a message asserting
  otherwise. Needed a follow-up commit purely to correct the record.
- Said "PR #89 is up" and later "#95" after pushing branches but never running
  `gh pr create`. Twice.
- Told the owner the new panel was under **Analytics** without checking where the nav line
  landed. It was in the **Operations** block. They went looking and could not find it.
- Wrote a test asserting a query returns nothing, when the fixture two tests earlier
  deliberately contained a matching row. The code was right; the assertion contradicted my
  own fixture.

---

## Half 3 — Never guess in place of the owner's answer, and never guess twice

Added 2026-08-08 at the owner's request, after guessing twice on one bug in one morning.

**The rule:** when a first hypothesis is disproven, the next step is a MEASUREMENT, not a
second hypothesis. Two guesses in a row on the same problem is the signal to stop and
instrument instead.

**What it cost (Notes 60 bug #1, FOB Analysis stuck at May 2026):**
1. Guess one — *"qsr_fob was among the tables 500ing, so v4.871 probably fixed it."*
   Reported to the owner as "probably already fixed". They checked. It was not.
2. Guess two — injected a warning banner into what I assumed was the panel's top-level
   render. It landed inside a KPI-strip renderer, created an unused variable, and the
   build passed anyway because an unused const is legal. Had to be backed out.
3. What actually worked: replicating the browser's exact request with curl, which showed
   page 1 returning 2 bytes for anon vs 1.4 MB for service role — and then READING the
   render before touching it, which revealed the panel **already had** a fallback
   indicator. The real fix was making the existing 8px tooltip legible, not adding a
   second one.

**The generalisable failure:** I wrote code into a file I had not read at that location.
"The build passed" is not evidence the change is correct — an unused variable, a banner
rendered in the wrong container, and a misplaced closing paren all compile.

## Half 4 — A fix that touches shared state must be verified against the REAL system

Added 2026-08-08 after breaking Dialed-In calibration for all 27 stores (v4.904 → v4.906).

**What happened:** to fix blank 1W/2W trend columns, I re-sourced `calibrateStore`'s `rows`
from the metric resolver. `rows` turned out to feed three things, not one — the grid search,
`detectCleanDataStart`, and the `fetchLY` precompute. LY resolves against `ds.laborIdx`, so
rows from one universe + LY from another silently invalidates the pairing. Every store failed.
The owner found it with a screenshot; my 988 tests were all green.

**Then I guessed at the cause and was wrong again.** I decided a 420-day range cap was the
culprit and "fixed" it to 2600 days. Only then did I build a harness that runs the real
`calibrateStore` against real `labor_rows` + `qsr_daily_activity_rollup` pulled from Supabase —
and **420 and 2600 both succeeded with identical numbers.** The cap was never the problem. That
guess would have shipped as a second broken fix on top of the first.

**What the harness bought, in one run:** it proved the revert restored the exact prior Full
MAPE (7.05% before, 7.05% after — bit-identical), proved the scoped fix populated all four
trend periods across 5 stores, and separated a PRE-EXISTING failure (Ponce de Leon's
`detectCleanDataStart` returning a future window start, which is why the panel always read
25/27) from damage I had caused. None of that was available from reading code.

**The generalisable lessons:**
- **Before re-sourcing a variable, find every consumer.** `rows` looked local; it was shared.
  One `grep` for the variable inside its own function would have shown three uses.
- **A green suite is not proof for engine changes.** 988 tests passed while every store failed
  in production, because no test ran `calibrateStore` end-to-end against real data.
- **When a change is hard to unit-test, build the real-data harness instead of shipping on
  reasoning.** It took one short script and it answered every question definitively.
- **Prefer the SMALLEST scope that fixes the reported symptom.** Only `_computePeriodMape`
  needed recent days. Re-sourcing the shared row set to fix it was a blast radius nobody asked
  for. The scoped version leaves chosen parameters and Full MAPE bit-identical.
- **Revert first, then fix.** The owner had a broken panel; restoring known-good behaviour
  came before diagnosing.

## Half 5 — Verify with the EXIT CODE, never by grepping for a success marker

Added 2026-08-08 after pushing a build that did not compile and reporting it as clean.

**What happened:** the v4.912 changelog entry was written through a Python heredoc whose
escaping produced `\\'` inside a single-quoted JS string. That terminates the string, and
`App.js` failed to parse — the deployed bundle would not have loaded at all.

**Why I did not notice:** all session I verified builds with

    npm run build 2>&1 | grep -E "^✓|error"

That greps for a SUCCESS MARKER. When the build fails with a stack trace the pattern prints
nothing useful, and because of the pipe `$?` reports **grep's** exit status, not vite's. A
failing build produced output that skimmed as passing. I had substituted a grep for reading
the output — which is exactly what Half 2 of this rule already forbids.

**The correct form:**

    npm run build > /tmp/build.log 2>&1; echo "exit: $?"

Check the exit code. If it is non-zero, read the log. The same applies to `npm test`.

**Generalisable:** a filter that only shows you what you hope to see is not a check, it is a
way of not looking. Any verification whose failure mode is *silence* is not verification.
Prefer the signal that is loud on failure (exit code, explicit count, a diff) over the one
that is quiet.

**Also:** a passing test suite did not catch this, because vitest transforms modules
independently and never parsed the broken literal. Tests and builds fail differently — green
tests are not evidence that the app compiles.

## How to apply

- **Before diagnosing:** reproduce the failure directly — `curl` the endpoint, run the
  query, print the value. Do this BEFORE forming a theory, not to confirm one.
- **Be most suspicious when a cause feels obvious** because it matches a past incident in
  this repo. That is exactly when to measure, not when to skip it.
- **Before proposing a schema/infra change**, get a measurement that would be different if
  the theory were false. `EXPLAIN ANALYZE` for query cost, a timed request for latency.
- **After running any script**, read its output. If a commit message will claim the script
  did something, that claim must come from the output, not the intent.
- **When choosing a threshold**, pull the real distribution first. State the measurement in
  the code comment so the number can be re-derived and challenged later.
- **State uncertainty as uncertainty.** "My leading suspicion is X, not acted on" is
  useful. "It's X" when unverified is not. Never tell the owner something is "probably
  fixed" — either verify it or say it is unverified.
- **After one disproven hypothesis, instrument — do not hypothesise again.** Two guesses
  in a row on the same bug means stop and measure.
- **Read the code at the exact location before writing there.** Not the file, the
  LOCATION. Grep-and-inject lands in the wrong function and still compiles.
- **Before adding a UI affordance, check whether one already exists.** The FOB panel
  already warned about manual-only fallback; it was simply too quiet to notice. Making
  the existing signal legible beat adding a second one.
- **A passing build is not verification.** Unused variables, mis-parented JSX and dead
  code all build cleanly. Verify the behaviour, not the compile.

Related: [[data-sourcing-standard]] and the v4.870 lesson that a failed read must never be
indistinguishable from an empty one — the same family of error, at the system level.

---

## 2026-08-10 — a scope estimate from a single-file grep (PR #163)

Reviewing the labor-target PR, the PM found three remaining `t.tLabor` reads, told the
engineer to fold them in, and told the owner **"three one-line changes, ten minutes."**

The grep was `grep -n "tLabor" src/engine/pipeline.js`. The correct command costs the same
five seconds:

```
$ grep -rn "\.tLabor\b" src/ --include=*.js | grep -v __tests__ | wc -l
69          # across 13 files — labor-tools.js alone has 24
```

One of the 69 was `engine/finding-rules.js:50`, computing the **dollar impact** on every
labor finding — so the divergence wasn't only in warning text, it was in the money.

**The rule this adds:** a count from a grep scoped to one file is not a measurement of the
codebase, and an estimate built on it is a guess wearing a number. *Before quoting a scope
or a duration, run the search at the scope you are quoting for.* `-rn` over `src/` costs
nothing and is the difference between "ten minutes" and "a migration."

Two things went right and are worth keeping:

- **The estimate was corrected before any code was written**, because the standing "read
  the code at the exact LOCATION before writing there" rule forced a look at each site —
  and looking is what surfaced the other 66. The rule paid for itself in a context it
  wasn't written for.
- **The two commits were separable, and measuring which way each one cut settled it.**
  Commit 1 (`buildStore` reads `settings.targets`) changes no field names, so scores and
  findings still agree — it *reduces* divergence and shipped. Commit 2 moves 1 of 69
  readers — it *creates* divergence and was deferred to #164 with its work preserved on a
  branch. **"Is this change consistent with the other N callers?" is a question with a
  measurable answer**; ask it before splitting on instinct.

Also: the engineer flagged those sites and proposed deferring them. The PM overrode that
and was wrong to. **A worker's "I found something adjacent, I don't think it belongs here"
deserves a `grep -rn` before it is overruled**, not a confident instruction.

## Half 7 — Would this verification still pass if the change were reverted?

Added 2026-08-16 after the same failure shape hit three times in one day.

**What happened, three times:**

1. **#327/#329's first verification** reported 192/192 store-days matching Glimpse to 4
   decimals — but the test fixture included `glimpseRows`, and `laborPct`'s `srcs` list
   checks `glimpseRows` FIRST. The comparison was Glimpse against itself on every sampled
   day. It would have passed identically with the derivation deleted.
2. **#329's own harness** built `ds` by hand rather than through the real loaders, so it
   never exercised `loadOpsLaborSummary` at all — it passed while production stayed broken,
   and shipped as "fixed" on that basis.
3. **#344's regression test** used 12 rows against a 400-row page. `pages = 1` (the bug)
   returns all 12 rows too — a single page comfortably covers 12. The test passed with the
   fix reverted, caught only because the PR's own reviewer asked the question below before
   merging, not by the test itself.

Two of these three shipped as "fixed" and weren't. The work in all three cases was sound —
the derivation, the fallback logic — the *check* was what let a wrong claim through.

**The rule:** before opening a PR, ask **"would this verification still pass if my change
were reverted?"** If yes, it isn't evidence — it's a check that happens to also pass, not a
check that requires the fix. Concretely:

- **For a fixture-based comparison** (case 1): strip out every source your fix is meant to
  be a fallback FOR, so the comparison is forced through the new code path, not past it.
- **For a hand-built harness** (case 2): build test state through the real loaders/parsers
  the production code path uses, not a hand-assembled shape that happens to look similar.
- **For a regression test on a size/threshold bug** (case 3): the dataset must cross the
  boundary the bug lives on. A boundary bug (a page cap, an off-by-one, a truncation limit)
  is invisible to any input that stays under the boundary either way.

**The cheap, mechanical version for a regression test specifically:** run it once against
the unfixed code and watch it go red. Not "the logic looks like it should fail" — actually
revert the fix (checkout the pre-fix version of the touched file, or comment out the fix)
and run the test. If it stays green, the test is not testing what the commit message claims
it tests, no matter how reasonable the code looks.

**Generalisable:** this is the same family as Half 5 (verify with the exit code, not a
success-marker grep) and Half 2 (verify the output, not the intent) — a verification whose
failure mode is silent agreement is not verification. It extends those to the test itself:
a test can be well-written, pass cleanly, and still prove nothing, if it was never capable
of failing against the bug it's named for.

## Half 6 — "Non-reproducing" is not closed. Verify with the REPORTER.

Added 2026-08-11, after the owner re-reported a bug that had been cleared a day earlier and
had already cost three note cycles.

**What happened:** the Food Cost panel's "period dropdown stuck at May 2026" was reported in
**Notes 60**, again in **Notes 63**, and again in **Notes 65**. The 2026-08-10 RLS audit
measured it properly and concluded correctly:

> *"`qsr_fob` itself measured OK — 24,156 rows both sides, dates run through today. The
> originally-reported symptom does not currently reproduce… a non-reproducing bug does not get
> a fix bolted onto it — it gets reported as non-reproducing, not a third guess."*

That was the right technical call and it followed Half 1 exactly. **The failure was what
happened next: nothing.** The finding went into a memory file. The owner was never asked to
re-check. So it stayed live on his list, he re-reported it in the next note dump, and on
2026-08-11 he opened the panel and it had been working the whole time — August 2026 selectable,
FOB 4.17% matching At-A-Glance, "Cloud auto" badge showing, no console warning.

Three note cycles of his attention spent on a bug that no longer existed.

**The rule:** a bug is not closed when the code is fixed, when the sandbox stops reproducing
it, or when a memory file records the finding. **It is closed when the person who reported it
confirms it.** Anything short of that leaves it live on their list — and the reporter has no
way to distinguish "we fixed it" from "nobody looked."

**"Non-reproducing" is the highest-risk verdict of all**, precisely because it produces no
artifact the reporter can see. A fix ships in a PR they can read; a non-reproduction ships
nothing. Those findings need an explicit, named ask: *"open X, tell me what you see."* One
sentence, and it ends the cycle.

**Generalisable:** the same shape as the product-level insight from the same session
(`memory/project-coaching-feedback-loop.md`) — identify → intervene → **verify** — where the
verify step is the one everybody skips and the only one that makes the rest compound. It
applies to bugs and to coaching for the same reason: **the person who owns the problem is the
only one who can confirm it is gone.**

Related: Half 2 (verify the output, not the intent) and Half 5 (verify with the exit code, not
a grep for a success marker). Same family — what counts as verification. This one extends it
past the machine to the human who raised it.
