---
name: finding-dossier-coaching-library-2026-11-11
description: DRAFT, NOT YET REVIEWED BY OWNER — the curated "cause → remedy" coaching content and win-recognition patterns for the Location Dossier (task #79) and Notes 73 #4 (task #111), plus a staged build plan. Owner has not committed this to the repo yet; he's reviewing and will edit. Do not treat anything in this file as final or as something already built — it is a curation draft, same tier as the location-dossier-mockup.html artifact it accompanies.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Dossier coaching library + staged build plan (DRAFT — 2026-11-11)

Owner reaction to the Location Dossier mockup (artifact `U8kJDjXVu6aYupwA9DQSqK`): *"What you did in the
mockup is perfect. We need to do the same for other areas that would land here."* This is that pass —
curating the What-happened / Why-it-happened / What-to-do-about-it content for the OTHER finding
categories that would show up in a real dossier, beyond the Ardmore/CASH-003 example already written by
hand into the mockup. **Owner offered to either help write this or let me curate first and edit after —
this file is the "curate first" path. Nothing here is built; nothing here is final.**

## 0. Two corrections made while researching this (measure-it, not reasoned)

1. **Demographics is NOT an open data-source question — it's already live.** My first mockup pass said
   "no data source exists." Wrong — checked the actual code: `src/engine/census-demographics.js` +
   `supabase/schema-store-demographics.sql` + Location Intel's own "🔄 Refresh Demographics" button
   already pull tract-level population/median-income/median-age/poverty-rate/owner-occupied%/household-size
   from the free, keyless Census Geocoder + ACS 5-Year API, server-side via a `census-proxy` Edge Function
   (built after a 2026-09-16 CORS failure forced it off the browser). Persisted in `store_demographics`,
   RLS-scoped like `store_assessments`. Full design history: `memory/project-location-demographics.md`.
   **The dossier's demographics card is a pure wiring job — read `store_demographics` — not a new feature.**
   Fixed in the mockup artifact (v2).
2. **Security findings already carry most of their own coaching content — it's columns in the
   `security_rules` table, not something to write from scratch.** Every rule (CASH-001/002/003/004,
   EVENT-001/002/003, INV-001/002) already has `description`, `investigation_action`,
   `false_positives` (legitimate explanations — exactly the "don't self-incriminate on a false positive"
   instinct), `exoneration_rules`, and `corroboration_rules`. See §2 below for how these map directly onto
   the dossier's What/Why/Remedy card shape. **This cuts the real curation work roughly in half** — the
   Security domain's cards are a re-presentation job, not new writing.

## 1. Staged build plan (owner said "yes" to this)

Builds on `memory/plan-location-dossier-report-2026-11-04.md`'s own §6 sizing, sharpened now that the
mockup exists and this curation pass has started:

- **Phase 1 — factual/ingested tier, location level only.** The cheapest phase: reuse
  `one-pager-data.js`'s builders (`buildCurrentState`/`buildPerLocationRows`/`buildScheduleActuals`/etc.)
  behind the mockup's KPI-grid presentation, for ONE store, the 5 fixed windows + custom. No new data
  plumbing. Closest existing analog in size: a Reports Hub Phase 5 report (Weather Impact, Price Change
  Impact) — a few hours, bigger only because it spans more metrics.
- **Phase 2 — rollup levels (patch/operator/state/district).** Aggregation, not concatenation — same
  math Above-Store One-Pager's scope selector already does today (`buildCurrentState` takes a `locs`
  array and dollar-weights/ratio-of-aggregates correctly). The new piece is the drill-down navigation
  (breadcrumb + rollup table → store), which the mockup's JS tree-walk already proves out as a UI pattern.
- **Phase 3 — analyzed/discovered tier.** Needs §3 below (curation) to decide WHICH correlations/trends
  surface per store and how many — Scanner can find dozens, the dossier wants 3-5 that matter. This is
  the first phase where "someone has to write judgment calls into code," not just wire existing builders.
- **Phase 4 — Important Findings + Wins cards.** For Security findings: read `security_rules`' own
  columns directly (§2) — genuinely cheap once Phase 1-3 exist. For every OTHER domain (Visit Readiness,
  Controls outliers, FOB, Labor/Scheduling, Service, Sales/GC, Forms, Voice): needs the curated content
  in §4/§5 below turned into either hand-written trigger logic (if/else on which condition is true →
  which canned explanation) or a SAGE call per finding (more flexible, real token cost — open question,
  same as `plan-location-dossier-report-2026-11-04.md` §5.2a already flagged).
- **Phase 5 — semi-static context tier.** Demographics (now known-easy, see §0.1), equipment/layout
  (already real data, just needs wiring), personnel snapshot (blocked on the PII policy — see §6),
  weather sensitivity (Signals already computes this per-store via the Weather metric group, needs
  surfacing not computing), Store KB notes (direct read of `STORE_KB`).

Nothing here is a commitment to timeline — it's the same sizing exercise as the design doc, now informed
by the mockup and this curation pass.

