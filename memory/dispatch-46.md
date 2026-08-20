---
name: dispatch-46
description: Make the Security panel legible and then make it analytical. Part A gives every rule a plain-language explainer and the panel a legend. Part B puts a decision sentence on every finding beside the number, per the standing say-the-number-AND-the-decision rule. Part C is the deep dive - per-subject history, change-point, shift attribution, cross-rule fingerprints, store-vs-person separation, and automatic exoneration.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #46 — make the Security panel legible, then make it analytical

**Owner-requested, 2026-08-20, after first real use of the shipped panel.** Verbatim:

> *"For the new security panel > we need a way to know in the ui what we are looking at. Give me a
> legend, a small detail under each policy, something to make it clear. The findings are awesome as
> well > just need to use plain language in addition to results. Same thing for Cash and Inventory.
> If we are able to let's take the findings and deep dive further to find root cause or develop
> patterns with people and metrics. Let's go all out on analysis here!"*

**"In addition to" is the whole brief.** This is CLAUDE.md's standing voice rule, which already
governs this: *say the number AND the decision.* The plain-language line never **replaces** the
metric, the window, or the comparison basis, and never hides them behind a click. Both ends get
preserved. A panel that reads as obvious to the owner — 33 years, every position in a restaurant —
is not evidence a GM can act on it.

Three parts, in order. **A and B are the ask; C is where the value is.** Do not stop after A and B
because they are more tractable.

---

## Part A — say what the reader is looking at

Today a first-time reader sees `CASH-004` / `120.04 vs threshold 100.00 — peer: mean 46.16, stdev
85.31, n 49` and has to already know the system to decode it. Three additions:

1. **Per-rule explainer, always visible, one line, restaurant words.** Under (or beside) each rule
   chip and at the head of each expanded finding. `security_rules` already carries `method`,
   `description`, and `investigation_action` — the panel loads them (`loadSecurityRules()`) and
   currently uses almost none of it. Do not invent new copy where a column already holds it; where
   the stored text is engineer-voice, rewrite the **stored** text so SAGE and any future consumer
   get the same improvement.
2. **A legend for the vocabulary**, dismissible, remembered. It must define, in plain terms:
   - **Flagged / Clear / Undetermined** — and specifically that Undetermined means *the rule could
     not honestly form a verdict* (no exposure, too few peers, below the materiality floor), which
     is **not** the same as Clear. This distinction is the build's core integrity property and is
     currently invisible to a reader.
   - **The signal count badge** (the red `2`) — how many rules flagged this subject, and why
     convergence matters more than any single rule.
   - **peer / personal / store / network baseline** — what each compares against.
   - **threshold vs. sigma** — a z-score rule's "threshold 2.50" means 2.5 standard deviations, not
     a rate. Two rules on screen right now use the same word for different units.
   - **The ⏸ marker** on an inactive rule. It already renders and already says *"RULE INACTIVE —
     historical output, not current truth"* on the detail line — good, keep it — but the chip
     marker itself is unexplained.
3. **Units on every number.** `120.04` is per $1,000 of sales; `42.11` is per 1,000 transactions;
   INV-001 is a percentage. Three different units, none labelled.

## Part B — a decision sentence on every finding

Beside (never instead of) the existing metric line. Restaurant words, one line, states what it
means and what to do:

> **Promo/discount rate** — **Flagged**
> *Discounts here run about 2.6× the peer average — 120 per $1,000 of sales against a typical 46.*
> *Next: pull this employee's discount detail for the window and check it against manager approvals.*
> `120.04 vs threshold 100.00 — peer: mean 46.16, stdev 85.31, n 49`
> `Window 2026-07-23 → 2026-08-20 · computed 8/20/2026, 2:29:38 PM`

Requirements:

- **Derive the comparison, don't restate the number.** "2.6× the peer average" is the useful fact;
  repeating "120.04" in words is not.
- **`investigation_action` already exists per rule** — surface it as the "next" clause rather than
  writing new prose.
- **An Undetermined finding needs the plainest language of all**, because it is the most likely to
  be misread as an all-clear. Say what was missing.
- **Same treatment for Cash and Inventory**, explicitly per the owner. Inventory's subject is an
  item at a store, so its sentence names the item and store, not a person.
- **Do not soften a magnitude to make it readable.** INV-001 currently shows `4936.47` against a
  store mean of `276.49` — 49× expected usage. The plain-language line should say plainly that a
  number like that is almost certainly an item-setup error, not shrink (see
  `project-inventory-data-hygiene-2026-08-20.md`), because that IS the actionable reading.

## Part C — the deep dive: root cause, and patterns across people and metrics

This is *"go all out."* The panel today shows one window's verdict per subject and nothing about
history, cause, or shape. Everything below is buildable from data already in Supabase — no new
source. **Scope it, then build in value order; not all of it needs to land at once.**

**Everything here keeps `emp_token`. Reveal stays a deliberate, logged action** — see
`schema-identity-vault.sql` and `incident-reveal-rpc-null-role-bypass-2026-08-20.md`.

1. **Per-subject trend — is this new, or chronic?** `security_findings` accumulates per run with
   `window_start`/`window_end`/`computed_at`. Sparkline a subject's value across successive windows
   against their own history and the peer band. A number 2.6× peers that has been flat for six
   months is a different problem from one that tripled last month, and the panel cannot currently
   tell them apart. **Highest value item in this dispatch.**
2. **Change-point — when did it start?** From the daily `audit_rows` behind the window, find the
   date the behaviour shifted. An investigator's first question is "since when," and a date usually
   points at a cause (a schedule change, a new hire, a promo launch, a POS change).
