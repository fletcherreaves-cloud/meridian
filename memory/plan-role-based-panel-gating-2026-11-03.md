# Draft: role-based panel gating, grounded in real GM/OM/Supervisor routines

**Status: GM slice APPLIED (owner-approved 2026-11-03, v5.612).** `gm`'s 18-panel trim (§4) is
now live — both `DEFAULT_ROLES` in `src/engine/permissions.js` (the shipped default) and the
live org's already-persisted `org_config.org_roles` row (read-modify-write via the same key the
Settings → Roles UI writes to, every other role and every other field on `gm` left untouched,
verified by re-reading the row after the write). `area_supervisor`/`om`/`do`/`vp`/`sm_am_dm`/
`manager` are all still DRAFT ONLY — nothing applied for them yet; see §4 for what (if anything)
is recommended per role, and "How to apply" at the bottom for how a future slice gets shipped the
same way.

**Source / provenance:** three PDFs the owner uploaded this session — "General Manager Routines
2022," "Operations Mgr. Routines 2022," "Supervisor Routines 2022," dated 1/20/2022, documenting
the daily/weekly/monthly job routines at **Murphy Family Restaurants**, a prior multi-unit McDonald's
operator the owner worked for before Meridian. Logged here verbatim-in-substance because the
uploaded files themselves live outside this repo (session scratch storage) and will not survive
session end — this file is now the only durable copy. Per this repo's own standing rule
("Performance reviews: do not hard-code org names"), that company's name is not to be repeated
in any shipped code/output — it appears here once, for provenance, and nowhere else in this file
or in any code this plan leads to.

**Task:** #77 in this session's tracker. Triggered by the owner's own framing: "study and create
a draft or plan of what panels should be gated to each role to best assist them in performing
their job duties. Use the hierarchy in app where needed."

---

## 1. Mechanism this plugs into

Meridian already has the exact mechanism this plan needs, built this session under task #64
(owner request 2026-11-02, "role-based panel active/inactive toggles"):

- **`src/engine/permissions.js`'s `isPanelEnabledForRole(panelId, roleId, roles)`** — reads an
  **opt-OUT** array, `disabledPanels`, on a role object (same `org_config`/`org_roles` JSON blob
  the Settings → Roles tab already persists — no new table, no schema change). A panel is visible
  unless its id is named in that role's `disabledPanels`. Level-1 roles (`admin`, `owner`) always
  bypass it.
- This is **finer-grained** than the existing `PERMISSION_GROUPS`/`hasPermission` system
  (`analytics.store`, `analytics.district`, etc.) — most panels share one perm key with several
  siblings, so toggling a permission off hides a whole group, not one panel. `disabledPanels` lets
  one specific panel be turned off for one specific role without touching its perm key or any
  sibling panel.
- **Important: a lot of this plan is already handled by the existing perm-key defaults** — see
  §3's "already excluded" notes per role. `disabledPanels` is only needed for panels that pass the
  coarse perm-key gate but still don't belong in that role's day-to-day nav, per their documented
  routine.

To apply this plan: edit the relevant role's `disabledPanels` array in Settings → Roles (admin.js's
RolesTab), or seed `DEFAULT_ROLES` in `src/engine/permissions.js` directly for a built-in role.
Both write to the same place.

---

## 2. Role-ladder mapping (routine role → Meridian `profiles.role` id)

