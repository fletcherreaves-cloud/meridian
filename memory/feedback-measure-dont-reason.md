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
  useful. "It's X" when unverified is not.

Related: [[data-sourcing-standard]] and the v4.870 lesson that a failed read must never be
indistinguishable from an empty one — the same family of error, at the system level.
