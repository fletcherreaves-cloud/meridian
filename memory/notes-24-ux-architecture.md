---
name: notes-24-ux-architecture
description: Owner "Notes 24" — UX/IA rework (mobile top bar → profile icon, menu consolidation, panel merges), documentation/forms repository, live panel brief, deployment path, and the modularization question. Captures the ideas AND Claude's recommendations so we can execute without re-deciding.
metadata:
  node_type: memory
  type: project
---

# Notes 24 — UX / Information-Architecture + platform direction (owner, 2026-07-24)

Context: we're mid-build and the surface area has grown fast (nav = DAILY / PERFORMANCE /
OPERATIONS / ANALYTICS / TEST KITCHEN / ADMIN). Owner wants to tame the sprawl before it
overwhelms future users, and is thinking ahead to docs, deployment, and modularization.
Owner explicitly invited Claude to **keep us focused and push to completion**.

## 1. Top bar / toolbar — mobile usability → profile menu

**Problem:** on mobile the top bar overflows; the All/OK/FL location selectors and utility
buttons (Save/Load, Change Password) aren't reliably visible/usable.

**Decision (recommended):**
- **Profile icon, top-right** (avatar optional — support an uploaded picture "just because").
  Click → dropdown card with: login id, display name, role/access level; actions: **Edit
  Profile**, **Change Password**, and dev/utility items (**Save Session / Restore Session**)
  tucked here so they're retained but out of the main bar. Standard SaaS pattern.
- **Location selectors (All/OK/FL/State/Store)** are a *data filter*, not navigation — they
  should NOT compete with nav in the top bar. Move to a **sticky sub-bar** directly under the
  header (or a compact filter chip that expands), consistent across panels. On mobile they
  collapse into a single "Filters" button opening a sheet.
- Retire nothing functionally — just relocate. Save/Load must remain reachable.

**Scope:** medium, contained to `shell.js` + a new ProfileMenu component. Good, visible win.

## 2. Menu / category consolidation + panel merges

Owner wants fewer top-level items and a more polished feel; open to new main categories
(**Scheduling**, maybe **HR/People**); fine for a panel to appear under >1 category.

**Recommended category model (proposal):**
- **Overview** — Home/Command, Morning Brief, Needs Attention
- **Analytics** — At A Glance, District Analytics, Store Dashboard/Analytics, Location Intel
- **Operations** — Signals, Promo/Discount ROI, Inventory, FOB/Food Cost, Controls/DAR
- **Labor & Scheduling** (NEW top category) — Labor Tools, LifeLenz, **Weekly Schedule
  Summary**, Labor Analysis, (future shift-builder)
- **Planning** — Monthly Targets, Projections vs Actuals, Yearly Projections, **Smart
  Targets** (+ Backtest/Diagnostic models)
- **People / HR** (NEW, grows over time) — Performance Reviews, Visit Readiness, coaching
- **Intelligence** — SAGE, Scanner/Signal Lab
- **Admin** — Data Manager, Changelog, Knowledge Base, Feature Requests, Task Queue, Help,
  Save/Restore (also reachable from the profile menu)

**Merge candidates (tabs inside one panel, not separate nav entries):**
- ✅ **Planning hub**: Monthly Targets + Projections vs Actuals + Yearly + Smart Targets +
  Backtest — all forward-looking numbers, same mental model. Strong merge.
- ✅ **Scheduling hub**: Labor Tools + LifeLenz + Weekly Schedule Summary + Labor Analysis.
- ✅ **Store hub**: Store Dashboard + Store Analytics as tabs.
- Consider: SMG VOICE (Comments + FullScale) already tabbed — keep.

**Pros of merging:** less overwhelm, fewer nav items, related workflows co-located, more
"product" feel for new users. **Cons:** changes muscle memory / deep-links; a merged panel
can get heavy (mitigate with **lazy-loaded tabs** so only the active tab mounts). Cross-listing
a panel in 2 categories is fine — use a shared shortcut, one source of truth.

**Sequencing:** do the **Planning hub** first (highest overlap, clearest win), then Scheduling
hub, then the category re-org. Each is a self-contained PR.

## 3. Documentation + forms repository (three distinct things — phase them)

