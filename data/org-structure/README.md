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
