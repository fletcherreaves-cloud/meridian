# Dispatch #32 — Workstream C: still fully open, unchanged since dispatch #25

**Board (2026-08-19):** `main` at v5.070 (`31928bf`). Six of the seven normalization workstreams
(A, B, D, E, F, G) now have real shipped code. **C does not — it has never been implemented.**
Dispatch #25 (PR #422) was the brief; no PR since has touched a pipeline-contract module, a
zero-row guard beyond the two that already existed before the plan, or a ratchet tracking either.
This dispatch re-verifies dispatch #25's content is still accurate and hands it back unchanged,
since nothing has drifted — it just needs someone to actually start it.

---

## Re-verified fresh against current `main` — nothing has changed

Checked every claim in dispatch #25 directly rather than assuming a month-old brief still holds:

- **Still exactly 2 of ~19 pull/write scripts have the zero-row-exits-nonzero guard**
  (`qsrsoft-pmix-pull.mjs`, `qsrsoft-ops-pull.mjs`) — grepped fresh, same two, same count.
- **All 19 named scripts in dispatch #25's list still exist**, unchanged, no new pull script has
  appeared that would need adding to the scope.
- **No `_pipeline-contract.mjs` (or any similarly-named module) exists anywhere in `scripts/`** —
  grepped for `pipeline-contract`/`pipelineContract` repo-wide, zero hits.
- **`scripts/_retry.mjs` still has exactly the same 7 importers** dispatch #25 named — the
  reference convention for how to build a shared script module is unchanged.
- **No ratchet test tracks the missing-contract count.** `src/__tests__/ratchet-*.test.js` has
  four files now (`color-alpha-concat`, `raw-metric-rows`, `week-day-arithmetic`, and the new
  `modal-backdrop-bypass` from Workstream D's dispatch #30) — none of them are C's.

**Dispatch #25's content is reproduced below verbatim in substance** (its own file,
`memory/dispatch-25.md`, is still the source of truth — read it directly, this is not a
rewrite). What follows is only what's new or worth adding on top of it.

## What's new since #25 that helps: a working ratchet precedent to copy exactly

Workstream D's dispatch #30 just shipped `ratchet-modal-backdrop-bypass.test.js` (R7) — the
**same shape** dispatch #25 already asked C to use (bidirectional, seeded at a number
independently re-measured on the branch that adds it, not copied from any prior estimate). That
file is now a second, more recent working example alongside `ratchet-raw-metric-rows.test.js` —
read both before writing C's contract-coverage ratchet. The shape is proven twice now, not once.

## The brief, unchanged from dispatch #25

1. **Build `scripts/_pipeline-contract.mjs`** (or similar name) as a small set of pure exported
   functions — an assert helper (copy `qsrsoft-pmix-pull.mjs:444-447`'s shape), a per-partition
   count logger (copy the same file's lines 427-434), and a freshness-SLA checker (genuinely new,
   nothing in the repo does this yet). Same convention as `_retry.mjs` — a shared utility 19
   scripts can import, not a framework they get rewritten around. Don't touch `_retry.mjs` itself.
2. **Convert a small bounded slice** (one or two of the 17 ungoverned scripts, per dispatch #25 —
   pick ones already due for other work if any are queued) as proof, not all 19 in one PR.
3. **Seed a ratchet** (`ratchet-pipeline-contract-coverage.test.js` or similar) counting scripts
   missing the contract, seeded at a number measured on the branch that adds it — following R7's
   just-shipped precedent exactly. Never copy the "2 of ~19" figure from this dispatch or #25 into
   the ceiling; re-measure with the ratchet's own exact detection pattern.
4. **C2 (idempotent partition replace) is separate and still fully greenfield** — delete-then-
   insert per date partition, paced between partitions, on the write side. Nothing in the repo
   does this yet (522s are already a defensive read-side concern in 5 scripts; the write side has
   no partition-replace semantics at all). Can land in the same PR as 1-3 or a follow-up — dealer's
   choice, dispatch #25 didn't sequence them relative to each other.

## Tracks

**#336**, unchanged from dispatch #25.

## What NOT to do

- Don't re-verify what dispatch #25 already verified (the pmix/#263 fix, the email-parse
  misdiagnosis, the calendar-write fix) — those findings hold, re-checking them again is wasted
  motion.
- Don't touch `scripts/_retry.mjs` — separate, working concern.
- Don't do all 19 scripts (or even all 17 ungoverned ones) in one PR — bounded slice + ratchet,
  per dispatch #25's scope guidance, now doubly precedented by how D actually did it.
- Don't copy any count from this dispatch, #25, or the plan doc into a ratchet `CEILING` —
  measure fresh on the branch that adds the ratchet.
