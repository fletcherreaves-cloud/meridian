---
name: plan-role-based-depth-tuning-2026-11-08
description: Scoping doc for backlog task #110 (Notes 73 item 3) — a panel-by-panel audit of where Meridian already varies depth/terminology/perspective by user role vs. where every role sees the identical dense view, plus a staged build plan. Audit + proposal only; no product code written.
metadata:
  type: project
---

# Design: Role-Based Depth & Perspective Tuning (task #110, 2026-11-08)

## The ask

Owner (`memory/notes-73-queue.md` item 3, verbatim): *"Let's spend some time analyzing panels for
ease of use based on user role level. Make changes or alternative views that are prominent
depending on the user using it. Different depths and terminology should be used based on role.
Different perspective (small focused vs big picture) should be implemented to drive usability."*

This is CLAUDE.md's "Voice by role" standing rule (UI Conventions section) — *say the number AND
the decision; the default surface states what to do, in one line, in restaurant words; the
supporting metric/window/comparison stays visible; depth stays reachable underneath* — asked for
systematically, panel-by-panel, instead of ad hoc. **This doc is the audit + the plan. No `src/`
file is touched by this task** (scoping only, matching task #90's and #79's prior treatment).

## The real role ladder (ground truth, not invented)

`src/engine/permissions.js`'s `DEFAULT_ROLES`, 9 real ids, level = authority (1 = top):

| id | label | level | shape |
|---|---|---|---|
| `admin` / `owner` | Admin / Owner-Developer | 1 | full bypass |
| `vp` | VP | 2 | multi-district |
| `do` | DO (District Ops) | 3 | district |
| `om` | OM (Ops Manager) | 4 | — |
| `area_supervisor` | AS (Area Supervisor) | 5 | patch (subset of stores) |
| `gm` | GM (General Manager) | 6 | own store only |
| `sm_am_dm` | SM/AM/DM | 7 | own store, narrower write access than GM |
| `manager` | Manager | 3 | pre-existing/default signup role |

CLAUDE.md's RBAC section already corrected a stale 8-tier doc (Developer/Admin/Owner/VP/DO/
Supervisor/GM/Office Staff) that never existed in code — this doc uses only the ids above.

Two mechanisms already exist and are **not** what this task is about:
1. **`hasPermission(roleId, permKey)`** — binary nav/panel *access* (can this role open this
   panel at all). Gates whole groups at once (e.g. many panels share `analytics.store`).
2. **`disabledPanels`** on `DEFAULT_ROLES.gm`  — a binary per-panel opt-OUT list (pricing-engine,
   promo-roi, loc-intel, trends, signals, ranking, and 11 more cross-store/strategic-analysis
   panels a GM doesn't need per `memory/plan-role-based-panel-gating-2026-11-03.md`).

Both are **show/hide**, not **reshape**. This task is about the third thing, which barely exists
yet: when a role *can* see a panel, does it see the *same content at a different depth/voice*, or
literally the identical rendering as every other role that can see it?

## What already does this — the reference pattern

Two fresh, in-repo examples, both built the same way: **same facts, different words/grouping by
altitude**, where altitude is a 3-rung simplification of the 9-rung ladder (store / patch /
district), not a 9-way branch:

**1. Curated Home's role-cascaded voice — `src/engine/curated-home.js`**
`altitudeForRole(roleId)` maps the real ladder down to 3 altitudes:
```
gm, sm_am_dm, manager        -> 'store'    (one tactical item per flag, per store)
area_supervisor, om, do      -> 'patch'    (flags grouped by rule across the patch/district --
                                             "3 of 9 stores are flagging X", not 9 separate lines)
vp, owner, admin             -> 'district'
```
Same underlying flags from `computeMorningBrief()` either way — `storeItems()` emits one line
per store per flag; `patternItems()` groups the identical flags by rule across every store with
data, regenerating only the *headline* (never fabricating a number) while reusing `detail`/
`action` verbatim since those are written generically per severity tier already. This is exactly
the "small focused vs big picture" split the owner asked for, already proven on real data.

**2. The Huddle (shipped same day, v5.692) — `src/engine/huddle-narrative.js`**
Three literal system prompts, one per altitude, each with a different *job*, not just a different
reading level:
- `store`: shift-lead coach, 1-2 sentences, lead with the most urgent real issue or confirm clean.
- `patch`: Area Supervisor coach, which store most deserves a conversation this week, **always
  leads with a win if one exists** — the owner's "celebrate wins" instinct built into the voice.
- `district`: DO lead, framed around leading *through supervisors*, never a store-level fix list.
All three share one hard rule: never invent a number, name, or cause not in the fed facts. Cached
once/day per (scope, business day) in `user_settings`, click-to-generate (not auto-fired — an AI
call costs money). This is the freshest, most literal embodiment of "different depth and
terminology by role" in the codebase and the template every recommendation below reuses rather
than re-inventing a fourth pattern.

Both of these are **wrappers on top of an unmodified engine** (`computeMorningBrief`) — the voice
layer is additive, the underlying computation never forked by role. That's the shape to repeat.

## Panel-by-panel audit (10+ panels, found via `Grep` for `userRole`/`roleId`/`effectiveRole`/
`altitude` across `src/views/` and `src/features/`, not a full read of each file)

