# Organization_Structure.xlsx — the sacred baseline file

Owner-designated **sacred file**, 2026-08-14: *"we landed on keeping this data intact as a sacred
file and definitely not losing it, so we have a solid baseline comparison to match up our results
from our own runs and pulls with our data inside Meridian."*

**Committed because it was not in the repository at all.** It existed only as a chat upload, and
a session's uploads do not survive the session. Discovered 2026-08-14 when the owner said *"you
and I have already addressed this, I think it may already be in a note"* — the note
(`memory/project-org-structure.md`) covers supervisor patches and date-effective attribution, but
said nothing about this workbook, and `git log` for it came back empty. A file everyone believes
is safe and which is in no repository is the failure mode the commit-your-artifacts rule exists
to prevent.

## Structure — 27 sheets

**7 named sheets**

| sheet | contents |
|---|---|
| `Locations` | the master roster — org, owner/operator, supervisor, GM, RGR date, weekly count day, Martin Brower delivery days, FOB/Controls risk profile + drivers, primary counting manager, email domains |
| `FC-Inv Setup` | food-cost / inventory configuration |
| `Scheduling Setup` | scheduling configuration |
| `IMET` | |
| `Risk Profiles` | the FOB/Controls risk classifications and their drivers |
| `RGR Dates` | scheduled graded-visit dates per store |
| `Other Locations` | |

**20 numbered sheets** — one per Oklahoma store (`3708`, `5183`, `5985`, `6972`, `10422`, …).

## What the numbered sheets are

An **early attempt to track weekly and monthly inventory counts and food-over-base metrics per
store**, plus other per-store data. Superseded operationally by Meridian's own `qsr_fob`,
`qsr_onhand` and `qsr_variance_stat` streams.

**Its value now is as a baseline for reconciliation**, not as a live source. When an EOM or FOB
figure from our own pulls looks wrong, this is the independent hand-built record to check it
against. That is precisely why it must not be lost — a second, independently-produced set of
numbers is not reproducible after the fact.

## Provenance caveat — READ BEFORE USING THE RISK PROFILES

**The FOB and Controls risk-control factors were derived end of February to mid-March 2026**
(owner, 2026-08-14). They are a **point-in-time classification**, not a live signal.

Still valuable — but any analysis citing them must date them. A store's risk profile from
February 2026 is not a statement about its risk today, and treating it as current would be the
same class of error as reading a stale manual upload as fresh data.

## The organization structure it encodes

**MCDOK — 20 Oklahoma stores**
- **Ryan Thorley** (9): 3708, 6972, 10915, 24471, 29760, 31357, 32525, 33222, 43380
- **Rick/Kathy Thorley** (5): 5985, 10422, 13113, 33109, 35064
- **Gary Mornhinweg** (6): 5183, 11657, 18213, 20475, 33704, 34222

**Emerald Arches — 7 Florida stores**
- **Jacob Thorley** (4): 6178, 6838, 35242, 38609
- **Ryan Thorley** (3): 10034, 37566, 43701

**This matches `DEF_SETTINGS.operators` (`src/constants.js:148`) exactly** — verified store-by-
store on 2026-08-14. The map was already correct and already wired as a grouping dimension
(One-Pager "Owner:" scope, Analytics `groupBy==='operator'`, Store Dash, Scheduling).

**Note the cross-cutting shape:** Ryan Thorley operates in *both* organizations. Owner/operator
is not nested under organization and must never be modelled as a strict tree — a rollup that
assumes nesting will double-count or drop his three Florida stores.

**One live defect found while checking:** the comment at `constants.js:149` reads
`MCDOK — Oklahoma (Ryan + FL stores 10034, 37566, 43380, 43701)`, listing **43380 as Florida**.
43380 is Tishomingo, Oklahoma (`constants.js:92` names it; it sits in Ashley Podroza's Oklahoma
patch at `:142`). The *data* is correct — only the comment misattributes it.

## Not yet extracted

The named sheets carry operational config that lives nowhere else in the system — RGR dates,
count days, delivery days, risk profiles, counting managers. `memory/data-acquisition-shopping-
list.md` §D lists graded-visit data as a gap needing a PACE/Propel pull; **scheduled** RGR dates
are already here. That does not replace actual visit results, but Visit Readiness could know when
each store's next graded visit falls without any new pull.

