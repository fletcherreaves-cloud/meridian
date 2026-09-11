# FS EcoSure / RGRV Food Safety scoring mechanism — owner-confirmed rules (2026-09-11)

Backlog item ("FS EcoSure/Audits/Tablet scoring mechanism — still genuinely open, owner: 'figure
out together + TEST'") answered directly by the owner this morning. This is the scoring design;
building the actual engine/UI change is separate follow-on work, not done in this note.

**Source doc committed**: `docs/2026_Food_Safety_Guide.pdf` — McDonald's "Operations PACE Food
Safety Guide," January 2026. Full FS-A through FS36 standard list with CITE/COACH assessment
detail per standard. Confidential/proprietary — internal reference only, not for external
distribution.

## The scoring rule (owner's own words, verbatim)

> EcoSure is 80 or above is pass, under is fail. There are a few questions that are critical and
> if missed are automatic fails.

## Critical questions (automatic fail if missed)

**FS-A-US through FS7-US** — confirmed against the PDF's own "Remediation" section (p.3) AND the
individual standard pages (p.4-12):
- `FS-A-US` — immediate access to the area behind the counter granted to the assessor
- `FS-B-US` — restaurant not posing imminent health hazards
- `FS1-US` — free of pest infestation
- `FS2-US` — beef patty internal temp ≥155°F
- `FS3-US` — chicken/plant-based internal temp ≥165°F
- `FS4-US` — Filet-O-Fish internal temp ≥155°F
- `FS5-US` — breakfast sausage/steak internal temp ≥155°F
- `FS6-US` — McMuffin round egg internal temp ≥155°F
- `FS7-US` — on-duty manager can demonstrate DFS Checklist training + corrective action

All other standards (FS8-US through FS33-US) are non-critical, scored toward the 80% threshold.
**FS34-36 (HST1-3) are explicitly marked "This standard is unscored"** in the PDF — informational
only (hands-free taps/towel dispensers/sanitizer station), never counted toward the 80%.

## Remediation timing — TWO DIFFERENT RULESETS depending on visit type

The owner's quote and the PDF both distinguish **3rd Party Food Safety (EcoSure)** from
**RGRV Food Safety** — they are NOT the same remediation logic:

**3rd Party Food Safety (EcoSure):**
- Any critical question (FS-A through FS7) missed → **unannounced FULL** Follow-up Food Safety
  Verification within **14 days**.
- Score <80% with no critical questions missed → **unannounced FULL** Follow-up within **30-90
  days**.

**RGRV Food Safety:**
- Any critical question (FS-A through FS7) missed → **unannounced, ITEMS-ONLY** Follow-up
  (review of the missed item(s) only) within **14 days**.
- Score <80% with no critical questions missed → **scheduled and ANNOUNCED FULL** Follow-up
  within **30-90 days**, but **only if**:
  - The overall RGRV score is <80%, OR
  - Another component (Quality, Service, Cleanliness, Shift Leadership, and/or Health & Safety)
    also scores <80%.

  i.e. for RGRV specifically, a Food-Safety-only <80% with the overall visit and every other
  component ≥80% does NOT trigger the 30-90-day follow-up — the owner's own quote didn't state
  this nuance verbatim but the PDF (p.3) is explicit and should be read literally, not assumed
  symmetric with the 3rd-party rule.

## What's still blocked (owner's own words)

> For the Tablet piece, that would be DFS (Daily/Digital Food Safety) completed and FS Last 2
> Months at 100% - Still trying to get access to that info. That would be the audits too - same
> thing.

So:
- **EcoSure itself is buildable now** — per CLAUDE.md's own note, a real sample (`FS1..FS36`
  per-question results, scores, cited reasons, `visitDate`) has already landed via
  `getThirdPartyFoodSafetyVisitReport&visitId=` (`propel.mcd.com`) — see
  `memory/finding-ecosure-propel-api-2026-08-22.md` for the endpoint/payload/ingest-trap detail
  (trailing spaces in `questionCode`, `result` 0=pass/1=cited/-1=N/A, critical items scoring 0/0).
  This note's scoring rules are exactly what that ingested data needs to be graded against.
- **FS Completion T-60 (Tablet)** and **FS Audits** both need the DFS-completed-%/FS-last-2-
  months-at-100% signal, which the owner does not yet have API/data access to. Do NOT build
  these two against a guess — wait for the owner to get access, per the standing "measure it,
  don't reason about it" rule. `visit-readiness.js`'s existing waste/holding proxy stays the
  interim signal for these two specifically (not for EcoSure, which has real data now).

## Where this plugs in

- `src/engine/graded-visits.js` — per-visit `contextData()`, already reads EcoSure's ingested
  rows (dispatch20, per CLAUDE.md).
- `src/engine/visit-readiness.js` — the graded-visit readiness composite; EcoSure was flagged
  there as a real data source that could REPLACE the waste/holding proxy, not just calibrate it.
- Not yet built: an actual `scoreEcoSureVisit(rows)` (or similarly-named) function applying the
  80%-threshold + critical-question-auto-fail logic above to a visit's FS1-36 rows, distinct from
  whatever raw pass/cited/NA tally already exists. Next concrete step when picked up.