| Panel | File | Role-aware today? | What's actually there |
|---|---|---|---|
| **Curated Home** | `engine/curated-home.js`, `views/curated-home.js` | ✅ Depth-tunes | `altitudeForRole` — see above. The reference pattern. |
| **The Huddle** | `engine/huddle-narrative.js` | ✅ Depth-tunes | 3 role-voiced system prompts over `callSageOnce`. The reference pattern. |
| **Priority Brief** (Morning Brief engine) | `features/morning-brief.js` | ❌ None | Zero `userRole`/`role` references. `computeMorningBrief()` is role-blind by design — it's the shared engine both Curated Home and Huddle *wrap*; the un-wrapped panel (`MorningBriefPanel` in App.js, `routePanel==='morning-brief'`) shows its raw 12-rule output identically to every caller who can open it. |
| **District Priority Brief** | `views/analytics.js:2090` (`DistrictPriorityBrief`) | ❌ None | Red/amber/watch/green tiering + calibration-gap detection + a district "focus" line — same exact multi-store tiered breakdown for OM, DO, VP, and Owner alike, despite those four roles spanning "patch supervisor" to "owns multiple districts." No `userRole` prop even passed in (App.js:4443 calls it without `userRole`). |
| **Intelligence Brief** | `views/analytics.js:6723` (`LocationBrief`) | ⚠️ Partial, wrong axis | Branches its AI prompt's *voice* on `isMulti` (single store → "seasoned operator talking to a GM," 350 words, conversational; multi-store → "briefing to a district VP," 500 words, enterprise) — real voice-branching exists, but it's keyed on **scope size**, not on the caller's actual role. A GM who opens a multi-store brief (if ever granted one) gets VP-voiced text; a VP who drills into one store gets GM-voiced text. App.js doesn't even pass `userRole`/`effectiveRole` into this component today — only `stores,ds,settings,scope,scopeLabel,onClose`. |
| **SAGE** | `views/sage.js`, `supabase/functions/sage-chat/index.ts` | ⚠️ Scoped, not voiced | RBAC is real and confirmed for **data**: `sage-chat` hard-filters every tool by the caller's `accessible_locs` (CLAUDE.md's "✅ RBAC-aware (v4.494)" line). But `buildSystemPrompt(ds, signals, customSignalDefs, activeContext)` (`sage.js:462`) takes **no role parameter at all**, and `SagePanel` already receives `userRole` as a prop (App.js:4427) but only forwards it to `PromptLibraryModal` for a binary admin/owner share-gate — never into the system prompt. **CLAUDE.md's own "role tunes the advice (manager=tactical, supervisor=patch, admin=district)" line, written as part of a ✅-marked bullet, does not match the code** — that part of the vision was never actually built, only the data-scoping half was. Confirmed by reading the function signature and its one call site, not inferred. |
| **Security Panel** | `views/security-panel.js` | ❌ Access only | `userRole` drives `securityPanelAccess()` — allowed/denied, plus a GM-identity-reveal runtime flag. No depth variation once access is granted. |
| **Settings / Admin tabs** | `views/admin.js` | ❌ Access only | `userRole==='admin'||userRole==='owner'` shows/hides the Dev and Data tabs. Binary. |
| **Store Dashboard / Store Analytics** | `views/store-dash.js`, `views/store-analytics.js` | ❌ None | Zero `userRole` references in either file. Full tab set (Overview, Shift Analysis, Intelligence Brief, etc.) and identical stat density for a GM checking their own store and a VP drilling in from District view. |
| **Labor Tools** | `views/labor-tools.js` | ❌ None | Zero `userRole` references. Model Assignment backtest matrices, Period-Total Scoreboard, VLH config — same raw diagnostic surface regardless of who's looking. |
| **Visit Readiness** | `engine/visit-readiness.js`, `views/visit-readiness.js` | ❌ None | Zero `userRole` references in either file; `VisitReadinessPanel` isn't even passed `userRole`/`effectiveRole` as a prop in App.js. Composite score + top risk drivers + EcoSure status render identically for a GM looking at their own store and a VP scanning the whole district table. |
| **Signals** | `views/signals.js` | ❌ None (access-gated instead) | Zero `userRole` references in the panel; not passed the prop at all. The *only* role-sensitivity is upstream and binary — `signals` is in GM's `disabledPanels` list, so GM simply never sees it. Everyone who clears that gate (AS and above) sees the identical Scanner/Signal Lab/LiveOps surface. |
| **Projections** (Monthly/Yearly) | `features/projections.js` | ❌ None | Zero `userRole` references. Gated by `projections.own` (binary write lock), but the read surface — targets, Scheduled-TPPH row, forecast table — is identical for every role that can see it. |
| **Management / Performance Reviews** | `views/management.js` | ⚠️ Access only (but the domain has real role structure) | The 3 `userRole` hits here are the Dev/Data tab gate (see Settings row above) — not review-content depth. Separately, `engine/permissions.js`'s `canOverrideLockedActual`/`canApproveDeparture` already encode a real ladder-distance rule ("2 levels above" / "1 level above" the reviewed person) for *authorization*, which is the right primitive to reuse if review *narrative* (not just override rights) is ever role-voiced. |
| **Smart Targets** | `features/smart-targets.js` | ❌ None | Zero `userRole` references. Same trailing-median Smart number + diagnostic-model drill-down for every role with `analytics.forecasting`. |
| **SMG Voice** | `views/smg-voice.js` | ❌ None | Zero `userRole` references. Same comments tab + FullScale scorecard for everyone. |
| **At A Glance** | `views/at-a-glance.js` | ❌ None | Zero `userRole` references — the one panel literally named for "the first thing you see," and it's role-blind. (Curated Home is the *separate*, newer panel that already does the voice work; At A Glance itself doesn't.) |

