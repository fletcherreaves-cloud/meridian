---
name: finding-pace-midcycle-update-2026-09-15
description: September 2026 Operations PACE Mid-Cycle Update (official McDonald's doc, dated 09/15/26) — supersedes the suspension end-date previously hardcoded in src/engine/visit-readiness.js, adds the Process-to-Cure exception, the 3 replacement Support Visits, 2027 self-assessment eligibility criteria, and other changes relevant to Meridian's Visit Readiness panel
metadata:
  node_type: memory
  type: finding
---

# Operations PACE — September 2026 Mid-Cycle Update (source: official McDonald's PDF, "VF")

User-uploaded PDF, `OperationsPACE2026_MidCycleChangeUpdate_09152026_VF.pdf`. This is the
**official, dated, final version** of the CFV/RGR suspension the owner first mentioned verbally
on 2026-09-11 (which `VISIT_SUSPENSIONS` in `src/engine/visit-readiness.js` already modeled from
that verbal notice, with an end date of `2026-12-31`). This document gives the real scope and
the real end date, which **differs from what's currently in the code** — see "Code changes
made" below.

## What's actually changing (quoted/paraphrased from the PDF)

**RGRV & CFV suspended, not canceled.** For eligible restaurants: **no Running Great Restaurant
Visits or Customer First Visits from September 15, 2026 through March 31, 2027.** (The code had
`end: '2026-12-31'` — nearly 3 months short.) Owner/Operators *may* schedule RGRVs starting in
2027 but aren't required to until **April 1, 2027**.

**Replaced by 3 required "Organizational Help"/"Support" Visits**, in this order, requiring
participation from Owner/Operators, Mid-Managers and Restaurant Leadership:
1. **Taste & Quality** — October & November (in addition to existing quality showcases, which
   continue in tandem, not replaced)
2. **Shift Management / Shift Leadership** — December (end month not specified in the doc)
3. **Hospitality** — February & March

These are coaching/consulting, not scored — no pass/fail, don't feed the Operations National
Franchising Standard. Train-the-Trainer sessions for field staff happen first (October).

**Exception: Operations Process to Cure restaurants are NOT suspended.** Any restaurant in
Process to Cure as of 9/15/26, or entering it shortly after based on a qualifying event from
*before* 9/15, keeps receiving its remaining 2026 PACE visits (CFV/RGRV) **and** its Cure
visits — regardless of whether it exits Process to Cure during the window. A restaurant that
enters Process to Cure *after* 9/15 from a qualifying event *after* 9/14 does **not** get this
exception — it just goes through Process to Cure with no PACE-visit makeup.
**Meridian has no per-store Process-to-Cure flag anywhere in the data model** (checked — only
mentioned in a code comment, never populated). The suspension as coded applies to every store
uniformly. This is a real gap if any of the 27 stores are currently in Process to Cure — flagged
in "Open questions" below, not fixed, since there's no data source for it yet.

**"Missed visits" standard, for the National Franchising Standard override consideration:**
3 CFVs + 1 RGRV per restaurant per cycle; fewer than that as of 9/15 counts as missed. If an
org fails the standard at a business review, McDonald's will check whether passing the missed
2026 visits would have cured it, and may override.

**2027 Self-Assessed RGRV eligibility** (for Owner/Operators, org-level) — ALL 3:
- Organization meets all National Franchising Standards
- No restaurant in Operations Process to Cure
- **≥92% combined CFV + Food Safety organizational pass rate**, computed as
  `(2025+2026 passing CFV+FS visits) / (2025+2026 total CFV+FS visits) × 100`, **no rounding**
  (91.5% does not qualify)

If eligible, the org may self-assess up to 50% of its restaurants (FBP discretion); McDonald's
assesses the rest. Can't self-assess the same restaurant in consecutive eligible years. Can opt
out entirely (written notice via the FBP, after the Business Acceleration Session — once set,
final for the cycle). **As of August 2026, only ~15% of organizations nationally meet this
threshold** on a trailing 24-month basis — first-blush data in Q4 2026, official eligible-org
list by February 2027.

**2027 Third-Party Food Safety (EcoSure) visits split in purpose** (2026 unchanged — still
2/year, nothing to do now): the *first* 3PFSV of 2027 becomes an announced, consultative
coaching visit (not scored); the *second* is the scored visit that counts toward PACE and the
National Franchising Standard. This roughly halves EcoSure's *scored* cadence starting 2027 —
worth revisiting `EXPECTED_CADENCE_DAYS.EcoSure` (currently 182 days = 2/yr) when 2027 begins,
not before.

**Curbside now optional** — restaurants may disable it via RFM (removing signage, repainting
stalls as needed); guidance on the standards/procedure update comes after October 1. **Table
Service** optionality is still being evaluated, no guidance yet. Neither is urgent for Meridian
— there's no current channel-mix metric gated on "is curbside enabled," and `signal-registry.js`
treats a channel's zero-volume days as real data (`allowZero`), which already tolerates a store
that's stopped offering curbside without any code change.

**Scorecards/rankings/Big-7 KPIs under review** — McDonald's is reassessing which KPIs to keep
and how results get shared, explicitly trying to reduce org-vs-org competitive optics in favor
of "insight and improvement." No specifics yet ("additional information in the coming months").
Relevant context for Meridian's own Leaderboards panel and any district-vs-district comparison
framing, but nothing actionable until McDonald's publishes the revised KPI list.

**NRBES unchanged through 2026**; 2027 reinvestment-standard changes to be shared Q4 2026.
**People Brand Standards (PBS) unchanged for the current 2026 cycle** (official visits conclude
early October); simplification details in Q4 2026. **GSET process under review** (earlier
Owner/Operator involvement, fewer late-stage reworks) — no specifics yet.

**November: national webcast** on PACE changes, PBS simplification, and support-visit
expectations. **Q4 2026 / Q1 2027:** the Operations PACE team publishes the actual 2027 PACE
cycle changes — this document is explicitly a mid-cycle *preview*, not the final 2027 program.

## Code changes made (this pass)

1. **`src/engine/visit-readiness.js`'s `VISIT_SUSPENSIONS` end date corrected**:
   `2026-12-31` → `2027-03-31`, matching this document exactly. The reason/label comment updated
   to cite this document, the replacement Support Visits, and the Process-to-Cure caveat (so a
   future reader isn't working from the stale Sept-11 verbal-notice framing alone).
2. **`src/__tests__/dispatch-visit-suspension-cfv-rgr-2026-09.test.js`** updated: the "last day of
   the window" test moves from `2026-12-31` to `2027-03-31`; "day after the window ends" moves to
   `2027-04-01`; added a mid-window check at `2027-02-15` (previously outside the old window
   entirely, so never exercised) to confirm the panel still treats the extended tail as suspended.

## Follow-up (2026-10-01): Process-to-Cure check + the 92% eligibility tracker

**Process to Cure — measured, not guessed.** Pulled real `graded_visits` data (service-role
Supabase read, 263 CFV/RGR/RGR-HealthSafety/EcoSure visits across all 27 stores, 2025-01-08
through 2026-09-11) and checked for the actual signal that drives the Cure clock: per the
standards file (`project-graded-visits-pace.md`), CFV explicitly carries **"No remediation,
but feeds trend"** — a CFV fail alone does not start the 30/90-day remediation clock or count
toward Cure. **RGR (and RGR-HealthSafety) is the instrument that does.** Of 43 RGR/
RGR-HealthSafety visits in 2025-2026, **zero failed** — every one is `status:'A'` (Acceptable),
`pass:true`. The only Food Safety (EcoSure) fail in the whole window is one visit at loc 06972
on 2025-09-17 (score 94, failed on a critical despite the high score) — over a year old, a
single isolated incident, not a pattern, and its mandatory 14-day unannounced re-check would
already be long resolved. **Conclusion: no store appears to be in Operations Process to Cure
right now**, based on everything Meridian's own visit records can see.

**Caveat, stated plainly**: this is inferred from visit *scores*, not from an official
"Process to Cure" status field — Meridian has none. The standard also allows Cure to be
triggered by things that wouldn't necessarily show up as a failed graded visit at all
(egregious circumstances, refused access, a health-department closure). This measurement rules
out the main pathway (repeated RGR failures); it cannot rule out those other triggers.
`VISIT_SUSPENSIONS`' uniform-suspension gap (no per-store exemption) therefore remains
real but currently **low-risk** in practice, since there's no visit-record evidence any store
needs the exemption today.

**92% eligibility tracker — built.** `computeSelfAssessmentEligibility(gradedVisits, opts)`
(`src/engine/visit-readiness.js`) implements the exact official formula — `(2025+2026 passing
CFV+EcoSure visits) / (2025+2026 total CFV+EcoSure visits) × 100`, compared `>= 92` with no
rounding (matches the FAQ's "91.5% does not round up"). Wired into `computeVisitReadiness`'s
return as `selfAssessmentEligibility`, org-level (not scoped to a panel's location filter, since
the real eligibility figure is organization-wide per the PDF). Rendered in the Visit Readiness
panel as a new `SelfAssessmentCard`, right alongside the existing Model-check / Waste-&-variance
cards. The card is deliberately worded to never say "eligible" or "qualifies" — it names the gap
to the 92% threshold and explicitly states the other two criteria (all National Franchising
Standards met, no restaurant in Process to Cure) aren't tracked in Meridian's data model at all.

**Measured result for McDOK/Emerald Arches (2025-2026, as of this pass)**: combined CFV+Food
Safety pass rate is **82.27%** (181/220 visits) — well short of the 92% threshold. The gap is
almost entirely CFV: CFV alone is **69.35%** (86/124) while EcoSure alone is **98.96%**
(95/96). So Food Safety performance is not the blocker — CFV pass rate is.

12 new tests (`src/__tests__/dispatch-self-assessment-eligibility-2026-10-01.test.js`): exact
formula verification, RGR/RGR-HealthSafety correctly excluded from the denominator, the
no-rounding boundary at exactly 92% (23/25) vs just under (11/12 = 91.67%), cycle-year
filtering (default `[2025,2026]`, overridable), per-type (CFV vs Food Safety) breakdown, empty/
null-safe behavior, the output never carrying a bare `eligible` field, `computeVisitReadiness`
wiring the result through org-level regardless of the panel's location scope, and two tests
rendering the real `VisitReadinessPanel` to prove the card actually shows the number and the
Process-to-Cure/National-Standards caveat (not just that the engine computes it).

## Open questions (still not implemented — need the owner's input or more data)

- **Track the 3 new Support Visits (Taste & Quality / Shift Leadership / Hospitality)?** They
  have real prework and participation requirements, but the document itself says tracking/
  completion details are still forthcoming ("in the coming weeks") — revisit once that's
  published rather than guessing at a tracking shape now.

## Follow-up (2026-10-02): per-store Process-to-Cure tracking — the inferred half, built

This section's own line 41-44 flagged the real gap: "Meridian has no per-store Process-to-Cure
flag anywhere in the data model... The suspension as coded applies to every store uniformly."
`computeProcessToCureStatus` (`src/engine/visit-readiness.js`) closes the INFERRED half of that
gap, wired into `computeVisitReadiness` and the Visit Readiness panel:

- **What it measures.** A "qualifying visit" per `project-graded-visits-pace.md`'s own
  consequences section: an Unacceptable RGR/RGR-HealthSafety visit (`pass:false` — already
  folds in the overall<80%/2+components<80%/critical-missed rule via `parseRGR`), or an EcoSure
  visit with a real cited critical (`criticalFailCount > 0`). A CFV visit never counts,
  whatever its score ("no remediation, but feeds trend"). 4 qualifying visits, counted
  cumulatively over all visit history on file (the source document states no reset/expiry
  window for this threshold — only that the separate 2-visit mandatory-support-visit trigger is
  scoped to "within 90 days", read here as any two qualifying visits ≤90 days apart) →
  `inCure:true`.
- **What it cannot measure, stated explicitly in its own `note` field and never silently
  assumed away:** the standard's other Cure triggers — egregious circumstances, a refused-access
  event that never registers as a cited EcoSure critical, an official McDonald's admin
  determination. No source checked so far (Propel — `finding-ecosure-propel-api-2026-08-22.md`;
  PEAK — both `finding-peak-*.md` files) exposes an actual "Process to Cure" status field
  anywhere. This remains the honest ceiling on what Meridian's own data can see.
- **Wired through:** `store.processToCure` (per store) and `district.inCure` /
  `district.mandatorySupportVisitDue` (rollup) on `computeVisitReadiness`'s return;
  `selfAssessmentEligibility.orgInCureCount` surfaces the same figure alongside the 92% tracker
  without touching that function's own criterion-3-only formula.
- **The uniform-suspension gap is now actually fixed, not just flagged.** `store.visitsSuspended`
  is `false` for a store with `processToCure.inCure:true` even while the district-wide
  `VISIT_SUSPENSIONS` window is active for everyone else, matching the PDF's own stated
  exception. The panel shows that store's real readiness score and a "Process to Cure
  (inferred, N qualifying visits)" badge instead of the generic "Suspended" pill, and the
  suspension banner names how many stores are exempt when any are.
- **Current measured result, same as the 2026-10-01 one-off check (re-confirmed, not
  re-measured from scratch this pass): zero stores currently qualify** — this feature has no
  visible effect on the live panel today. It is infrastructure for if/when that changes, not a
  response to a current live case.
- **Deliberately NOT built this pass: a manual override for the non-visit-based triggers.**
  Two reasons, not an oversight: (1) with zero stores currently qualifying by any pathway,
  there is nothing today to override; (2) the obvious reuse candidate — `org_events`, which
  already carries a per-store, date-ranged shape (`own_closure` is the exact precedent) — turns
  out not to fit cleanly: `orgEventsToDayMap()` (`src/engine/events-import.js:169`) collapses a
  null `dateEnd` to a single day (`end = e.dateEnd || e.dateStart`), so it cannot represent an
  open-ended "still in Cure, no exit date yet" status without the owner manually extending an
  end date on a cadence that has no natural trigger. Building a manual-override mechanism
  properly needs a real design decision (a dedicated ongoing-status shape, not a forced fit into
  the day-map), and per the "measure it, don't reason about it" rule, inventing that plumbing
  for a hypothetical with n=0 live cases is premature. Revisit if a store is ever actually
  measured crossing the threshold, or if the owner wants it built ahead of that regardless.
- 22 tests, `src/__tests__/dispatch-process-to-cure-2026-10-02.test.js`: qualifying-visit
  definition (RGR/RGR-HealthSafety fail, EcoSure critical-only, CFV never), the 2-visit/90-day
  and 4-visit cumulative thresholds, per-store isolation, the honesty-of-the-note checks,
  `computeVisitReadiness` wiring (per-store, district, `selfAssessmentEligibility`), and two
  React-rendering tests on the real `VisitReadinessPanel` proving the per-store suspension
  exemption and Cure badge actually render (not just that the engine computes them).
