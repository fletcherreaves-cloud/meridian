---
name: dispatch56-part-d
description: Dispatch #56 Part D, done. Subject-level flag history rollup (buildSubjectTimeline, flattening a subject's per-rule window history into one oldest-to-newest list) and a per-rule instance/pattern/trend shape classifier (classifySubjectShape -- a different axis from dispatch #46's chronic/new/improving/clear), plus the corroboration_rules finding-level cross-link (Part A already surfaced the static directory half). Both new engine functions extend security-drilldown.js per the dispatch's own "link, don't re-render" instruction -- no new data source, no new fetch.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #56 Part D — is this an instance, a pattern, or a trend?

**2026-08-21**, immediately after Parts A and C (PR #532, merged). Executes Part D of
`memory/dispatch-56.md`, per the owner's own stated sequencing: first, because — unlike Parts B and
E — it needs no new data source, everything it wants already lives in `security_findings`.

**Owner:** *"Trend, pattern, instance, etc."* and *"Links to previous findings or a roll up
somehow."* The dispatch's own framing: *"A first-time flag and a fifth consecutive flag are
completely different situations and the panel currently presents them identically."*

## Checked whether a helper already existed before writing one

Dispatch #46 already shipped `classifySubjectTrend()` (chronic/new/improving/clear) and it is
already wired into `SubjectDetail` — a real risk of building a duplicate. Read it carefully before
starting: it answers a **different, narrower question** — "is the LATEST verdict flagged, and was
ANY prior verdict flagged," a two-state boolean story with a 2-window minimum. It cannot
distinguish a subject flagged twice non-consecutively from one flagged three times in a row with a
rising value — exactly the distinction Part D's own vocabulary (instance/pattern/trend) asks for.
So this is genuinely additive, not a rebuild — `classifySubjectTrend`'s existing line stays exactly
as it was, and the new shape line renders beside it.

## Two engine functions, both pure, both extending `security-drilldown.js`

Per the dispatch's own instruction — *"Link, don't re-render... `src/engine/security-drilldown.js`
is pure and unit-tested — extend it rather than writing a parallel history calculation next to
it"* — both new functions live there, not in `security-panel.js`, even though nothing about them
needs an on-demand fetch (they operate on `security_findings` data already loaded at panel-open).

- **`classifySubjectShape(history, {minTrendWindows=3})`** — one rule's own window history for one
  subject, oldest→newest. `instance` = flagged exactly once. `pattern` = flagged 2+ times with a
  clear/undetermined window between two flags — asserted even at n=2, since it's a factual count,
  not a directional claim. `trend` = an **unbroken run** of `minTrendWindows`+ consecutive flagged
  windows, direction from the run's first value vs its last. `insufficient-history` = a consecutive
  flagged run exists but is shorter than `minTrendWindows` — **the exact "do not label a shape from
  two windows" case the dispatch itself warns against**, the same discipline dispatch #52 already
  applied by declining a z-test on 1–4 flagged cash rules. The caller shows the raw history instead
  of asserting a shape word; the minimum is a caller-visible field (`minTrendWindows`), not buried.
- **`buildSubjectTimeline(historyByRule)`** — flattens **every rule's** own window history for a
  subject into one oldest→newest list, "has this subject been flagged before, on which rules, in
  which windows." Pure flatten + sort, no classification — same discipline as `periodTrend`'s own
  undecorated medians (the reader reads the list; the code doesn't editorialize).
- **`corroboratingFlags(rule, subjectVerdicts)`** — the finding-level half of Part D's "free win."
  Part A already mapped `corroboration_rules`/`exoneration_rules` (dropped by `loadSecurityRules()`
  until that PR) and surfaced them in the static rule directory ("Corroborates with: X"). This is
  the other half — *"on a finding where a corroborating rule actually fired on the same subject"* —
  checking, per verdict, which of a flagged rule's `corroborationRules` are **also currently
  flagged for this exact subject**, excluding hygiene-routed verdicts (a lifecycle finding is a
  data-setup signal, not a security co-occurrence).

## Wired into `security-panel.js`

- **`SubjectHistory`** (new component) renders once per expanded subject, above the per-rule
  breakdown: `"Subject history: flagged N of M evaluations since <date>"`, plus the flattened
  per-window list **only when there's more than one window** (a single-window subject's timeline
  is identical to the one verdict block already shown right below it — redundant, not omitted for
  space).
- **`SHAPE_META`** (new, beside the existing `TREND_META`) renders the shape line per verdict,
  right under the existing chronic/new line — additive, never replacing it. `never-flagged` has no
  label (nothing to name yet).
- **Corroboration cross-link** renders on a flagged verdict only (`v.pass === true`), right after
  the automatic-exoneration line: `"⚠ Corroborated by CASH-004 — also flagged for this subject."`

## What was NOT touched, and why

- **Parts B and E** — per the owner's own sequencing, these come next (E: `event_details`'s schema
  is confirmed and the auth question resolved in QSRSoft's favor per the finding file; B folds into
  the same investigation pass once the `/reporting/v2/people/` path family from the time-punches
  capture is checked for a roster endpoint). Neither started here.
- **Job C Batches 2+** — explicitly deferred by the owner as low-risk and not blocking security work.
- **A collapsed-row shape indicator** — considered (surfacing "×3" or similar on the flaggedCount
  badge before expanding), but the dispatch's own phrasing — *"Show it on the subject"* — and every
  existing precedent for this exact class of info (`classifySubjectTrend`'s chronic/new line, the
  drill-down section) already live in the expanded `SubjectDetail`, not the collapsed row. Matched
  that placement convention rather than inventing a new one.

## Verification

`src/__tests__/security-drilldown.test.js`: 15 net new unit tests — `classifySubjectShape`'s full
state space (never-flagged, instance, pattern at n=2, the insufficient-history 2-consecutive-window
case, trend with rising/falling/flat direction, a caller-supplied `minTrendWindows`, a null-value
guard against a fabricated direction, and the "one run plus a gap" case that must read as pattern
not trend); `buildSubjectTimeline`'s flatten/sort/count and its empty-input honesty;
`corroboratingFlags`'s flagged/not-flagged/hygiene-excluded/no-corroboration-rules cases.

`src/__tests__/security-panel.test.js`: 5 net new render tests through the real `SecurityPanel` —
the subject-history rollup's count and per-window list (present when >1 window, absent and
singular-worded at exactly 1), the Trend classification rendering beside the pre-existing Chronic
line (proving additive, not replaced), the corroboration cross-link rendering when the
corroborating rule fired and NOT rendering when it didn't.

1900/1900 tests (163 files). Build clean, entry chunk unchanged (`security-panel.js` is already
lazy).
