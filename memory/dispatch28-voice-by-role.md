# Dispatch28 — Workstream F: role-based voice, first slice shipped

2026-08-19. `memory/dispatch-28.md` restates a standing CLAUDE.md rule (2026-08-17, "Voice by
role"): every panel's default surface must say the number AND the decision — *"say the number
AND the decision"*, explicit both/and, never a simplification trade. This dispatch's own
grounding confirmed the gap is real (Count Cycle, DI Compare still emit analyst-only strings) and
recommended the cheapest, already-mostly-built lift as the starting point: **Visit Readiness's
`topDrivers`** already computes *which* gap matters (the hard half); it was only missing the last
mile — phrasing that as an instruction instead of an explanation.

## What shipped

`src/engine/visit-readiness.js` — new `buildVerdict(store)`, called alongside the existing
`buildWhy(store)` and stored as `store.verdict`. Reuses `topDrivers` (already sorted worst-first)
and the same `0.85` driver-badness threshold `buildWhy` already uses — no new threshold invented,
per the dispatch's explicit "don't relabel a metric string as a decision without actually
computing which threshold it crossed" warning. Priority order:

1. `fsFlag === 'elevated'` → food-safety risk leads (the more severe PACE consequence — criticals,
   not just a re-visit clock — so it overrides the general readiness band even for an at-risk
   store, tested explicitly so this priority can't silently drift).
2. `band === 'at-risk'` → `"Coach {worst driver} — {actual} vs {target} target, the biggest
   blocker to PACE-ready."`
3. `band === 'watch'` → same shape, softer verb (`"Watch..."`).
4. `band === 'ready'` → `"On track for a graded visit — no action needed this week."`

**`why` is unchanged and still shown** — the two are complementary, not a replacement: `verdict`
is the one-line decision, `why`/`topDrivers` stay the supporting depth, exactly the standing
rule's explicit both/and. Wired into all three surfaces that render a store's readiness:

- `src/views/visit-readiness.js`'s collapsed row — the actual "default surface" (previously only
  the numeric readiness score + band/FS chips, zero decision text, and the diagnostic `why` line
  only appeared once expanded — the gap CLAUDE.md's rule names directly: "never hidden behind a
  click that an operator won't make"). The verdict's own number+comparison satisfies that even in
  the one-line collapsed form; the multi-driver breakdown stays behind expand as genuine extra
  depth, not the core supporting metric.
- The same file's per-store printable coaching one-pager (`storeReportHTML`).
- `src/views/visit-readiness-report.js`'s district-wide printable report.

`src/engine/attention-feed.js`'s `visitRisk()` — was a single generic `"coach before the next
CFV/RGR"` string for every at-risk store regardless of what was actually wrong. Now reads
`s.verdict` (falls back to the old generic string if absent, e.g. older cached data shaped
before this shipped) — so the Needs Attention feed and the Visit Readiness panel never disagree
about what to coach, the "diff the two computations before debugging either" lesson applied
proactively instead of after a bug report.

## Verified

7 new/updated tests (`visit-readiness.test.js`, 4 new; `attention-feed.test.js`, 2 new): an
at-risk store's verdict names an action verb + the SAME worst driver `topDrivers` already
identified (not an independently re-picked one) + its actual-vs-target number; a ready store's
verdict is genuinely different text from its `why` (not a copy); food-safety priority holds even
when the store is also at-risk on readiness (isolated with a dedicated fixture, since the
straightforward `badRows()` fixture trips both flags simultaneously — caught this collision
writing the first version of the at-risk test, fixed by isolating waste/variance to target while
leaving speed/accuracy/quality bad). `attention-feed.test.js` proves `visitRisk` prefers a
present `verdict` and still degrades gracefully without one.

1562/1562 tests pass (7 new). Build clean, budget unaffected (all three touched view files are
already-lazy panels, not in the entry chunk).

## Scope discipline (per the dispatch's explicit framing)

- Only Visit Readiness — the dispatch's own recommended cheapest-lift entry point, not a
  district-wide sweep of all panels.
- **Explicitly deferred, not forgotten**: Count Cycle (`src/engine/count-cycle.js:235`, `'No
  complete weekly count on record'`) and DI Compare (`src/views/analytics.js:6895`, `'Not
  Dialed-In is better — recalibrate'`) — the dispatch's own two reproduced evidence strings —
  still read exactly as diagnosed. Same pattern this repo already uses for staged workstreams
  (SAGE Phase 2, `org_event_exceptions` UI, Workstream D sequenced after E): ship one real,
  tested slice rather than a shallow first pass across three panels.
- Did not touch `permissions.js`/the 3-vs-8-role question — the dispatch's own "what NOT to do"
  is explicit that voice tiers should build against the 3 roles actually enforced
  (`admin`/`supervisor`/`manager`), and this slice doesn't branch on role at all yet (the verdict
  text is the same for every viewer) — that's the next real design decision (does a supervisor's
  verdict differ from a GM's?), not answered here.
- Did not touch SAGE's existing binary supervisor/manager prompt framing — a separate, prompt-only
  precedent the dispatch explicitly says not to treat as solved for this (deterministic,
  panel-computed) problem.

## Not measured / open

Empirically testing "hand the panel to someone at operator level and see whether they take the
right action without being told" (the dispatch's own standard) needs a real person, not something
verifiable from this session. The verdict text was written to name a concrete, single next action
in restaurant language rather than jargon (score/threshold names) — that's a design choice stated
plainly, not a substitute for the actual empirical test the dispatch specifies.
