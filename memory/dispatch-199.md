# Dispatch #199 — merge Performance Calculator into Performance Reviews (Customize tab)

## Context — mirrors an already-executed, owner-validated pattern exactly

Per the 2026-08-28 scoping pass: `perf-calc` (Performance Calculator, `store-dash.js`'s
`PerformanceCalculator`, `kind:'optional'`) and `perf-reviews` (Performance Reviews,
`kind:'nav', route:true`) are both `section:'people'`. `PerformanceCalculator` is a standalone
what-if scoring tool; `performance-reviews.js` already owns the real scoring engine
(`computeScores`/`rateMetric`/`ratingColor`) plus a "Customize" tab that **already absorbed a
different standalone tool the same way** — `targets-editor` (Targets Editor) was merged into
Performance Reviews' Customize tab (dispatch #135), leaving `targets-editor`'s registry entry as
`kind:'hub-tab'` with old `modal==='targets-editor'` deep links redirecting into Customize. This
dispatch is the same move for `perf-calc`, not a new design.

No dispatch doc has previously touched `PerformanceCalculator` — this is genuinely new work, not
a re-litigation of something already decided against.

## Task

1. **Read `PerformanceCalculator` in `src/views/store-dash.js` in full**, and re-read the
   `targets-editor`→Performance Reviews merge (dispatch #135's PR/commit, and the resulting
   `kind:'hub-tab'` registry entry + redirect pattern in `panel-registry.js`/`App.js`) as your
   template — match its shape rather than inventing a new one.
2. **Fold `PerformanceCalculator`'s what-if scoring UI into Performance Reviews' Customize tab**,
   reusing the real `computeScores`/`rateMetric`/`ratingColor` engine already there instead of
   whatever scoring logic `PerformanceCalculator` currently has of its own — read what it currently
   does first and state in your PR whether it duplicates or diverges from the real engine (this
   matters: if it diverges, silently switching engines could change output the owner is used to
   seeing, so call that out explicitly rather than assuming they're equivalent).
3. **Retire `perf-calc`** to `kind:'hub-tab'` (harvest-then-remove, same as `targets-editor`) —
   keep its `id` so `panel-registry.test.js`'s pairing check still passes, and redirect any
   `onOpenModal('perf-calc')`/`?modal=perf-calc` call site into Performance Reviews' Customize tab
   (grep `App.js`/`store-dash.js` for all of them, don't assume there's only one).
4. **Opportunistic panel-contract check** on the merged surface (close button, date picker,
   `LocationSelector`, mobile-scroll) if it doesn't meaningfully widen scope.

## Verification

- Performance Reviews' Customize tab renders the what-if calculator alongside its existing
  content, using the shared scoring engine.
- Old `perf-calc` deep link(s) redirect correctly.
- If `PerformanceCalculator`'s own scoring logic diverged from `performance-reviews.js`'s real
  engine, the PR body states exactly how and confirms the switch is intentional/correct, not
  silently discovered after the fact.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  immediately before committing).

## Out of scope

- Any other panel-merge candidate from the 2026-08-28 scoping pass (Channel Intel/3PO Delivery,
  EOM Supervisor rollup, the Rankings/Record Days/Top-Bottom trophy cluster) — those are more
  speculative and flagged separately for an owner decision, not dispatched here.
- Redesigning Performance Reviews' scoring model itself.
