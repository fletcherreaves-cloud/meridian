# Dispatch #203 — merge Rankings / Record Days / Top-Bottom Performers into one leaderboard panel

## Context — owner-approved 2026-08-28; SEQUENCE AFTER DISPATCH #200 LANDS

⚠️ **Do not start this dispatch until dispatch #200 (Store Analytics District View fixes,
including Task Group C's Records-tab/Record-Days merge) has landed on `main`.** Task Group C
touches `src/views/record-day.js` directly (likely extracting a reusable per-store record-
computation engine out of it) and this dispatch also touches `record-day.js` — check
`origin/main`'s commit log for dispatch #200 before starting, and build on whatever shared engine
Task Group C may have already extracted rather than re-deriving one.

Owner confirmed this merge live in this session. Three panels currently share the 🏆 icon and
overlapping "who's leading/lagging" framing, and this pairing is on record in this codebase's own
history as intentional (dispatch #77 explicitly notes Rankings/Record Days/Top-Bottom Performers
sharing 🏆):

- `ranking` (Rankings, `RankingView` in `src/views/store-dash.js:2180`, `kind:'nav', route:true`,
  `section:'reports'`) — current period cross-store leaderboard by metric.
- `record-day` (Record Days, `src/views/record-day.js`, `kind:'optional'`, `section:'analytics'`)
  — all-time best-single-day records per store/metric (richer after dispatch #200's likely
  refactor — re-read post-#200, don't assume its pre-#200 shape).
- `top-bottom` (Top/Bottom Performers, `src/views/top-bottom-performers.js`,
  `kind:'test-kitchen', section:'analytics', tkOrder:12`) — still in Test Kitchen, not yet
  promoted.

**This is the most speculative of the three merges the owner approved — the earlier scoping pass
flagged it as the weakest candidate, since each panel answers a genuinely different question
(current-period ranking vs. all-time single-day record vs. distribution of over/under
performers) rather than being pure duplicates.** The owner's approval was a "yes" to exploring it,
not a mandate to force three distinct analyses into one screen if that makes any of them worse.

## Task

1. **Read all three panels in full** (post-dispatch-#200 for `record-day.js`) before designing
   anything. Confirm what each ACTUALLY answers — don't assume from the names/icons alone.
2. **Design one leaderboard panel with clearly labeled modes/tabs** for the three distinct
   questions (current ranking / all-time record / over-under distribution) rather than trying to
   blend them into one view that answers none of the three questions well. This is explicitly NOT
   a "pick a survivor, retire the others" merge like most of this session's other panel merges —
   it's "put three related lenses on the same leaderboard-shaped data under one roof," closer in
   spirit to how Signals hosts multiple distinct tabs (LiveOps/Scanner/Signal Lab) than to a
   harvest-and-retire merge.
3. **Promote `top-bottom` out of Test Kitchen** as part of this (`kind:'test-kitchen'` →
   whatever kind the merged panel ends up as) — per CLAUDE.md's standing rule, this is a one-field
   `kind` flip in the registry, nothing else changes about its position (its `section` is already
   truthful).
4. **Pick which id survives** as the nav entry, retire the other two to `kind:'internal'`
   (harvest-then-remove, keep their `id`s), redirect deep links.
5. If, after reading all three, you conclude the merge genuinely makes one or more of them WORSE
   (loses a real capability, or forces an awkward shared UI none of the three fit), **say so
   explicitly in the PR body and propose the narrower version that still delivers real value**
   (e.g. just tabs under one nav entry with zero shared computation, if that's the honest
   assessment) rather than forcing a deeper merge than the data supports.

## Verification

- Merged panel's three modes each still answer their original distinct question, clearly labeled,
  no information loss from any of the three.
- `top-bottom` promoted out of Test Kitchen (or, if you determined the merge doesn't hold up, this
  step still happens standalone — promoting it was independently worth doing).
- Old deep links redirect correctly.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- Redesigning any of the three panels' underlying computations.
- Dispatch #200's own Records-tab work (should already be merged before you start).
