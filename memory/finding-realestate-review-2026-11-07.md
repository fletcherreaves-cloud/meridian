---
name: finding-realestate-review-2026-11-07
description: Notes 73 #5 (task #112) — app-wide "lean and mean" real-estate review. Report only, no code changed. Tier C per CLAUDE.md — needs the owner's own sign-off before anything here is acted on.
metadata:
  type: project
---

# "Lean and mean" real-estate review (Notes 73 #5, task #112)

**Owner's own words:** *"Take a step back for me and review the app and let me know your
thoughts on what should change or be added/removed as to whether it is worthy of real estate in
app. Think about everything, but especially items we added throughout to assist or aide us in
building. Should some of this be retired or go away visibly and better placed elsewhere where it
can still be accessed, just not necessarily a candidate for prime real estate... I just feel we
need a healthy review to become lean and mean."*

**This is a report, not a dispatch.** No code was touched. Per CLAUDE.md's self-maintenance
framework, "a genuine product-judgment call, reversing a documented decision" is Tier C — never
applied unattended. Every recommendation below needs the owner's own sign-off.

**Method:** read `src/app/panel-registry.js` in full (668 lines, every one of the ~100 panels)
and CLAUDE.md's "Panels & Modules" table, then grep-verified specific claims against real code
before writing them down — not vibes. Scope: panel-level real estate (nav placement, Test
Kitchen status), not individual UI widgets.

---

## The headline finding: three load-bearing weekly/monthly workflows sit in Test Kitchen

CLAUDE.md's own "Workflow Guide" content (`src/app/App.js`'s `WORKFLOW_GUIDE_SECTIONS`, the
in-app onboarding checklist every OM-and-above role sees) tells users to do this **every single
week**:

> *"1. Lock the weekly projection — Open ▦ Projections in ⚗ Test Kitchen..."*
> *"2. Run Projection vs Actuals report — ◑ Proj vs Actuals (⚗ Test Kitchen)..."*
> *"3. Check DI Calibration for drifting stores — ⚗ Test Kitchen → ◎ DI Calibration..."*

`panel-registry.js` confirms all three carry `kind:'test-kitchen'`:
```
{ id:'proj',      label:'Projections',     kind:'test-kitchen', tkOrder:1 }
{ id:'pvsa',      label:'Proj vs Actuals', kind:'test-kitchen', tkOrder:2 }
{ id:'dialedin',  label:'DI Calibration',  kind:'test-kitchen', tkOrder:4 }
```
And Test Kitchen's whole *reason to exist* is "experimental; **hidden when betaMode is on**"
(the field's own doc comment). So the app's own required weekly ritual lives behind the exact
toggle that's supposed to hide unproven experiments. That's not a minor inconsistency — it's the
single clearest case of "this earned its promotion a long time ago and nobody flipped the
switch." CLAUDE.md's own rule: *"Promotion IS a one-field flip."* These three should be it.

## Candidates for promotion/retirement — each checked, not guessed

1. **Opportunity $ (`opportunity-dollars`, test-kitchen)** — its own registry comment calls it
   the *"flagship 'every performance gap becomes recoverable dollars' panel."* Grepped and
   confirmed it's **already a headline tile on At-A-Glance** (`at-a-glance.js:507-519`,
   `onClick: () => onOpenModal('opportunity-dollars')`) and also referenced from
   `attention-now.js`. This is not an experiment waiting to prove itself — it's already the
   centerpiece of the home screen, just filed under "hidden when betaMode is on." Promote it.

2. **Form Completions (`forms-completion`, test-kitchen)** — its own comment: *"this proven,
   live-data panel (shipped v5.098, iterated through v5.474)... promoting it out of Test Kitchen
   is a separate, not-yet-made decision."* The comment is explicitly inviting this review. Nine
   months of iteration on real pulled data (QSRSoft Forms) is not "still proving itself."

