---
name: notes-73-queue
description: Notes 73 field queue (2026-11-07) — UI/UX consistency audit directive, role-based depth/perspective tuning, more interactivity (contextual help links + win-celebration), and a "lean and mean" real-estate review of the app itself. Explicitly queued for later, not scoped yet.
metadata:
  type: project
---

# Notes 73 — field queue (2026-11-07)

Owner's own words: "Some more rambling thoughts and ideas. Can be discussed and definitely queued
for later. Some of these may be re-hits." Delivered the same day as the Movers Alerts pause +
notification-consent screen + (queued) nav walkthrough. **None of this is scoped yet** — this file
is capture only, per this repo's own standing rule that a Notes queue dies with the session if it
isn't written down (`CLAUDE.md`'s "Commit every memory file..." rule).

---

## 1. Per-panel info icon for help (possible re-hit)

"Adding info icon with easy access click for help on panels." This may already be substantially
covered by the ongoing KB InfoIcon rollout (task #75, `memory/finding-kb-panel-guide-2026-11-03.md`
— 39+ of ~117 `KB_ARTICLES` wired to a real panel as of 2026-11-07). **Before scoping this as new
work, re-check task #75's current coverage** — this note may just mean "finish the rollout," not a
separate feature.

## 2. UI/UX consistency QC pass + standardization plan

Owner wants a dedicated session to act as "final quality control engineer" scanning the whole app
for UI/UX inconsistencies — specifically menus, dropdowns, and selector-driven controls. Standing
instruction, verbatim: *"All menu and drop down and selectors driven items should be modeled as
close as possible to the same throughout with the only exceptions of when they have to be
different. No differing styles or ways to accomplish the same tasks. Consistency is key."*
Deliverable: a report of inconsistencies found + a concise standardization plan (not necessarily
the fix itself in the same pass — scope that when picked up). Likely overlaps existing work:
`memory/feedback-selector-ui-standard.md` (location filter UI standard) and the LocationSelector
rollout (tasks #39/#42-50/#52-55) already did a version of this for ONE control family — this new
ask is broader (all menus/dropdowns/selectors, not just location pickers). Check that file and the
panel-contract doc (`memory/panel-contract.md`) first so this doesn't re-litigate settled ground.

## 3. Role-based depth/perspective tuning per panel

*"Let's spend some time analyzing panels for ease of use based on user role level. Make changes or
alternative views that are prominent depending on the user using it. Different depths and
terminology should be used based on role. Different perspective (small focused vs big picture)
should be implemented to drive usability."* This is the CLAUDE.md "Voice by role" standing rule
(UI Conventions section) applied systematically, panel-by-panel, rather than ad hoc — GM gets a
focused/tactical view+terminology, DO/VP get a big-picture/analytical one, same panel. Needs a
panel-by-panel audit to find where this is already true (Priority Brief, Intelligence Briefs
already do some of this) vs. where every role sees the identical dense view today.

## 4. More interactivity: contextual help links (incl. external), root-cause-to-remedy coaching, and celebrating wins

Three related asks in one note:
- Suggest where to look for more context on a finding, with links — "even external" (i.e., not
  just in-app cross-references; could mean linking out to a QSRSoft KB article, a relevant
  training resource, etc.). Possibly overlaps SAGE's existing `search_qsr_kb`/`search_project_memory`
  tools and the Why Engine's cause tagging — check before building a parallel mechanism.
  cross-references
- Curated explanations of HOW a bad condition occurred on the floor, paired with PRACTICAL
  prevention steps — reads as an extension of the Why Engine (`src/engine/why.js`) and/or Visit
  Readiness's risk-driver output, turning a diagnosis into a coaching action, not just a flag.
- **"We should always remember to celebrate the wins when people and locations achieve good or
  great things as well!"** — explicit owner value statement. Nothing in the app currently
  does this (Movers Alerts deliberately has NO up-swing rule per the 2026-11-07 measurement that
  up-swings aren't anomalous at this grain — see `memory/plan-movers-alerts-2026-11-07.md` — so
  that engine is the wrong place for this). A positive-recognition mechanism is a genuinely
  separate, unscoped idea: what counts as a "win" worth surfacing, to whom, and where it shows up
  (a tile, a notification, a leaderboard callout) are all open questions.

## 5. "Lean and mean" app-wide real-estate review

*"Take a step back for me and review the app and let me know your thoughts on what should change
or be added/removed as to whether it is worthy of real estate in app... especially items we added
throughout to assist or aide us in building. Should some of this be retired or go away visibly and
better placed elsewhere where it can still be accessed, just not necessarily a candidate for prime
real estate... simple is better... we need a healthy review to become lean and mean."* A genuine
product-judgment review, not a code change — likely candidates to specifically evaluate (owner's
own framing: "items we added... to assist or aide us in building"): Test Kitchen population (how
many panels are still experimental vs. should be promoted/retired), the Dev-only panels, and
anything built as a one-off diagnostic (e.g., AI Backtest Scanner, Scanner/Signal Lab seed signals,
the Period-Total Scoreboard) that may have proven its point and could move to a less prominent
spot without losing access. This is a CLAUDE.md "Tier C" judgment call (reversing visible
placement decisions) — never ship unattended; scope as a report + recommendation first, same as
item 2 above.

---

**Status: all five items above are queued, not started.** Nothing here should be built without a
separate scoping pass per item — several explicitly depend on auditing current state first (items
1, 2, 5) rather than assuming a gap exists.
