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

## Open questions (not implemented — need the owner's input or more data)

- **Is any of the 27 stores currently in Operations Process to Cure?** If yes, that store's
  suspension exemption isn't modeled anywhere — `VISIT_SUSPENSIONS` applies uniformly. Would
  need either a manual per-store flag or a real data source (the PEAK visit-detail API dispatch
  #230 already pulls bulk visit history — worth checking whether Cure-visit records are
  identifiable in that data before building a manual toggle).
- **Track the 3 new Support Visits (Taste & Quality / Shift Leadership / Hospitality)?** They
  have real prework and participation requirements, but the document itself says tracking/
  completion details are still forthcoming ("in the coming weeks") — revisit once that's
  published rather than guessing at a tracking shape now.
- **Surface the 92% self-assessment-eligibility metric per org?** This is computable today from
  existing CFV/Food-Safety visit history (`src/parsers/graded-visits.js` already parses pass/
  fail + type) — `(2025+2026 passing CFV+FS)/(2025+2026 total CFV+FS) × 100`. Not built this
  pass since it's a new feature, not a fix to something already in the code, and the question of
  where it should live (a new tile? part of Visit Readiness? a standalone panel?) is a product
  call. Flagging as a real, well-scoped candidate if the owner wants to see where McDOK/Emerald
  Arches currently stands.