- **(a) Internal docs repository** — markdown, versioned, on-demand in-app. LOW complexity,
  HIGH value. There's already a **Knowledge Base** modal (`kb`) + Help — extend that into a
  real docs browser backed by a `docs` table (or repo-committed markdown surfaced in-app).
  Contextual "?/Docs" links per panel. Claude maintains content in `memory/` and mirrors to app.
- **(b) Document uploads** — house user-uploaded files (PDF/xlsx) and list/serve them. MODERATE
  (Supabase Storage bucket + list UI + RBAC). Good once (a) exists.
- **(c) Form builder w/ scoring + weighting + math** — generalize the Performance-Reviews
  engine into a from-scratch modular form builder (fields, weights, computed scores). BIG
  feature; high value; **defer to its own workstream**. Reuse the perf-review scoring core.

## 4. Live "panel summary brief"

Owner: a synopsis of every current panel, kept live, pullable on demand — to speed decisions.
**Plan:** maintain `memory/panel-catalog.md` (Claude keeps current on each panel change) and
later surface it in-app under Knowledge Base as an auto-generated "Panel Index." Cheap, useful
for our collaboration. **Offered as an immediate deliverable.**

## 5. Deployment to other users / orgs (owner asked "what would it look like?")

We're not there yet (roadmap P4), but the path:
1. **Multi-user, same org** (near-term): harden RLS per `accessible_locs`/role; real onboarding
   (invite → magic link → profile); audit every data tool for leakage. (SAGE RBAC already done.)
2. **Multi-tenant** (org isolation): every table carries `org_id`; RLS by org; `org_config`
   (already exists) drives territory/patch/store mapping per tenant; **per-tenant secrets**
   (each org's LifeLenz/QSRSoft creds) — the daily pulls must key by tenant, not global env.
3. **Onboarding/setup**: a wizard to register stores, map orgs, connect data sources, seed
   targets. Data backfill per source.
4. **Ops**: monitoring/alerting on the sync jobs, per-tenant error surfacing, support docs
   (ties to #3 docs repo), and a status page.
5. **Commercial (if applicable)**: billing/plans, T&Cs, data-processing terms, SOC-type posture.
The single biggest lift is **per-tenant data isolation + per-tenant source credentials**;
everything else is incremental.

## 6. Modularization — Claude's recommendation: **NOT separate apps/repos yet**

The question: break Meridian into modules (projection / scheduling / operations / …)?

**Recommendation:** keep the **single Vite SPA / one repo**. Get ~90% of the "modules" benefit
at ~10% of the cost by:
1. **Clean boundaries** via the existing `features/` `engine/` `views/` `parsers/` structure
   (already good) — enforce that panels talk through engines, not each other.
2. **Lazy-load heavy panels** (route/tab-level code-splitting) — real perf win, low risk, and
   it *feels* modular (only what you open loads).
3. **Module/feature registry + flags** — a small config where each panel declares its category,
   required permission, and an on/off flag. This is what later lets you **enable modules
   per-tenant** without splitting the codebase.

**True modules (separate deployables/repos/micro-frontends): defer.** Pros: independent
release cadence, smaller blast radius, per-tenant packaging. Cons for a solo/small team:
build+deploy complexity, shared data-model duplication, version skew, cross-module state pain.
It's premature; revisit only if/when multi-tenant scale or a second dev makes independent
release cadence worth the overhead. **Decision now:** make choices that don't paint us into a
corner (boundaries + lazy-load + flags); don't split.

---

## Recommended execution order (Claude, to keep us focused)
1. **Land PR #39** (v4.506–v4.509) — confirm per-job pull works, merge.
2. **Panel catalog** (`memory/panel-catalog.md`) — fast, unblocks IA decisions.
3. **Profile menu + relocate location filters** (mobile bar fix) — visible, contained.
4. **Planning hub** merge (Targets+Projections+Smart Targets tabs) — biggest IA win.
5. Then: Scheduling hub, category re-org, KB→docs, (later) form builder, deployment prep.

⚠️ Also pending: owner added items to the in-app **Task Queue** / **Feature Requests**
(Supabase-backed) — Claude cannot read those from the repo; fold them in when synced/pasted.