## 🆕 2026-08-26 update — real schedule-workshop tracking data, and a cross-sheet formula

**Owner updated this file on 2026-08-25** (uploaded to the PM session, confirmed current
2026-08-26) with real workshop-tracking columns that did not exist in the 2026-08-23 copy this
file previously held:

- **`Scheduling Setup` sheet, column L — "1st Schedule Week"**: the date each store's **first live
  LifeLenz schedule week under the new scheduling process actually landed** — a real, per-store
  outcome date, not a plan. **Self-validating**: every store whose date is on or before today has
  real, filled-in `GM Engagement`/`Sched Mgr Engagement`/`Execution Confidence`/`Notes` values
  (genuine retrospective comments — e.g. "Derek not fully engaged. Appeared asleep a couple
  times"); every store whose date is still in the future has all four of those fields blank. That
  correlation is airtight across all 20 OK stores as of 2026-08-26 — treat `1st Schedule Week ≤
  today` as a reliable "has this actually happened yet" signal, not just a plan date.
  `Scheduling Setup`'s own **"Date Scheduled"** column (a different, earlier concept — the
  workshop/training date itself) is a separate, plain-entered value, not derived from this one.
- **`Locations` sheet, new column "1st Schedule Week"** (added after "Skill Levels Updated") — a
  **real cross-sheet formula** mirrors the value above onto the main roster sheet:
  `=IFERROR(INDEX('Scheduling Setup'!$L:$L,MATCH($A3,'Scheduling Setup'!$A:$A,0)),"")`. This was
  added by an earlier session (2026-08-25), not by the owner directly — the formula's cached
  value (`<v/>`) is empty in this committed copy since it was written by a library that doesn't
  recompute Excel's calc chain; it resolves correctly the moment the file is opened in real Excel
  (or any tool that recalculates), and the underlying source data (`Scheduling Setup`!L) is a
  plain value, not affected. **For programmatic reads, source `1st Schedule Week` directly from
  `Scheduling Setup`, not through this formula.**

This is the real answer to "when did the schedule-workshop retention split actually happen for
each store" — a stronger signal than the `Locations` sheet's "Schedule Workshop" column (the
training date), which this file previously documented as the retention-marks candidate. See
`memory/dispatch-146.md` for how this feeds the Retention Rollup's `sched_retention_marks`.

## 🆕 2026-09-01 update — Locations sheet substantially filled in; Weekly Inventory Count Day unchanged

Owner uploaded a refreshed copy (`Organization_Structure_updated_20260825.xlsx`). Diffed
cell-by-cell against the prior committed copy before replacing it (never trust a filename alone):
**every difference is a previously-blank cell now filled in — zero existing values were changed or
removed.** Newly populated: `Locations` sheet's Operator/Supervisor/GM email columns, MDP
credentials, **FOB Risk Profile / FOB Driver / Controls Risk Profile / Controls Driver** (the risk
classification columns this README's provenance caveat already warned are point-in-time, Feb-Mar
2026 — now with real values to apply that caveat to), Primary Counting Manager, RGR dates, and the
sheet's second summary table (Time Needed/Date Scheduled/RGR Date/Count Day/Validity/Status,
`Locations` cols 52-64 — a separate, differently-ordered table on the same sheet, not row-aligned
to the main per-store rows above it). The 20 per-store sheets and `FC-Inv Setup`/`Scheduling Setup`
also gained new values, same pattern (fill-in only).

**This session's own reason for caring about this file — the `Locations` sheet's "Weekly Inventory
Count Day" column (col 19), the real per-store ground truth for the weekly-count automation's
detected-count-day logic — is UNCHANGED**: identical values for all 20 OK stores, still blank for
all 7 FL stores. Verified by direct extraction, not by the diff summary alone. So this update does
not by itself resolve the still-open question of whether/how to wire that column into
`detectWeeklyCountDay()`'s consumers (`scripts/qsrsoft-onhand-pull.mjs`,
`scripts/weekly-cycle-digest-send.mjs`) — see the PM session's own findings for that.