| Routine doc | Meridian role id | Scope (per CLAUDE.md's RBAC table) |
|---|---|---|
| General Manager | `gm` | Own store only |
| Supervisor | `area_supervisor` | Patch-level (subset of stores) |
| Operations Mgr. | `om` | — (between Supervisor and DO; "Review 11am Labor Report," "Supervisor Calendars due to Operation managers," multi-patch span) |
| *(not in source docs — extended by hierarchy, per the owner's own "use the hierarchy in app where needed")* | `do`, `vp` | District-level / multi-district — broader than OM, not covered by a routines doc here. Recommendation below reasons from the existing scope definition only, not a documented routine. |
| *(not in source docs)* | `sm_am_dm` | Bottom rung, one store, narrower than GM — the routines reference this tier only as attendees/subjects of a GM's or Supervisor's routine ("Monthly Restaurant Development / Results Day w/ DM's & Shift Managers," "Shift Verifications on new managers / opportunity shift runners"), never its own job description. Recommendation below is extrapolated downward from GM's, not sourced from a dedicated SM/AM/DM routines doc. |
| *(not in source docs)* | `manager` | Pre-existing/default role, new-signup default — treated as a GM-equivalent baseline for this plan (closest existing routine), since nothing in the three docs or CLAUDE.md distinguishes its intended duties from `gm`'s. |

---

## 3. What each routine actually asks for, cross-walked to real Meridian panels

Panel ids below are `panel-registry.js` ids (`PANELS` array), current as of this session. "Already
excluded" means the role's existing `ROLE_PERMISSION_TEMPLATES` entry already hides it via a perm
key — no `disabledPanels` entry is needed to achieve that; listed so the two layers aren't confused.

### GM (`gm`) — own store, full-spectrum daily operator

The GM routine is the most comprehensive of the three: it touches nearly every operational lever
at the store level (food safety, cash, labor, food cost, customer complaints, equipment, PACE,
performance reviews, scheduling). **Already excluded by `GM_PERMS`** (no `disabledPanels` entry
needed): every `analytics.district`-gated panel (`above-store`, `operator-summary`, `top-bottom`,
`trend-report`, `opportunity-dollars`), every `analytics.forecasting`-gated panel (`proj`, `pvsa`,
`model-assign`, `dicompare`, `dialedin`, `lfz-gap`, `fcst-ref`, `forecast-audit`,
`forecast-reports`, `fcst-accuracy`, `lifelenz-bridge`), `analytics.ai` (`aiscan`, `why-engine`),
`payroll.view` (`pay-rate-history`), `settings.view` (`settings`, `panel-manager`),
`security.auditLog` (`access-log`), `users.manage.*` (nothing panel-gated on this yet).

**Direct matches — keep visible, these are literally the routine (no change needed):**

| Routine line | Panel(s) |
|---|---|
| Previous Day Operations Report Review, "monitor sales, labor, service time" | Morning Brief / Daily Brief (`morning-brief`), the default dashboard |
| Food Cost Review (QCR, Stat, Yield, Ending Inventory, Transfer Report), troubleshoot stat loss | `fob-analysis`, `fob-eom`, `eom-dashboard`, `count-cycle` |
| Top 3-5 item daily inventory, waste posted correctly | `inventory`, `fob-analysis` |
| Time Punch Review, OT monitoring | `crew-schedule` (now includes the Punches tab) |
| Crew schedule review, Labor Analysis Report (projected labor %, peak hours, fixed labor guide) | `sched-hub`, `labor-analysis` (hub-tab) |
| Op supply level / order / budget | `pace-target`, `monthly-proj` — Op Supply is a real target field (`tOpSupply`) already in the Pace/Projections rollup |
| Validate safe, cashier tracking log, Safe/Cash Audits, Security Check | `security` |
| Respond to Customer Complaints, complaint log | `customer-complaints` |
| Check all equipment, fix-it list | `equipment-results`; arguably `equipment-layout` too (single-store floor plan tool, still test-kitchen) |
| Performance Reviews (crew & manager) scheduled | `perf-reviews` |
| Results to target: service times, OSAT and Complaints | `dt-sos`, `smg-voice` |
| **PACE Action Plan** (explicitly named every month) | `visit-readiness` — this is a direct, strong match; Visit Readiness was literally built for PACE/CFV/RGRV/EcoSure readiness |
| Graded visits / EcoSure contact | `graded-visits` |
| SimpleThink fix-it-list / tech-needs submission | `task-queue` (closest existing analog — ticket/request queue) |
| Food safety / checklist items | `checklist-fill`, `forms-completion`, `forms-print`, `forms-library`, `forms-reviews` |
| Store One-Pager (single-store daily/weekly recap) | `one-pager` |
| Weekly Count Status (part of the inventory cadence family) | `weekly-count-status` |

**Candidates to add to `gm.disabledPanels`** — panels that pass the `analytics.store` gate (so
they're visible today) but are not part of the GM's documented job, and read as analytical/
strategic tooling aimed at a multi-store reviewer rather than single-store execution:

| Panel id | Why it's a candidate to hide for GM |
|---|---|
| `pricing-engine` | Menu-price/margin modeling across items — a pricing/strategy tool, not in the GM routine at all (GM validates promo entry, doesn't model price-change ROI) |
| `promo-roi` | ROI *modeling* for promos/discounts — distinct from "Promo's validated" (operational entry-checking, which stays visible via `fob-analysis`/Controls). Modeling reads as a Supervisor/OM-level analytical tool. |
| `loc-intel` (Market Intelligence / weather) | Not referenced anywhere in the GM routine |
| `trends` (Trend Explorer), `signals` (Signals/Scanner) | Deep correlation/signal-discovery tooling — the GM routine's data consumption is "review the report, act," not "run a correlation scan" |
| `ranking` (Leaderboards) | Cross-store comparison — mildly motivating but not a GM duty; arguably belongs at Supervisor+ where patch-wide comparison is the actual job |
| `conversion-efficiency`, `oil-efficiency` | Corporate Owner/Operator program tracking reports — these read as OM/DO/owner-level compliance tracking, not a line in the GM's own routine |
| The six new Reports Hub deep-dive reports (`weather-impact`, `price-change-impact`, `item-velocity`, `channel-mix`, `labor-opportunity-cost`, `cash-variance-pattern`, `controls-food-cost-link`, `fob-reference-table`, `loss-prevention`, `custom-reports`) | None of these are named in the GM routine; they're Reports-Hub-era (Oct 2026) analytical deep-dives built for a multi-store reviewer diagnosing patterns, not a GM's daily/weekly checklist. Keeping the small set of direct-match panels above and hiding this whole newer analytical layer keeps a GM's nav close to their actual routine instead of ~15 extra report links they never open. |

**Gaps found (not a panel-gating question, just worth noting):** the GM routine references several
things Meridian has no panel for at all — Deposit Validation (Loomis vs. ISP), Green Book/Minor
Book review, truck-order posting/credits with Martin Brower, McHire applications, payroll release.
These are either external-system or physical-paperwork items outside Meridian's current scope —
listed here for completeness, not proposed as new build work.

### Supervisor (`area_supervisor`) — patch-level, GM's direct reviewer

**Already excluded by `SUPERVISOR_PERMS`:** `analytics.forecasting` (same forecasting-hub list as
GM above), `analytics.ai`, `settings.view`, `payroll.view`, `security.auditLog`,
`users.manage.all`. **Already INCLUDED beyond GM** (via `analytics.district:true`): `above-store`,
`operator-summary`, `top-bottom`, `trend-report`, `opportunity-dollars` — correct, matches "Monthly
Patch Meeting," "review previous weeks," cross-store/patch comparison being the actual job.

**Direct matches** — everything in the GM table above, PLUS patch-wide versions of the same
things (the Supervisor routine is explicitly the GM routine's reviewer: "troubleshoot the weekly
MTD Results w/ General Managers," "Supervisor should be working shoulder to shoulder w/
restaurant w/ most opportunity," "Review Labor Analysis Report," "Review PACE Action Plan").
Notably the Supervisor routine explicitly says **"Sales/Guest Count Projections approved by
Supervisor before generating schedule"** — confirms `pace-target`/`monthly-proj`/`unified-targets`
(all `analytics.store`-gated, already visible) are correctly in scope; it does NOT ask for
forecast-model tuning (`proj`/`pvsa`/`model-assign`), so those staying hidden via
`analytics.forecasting:false` is correct, not a gap.

**Candidates to add to `area_supervisor.disabledPanels`:** none of the GM-level hide candidates
apply here — a Supervisor's whole job is cross-store comparison and diagnosis, so `pricing-engine`,
`promo-roi`, `trends`, `signals`, `ranking`, the Reports Hub deep-dives, `conversion-efficiency`,
`oil-efficiency` are all plausibly real Supervisor tools (reconciling food cost/promo/pricing
patterns across their patch is squarely "troubleshoot the weekly MTD Results"-shaped work). **No
hide recommendations for this role** — the existing perm-key defaults already look right against
the documented routine.

### OM (`om`) — multi-patch, Supervisor's reviewer

**Already identical to `SUPERVISOR_PERMS` plus `analytics.integrity:true`** (`OM_PERMS =
{...SUPERVISOR_PERMS, 'analytics.integrity': true}`) — i.e. OM already inherits every panel a
Supervisor sees, plus `analytics.integrity`-gated data-audit tooling. The OM routine confirms this
is the right shape: "Review Operations report," "Review Headcount Report from Office," "Review
Inventory Control Report from Office," "Review Labor Scheduling Report from Office" — all
office/aggregate-report consumption, matching `analytics.district` scope. "Restaurant Visits" and
"Scheduled Restaurant Visits" confirm `graded-visits`/`visit-readiness` relevance continues at
this tier. "MB SYNC report," "Watch list," "Customer Complaint Recovery follow-up" all map to
existing panels already visible at this tier.

**No hide recommendations for this role either** — same reasoning as Supervisor: the OM routine
is explicitly a reviewer/oversight role across a wider span, so the broader analytical surface is
appropriate, not clutter.

### DO / VP (`do`, `vp`) — not covered by a source routines doc; hierarchy-extended only

No routines doc exists for these tiers in this batch. Per the owner's own instruction to "use the
hierarchy in app where needed": `DO_PERMS`/`VP_PERMS` already sit one and two rungs above OM with
a correspondingly broader perm set (`do` adds `payroll.view:true`; both already carry
`analytics.district`/`analytics.forecasting`/full `security.view`). Nothing in the GM/Supervisor/
OM routines suggests narrowing either tier further — if anything, a DO/VP needs the SAME or MORE
surface than OM, not less. **No hide recommendations for `do` or `vp`** without a dedicated
routines reference for those tiers; flagging this as a real gap if the owner has (or can get) a
DO/VP routines doc from the same source, which would let this plan be completed properly rather
than guessed at.

### SM / AM / DM (`sm_am_dm`) — bottom rung, one store, narrower than GM

Not its own documented routine either, but the ladder's logic plus `SM_AM_DM_PERMS`'s already-
narrower defaults (`reviews.create:false`, `reviews.approve:false`, `data.upload:false`,
`users.manage.lower:false`) point the same direction as GM's hide list, just further: a shift-
level manager executes a shift, they don't run food-cost reconciliation or security audits.
**Candidates to add to `sm_am_dm.disabledPanels`** — everything recommended hidden for `gm` above,
PLUS (since this tier is explicitly shift-execution, not store-level reconciliation):

| Panel id | Why |
|---|---|
| `fob-analysis`, `fob-eom`, `eom-dashboard`, `count-cycle`, `weekly-count-status` | Food cost reconciliation is a GM-and-up duty in every one of these routines; an SM/AM/DM runs a shift, not the monthly QCR |
| `visit-readiness` | PACE Action Plan ownership sits with the GM ("Review PACE Action Plan – Update as needed" is a GM monthly routine item, never delegated down in any of the three docs) |
| `security` | Safe/cash audits are a GM/Supervisor monthly routine, not a shift-level duty |
| `perf-reviews` | `reviews.create:false` already blocks the write side; the panel itself is still visible today purely because `reviews.view:true` — reasonable to also keep it reachable (they can see their OWN review, which the perm comment for this role already documents as the intended scope), so **not** recommended for `disabledPanels` despite the narrower write permissions — flagging the distinction rather than over-hiding. |

This tier's list is the least confident one in this plan — it's extrapolated two layers down from
a GM routine, not sourced from an SM/AM/DM-specific document. Treat it as a starting point to
adjust once real usage is observed, not a final answer.

---

## 4. Summary table — recommended `disabledPanels` to add per role

| Role | Recommended additions to `disabledPanels` |
|---|---|
| `gm` | `pricing-engine`, `promo-roi`, `loc-intel`, `trends`, `signals`, `ranking`, `conversion-efficiency`, `oil-efficiency`, `weather-impact`, `price-change-impact`, `item-velocity`, `channel-mix`, `labor-opportunity-cost`, `cash-variance-pattern`, `controls-food-cost-link`, `fob-reference-table`, `loss-prevention`, `custom-reports` |
| `area_supervisor` | none — existing perm-key defaults already match the documented routine |
| `om` | none — existing perm-key defaults already match the documented routine |
| `do`, `vp` | none proposed — no source routine to ground a recommendation; current (broader-than-OM) defaults look directionally correct already |
| `sm_am_dm` | everything in the `gm` list above, plus `fob-analysis`, `fob-eom`, `eom-dashboard`, `count-cycle`, `weekly-count-status`, `visit-readiness`, `security` |
| `manager` | treated as GM-equivalent in this plan; same list as `gm` if the owner wants it applied here too |

`admin`/`owner` are level-1 and always bypass `disabledPanels` — nothing to configure there.

---

## 5. How to apply (when the owner approves)

Nothing above has been written to `DEFAULT_ROLES` or any live `org_roles` config — this is a plan,
not a change. To apply a role's recommended list: either (a) edit that role in Settings → Roles in
the running app (writes straight to `org_config`, takes effect immediately, easiest to adjust/
revert live), or (b) have a future session seed `disabledPanels` directly on the matching entry in
`DEFAULT_ROLES` (`src/engine/permissions.js`) if the owner wants it as the shipped default for
every org, not just a live per-org override. Recommend starting with (a) on this org only, watching
whether any hidden panel turns out to still be needed, before considering (b).

---

## 6. Owner's own Area Supervisor / Ops Manager routine notes (2026-11-13) — the Daily Review seed

**Promised notes, logged verbatim-in-substance per the owner's own instruction ("We need to keep
these somewhere for future revising").** Unlike §3 above (which was reverse-engineered from
generic 2022 job-description PDFs at a prior employer), this is the owner's own fresh, Meridian-
specific description of what a Supervisor/OM daily review should actually contain — written for
**building the Daily Review engine's Supervisor/OM scope**, not just panel visibility. Treat this
as the authoritative source over §3's panel-gating conclusions wherever the two touch the same
ground (e.g. §3 says "no hide recommendations" for these roles based on generic routines; this
section is the real spec for what they should see and how).

### Area Supervisor

- **Primarily works through the GM** of the restaurants to achieve business goals — not
  restricted, but GM is the default relationship, not a bypass.
- **Owner's own framing (ex-Supervisor himself):** largely the same review as a GM's, but across
  *all assigned locations*, with the purpose of identifying every hotspot and communicating to
  GMs where to direct focus. Should read as an overview with enough detail to keep teams grounded
  in continuous operational improvement — not a raw data dump.
- **Time windows:** daily is not enough. Supervisor and OM levels especially should also see
  **WTD and MTD**, and it never hurts to call out **yearly/seasonal trends** (detected or known
  upcoming) to aid planning.
- **Reports to:** OM, DO, and/or VP and Owners.

**Daily/weekly review checklist, in the owner's own order:**

1. **Verify Cash Controls** — Safe Contents, Cash Drawers.
2. **Review Previous Day's Results** (owner's follow-on idea: after doing the below, also break
   it out and report by **daypart**).
   - **Operations Report — Sales**: vs. targets, with problem time frames made to stand out.
     Look at trends, identify weaknesses in a location's ability to hit targets, and bring
     smart, specific improvement suggestions to the GM conversation — not just the numbers.
     Metrics: Product Sales (actual, +/- vs LY), Guest Count (actual, +/- vs LY), DT % of
     Sales, Breakfast % of Sales, Eat In % of Sales, McDelivery % of Sales, MOP % of Sales,
     Kiosk % of Sales.
   - **Operations Report — Service**: vs. targets, Daily AND Day Part. When something is out of
     range, name the actual times of day responsible — don't make the manager go hunting.
     Equally call out the positive times of day, not just the misses. Metrics: OEPE W/O Parked,
     DT Parked %, R2P, KVS Time, 2nd Side Healthy Usage %.
   - **Operations Report — Controls**: same logic — compare vs. targets, dive in, present
     findings so the manager doesn't have to go looking. For any major violation/deviation or
     suspected wrongdoing, **event detail + who's associated is critical** to this actually
     working. Metrics — Labor: Punched Labor %, Act Hours, TPPH, OT Hours, Act vs Scheduled, Act
     vs Needed. Cash: Cash +/-, Promos, T-Red Before, T-Red After, Refund, Overring, Employee/Mgr
     Meal.
   - **Operations Report — FOB**: same logic — compare vs. targets, dive in, present findings,
     and offer guidance on where each store should focus to improve or sustain results. Metrics:
     FOB %, Comp Waste %, Raw Waste %, Condiment %, Empl Meal %, Stat Var %, Unexplained %, Disc
     Coupon %, Paper Cost %.
3. **Review Tickets** — confirm any pending maintenance/repair items (Maintenance and
   Technology) are logged. Triage by priority to expedite remediation. List by agency and how it
   affects operations.
4. **Review Calendar**:
   - Current and upcoming promotions (expected impact).
   - Current and upcoming events.
   - Payroll released as needed (cadence: **every other Wednesday starting 11/18/26**).
   - Truck orders (Martin Brower) — store-specific order days. Follow up on inventory levels,
     flag product outages by location, check transfers, and address why a location ran out of
     supply.
   - Other calendar events (games, concerts, community events, etc.) — list expected impacts.
   - **When visiting a location**: follow up on Pre-Shift Checklist, DSPT, and Travel Paths —
     coach and give feedback as appropriate.
   - Check email, respond as needed.

### Ops Manager

- **Follows up on Area Supervisors** and addresses patch results. Views data from a higher
  level, but wants the detail behind any major swing in order to root-cause and build an
  improvement plan.
- **Profitability-minded**, always looking for creative ways to improve, via (examples given):
  additional training; support visits; assisting in the personal development of Area Supervisors
  and even GMs to a degree; lots of coaching and feedback; celebrating wins with teams while
  addressing concerns at the right level (Supervisor, GM, or even a specific manager); aware of
  every metric a Supervisor is, but over a larger set of locations, so daily/weekly triage looks
  different in what to focus on and who to address it with; generally needs a working,
  patch-specific action plan per patch.
- Needs the information and supporting results to comfortably discuss current business state and
  results **up or down the chain, at any time**.
- **Reports to:** DO and/or VP and Owners.
- Reviews and knows the needs of locations: current tickets, their own walkthroughs and the
  findings from them, current promotions/directives, and goals for individual locations.
- **Needs data presented structurally to identify focus areas, by patch.**

### Notes for whoever builds this next

- This reads as a direct spec for extending the Daily Review engine's scope to `area_supervisor`
  and `om` (patch-level rollup, same metric set as the GM-level review, plus the explicit
  WTD/MTD/seasonal-trend windows these roles specifically asked for) — not a new report type.
  Check `src/engine/daily-review.js`/`review-engine.js` for what already exists at store level
  before building a parallel mechanism (standing rule).
- Every metric named above already has a real Meridian source (`metric-source.js`'s
  `METRIC_SOURCES`, the Signals/Controls registries, `qsr_security_events` for T-Red/overring/
  refund event detail) — this is a rollup/presentation design, not a new-data-source question.
- The "name the actual times of day, don't make them go looking" and "call out the positives
  too" instructions directly match CLAUDE.md's existing "say the number AND the decision"
  standing voice rule — this is reinforcement of an existing product principle, not a new one.
- The daypart-breakdown idea for Previous Day's Results was explicitly offered as a "maybe,"
  not a firm requirement — confirm before building it as load-bearing.
- This is design input, not yet scoped or built. Treat the same way task #79 was treated: do not
  start building without going back to the owner on sequencing/priority once a concrete plan
  exists, consistent with this session's standing practice of not making product-shape calls for
  him unprompted.