## 2. Security findings — re-presentation, not new writing

Pattern: pull the rule's own `description` (what the metric measures), `investigation_action` (what to
do), and `false_positives` (legitimate explanations — feeds the "why it happened" block honestly, since
many of these are genuinely often innocent) straight from `security_rules`. Below is that mapping for
every rule currently defined, so Phase 4 has a checked reference instead of re-deriving it from the SQL
files again.

| Rule | What it measures (from `description`) | Legitimate explanations (`false_positives`) | What to do (`investigation_action`) |
|---|---|---|---|
| **CASH-001** | Cash O/S rate, personal baseline | (not re-checked this pass — phase1b.sql, not re-read; same pattern as below) | — |
| **CASH-002** | POS-over rate, personal baseline | — | — |
| **CASH-003** | Manual/self-authorized refund — restructured 2026-11-11 onto `qsr_security_events`, see `memory/finding-cash003-security-events-restructure-2026-11-11.md` | documented price-match override, manager-approved service recovery, POS training correction | Pull the manual-refund transaction detail for the flagged employee and cross-reference against manager-approval logs for the same window |
| **CASH-004** | Promo/discount rate, peer baseline, threshold = Register Audit's own existing 10% amber band | new promo campaign, documented manager-approved comp, employee meal policy explains the rate | Pull the Meal Activity log and compare discount transactions against the employee meal policy and scheduled hours |
| **EVENT-001** | Employee-meal event rate (`qsr_security_events`) — INACTIVE, first-guess threshold never measured | documented employee meal policy change, shift-meal promotion, new hire orientation week | Pull the flagged crew member's employee-meal transactions and compare against the posted policy and scheduled hours |
| **EVENT-002** | Manager-meal event rate — INACTIVE | documented manager meal policy, shift-meal promotion | Pull the flagged crew member's manager-meal transactions and compare against the posted policy and manager schedule |
| **EVENT-003** | Manager-AUTHORIZED POS-override rate (subject = the approving manager, not the cashier) — INACTIVE | new POS rollout, documented equipment malfunction, manager training on overrides | Pull the flagged manager's authorized-override transactions and compare against the register's own exception log |
| **INV-001 / INV-002** | Inventory TvA variance, z-scored against peer stores (not an absolute threshold) | — (not re-checked this pass) | — |

**Three EVENT-* rules and CASH-001/002/INV-* cells above still need their exact current `false_positives`/
`investigation_action` text pulled the same way CASH-003/004 and EVENT-001/002/003 were here — not done
in this pass for time, flagged so nobody assumes this table is complete.**

This table itself is the design answer to "contextual help" for Security findings: the "external link"
the owner asked for doesn't need to be invented per-finding — `investigation_action` already names the
concrete next step, and the dossier's job is just rendering it next to the number, the same way the
mockup already did for CASH-003.

## 3. Visit Readiness / PACE — genuinely new curation (no existing remedy column)