**Pattern across the sample:** role-awareness in this codebase today is overwhelmingly
**access-gating** (`hasPermission`, `disabledPanels`, `securityPanelAccess`) — a clean, well-built
mechanism, but a different axis entirely from what's asked here. Of 15 panels sampled outside
Curated Home/Huddle, **zero** vary *content depth or terminology* by role; one (Intelligence
Brief) varies voice but on the wrong axis (scope size, not caller role); one (SAGE) has the role
plumbing already present as an unused prop. This is a real, current gap — not a hypothetical one —
and the fix in most cases is "wrap," not "rewrite," per the two reference patterns above.

## Concrete recommendations (grounded in real data this app already has)

### 1. SAGE — wire the already-threaded `userRole` prop into `buildSystemPrompt`
✅ **DONE 2026-11-11 — owner approved proceeding on judgment for this doc's open questions** (per-panel
treatment, not a shared component; keep the 3-way altitude collapse as-is; "celebrate the wins"
stays separate per task #111). `buildSystemPrompt`'s 5th parameter now threads `userRole` through
`curated-home.js`'s `altitudeForRole`, appending a role-voice addendum to the prompt text
(`src/views/sage.js`). CLAUDE.md's stale "role tunes the advice" claim corrected in the same pass.
Covered by `src/__tests__/dispatch-sage-role-voice-2026-11-11.test.js`.