3. **Shift and daypart attribution.** `lifelenz_schedules` has who worked when; `audit_rows` is
   per employee-day; `qsr_daily_activity` is hourly. Does a subject's flagged behaviour concentrate
   in a daypart, on closing shifts, or on days a particular manager was on? **State associations as
   associations** — this is the most inferentially dangerous part of the dispatch and the place
   where a confident-sounding wrong answer does real harm to a real person.
4. **Cross-rule fingerprints.** The panel already groups by subject and counts signals. Go further:
   *which* combination? Voids + refunds is a different pattern from promo + discount, and both
   differ from over/short alone. Cluster subjects by their signal vector and name the recurring
   shapes. This is the "patterns with people and metrics" the owner asked for.
5. **Store vs. person separation.** If every employee at store X flags on CASH-002, that is a
   store-level process or training problem, not eight suspects. Roll up per store and show a
   subject's deviation **from their own store**, not only from the estate. Cheap, high-signal, and
   directly prevents the worst false-positive class.
6. **Automatic exoneration — the plan's own principle 4, still unbuilt.** `security_rules` carries
   `exoneration_rules` and `corroboration_rules` and **nothing reads them.** For inventory,
   `qsr_variance_stat` already carries `raw_waste`/`comp_waste`: variance matched by logged waste is
   largely explained. A rule that automatically searches for its own counter-evidence is what makes
   this system trustworthy rather than accusatory. **Ties directly to dispatch #45 Part C question 4
   and to the unbuilt `INV-003`** — coordinate, don't duplicate.

**Ground every claim in a measurement, and say "unexplained" when it is.** This panel points at
named people. The standing rules against reasoning from a sorted head, and against a plausible cause
that no query confirmed, matter here more than anywhere else in the codebase.

## Part D — make it visual (owner-requested, explicitly not urgent)

> *"At some point I would love to see graphical analysis layered into the security panel as well —
> for example, if a store is trending with food over base issues, we should be able to see a
> specific date range trend of what that looks like in a chart of some kind. I would just like to
> make this dashboard really pop out and be super easy to understand and navigate while delivering
> on the results that we're putting in place."*

**Charts here are Part C's findings made visible, not decoration.** Each one below exists because a
specific question is hard to answer from a table. Build them as Part C's analyses land — a chart of
an unvalidated number is worse than no chart, because it looks authoritative.

Load the **`dataviz` skill** before writing any chart code, and honour the project's own
conventions: tokens from `meridian.css`, never hardcoded `rgba(255,255,255,X)` (guarded by
`light-mode-white-alpha.test.js`), lazy-loaded per the entry-chunk budget, dense/data-first, and
readable in all 8 theme×mode combinations.

Highest value first:

1. **Subject trend line — the owner's own example.** A metric over a date range for one subject
   (store, employee, or item), with the peer band behind it and flag events marked. This is Part C
   item 1 rendered, and it answers "is this new or chronic" at a glance, which no table does.
2. **Peer-distribution strip.** Where this subject sits in the population for this rule — a
   histogram or beeswarm with the subject and the threshold marked. Turns "120.04 vs threshold
   100.00, peer mean 46.16" into an instantly legible position. Also makes a *degenerate* baseline
   visually obvious: a distribution collapsed on zero explains a nonsense z-score better than any
   sentence (see dispatch #45 §A).
3. **Store heatmap.** Stores × rules, coloured by flag rate. Part C item 5's store-vs-person
   separation, and the fastest way to see the finding #45 Part C already produced — one store at
   23.7% of unexplained inventory flags. `patch-heatmap.js` already exists; reuse its idiom.
4. **Signal-convergence view.** Which rules co-occur on the same subjects. Part C item 4's
   fingerprints; a small matrix or chord beats prose for "voids + refunds travel together."
5. **Change-point marker on (1).** Once Part C item 2 computes a start date, draw it. A vertical
   rule on the trend line is the single most investigative element on the page.

**Navigation, since the owner asked for "easy to navigate":** the panel currently opens on a flat
ranked list. Consider a summary band above it — counts by domain, by severity, by store — that
filters the list on click. Do not add a chart that cannot be acted on; the standing rule holds
(*a number nobody acts on is not a shipped feature*), and it applies to pictures too.

**Scope honestly.** Part D is larger than A–C combined and is explicitly not urgent. Land A and B
first (they are the stated ask), then C, then take D in the order above — item 1 alone delivers most
of what the owner described.

---

## Dependencies and coordination

- **Dispatch #45 Part A must land first, or Part B's plain language will describe flags that are
  artifacts.** INV-002's 224 flags are trivial in dollars AND produced by a degenerate near-zero
  stdev; writing "this store is a significant outlier" over one of those makes the panel actively
  misleading. **Do not ship Part B's copy for INV-002 until #45 Part A is in.**
- **#45 Part C** (the unexplained 162) overlaps Part C items 1/5/6 here. Whoever runs first should
  produce the analysis; the other consumes it.
- **#43 Phase 2** (triage state) is still separate and still unscheduled.

## Out of scope

- Reactivating any rule. CASH-003 and INV-002 stay off pending their own dispatches.
- New data sources — everything above uses tables already pulled.
- Revealing identity by default. Pseudonymous first, reveal logged, always.

## Standing rules that bite specifically here

- **Say the number AND the decision** — both, never one. The metric, its window, and its comparison
  basis stay visible next to the plain-language line.
- **A number nobody acts on is not a shipped feature** — before adding a metric to a tile, name the
  decision it changes and who makes it.
- **Measure it, don't reason about it** — especially Part C item 3.
- **Would this verification still pass if the change were reverted?** — a copy change needs a test
  that renders through the real panel, not one that imports a string helper.