PACE's weighted composite (Speed 35 / Accuracy 30 / Quality 20 / Leadership 15, CLAUDE.md) already names
*which* pillar is dragging a store down (`src/engine/visit-readiness.js`'s top risk drivers) but not *why*
or *what to do* — that reasoning doesn't exist anywhere yet. Draft patterns, grounded in what Meridian can
actually cross-reference (not invented without a data path):

- **Speed pillar dragging:** cross-ref against `qsr_daily_activity`'s hour-slot OEPE/R2P by daypart —
  if the miss concentrates in one daypart, the remedy is a staffing-density check for that window
  (TPMH vs. the store's own historical baseline for that daypart), not an all-day fix. If it's flat across
  all dayparts, that's a process/training question, not a staffing one — different remedy entirely.
- **Accuracy pillar dragging:** cross-ref against Forms completion + the most recent graded-visit notes
  for repeat station-specific misses (same station cited twice running = a station-level training gap,
  not a store-wide one).
- **Quality pillar dragging:** cross-ref against EcoSure's own item-level results (`graded_visits`) —
  a repeat citation on the SAME `questionCode` across visits is a process gap; a different code each time
  is closer to noise/one-offs and shouldn't be over-coached.
- **Leadership pillar dragging:** cross-ref against Shift Manager coverage data — a gap concentrated in
  a specific daypart/day-of-week pattern (e.g., always weekend closes) points at a scheduling-coverage
  fix; scattered across the week points at a different, harder-to-pin-down leadership-presence question.
- **Food-Safety flag (EcoSure-sourced, per the 2026-09-12 real-signal fix):** a CRITICAL result's remedy
  is always procedural (pull the exact citation, verify the corrective action logged); a WATCH from the
  waste/variance proxy (the fallback, used only between real EcoSure visits) should say so explicitly —
  "this is the proxy signal, not a real audit result" — so a GM doesn't over-react to a fallback reading.

## 4. Controls outliers — distinct from Security findings, needs its own curation

`buildControlsOutliers` (Above-Store One-Pager) surfaces the worst individual store-days for
cashOSPct/tRedAPct/discPct — simple statistical outliers, NOT the registered `security_rules` (those are
employee-level; these are store-day-level). Draft patterns:

- **Cash O/S outlier (either direction):** a big OVER and a big SHORT are both exposure, but for
  different reasons — over usually traces to a till-count or change-fund error (remedy: re-verify the
  count procedure with whoever closed that drawer); short more often traces to either a miscount or an
  actual loss (remedy: check whether the same register/shift pattern recurs before treating it as a
  one-off).
- **T-Reds After outlier:** a spike here specifically (vs. T-Reds Before) means a transaction was
  voided AFTER tender — the single highest-signal self-authorization pattern in Controls. Remedy:
  identify who rang AND who (if anyone) authorized it; this is the store-day version of what CASH-003
  checks at the employee level.
- **Discount outlier:** check against that day's promo calendar first — a real campaign day legitimately
  spikes this; only flag as a finding if the day has no promo on file.

## 5. Other domains — lighter curation, first pass

- **FOB/Food cost miss:** distinguish a VENDOR/cost-driven favorable or unfavorable swing (check if
  comp-waste$ moved while raw-waste$ stayed flat, or vice versa — different remedies) from a genuine
  waste-discipline issue (both components moving together, store-specific, not estate-wide).
- **Labor% / Scheduling (VLH band) miss:** check whether the Fixed/Floor/Combined band breach is new
  (this period only — likely a one-off staffing decision) or persistent (3+ periods — likely a scheduling
  template that needs resetting, not a one-time coaching conversation).
- **Service speed (OEPE/R2P/TPPH/KVS) miss:** same daypart-concentration check as PACE's Speed pillar
  above — these should actually SHARE logic, not be curated twice (flag for Phase 3: don't duplicate this
  reasoning in two places in the codebase).
- **Sales/GC pace miss:** always check the LY-event caveat first (Above-Store One-Pager already computes
  this — `lyWindowEvents`) before coaching a "miss" that's actually a tough prior-year comp.
- **Forms completion gap:** distinguish "never started" from "started late" from "started on time but
  incomplete" — each has a different conversation (a process that never got assigned vs. one person
  falling behind vs. a genuinely harder checklist that period).
- **SMG Voice / complaint spike:** cross-ref against the SAME period's Speed/Quality pillar scores before
  assuming a standalone guest-relations issue — a service or food-safety miss in the same window is
  usually the actual root cause, and Voice is just where the guest reported it.

## 6. Wins — a parallel library, not an afterthought

Owner, verbatim: *"We should always remember to celebrate the wins when people and locations achieve good
or great things as well!"* Draft win patterns, same structural shape as findings (just styled gold, not
red/amber) — each needs a THRESHOLD, same discipline as a finding needs one, so "win" doesn't become
noise either:

- Sales beat LY N days running (N≥5, matching the mockup's example)
- A real EcoSure clean pass with zero criticals (not just "no flag" — a genuine positive result)
- A Controls metric clean for a full rolling window (21+ days, mirroring the mockup)
- A Speed/Accuracy/Quality/Leadership pillar crossing from Watch/Critical back to On-Track
- A PACE score improving period-over-period by a real margin (not noise-level movement)
- Forms completion hitting 100% for a period after a prior gap

**Open design question carried over from the scoping doc, still unanswered:** who sees these, and where —
a dossier section (this file's assumption), a notification, a leaderboard callout, or more than one of
those? Not decided here.

## 7. PII boundary — RESOLVED 2026-11-11

Settled via an interactive Q&A, then written into CLAUDE.md's PII section as its own bullet (don't
re-derive this from scratch again): **employee NAMES follow Meridian's existing role/scope gates
(`payroll.view`, `accessible_locs`, RBAC role) — not a separate, more-conservative rule just because
it's a report.** Every party to a finding is named (not just an "upstream" authorizer — "naming all
parties... that is how QSRSoft handles it," owner's words) to whoever already has that access; a
subject sees their own unmasked history (e.g. a GM's own store). The never-self-incriminate instinct
(suppress a person's own flagged data from them) is explicitly NOT the policy — owner called it "moot"
once role-based full visibility already matches QSRSoft/LifeLenz. **This does not touch the separate,
untouched SSN/DOB/address-grade raw-field prohibitions** (CLAUDE.md's PII section, unchanged) — this
was about identity/names, not those fields.

**Concrete effect on §2's Security-findings table above:** CASH-003's `crew_token`/`mgr_token` (and
every other rule's subject) should resolve to real names via `employee_identity_vault` — same join
already used earlier this session to confirm "Lauren W" at store 38609 — for whatever role the dossier
viewer holds, not stay anonymized to a token. **Concrete effect on §5's "Personnel snapshot" context
card:** should show names/roles where the viewer's role permits, not just tenure bands — the mockup's
current tenure-bands-only card is now stale against this resolution and should be updated to match (or
flagged as "needs a role-check implementation" if updating the mockup is deferred).