**Effort: smallest in this doc.** `SagePanel` already receives `userRole` (App.js:4427); it just
isn't forwarded into `buildSystemPrompt(ds, signals, customSignalDefs, activeContext)`. Add a
5th parameter, append a short role-voice addendum to the system prompt text — reuse
`huddle-narrative.js`'s exact `ALTITUDE_VOICE`/`altitudeForRole` mapping (store/patch/district)
rather than inventing SAGE-specific wording, since SAGE answers the same kind of "what do I do
about this" question the Huddle does, just interactively instead of as a daily note. Concretely:
a GM asking SAGE "why was labor % high Tuesday" should get the tactical, one-store, plain-language
answer-plus-action; a VP asking the identical question about the same store should get the number
with district-comparison framing layered on ("...and that's the 3rd-highest in the district this
week"), using data the RBAC-scoped tools already return — no new tool, no new data. This also
closes a real doc/code mismatch: CLAUDE.md currently describes this as already shipped
("role tunes the advice") when it measurably is not.

### 2. District Priority Brief — apply the Curated-Home altitude gradient to its own already-multi-store audience
✅ **DONE 2026-11-11.** Built per `altitudeForRole`'s REAL mapping, not this section's original
draft wording — the draft (written 2026-11-08, before dispatch-sage-role-voice-2026-11-11 measured
`curated-home.js`'s actual `ALTITUDE_BY_ROLE`) assumed DO collapsed to 'district' alongside VP/
Owner; the real map groups `do` with `area_supervisor`/`om` at **'patch'**. So the shipped split is:
'patch'-altitude roles (AS/OM/DO) keep today's unmodified flat per-store tiered list as the
default; 'district'-altitude roles (VP/Owner/Admin) default to the same stores pre-rolled by
supervisor patch (`byPatch`, grouped via the existing `supervisorOf` helper — zero new data,
reuses the already-computed `tiered` array) as the headline, one click (or toggle) from the full
per-store table. A manual "📍 By Patch / 🏪 By Store" toggle stays reachable for every role
whenever there's more than one patch in view, so depth is reordered, never removed. Clicking a
patch card sets the panel's existing `orgFilter` to that patch name — reuses the exact filter the
LocationSelector already drives, no new filtering mechanism. `effectiveRole` (already computed in
App.js for the "view as" sandbox, task #97) is the prop threaded in, not a separate `userRole`
read. Covered by
`src/__tests__/dispatch-district-priority-brief-altitude-2026-11-11.test.js` (5 tests, rendering
the real exported `DistrictPriorityBrief` component end to end).

**Effort: small-medium.** Every role that can open this panel (OM, DO, VP, Owner/Admin — all pass
`analytics.district`) sees the identical per-store red/amber/green tiered table today. Apply
`altitudeForRole`-style grouping *within* that audience, reusing the real distinction the ladder
already draws: OM (patch-adjacent, most hands-on of the four) keeps today's per-store tiered list
as the default top section; DO/VP/Owner get the same data pre-rolled by supervisor-patch (reusing
`supervisorOf`/patch grouping already computed elsewhere in this file) as the *headline*, with the
existing full per-store tier table one click down — "small focused vs big picture" exactly as
asked, same underlying `tiered`/`pulse` computation, zero new data. The calibration-gap watch
flag, `focus` line, and org filter stay exactly as they are; only which grouping renders first
changes by role.

### 3. Intelligence Brief — re-key its existing voice branch from scope-size to caller role
✅ **DONE 2026-11-11.** `LocationBrief`'s `generateBrief` now picks its prompt voice from
`altitudeForRole(effectiveRole)` — 'store' altitude (gm/sm_am_dm/manager) always gets the
coaching voice; 'patch'/'district' altitude (everyone else who can reach this panel) always gets
the enterprise voice — falling back to the old `locs.length>1` heuristic only when no role is
threaded in at all. **Open question #5 decided** (same "trust your judgement" latitude the owner
gave for recommendation #1's opens): scope size is kept as a secondary modifier, not dropped —
every prompt now states `DATA (N location(s)):` explicitly regardless of which voice is chosen.
`effectiveRole` is threaded into `LocationBrief` at its one App.js call site (`routePanel==='brief'`).
Covered by `src/__tests__/dispatch-location-brief-role-voice-2026-11-11.test.js` (4 tests,
rendering the real exported component and asserting on the actual prompt text sent to
`callSageOnce`): a GM gets the coaching voice even on a multi-store district scope, a VP/OM get
the enterprise voice even on a single-store scope, and the old scope-size fallback still holds
when no role is passed.

**Effort: small.** The two prompt styles already exist (operator-coaching-a-GM vs.
enterprise-briefing-a-VP) — they're just gated on `locs.length > 1` instead of on who's asking.
Pass `effectiveRole` into `LocationBrief` (not currently threaded — a one-line addition at its
App.js call site) and pick the prompt style from `altitudeForRole(effectiveRole)` primarily
(falling back to the scope-size heuristic only if role is somehow absent), so a GM always gets
the coaching voice and a DO/VP always gets the enterprise voice, regardless of how many stores
happen to be in scope that time. No change to the underlying `buildBriefContext` data.

These three are the **recommended first phase** — each reuses a pattern already proven today
(Curated Home's altitude map or the Huddle's role-voice prompts), touches no schema, and is
additive on top of an unmodified data/engine layer, matching this repo's own "wrap, don't fork"
precedent. None requires new RBAC, new Supabase tables, or a new design system component.

### Second-phase candidates (real, but bigger lifts — visual restructuring, not just prompt/grouping changes)

- **Store Dashboard / Store Analytics.** Highest ceiling, highest effort: the owner's "small
  focused vs big picture" framing fits this panel exactly (a GM lands here to run today; a DO/VP
  lands here to judge one store against the district), but today's tab structure (Overview, Shift
  Analysis, Intelligence Brief, etc.) is dense and identical for both. A role-conditional **top
  section** — GM sees today's 3-4 flagged metrics in plain language with the decision attached
  (reusing Curated Home's `ItemCard`/severity pattern); DO/VP sees the same tiles but opens with
  district-rank context (Location Intel and Visit Readiness already compute per-store ranking and
  risk drivers — reuse, don't rebuild) — while every existing tab stays reachable underneath,
  unchanged. This is a real visual-restructuring job, not a prompt swap, so it's sized for phase 2
  rather than phase 1.
- **Visit Readiness.** Same shape of opportunity: GM's own-store view could lead with the plain
  "EcoSure: Watch — here's the one thing to fix before the next visit" line (data already
  computed — `fsFlag`/`fsScore`/top risk drivers); DO/VP's multi-store view could lead with a
  ranked table of which stores are least visit-ready right now. Currently one identical layout
  for both. Needs a product decision on whether the GM-altitude view replaces or sits above the
  existing single-store page.
- **Labor Tools (Model Assignment / Period-Total Scoreboard).** Genuinely diagnostic/engineering
  surfaces today — not obviously wrong to leave role-flat, but worth a product call: does a GM
  ever need the backtest matrix at all (it's already partly covered by `disabledPanels`-style
  gating elsewhere), or does a DO/VP need a rolled-up "which stores' forecast models are
  mis-assigned" view on top of the current per-store detail?

## Open questions for the owner

1. **Bespoke per-panel treatment, or one shared component/pattern reused everywhere?** This doc's
   three phase-1 picks each reuse `altitudeForRole`/the Huddle's voice prompts, but each panel's
   *rendering* change is still hand-built per panel (SAGE = prompt text, District Priority Brief =
   grouping order, Intelligence Brief = prompt selection). Is that the right model long-term, or
   should there be one shared `<RoleAdaptiveSection>`-style component that every future panel
   plugs into (headline slot + depth slot, role picks which renders first)? Building that
   shared piece first would change phase-1's scope and cost.
2. **How much visual restructuring vs. just reordering which stats are headline vs. drill-down?**
   Phase 1 above is deliberately the "reorder/re-voice existing output" tier (cheap, low risk).
   Store Dashboard and Visit Readiness (second-phase candidates) are the first places where "swap
   which stats lead" stops being enough and a real layout decision is needed — worth confirming
   that's the right line before any of phase 2 is scoped in detail.
3. **Should the 9-rung ladder always collapse to exactly 3 altitudes (store/patch/district), or
   does any panel need a finer split** — e.g. does OM (level 4, "—" scope, currently lumped into
   'patch' alongside AS and DO) deserve its own voice anywhere, given it sits structurally between
   AS's patch-level and DO's district-level per the real ladder? Curated Home and the Huddle both
   made the 3-way collapse already and it hasn't been revisited; worth deciding once rather than
   per-panel.
4. **Does "celebrate the wins" (Notes 73 item 4, a separate queued idea) belong folded into this
   work or stay fully separate?** The Huddle's `patch` voice already has an owner-mandated
   "always lead with a win if one exists" rule baked in — the first concrete instance of the
   win-celebration ask anywhere in the app. Worth flagging since item 4 is unscoped and this task
   already produced one real example of it; if item 4 gets picked up next it should know this
   precedent exists rather than starting from zero.
5. **Intelligence Brief's scope-size voice branch** — once re-keyed to role (recommendation #3),
   should the scope-size signal be dropped entirely, or kept as a *secondary* modifier (e.g. a GM
   who somehow gets a 5-store brief still gets GM voice, but the brief also says "this covers 5
   stores" explicitly)? Minor, but worth a one-line decision before building.

## Build phasing (sized, not committed)

**Phase 1** (the three recommendations above — SAGE role-voice, District Priority Brief altitude
grouping, Intelligence Brief re-keyed voice): no schema change, no new RBAC, reuses
`altitudeForRole`/`ALTITUDE_VOICE` as-is or by trivial extension. Each is independently shippable
and independently revertible — do them as 2-3 small PRs, not one large one, per this repo's own
"would this still pass if reverted" bar (each panel's existing behavior for a reverted role is
exactly today's behavior, nothing lost).

**Phase 2** (pending owner decision on open questions 1-2): Store Dashboard/Store Analytics
role-conditional top section; Visit Readiness role-conditional lead. Real visual work, needs a
layout decision before estimating size.

**Phase 3** (pending owner decision on open question 4, and likely its own separate scoping pass
per Notes 73 item 4's own framing): generalize "celebrate the win" beyond the Huddle's `patch`
altitude into other role-voiced surfaces, once item 4 itself is scoped.

## What this doc deliberately does not do

No `src/` file is touched. No component is built. No panel is restructured. This is the audit +
plan task #110 asked for, following task #90's and #79's own precedent of "write the design doc,
get the owner's read, then build" for anything that reshapes a panel's visible behavior (a
CLAUDE.md Dev-Rules "Tier B/C" judgment call — changes visible behavior, in some cases reverses or
narrows an existing uniform-for-everyone presentation — never shipped unattended).
