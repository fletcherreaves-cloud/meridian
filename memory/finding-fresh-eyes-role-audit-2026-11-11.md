---
name: finding-fresh-eyes-role-audit-2026-11-11
description: Owner-requested exercise (2026-11-11) -- a full "forget everything you know, open this cold as each role" pass over Meridian, cycling through every RBAC role and answering 13 structured UX/product questions per role. Code-grounded (panel-registry.js, permissions.js, curated-home.js read directly; no live browser click-through this pass -- flagged explicitly where that matters). Builds on, and does not duplicate, the existing lean-and-mean review (memory/finding-realestate-review-2026-11-07.md) and role-voice-tuning scoping (memory/plan-role-based-depth-tuning-2026-11-08.md). Log for reuse as the app grows -- re-run this exercise after any major IA change.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Fresh-eyes role audit (2026-11-11)

## 0. The real finding before any role-play starts

**Nine named roles collapse to THREE actual first impressions**, by design
(`src/engine/curated-home.js`'s `ALTITUDE_BY_ROLE`, already reused for Curated Home, the Huddle,
and SAGE's role-voice): `gm`/`sm_am_dm`/`manager` → **store**; `area_supervisor`/`om`/`do` →
**patch**; `vp`/`owner`/`admin` → **district**. That's a deliberate, reasonable simplification —
most of this audit is organized the same way, because pretending there are 9 distinct UX
experiences today would be dishonest. Within each cluster I call out the real permission deltas
that DO still matter.

**The single biggest fact governing every role's first few seconds in the app:** `defaultLandingPanel`
defaults to `null` → `'command'` → `AtAGlance` (verified in code: `App.js`'s `view` state
initializer, `constants.js`'s `DEF_SETTINGS`). **Curated Home — the one feature built specifically
to solve "say the number and the decision" per role (tasks #92/#106) — is NOT what any new user
sees by default.** It's an opt-in sidebar item under Daily. Every role's actual first impression is
the classic At-A-Glance dashboard, built for a power user, regardless of altitude. This single fact
touches almost every answer below and is the headline of §4.

---

## 1. Store altitude — GM, SM/AM/DM, Manager (one store, the people actually running shifts)

These three share `altitude:'store'` but have real permission deltas: **GM** gets
`data.upload`/`users.manage.lower`/full review workflow + `disabledPanels` trims 17 multi-store
analytical panels (pricing/promo-ROI/compare/correlation tools) that were never in the real GM
Routines doc. **SM/AM/DM** is read-mostly (`reviews.create:false`, no upload, no lower-user
management) — they see their own review only. **Manager** is the odd one out: it's the
pre-existing *default-signup* role (`profiles.role default 'manager'`), level 3 (same numeric
level as DO!), with its own permission set that's neither GM's nor SM/AM/DM's — `analytics.ai:false`,
`data.upload:false`, narrower than GM despite being a "kept as-is, don't touch" legacy role.

**Q1 — what's different for this role specifically:** A GM's actual job is "is today going okay,
and if not, what do I do about it RIGHT NOW" — a shift-by-shift, hours-not-days cadence. The app's
default landing (AtAGlance) is built for a multi-store power user scanning tiles across 27 stores;
a single-store GM scanning the SAME tile layout is reading mostly blank/irrelevant comparison
chrome (district rollups, patch heat maps) before reaching their own store's numbers.

**Q2 — most impactful data first:** Today's OEPE/R2P live reading + whether today's labor is
tracking to forecast + the single worst-trending metric since yesterday + anything a Visit
Readiness/Security/EcoSure finding flags for THEIR store specifically. Not district trends, not
patch comparisons — those are a supervisor's job, not theirs.

**Q3 — too much/not enough/right data, too much/too little help:** Too much, by default — a GM
landing on classic AtAGlance sees every district-altitude tile (patch heat map, bullseye, district
projections — task #69 moved these below the fold, which helps, but they're still there to scroll
past). `disabledPanels` already trims the SIDEBAR correctly for GM; the HOME SCREEN isn't scoped
the same way, because the home screen is AtAGlance for everyone, not altitude-aware.

**Q5 — predicted first-time reaction:** A GM given a login for the first time would almost
certainly say some version of *"there's a lot here and I don't know where to look"* — not because
any one panel is bad, but because the landing experience doesn't know they're a GM. The existing
first-login nav walkthrough (task #107) helps with navigation; it doesn't change what greets them
before they've clicked anything.

**Q6 — doesn't belong / misused:** Nothing in a GM's actual sidebar is obviously wrong (the
`disabledPanels` trim already did real curation work here, per task #112's finding). The real
"doesn't belong" is architectural, not panel-level: a GM-altitude first screen SHOULD be Curated
Home (it already narrates store-altitude tactical items in restaurant language), and isn't.

**Q7 — UI/UX cohesion:** Panels individually are consistent (ModalShell/RoutePanelShell convention
is real and enforced by tests — not a vague impression). The one open UI thread I can't settle from
code alone: does every panel's close/back behavior actually feel the same to someone who's never
seen a RoutePanelShell before? `memory/panel-contract.md`'s own numbers (34/94 panels `route:true`
as of 2026-09-01) say most panels are still modals, not full pages — a GM bouncing between a
modal-style panel and a route-style one will feel a navigation-model switch they can't name but
will notice.

**Q8 — too technical wording:** "OEPE" (Order, Experience, Prepare, Enjoy — or whatever the real
expansion is) and "R2P" are QSRSoft jargon shown as bare acronyms in header tiles. A GM who's used
QSRSoft daily knows these; an SM/AM/DM who mostly works the floor may not have the acronym
memorized even if they know what "how fast is the drive-thru" means. "FOB %" is the worst offender
— it's genuinely opaque to anyone without a QSRSoft background ("Food over Base"? a brand-new GM
would have no way to guess). None of these have an inline expansion on first use anywhere I can
find in the registry or component code I've read this session.

**Q9 — needs a front-end facelift:** Visit Readiness is the strongest existing candidate for "the
engine is good, the delivery could be better" — the composite score + risk drivers are real and
transparent (CLAUDE.md's own PACE weighting), but it's presented as a dashboard, not as a coaching
conversation. This is literally what Notes 73 #4 (task #111, in progress — see
`memory/finding-dossier-coaching-library-2026-11-11.md`) is already scoped to fix.

**Q10 — wish-I-could-click-into-detail:** Every current-state KPI tile across the app (AtAGlance,
One-Pager, Above-Store One-Pager) shows actual vs. target with no click-through to "which specific
transactions/hours/days drove this." Some panels already have this (the per-location drilldown
tables, Controls outliers' "who and when"); the home-screen tiles themselves don't. **Can this be
wired up?** Yes, mechanically — `metric-source.js`'s `metricSeries` already returns the day-by-day
series every tile's average is built from; the tile just doesn't expose it. A click-to-expand
showing the underlying daily series (reusing Trend Explorer's own sparkline+table component) is a
real, scoped, non-speculative build, not a "would need new data" ask.

---

## 2. Patch altitude — Area Supervisor, OM, DO (multi-store, one layer below district)

Real deltas: **AS** (`area_supervisor`) is the only one of the three with `system:false` (an
org-configurable role, not a locked system one) and is the one CLAUDE.md's own role table calls
"patch-level (subset of stores)" explicitly. **OM** = `SUPERVISOR_PERMS + analytics.integrity:true`
— otherwise identical to AS. **DO** = `VP_PERMS` minus `analytics.integrity`, plus `payroll.view:true`
— meaningfully MORE access than AS/OM (district-wide analytics permission, payroll), despite
sharing their 'patch' altitude for Curated Home's narration purposes.

**Q1:** This cluster's real job is comparative — "which of MY stores needs me today, and is my
patch/district trending the right direction." The existing Above-Store One-Pager (scope selector:
all/state/patch/store, 5 time windows, per-store drilldown) is already built almost exactly for
this altitude. The gap isn't missing capability, it's that this cluster, like GM, lands on
AtAGlance by default rather than something that opens already scoped to their patch.

**Q2:** Patch-wide ranked list (worst sales-vs-LY first, matching Above-Store One-Pager's own
existing sort), the biggest-$ opportunity store, and any Controls/Security outlier in their patch
specifically (not company-wide).

**Q3:** Right data exists; wrong default altitude on landing (same root cause as §1). One thing I'd
flag as genuinely missing, not just mis-surfaced: nothing I can find gives this cluster a
"compare my patch to the OTHER patches" ranking on the home screen — Above-Store One-Pager can show
it if you build the query yourself (select the right scope), but nothing surfaces "you're patch 3
of 5, here's why" unprompted.

**Q4 (role-specific aesthetics callout):** TopBottomStrip (one-pager.js) already does the right
thing visually — top performer / needs attention, state-broken-out when the scope spans FL+OK —
and that pattern should be the template for patch-altitude home content generally, not just inside
the One-Pager.

**Q5:** A supervisor given a cold login would likely ask "how do I just see MY stores" within the
first minute — the scope selector exists and works (Above-Store One-Pager, Reports Hub via
LocationSelector), but it's not the first thing on screen; it's a control inside a panel they have
to already know to open.

**Q6:** A real, specific inconsistency, found by reading the code (not assumed): CLAUDE.md's own
RBAC table calls DO "District-level" scope, but `curated-home.js`'s `ALTITUDE_BY_ROLE` collapses
`do` into `'patch'` altitude for narration, and `altWord` (that same file) literally renders the
word **"patch"** in a DO's home-screen text. A District Ops manager overseeing an entire district
would read their own Curated Home narration calling their district a "patch" — a wording mismatch
that would read as mildly wrong to exactly the role most likely to notice org-chart language. Worth
a one-line fix (give DO its own `altWord`, or its own altitude bucket) — small, but it's the kind
of detail that erodes trust in a tool for the person being asked to rely on its language.

**Q7:** Consistent panel chrome, same open question as §1 about modal-vs-route feel.

**Q8:** Less of a concern at this altitude — these roles are closer to the owner's own vantage
point and more likely to already know the QSRSoft vocabulary. "FOB %" is still worth a tooltip
everywhere, cheaply.

**Q9:** Controls outliers (`buildControlsOutliers`) already surfaces "who and when" for a patch —
genuinely good data, currently only inside Above-Store One-Pager's text brief, not its own
dashboard. A small, real facelift candidate: promote it to its own visual card (sparkline of the
outlier days, not just a text line).

**Q10:** Same answer as §1 — the daily series behind any averaged KPI should be one click away
everywhere, not just where a panel happens to already build a drilldown table.

---

## 3. District altitude — VP, Owner/Admin (the owner's own vantage point)

**Owner/Admin IS the owner** (or his technical twin) — there is no genuine "first time" experience
to predict here; he built the thing. The one real finding at this altitude: **VP has slightly LESS
access than DO on two keys** (`payroll.view:false`, `security.auditLog:false` — both `true` for DO)
despite VP outranking DO on the ladder (level 2 vs 3). If a VP is ever a real second person (not
just Fletcher wearing a different hat), this is backwards from how most org charts work — someone
senior enough to be above District Ops usually has at least as much visibility as the people
reporting to them, not less. Worth a deliberate owner decision, not a silent "fix": is this
intentional (VP is a strategic/multi-district role that genuinely shouldn't see wage data by
design), or an oversight from the ladder being added incrementally (dispatch #148)?

**Q2 (district altitude, what matters most first):** Which district/state is trending the wrong
direction, the single biggest $ opportunity company-wide, and whether the automated data pulls
themselves are healthy (stream freshness) — since at this altitude, a bad number might mean a bad
store OR a dead data stream, and that distinction has to be visible immediately or it wastes a
VP's whole first five minutes chasing a phantom.

---

## 4. Cross-cutting answers (Q4, Q11, Q12, Q13 — these don't repeat well per-role)

**Q4 — single most impactful thing to build, knowing every request made this session and before:**
**Make Curated Home (or an altitude-aware variant of AtAGlance) the actual default landing
experience, at least for store- and patch-altitude roles.** Every other finding in this document —
"too much chrome," "doesn't know I'm a GM," "the right data exists but isn't surfaced first" —
traces back to the same one root cause: the feature built to solve exactly this (tasks #92/#106)
exists, is real, is tested, and sits behind a settings toggle nobody new will find.
**How I'd present it:** not a forced replacement — keep AtAGlance as the power-user/admin default
(district altitude is closer to what it's already built for), but change `defaultLandingPanel`'s
*effective* default to resolve per-role: store/patch altitude → Curated Home; district altitude →
command (today's behavior, unchanged for Fletcher). One function, `altitudeForRole` already exists
to drive it. This is the highest ratio of "real existing capability unlocked" to "code written" of
anything in this document.

**Q11 — missing reports/settings for seamlessness:** Two concrete gaps, not vague wishes: (a) no
in-app way for a user to SEE which panels their own role has access to without opening Settings →
Roles & Permissions and reading a table meant for an admin — a plain-language "here's what you can
do in this app" screen for a non-admin role would reduce the first-login confusion more than most
UI polish would; (b) nothing surfaces, to the USER themselves, that their `accessible_locs` scope
is narrower than "everything" — a GM given access to only their own store has no on-screen
confirmation that this is intentional vs. a bug, which matters a lot the first time someone from a
second trusted operator (the stated beta plan) logs in and sees fewer stores than they expected.

**Q12 — the one suggestion, and why it matters:** Same as Q4's answer — ship the altitude-aware
default landing. It would make a difference because every other piece of this audit's "first
impression" critique is really the SAME critique wearing different panel names: the app already
knows how to speak to each altitude (Curated Home proves it), it just doesn't speak first.

**Q13 — anything else, raw:** The app is excellent at DEPTH and nearly unparalleled at BUILDING
THE RIGHT THING FAST (this session alone is evidence) — the actual weak point an outside user
would hit isn't any single panel's quality, it's DISCOVERABILITY at low altitude. A GM is not going
to explore 94 panels to find the 6 that matter to them; they'll form an opinion in the first 30
seconds based on what's already on screen. Everything in §1-§3 above is really one finding stated
nine ways: **the product is built depth-first and role-gated correctly, but not yet altitude-first
on the one screen every single login actually opens on.**

---

## 5. Honesty about this pass's own limits

This was a **code-grounded** audit (`panel-registry.js`, `permissions.js`, `curated-home.js` read
directly, plus deep context accumulated reading dozens of panels earlier this same session) — not
a live click-through of all 9 roles in a running browser. Where I state something as a predicted
reaction (§1 Q5, §2 Q5), that is a reasoned prediction from the real permission/altitude model, not
an observed one. The one thing most worth a real follow-up before trusting this further: **actually
log in as a GM via the Role-view sandbox (task #97, already built) and watch the real first 60
seconds**, rather than reasoning about it from the registry. I did not do that this pass — flagged
honestly rather than claimed.