3. **Forecast Audit (`forecast-audit`, 🔬 icon, test-kitchen)** — this is the literal successor
   to the deleted `DevDashboard`'s "Engine Trace" tab (per `ORPHANS`'s own comment: *"its Engine
   Trace tab was dropped (superseded by the standalone ForecastAudit panel)"*). It's a
   per-store forecast-internals microscope, exactly the "item we added to help us build it"
   category the owner flagged. It already sits one click from a real admin-only equivalent —
   `management.js`'s `🛠 Dev` tab (admin/owner-gated, confirmed live and correctly gated, not
   the dead `'developer'`-string bug CLAUDE.md's RBAC section once described). Candidate: move
   Forecast Audit's reach to live *there* instead of the general Test Kitchen list anyone with
   `analytics.forecasting` can see — it's a build tool, not an operator one.

4. **Access Log (`access-log`, test-kitchen)** — its own comment: *"a new, unproven panel against
   a new RLS-gated table that still needs its SQL migration run manually."* `supabase/schema-app-
   access-log.sql` exists, but **whether that migration has actually been run is not something
   this review can check** (no DB credentials in scope here, and running DDL is never an agent's
   own call per CLAUDE.md). If it hasn't been run, this panel is dead weight sitting in the nav
   today, not merely experimental. Worth a direct answer from the owner: has this table ever been
   created?

## Borderline — flagged, not recommended either way

- **Model Assignment / DI Compare / LifeLenz Gap / Fcst Reference** (all test-kitchen,
  `forecasting` section) — these are forecast-model internals: picking which model wins per
  store, comparing DI calibration runs, a glossary/reference page. They read as power-user
  tooling for whoever tunes the forecasting engine (the owner, maybe a DO), not GM-facing daily
  panels — plausibly in the same "built to help us build it" bucket as Forecast Audit, but unlike
  that one they don't have an obvious existing home to move to (no admin-only forecasting tab
  exists today). Recommend the owner decide based on who actually opens these, not guesswork.
- **Store Assessments, Review Forms, Equipment Layout, Performance Trends** (all test-kitchen) —
  each one's own comment explicitly says it's genuinely new/unproven ("first real use hasn't
  happened yet," etc.). No complaint here — Test Kitchen is doing exactly its job for these four.
- **`🛠 Dev` tab** (`management.js`, admin/owner only) — a raw settings dump, exactly the
  diagnostic-surface category the owner asked about. But it's already correctly gated to
  admin/owner only and isn't nav-prominent (buried in Management's own tab strip) — low
  real-estate cost as-is. Not a priority unless the owner wants it gone entirely.
- **Forecast Reports hub / `forecast-reports`** (test-kitchen, parent shell for `fcst-accuracy` +
  `lifelenz-bridge`) — forecast-accuracy (MAPE) tracking is genuinely diagnostic in nature but is
  also something the owner/DO use to judge whether to trust a store's number. Left alone; the
  three Workflow-Guide panels above are the clear-cut case, this one is murkier.

## What I did NOT find

No dead/orphaned panels beyond what's already tracked — `ORPHANS` (panel-registry.js) is
confirmed empty and `VESTIGIAL_STATE` only lists harmless always-false flags, both already
called out as the resting state in the file's own comments. This review did not uncover a new
orphan; the real estate problem here is misplaced-but-alive panels, not dead code.

## Bottom line

The clearest, lowest-risk win is also the highest-value one: **flip `kind:` on `proj`, `pvsa`,
`dialedin`, and `opportunity-dollars`** from `test-kitchen` to their real sections (`forecasting`
×3, `analytics` ×1 — all already correctly set per the promotion convention) and they become
ordinary nav entries, visible to everyone regardless of `betaMode`, with zero other code change.
`forms-completion` is the same one-line flip. Those five together resolve the biggest
"experimental-labeled-but-actually-load-bearing" gap this review found. Forecast Audit and
Access Log are smaller, more judgment-call-shaped items for a direct owner decision.
