---
name: plan-security-loss-prevention
description: Design spec for Meridian's Security & Loss Prevention build — synthesized from three independent AI-engine research passes (Gemini in-chat, Grok and ChatGPT via uploaded files) the owner commissioned 2026-08-19. Architecture, unified ruleset (deduplicated by mechanism across all three sources), the employee rule-out/evidence-chain mechanism and its HR/legal sensitivity, and a phased build order. Not yet scoped into engineer dispatches.
metadata:
  type: project
---

# Security & Loss Prevention — design spec (2026-08-19)

**Status: research synthesis, not yet a dispatch.** The owner went "all in" and ran the same
research question through three AI engines, plus several rounds of his own follow-up prompts
steering each deeper. This file consolidates all three into one coherent design — deduplicated by
*mechanism*, not by source, since all three independently proposed overlapping methods (post-tender
void skimming showed up in all three, worded three different ways). Source material and
attribution, confirmed by the owner:

- **Gemini** — the conversation pasted directly into chat (`notes-67-queue.md` §3 references it).
- **Grok** — uploaded as `McDonalds_QSR_Security_Loss_Prevention_Methods.md` (research-catalog
  style, real industry citations — LP Media, ACFE, QSRSoft/DTiQ/Solink/Envysion vendor materials,
  smart-safe case studies).
- **ChatGPT** — uploaded as `McDonalds_Security_Analytics_Session.md` (systems-architecture style,
  the most rigorous of the three — baselines, exposure normalization, opportunity-adjusted risk,
  exoneration analytics, sequence detection, the Rules Registry schema).

**Read this before building anything security-related.** It supersedes any single engine's raw
output as the reference — go to the source transcripts only if this file's summary of a specific
method needs more color.

**This is not greenfield — correction made on independent review, 2026-08-19.** The three-engine
research reads like a fresh initiative, but this org already has substantial, owner-approved prior
work on exactly this problem, discovered by grepping `memory/` before treating anything below as
new (the standing "measure it, don't reason about it" rule, applied to this file's own first
draft). See §0 before reading anything else — it changes the framing of §5 and §7 materially, in
the direction of *less* open than the raw research suggested, not more.

---

## 0. Existing prior art — read this before §5 or §7

Three memory files already cover large parts of what the three AI engines proposed, with real
owner decisions already made. This section exists so nothing below gets re-decided from scratch
the way `notes-67-queue.md`'s own review nearly did with the backlog file, twice, in the same day.

### The data foundation is already mapped and largely built (`data-acquisition-shopping-list.md`)

**This is the single most important correction to this file's original draft, confirmed against a
real Register Audit export the owner supplied (2026-08-19, `Register_Audit_20260801_to_20260818.xlsx`,
3,843 rows).** This file's first draft treated "does employee-attributed data even exist" as an
open research question (a "Phase −1"). It doesn't need to be researched — it's already answered,
in detail, in `memory/data-acquisition-shopping-list.md`, via an **attribution ladder** the owner
and a prior session already built and partly executed:

| rung | grain | status |
|---|---|---|
| 1 | store × day | ✅ **Have it.** `qsr_cash_sheet` + siblings, 27 months back. Six of seven standard POS exception families. |
| 2 | **employee × store × day** | ⚠️ **Parser, Supabase table, and a risk-scoring engine all already exist** (`parseRegisterAudit`, `audit_rows` PK `(loc,date,emp)`, `analyzeRegisterAudit`). **The only missing piece is the auto-pull** — today it's manual-Excel-upload only (`auditRows` is in `MANUAL_FED_SOURCES`). |
| 3 | transaction | ❌ Nothing built yet, but a **three-tier design is already owner-approved** (2026-08-14) — see below. |

**Rung 2, confirmed against the real export:** the uploaded sample's columns are `Emp Name, Loc,
Business Date, Drawer Sales, Average Check, Drawer Opens, Emp Meal Disc $/Cnt, Manual
Refund/Overring $, Mgr Meal $/#, Over/Short $/%, POS Overrings $/#, Promo Amt/Pct/#, T-Red Before
Cnt/Pct/Avg/$, T-Red After Cnt/Pct/Avg/$, Refund Cash/Cashless $/Cnt, Drawer GC`. That is **already
employee-attributed, daily-grain coverage of nearly every method in §2.1 below** — T-Red
before/after, POS overrings, refunds by tender type, promo/discount rate, manager-meal abuse,
cash over/short — with count, percent, average, and dollar all pre-computed per employee per
store per day. This is not a future data source to go find; it's sitting in a spreadsheet the
owner already downloads, and a parser/table/scoring-engine for it already ships in this codebase.
**The gap is entirely an auto-pull dispatch, not a design or data-existence question.**

**Rung 3 (`Any Transaction`), already scoped and approved:** the owner already proposed and got
sign-off (2026-08-14) on a three-tier design — **Tier A**: exception-transactions-only,
district-wide, daily standing pull (~200–600 rows/day, trivial volume) IF the report can
server-side-filter to exception types; **Tier B**: full transaction detail for one store × a date
range, on-demand, triggered by an actual investigation; **Tier C**: full district-wide standing
transaction pull — explicitly rejected as unnecessary. The design is approved; **only the probe to
determine which of 3 outcomes the report actually supports is outstanding** (does it server-side
filter to exceptions? accept a date range? or is it one-date-at-a-time only, which would kill
Tier A and leave Register Audit carrying all standing attribution). The owner has already confirmed
(2026-08-19) that Security Events, Suspicious Activity, and Any Transaction have all been explored
in the QSRSoft UI — the probe groundwork already exists, this is a "run it and capture the
response shape" task, not exploratory.

**One settled negative finding, so it isn't re-derived:** deposit lapping (§2.1/§2.3 below) is
**structurally invisible in QSRSoft** — settled 2026-08-13. A deposit counts as accounted for the
moment it's entered, so a held/delayed deposit produces no cash-over/short variance at all in this
org's data. Only bank-side data (actual deposit-clearing timestamps against recorded deposit
dates) would show the lag. **No amount of transaction detail changes this** — do not scope a
deposit-lapping detection rule against QSRSoft data; it would silently never fire, not because
lapping isn't happening but because the data source cannot see it.

**Revised understanding of what this file adds on top of that existing roadmap:** the
attribution-ladder work already answers *where the data comes from*. What all three AI engines'
research adds that isn't already in `data-acquisition-shopping-list.md` is the **analytical layer
on top** — baselines, exposure normalization, opportunity-adjusted risk, sequence detection,
exoneration analytics, the Rules Registry, and the actual fraud-pattern taxonomy (§2 below) to run
against rung-1/2/3 data once it lands. That's this file's real contribution; treat
`data-acquisition-shopping-list.md` as the authoritative source for data-readiness status and this
file as the authoritative source for what to compute once the data is flowing.

### QSRSoft already has a purpose-built exception feed (`qsrsoft-report-catalog.md`)

QSRSoft's own `/security/` section ships **five reports**: Security Events, **Suspicious
Activity** (a purpose-built exception feed), Any Transaction, Store Rankings, and Camera Settings
— meaning video/camera integration (which §7 originally called "out of scope, no integration
exists") may already be partially available through QSRSoft rather than needing a new vendor
relationship.

The `suspicious_activity` endpoint has already been probed and captured (2026-08-14). Its response
carries **cashier and manager attribution separately**, a `score_id`, and a 27-item server-side
exception taxonomy — `cash_refund`, `cashless_refund`, `pos_overring`, `t_red_before`/`t_red_after`,
`all_promo`/`mobile_promo`/`delivery_promo`/etc., `all_discount`/`pos_auto_discount`/etc., `coupon`,
`duplicate_card_swipe`, `drawer_open` ("Unauthorized Drawer Open"), `high_lock_out` variants,
`employee_meal`, `manager_meal`, `loyalty_reward_ids`, `billable_sales`,
`electronic_benefit_transfer` — which **already covers most of §2.1's cash/POS methods as
pre-built QSRSoft exception categories**, not things this org would need to derive from raw
transaction math. **Resolved below (real probe data, 2026-08-19): `suspicious_activity` itself is
QSRSoft's own pre-aggregated judgment, not raw events — but `Security Events`, a report this
file's first draft hadn't found, is the actual raw per-event log**, which changes the build
calculus in a better direction than either original guess: build against `Security Events` for
raw facts, and treat `suspicious_activity` as a second-opinion judgment layer gated the same way
`#272`'s other derived judgments are.

**Four things `qsrsoft-report-catalog.md` already identifies as needing to be settled before a
pull is built — this supersedes this file's own original "Phase −1" framing, which is too vague
next to this:**
1. **Is `suspicious_activity` raw events or QSRSoft's own pre-scored judgments?** One row returned
   for `cash_refund` across 27 stores × 13 days — either near-zero real occurrence, or the feed is
   already pre-filtered to flagged events (the `score_id` field suggests the latter). Settle by
   comparing against Meridian's own existing Controls-metric refund counts for the same window —
   many vs. one settles it immediately. **If it's QSRSoft's own derived judgment, that puts it on
   the far side of the facts-vs-judgments line `#272` already drew** (see below) — different
   handling rules apply than to a raw fact.
2. **Join key is `(location, leid)`, not `leid` alone** — `leid` is store-local (badge number),
   not a global employee ID. This repo already has four documented `loc`-padding incidents from
   exactly this join mistake; here it's worse because a wrong join attributes an exception to the
   wrong human being.
3. **No event-level timestamp** — only `login_timestamp`/`logout_timestamp` (the *session*, up to
   ~10 hours) and `busn_dt` (a date). An exception can be placed within a shift, not within an
   hour — this rules out correlating against `qsr_daily_activity`'s hourly rows, and materially
   weakens §3's sequence-detection ambitions (`SALE → PRODUCTION → VOID → ...`) for anything
   sourced from this endpoint specifically, since sequence detection needs finer-grained timing
   than a shift window provides.
4. **`user_reaction` is an existing human-review workflow inside QSRSoft** — currently null in the
   captured sample, meaning investigators may already be able to respond to flagged events in
   QSRSoft's own UI. Any pull must carry this field through and never overwrite it, or a pull
   silently discards existing human work.

Also open, systemic: **`geid` (the cross-system employee ID) is null for every cashier/manager
sampled** — the badge-to-employee-ID mapping this org would need for cross-source joins (QSRSoft ↔
LifeLenz ↔ Meridian) is simply unpopulated today, not merely hard to find. `/admin/missingGeids`
and `/admin/geidLookup` exist in QSRSoft for this; populating it is likely a prerequisite for
almost anything in §2 that needs to join across data sources by employee.

### Real probe data captured 2026-08-19 — resolves question 1 above, and adds a third data shape

The owner supplied three real exports covering three of the five `/security/` reports (store
3708, POS Overring exceptions, 2026-08-01 to 2026-08-18), which settle open questions rather than
leave them for a future probe.

**`suspicious_activity` is confirmed QSRSoft's own pre-aggregated judgment, not raw events —
question 1 above is now answered.** The exported report's columns are `Date, Location, Cashier,
Reason, Go To`, and a real row reads: `2026-08-03, 3708, Dillon S, "7 POS Overrings totaling
$104.36"`. That's **one row summarizing seven individual overring events** for one cashier on one
day — confirming this endpoint is a derived summary, already crossed some internal QSRSoft
threshold to appear at all. **This sits on the far side of the facts-vs-judgments line `#272`
already drew** (§0 below) — it should be handled under the disclosure-gating policy
(DO-and-above, mandatory handling notice) if ever surfaced in Meridian, not treated as a raw fact
feed.

**`Security Events` (the report neither this file's first draft nor `qsrsoft-report-catalog.md`
had explored) is the actual raw per-event log — and it's better than what `suspicious_activity`
offers.** Columns: `Date, Time, Day Part, Register, Crew, Manager, Manager Code Entered, Tender
Type, Overring Amount, View Detail, Camera`. Real to-the-second timestamps (`11:46:55`), one row
per individual event (not aggregated), crew AND manager named separately per row, and — notably —
**a `Manager Code Entered` boolean per event.** A real sample row shows Crew and Manager as the
*same person* (`Dallas L - 51` in both columns) with `Manager Code Entered: false` — i.e., an
override that didn't require a manager code, or a self-override. This is a stronger, more direct
signal than anything the three AI engines proposed for "self-authorization," and worth
understanding fully (does `false` mean no code was required, or that the system failed to capture
one?) before building a rule on it — flag as a real open question, not an assumption either way.
**`Security Events`, filtered per exception type, looks like the right raw-event source for §2.1's
rules — reach for this before `suspicious_activity`.**

**`Any Transaction` (rung 3) is confirmed to carry everything §2's rules need, when filtered.**
Columns: `Date & Time` (second-precision), `Transaction Type`, `Transaction Status`, `Originating
Register`, `Final Register` (these can differ — e.g. a mobile/kiosk order finalized at a different
register than it originated, worth understanding before assuming same-register = same-person),
`Order Amount`, `Cashier`, `Manager`, plus **`View Details` and `Camera` columns present in the
schema** (empty in this all-sale sample, but their presence confirms QSRSoft has camera linkage
wired into this exact report — correcting this file's earlier "no camera integration to build
against" framing in §7 even further than the `/security/` menu listing alone suggested). This
sample was filtered to one store, one register, one 3-hour window (166 rows) — consistent with
`data-acquisition-shopping-list.md` §B's volume estimate, and confirms the UI supports exactly the
store/register/date/time-window filtering that section described. **Still open:** whether the
report can filter server-side to exception types only (the actual Tier A question) — this sample
was an all-transactions pull, not an exceptions-only one, so it doesn't yet answer that half of
the probe.

**Net effect on Phase 0a above:** the Any-Transaction-probe task is now partly done — response
shape, timestamp precision, and register/cashier/manager attribution are confirmed — but the
single decisive question (server-side exception filtering, for Tier A) still needs one more
capture with an exception-type filter applied rather than a full-register pull.

### The attribution problem is already worked through, with an owner-approved design (`attribution-validity-register-login.md`)

This is the single most direct overlap with the three engines' research — what they call
"exoneration analytics" / "environmental exculpation logic" (§1 principle 4, §3), this org already
has a concrete, owner-vetted answer to, dated 2026-08-14, under dispatch thread `#272`:

- **The core problem, in the owner's own words:** *"managers are often tied to a lot of events
  that they're not necessarily responsible for"* — an exception is attributed to whoever is
  logged into the register, which is frequently not who actually operated it. Manager IDs collect
  the most misattributed exceptions because they have the broadest permissions and get left signed
  in most often.
- **Primary fix is operational, not analytical** — owner: *"managers have to make sure the proper
  people are logged into the registers... that will solve 99% of all of these problems."* Nothing
  in this security build should be presented as a substitute for that; it's a support/measurement
  layer on top of a process fix that is already underway.
- **A real, testable contradiction check exists:** transactions recorded under an employee's ID
  during a period they were not punched in. Not inference — two records disagreeing. **Currently
  not runnable**: per-employee punch timestamps aren't available (LifeLenz's pull pre-aggregates
  and never stores raw shifts; the transaction-timestamp+terminal-ID data #275 was probing for
  isn't available either). Owner already decided the eventual source: **QSRSoft preferred over
  LifeLenz** for this specific test, for history depth (27 months backfilled vs. LifeLenz's
  Oct-2025 OK floor) and identifier-space consistency (QSRSoft's roster pull already bridges name
  → `geid`; cross-system name-matching against LifeLenz risks silently misattributing one
  employee's punches to another).
- **The design that follows — carry an attribution-confidence state on every employee-attributed
  metric**, not an attempt to repair attribution after the fact:

  | state | meaning | treatment |
  |---|---|---|
  | clean | no contradicting evidence | normal |
  | **contested** | transactions outside punched hours, concurrent terminals, or an implausible session | **excluded from rankings**; shown with the reason, never as a bare number |
  | unknown | inputs unavailable for that store/date | shown, but never ranked or flagged (fail-closed) |

  This is a more specific and more rigorous version of §1 principle 4's exoneration-analytics idea
  and **should be adopted directly** rather than reinvented — it already accounts for this org's
  actual data gaps (no punch timestamps yet) in a way the AI research, working from general QSR
  assumptions, could not have known to.
- **The honest limit, already stated:** this design can detect *that* an attribution is wrong; it
  cannot establish who it should have been. It exonerates; it does not reattribute. That's a
  correct constraint, not a gap to close.
- **A fallback the owner already proposed if inference never becomes reliable:** track the
  *frequency* of contested/incorrect logins itself as a manager-accountability metric — "how often
  were your registers signed in incorrectly" — separate from and independent of whatever exception
  rate that manager's ID accumulated. This turns an unfixable data-quality problem into a real,
  measured operational metric with its own value.
- **Sequencing already decided:** Path 1 (operational fix) is running now. Register Audit
  auto-pull can ship at daily-fact grain without any attribution-confidence work — only *rankings
  and risk flags* need to gate on it. LifeLenz punch-timestamp extension is the next unlock to
  scope. **The owner explicitly wants to review this against real data before finalizing
  thresholds** — "*it'll probably make more sense when we're actually looking at the data*" — so
  this file should not be read as license to finalize contested-state thresholds from first
  principles.

### The disclosure-gating policy already exists and should extend here, not be re-derived (`project-sage-knowledge-grounding.md`)

Owner decision, 2026-08-13, made for SAGE's knowledge base but written generally enough to cover
any investigative/personnel-sensitive finding anywhere in Meridian — **this already answers most
of what this file's original §5 posed as an open access-control question:**

1. Investigative/personnel-sensitive findings are restricted to **above-store personnel — above
   supervisor** (DO, VP, Owner/OO, Admin, Developer). Supervisor, GM, and Office Staff do not
   receive them.
2. **Gate on subject, not only role** — a finding whose subject is the requester (or, per the
   extension the owner approved, an implicated DO) must not return to that requester even if their
   role would otherwise clear the bar.
3. **A mandatory handling notice travels with every restricted disclosure**, generated at the
   tool-output layer so it can't be dropped by a paraphrase, copy-paste, or export — not
   SAGE-specific, applies to "panel, printed report, PDF export," i.e. exactly the kind of
   named-employee risk-score view this security build would produce. Short form: *"Restricted ·
   statistical signal, not a finding of fact... Handle per the organization's confidentiality and
   human-resources procedures, and involve HR before any action concerning an employee."* Long
   form spells out: not a determination of wrongdoing, patterns arise from inexperience/process
   gaps/system errors/legitimate change at least as often as misconduct, never share with or
   discuss in front of anyone it names, involve HR before any action, keep a disclosure log. **No
   "suspected wrongdoing" language anywhere** — that framing itself is prejudicial.
4. Enforcement mechanism: per-file frontmatter (`sensitivity`, `min_role`, `subject_locs`,
   `subject_people`) at query time, **failing closed when unset**.

**This directly answers §5's original "access control" question below** — the RBAC tier is already
decided (above-supervisor, not the full existing 8-tier table), the handling-notice text already
exists verbatim and should be reused rather than redrafted, and the "not SAGE-only" framing means
this security system's UI (heatmaps, drill-down grids, case-review screens) needs the same notice
wired in from day one, not as a later compliance pass.

---

## 1. Why architecture-first, not rules-first

All three engines converged on the same core insight even though they used different words for it:
**a flat list of fraud rules produces a noisy, low-trust system that investigators stop reading.**
The most rigorous of the three sources (ChatGPT, `Security_Analytics_Session.md`) frames this explicitly:
the system should not be "a fraud rules engine," it should be a **behavior + event intelligence
engine** — rules are one layer inside a bigger pipeline, not the whole system.

This matters for build order: **do not start by coding individual fraud rules.** Start by building
the substrate every rule needs (baselines, exposure normalization, event correlation), because a
rule written before that substrate exists will need to be rewritten once it does.

### Recommended architecture (synthesized from all three sources' pipeline diagrams)

```text
RAW EVENTS (POS, inventory, cash/deposit, labor/T&A, access/video)
        │
        ▼
DATA QUALITY LAYER            (reject/flag incomplete or malformed source rows)
        │
        ▼
EVENT NORMALIZATION           (standard schema per event: who/where/when/what/how-tendered)
        │
        ▼
   ┌────┴────┬─────────────┐
   ▼         ▼             ▼
RULES    BASELINES    SEQUENCE ENGINE     (personal/peer/store/network; A→B→C chains)
   │         │             │
   └────┬────┴─────────────┘
        ▼
RELATIONSHIP / CORRELATION ENGINE   (event pairs/trios, cross-domain: POS+inventory+labor)
        │
        ▼
OPPORTUNITY-ADJUSTED RISK           (did this person even have access to do this?)
        │
        ▼
CHANGE-POINT DETECTION              (when did behavior shift, not just "is it extreme")
        │
        ▼
EXONERATION / EXPLANATION ENGINE    (actively search for legitimate explanations)
        │
        ▼
   RISK ENGINE  ──┬── FINANCIAL IMPACT ESTIMATE
                  └── CONFIDENCE SCORE (separate from severity)
        │
        ▼
INVESTIGATION PRIORITY SCORE
        │
   ┌────┴────┐
   ▼         ▼
EARLY WARNING   CASE REVIEW / EMPLOYEE RULE-OUT LOOP (see §5)
   │         │
   └────┬────┘
        ▼
HUMAN INVESTIGATION OUTCOME  →  feeds back into RULE PERFORMANCE + LEARNING
```

### Core conceptual formula (from ChatGPT, `Security_Analytics_Session.md` §41)

```text
Risk = Baseline + Exposure + Opportunity + Sequence + Relationship + Change + Corroboration
       − Legitimate Explanation

Investigation Priority = Risk × Financial Impact × Confidence
```

Keep **Confidence** (how sure are we this is unusual) and **Severity** (how much money is at
stake) as two separate axes, not one blended score. `Confidence=91, Severity=2` ("very certain
this is unusual, but financially trivial") and `Confidence=68, Severity=5` ("less certain, but
potentially enormous exposure") need different investigator responses — collapsing them into one
number loses that distinction.

### Non-negotiable design principles (all three sources agree, independently)

1. **Never count raw events — normalize against exposure.** "40 voids" means nothing without
   knowing it's 40 voids / 8,000 transactions vs. 40 voids / 800 transactions. Same for
   dollars-per-sales-handled and events-per-hours-worked. Otherwise your highest-volume, most
   trusted employees automatically look the most suspicious simply because they process more.
2. **Compare against four baselines, not one:** personal (is this person behaving differently than
   *they* normally do), peer (differently than comparable employees — same role/daypart/tenure/
   volume band), store (differently than comparable stores), network (unusual org-wide). These
   answer different questions and a system that only does peer-comparison will miss someone who
   drifted slowly from their own historical norm while staying inside the peer band.
3. **Opportunity-adjusted risk.** A refund anomaly on someone with no refund authority is noise. A
   refund anomaly on someone with refund authority, on the same register, same shift, is signal.
   Model access/authority as a first-class input, not an afterthought filter.
4. **The system must try to prove itself wrong (exoneration analytics).** Every rule should carry
   a paired list of legitimate explanations it checks automatically (new POS rollout, training
   assignment, drive-thru outage, documented equipment failure, manager-approved service
   recovery). A finding that survives an automated search for its own counter-evidence is more
   credible than one that never looked. This is the single most distinctive idea across all three
   sources and should not get cut for MVP scope — it's what keeps the system from becoming an
   accusation engine (see §5's HR/legal note).
5. **Sequence and cross-domain correlation beat isolated single-event rules.** `VOID` alone is
   weak. `SALE → PRODUCTION → VOID → CASH DRAWER → INVENTORY VARIANCE`, same employee, same
   shift, is a fraud-chain, and should score far higher than any one of its component events.
6. **Explain every score.** No investigator should see "Employee 3821 — Risk 87" with no breakdown.
   Show the contributing factors and their weights, additive and subtractive, so the number is
   auditable rather than a black box (see the worked example in §4).
7. **Rules live in a registry, not hardcoded.** A `RULE_ID` / `THRESHOLD` / `SEVERITY` /
   `LOGIC_EXPRESSION` schema (JSON/YAML-configurable) so thresholds get tuned per-store without a
   code deploy, and so a new rule is a data row, not a PR. See §6 for the proposed schema.

---

## 2. Unified ruleset — deduplicated by mechanism

Every method below appeared, worded differently, in at least one of the three sources; several
appeared in all three. Grouped by domain. Each entry: what it is, what to look for, and the
codeable detection logic. Threshold numbers below are the sources' starting suggestions — **treat
every number as a first guess to be tuned against this org's actual data, not a fixed constant.**

### 2.1 Cash / POS fraud

| Method | What it represents | Detection logic |
|---|---|---|
| **Post-tender void/refund skimming** | Employee rings a cash sale, collects payment, then voids or refunds the same transaction after the customer leaves, pocketing the cash while the register balances clean. The single most-cited method across all three sources. | Flag `void_timestamp` or `refund_timestamp` > `tender_timestamp` on cash transactions, especially without manager override. Rank employees by void/refund rate as % of transactions (not raw count); flag >1.5–2× peer average. |
| **No-sale drawer opens** | Drawer opened via "No Sale" with no transaction, cash pocketed directly. | Flag no-sale events clustered by employee/shift; correlate with subsequent cash-drawer variance. |
| **Blind-drawer / floating-bank manipulation** | Shift cash shortages between registers or days so no single count ever shows a large variance — e.g. a register hitting exactly $0.00 variance for 30 straight days, which is a statistical near-impossibility at real volume. | Track `σ(variance)` per register over a rolling 30-day window; flag *unnaturally low* variance (forced-perfect numbers), not just high variance. |
| **Deposit lapping** | Steal today's deposit, cover it with tomorrow's receipts — always one day behind. Classic ACFE-documented scheme, and the method all three AI engines proposed detecting via `LAG()`/`LEAD()` window functions over daily cash variance. **Settled 2026-08-13, `data-acquisition-shopping-list.md` §J: structurally invisible in QSRSoft.** A deposit counts as accounted for the moment it's *entered*, so a held/delayed deposit produces zero cash-over/short variance in any QSRSoft-sourced data — no amount of transaction detail fixes this. | **Do not build this against QSRSoft data — it would never fire, not because lapping isn't happening but because this org's available data cannot see it.** Only a bank feed (actual deposit-clearing timestamps vs. recorded deposit dates) would show the lag; revisit only if a bank data source is ever added. |
| **Refund/return abuse (ghost customer)** | Fraudulent refund processed with no actual customer/return, cash pocketed. | Filter refund events with no matching original-sale reference; cross-reference against drive-thru vehicle-presence or video-analytics triggers where available; flag self-authorized refunds (`approving_manager_id == cashier_id`). |
| **Unauthorized discount / manager-meal abuse** | Privileged override codes (comps, employee meals, promo) used to give away food to friends/family, or to hand cash-paying customers "free" items while pocketing the cash. | Cross-reference `discount_type IN (comp, employee_meal, promo)` against `active_clocked_crew_count` — flag high discount frequency relative to actual headcount on shift. Flag managers repeatedly approving overrides for themselves or one specific ally cashier. |
| **Sweethearting / unrecorded modifiers** | Cashier keys a cheap item but hands over a premium one (extra bacon, double patty), or keys nothing and hands over a full item. | Join POS line items against kitchen-display/production-printer logs by order ID; flag `KDS_item_complexity > POS_item_complexity` for a given employee. Flag high-modifier-frequency outliers vs. peers. |
| **Sales skimming (never rung at all)** | Cash collected, nothing recorded — the underlying "no-sale" of an entire transaction. Hardest to catch from POS alone since there's no POS event. | Inferred, not directly observed: inventory depletion with no matching revenue; cash-% of total sales abnormally low for an employee; video showing cash handoff with no corresponding POS event where video exists. |
| **Threshold avoidance / structuring** | Repeatedly creating transactions just under an approval/limit threshold (`$497, $498, $499, $499...` under a $500 limit). ACFE explicitly calls this out as a splitting/structuring red flag. | Generalizable **threshold-avoidance engine**: for any dollar-gated action (refunds, discounts, deposits, inventory adjustments, write-offs, approvals), flag unusual clustering of values just under the gate. |
| **The "transfer scam" / cross-check bleed** | Items shifted between open cash orders and comp/employee tabs — collect cash from the customer, then clear the item via a comp/transfer code before drawer sign-off. | Track item-transfer events and open-check durations; flag cashiers with abnormally high transfer-out-of-cash-into-comp frequency concentrated right before drawer close. |

### 2.2 Inventory / product

| Method | What it represents | Detection logic |
|---|---|---|
| **Theoretical vs. Actual (TvA) variance / protein padding** | The core inventory-fraud check: theoretical usage (POS sales × recipe BOM) vs. actual usage (beginning + purchases − ending). Divergence on high-cost proteins (beef, chicken, bacon) is the highest-value target across all three sources. | `theoretical = Σ(items_sold × BOM_coefficient)`; `actual = opening_inv + purchases − ending_inv`; `variance_pct = (actual − theoretical) / theoretical × 100`. Flag >3–5% (tune per item/category) **especially when not matched by a corresponding waste-log entry** — an unexplained variance with zero waste logged for that item is the strongest single signal. |
| **Inventory padding / phantom gains** | Falsifying counts or logging fictitious "returns" to create artificial inventory *gains* that mask a true shortage — the defensive/covering move that follows a TvA-flagged shortage. | Flag unexplained positive inventory adjustments, especially post-count, especially on items with a recent negative-variance history. |
| **Waste-log padding / spoilage masking** | Intentionally over-producing (extra baskets dropped) under cover of "prep error," then walking out with the product after close. | Group waste logs by item, day-of-week, and closing-manager; z-score waste-weight-per-sales-dollar; flag `Z > 3.0` sustained over a rolling window, especially concentrated on one closing team/day-part combination. |
| **Cooking-oil / fryer-asset integrity** | High-cost consumable (fryer oil) target for premature/unauthorized dumping or "ghost recycling" (logged as waste, actually salvaged/sold). Named as an "additional module" by Gemini, not covered by Grok or ChatGPT — worth including precisely because it's a blind spot the other two engines missed. | Track oil-filter-log frequency against fries/chicken volume sold; flag deviation from equipment-capacity norms, or oil changes authorized exclusively by one closing manager with no corresponding drop in product volume. |
| **Automated FOB (Food-Over-Base) variance spikes** | This org already has a live FOB panel (`memory/backlog-master-2026-08-19.md` §6/§11) — this method is really "apply the same detection discipline to the existing FOB metric": a predictive moving-average baseline (weather, local events, DT volume) with automated alerts when actual COGS deviates >1.5% over base within 48 hours. **This should plug into the existing FOB infrastructure, not be built as a separate pipeline.** | Extend existing FOB computation with a rolling expected-value model and an automated 48-hour-deviation alert, gated to trigger a targeted audit of the specific high-cost items driving the spike. |

### 2.3 Deposit / cash-office

Deposit lapping is covered in §2.1 (it's fundamentally a cash-timing scheme). Additional
deposit-specific controls all three sources converged on:

- **Smart safes / non-retrievable deposit devices** — not a detection *rule*, a control that
  removes the opportunity entirely (staff can't retrieve what they drop). Flagged here because if
  this org doesn't already have them, it's a stronger fix than any downstream detection rule for
  the same failure mode. Detection-side complement: flag any deposit that doesn't validate/clear
  within the expected window.
- **Dual custody / independent bank reconciliation** — same logic: a control, not a rule. The
  detection-side complement is flagging any store where the person dropping the deposit and the
  person reconciling the bank statement are the same individual (see §2.4 segregation-of-duties).

### 2.4 Labor / Time-and-Attendance

| Method | What it represents | Detection logic |
|---|---|---|
| **Buddy punching / ghost shifts** | One employee clocks in/out for another, or logs hours never worked. | Cross-reference `clock_in_timestamp` against `first_POS_activity_timestamp` (or badge/biometric/back-door access log where available). Flag when the gap exceeds ~15–30 minutes consistently across multiple shifts, not as a one-off. |
| **Manual time-edit self-approval** | A manager edits their own timecard, or approves an edit for an employee where the manager is also the beneficiary. | Flag `manual_time_adjustment` where `approving_manager == beneficiary_employee`. |

### 2.5 Segregation-of-duties / control-circumvention (cross-cutting, not domain-specific)

These aren't single-event rules — they're structural checks that apply across cash, inventory, and
vendor domains simultaneously. ChatGPT (`Security_Analytics_Session.md`) is the strongest source
on this category; neither Gemini nor Grok names it explicitly.

- **Control-concentration risk.** Build a function/employee matrix (orders, receives, adjusts
  inventory, approves, deposits). One person holding multiple independent control functions is
  itself a risk signal, *even with zero confirmed fraud* — this is what makes the system an
  early-warning tool instead of a purely reactive one. ACFE explicitly recommends testing for
  incompatible combinations (e.g., the same person purchasing, approving, and paying).
- **Vendor/invoice fraud** — dual receiving required; price/quantity audits against PO; watch for
  shell-vendor or kickback indicators (round-number invoices, a vendor with no other customers in
  the area, price creep with no corresponding market movement).

---

## 3. Analytical techniques that make the rules trustworthy (not fraud-specific, but essential)

These came almost entirely from ChatGPT (`Security_Analytics_Session.md`) and materially raise the quality
bar above a plain rule-list. Build these as reusable primitives, not per-rule one-offs — every
rule in §2 should be able to call into all of these.

- **Event DNA** — give every transaction/event a standardized signature (store, employee, manager,
  register, time, daypart, tender, items, gross, discount, void/refund flags, inventory-consumption
  flags). This is what makes cross-event and cross-store pattern comparison computationally
  tractable — build the normalized event schema early, it's a prerequisite for almost everything
  else in this file.
- **Sequence detection** — generic `A → B → C → D` chain matching within configurable time
  windows, not hardcoded per-scenario. A fraud chain (`sale → production → void → drawer →
  inventory variance`) should score meaningfully higher than any single link in it.
- **Event pair/trio mining** — systematic combination detection (`VOID + CASH_SHORT`,
  `REFUND + INVENTORY_VARIANCE`) that can surface combinations nobody explicitly programmed.
- **First-occurrence and rare-event detection** — alert on an employee's *first-ever* instance of a
  category of event (first inventory adjustment, first large refund, first after-hours access),
  especially when immediately followed by another anomaly. An event occurring once in 100,000
  transactions deserves a look even if it isn't technically against policy.
- **Recurrence scoring with decay** — risk should climb with repetition (`1st=20, 2nd=35, 3rd=55,
  4th=75, 5th=90` as a starting curve) but also **decay** — 180 days with no recurrence should pull
  a score back down (`90→65→40`), so one old event doesn't permanently brand someone.
- **Change-point detection** — the interesting signal is often *when behavior shifted*, not just
  that a value is currently extreme. A slow ramp from normal → elevated over 6 months should
  surface the month it started changing, then correlate that month against operational changes
  (manager change, new POS, employee transfer, new schedule).
- **Fraud-chain scoring and fraud-migration detection** — after tightening one control (e.g.
  voids), watch whether the flagged behavior displaces to a different mechanism (discounts, then
  refunds) rather than actually declining. Track this explicitly as a control-effectiveness metric,
  not just "did the original rule's alert count go down."
- **Pattern portability** — a confirmed fraud signature at one store should automatically get
  searched for at every other store, escalating outward (store → district → state → org). One
  investigation becomes a network-wide check, which is a natural fit for this org's 27-store,
  two-state footprint.
- **Loss estimation with confidence intervals**, not a bare "high risk" label — e.g. "estimated
  exposure $2,400–$4,100 over the last 60 days" — and a split between *observed* loss and
  *potentially preventable* loss going forward, since that's what actually drives prioritization.
- **Detection latency and time-to-intervention tracking** — instrument the system's own
  performance (fraud-start-date vs. detection-date vs. alert-date vs. investigation-date vs.
  control-action-date) as a first-class metric, not an afterthought.
- **Rule performance / precision-recall tracking** — every rule needs alerts-generated,
  investigations-opened, confirmed-cases, cleared-cases, false-positives, and estimated-vs-actual
  loss tracked over time, or the rule library degrades into noise nobody reads. This is the
  mechanism that prevents rule rot.

---

## 4. Worked example — how a score should actually look to an investigator

Adapted from ChatGPT, `Security_Analytics_Session.md` §11, which is the clearest illustration across all
three sources of what "explainable" should mean in practice. **No score should ever surface to a
human without this breakdown.**

```text
Employee 3821 — Investigation Priority Score

+24  Refund rate 4.2σ above peer group (peer = same role/daypart/tenure band)
+18  Cash shortage 3.1σ above own historical baseline
+15  7 refunds occurred within 15 min of shift end (opportunity-window signal)
+13  6 of those refunds approved by the same manager (relationship signal)
+11  Related inventory variance on the same SKU category
 +8  Similar sequence pattern occurred 4 times in the last 30 days (recurrence)
---------------------------------------------------------------------------
 89  Raw risk

Exoneration pass:
 −8  Similar refund pattern also present among 7 peer employees (store-wide, not individual)
 −4  Two of the flagged transactions link to documented customer-complaint records
---------------------------------------------------------------------------
 77  HIGH RISK · Confidence: 82% · Severity: 4 (High) · Est. exposure: $1,100–$1,900 / 30 days
```

---

## 5. Employee rule-out / evidence-chain mechanism — the part that needs an owner decision

The owner's own framing (from the original notes-67 message): *"when we identify an event, we log
it and all employees on the clock, next time it occurs as a similar or like event, we log again
and repeat this process until the possible list of people involved is small enough to recommend
further verification... If we can rule out to within almost complete certainty a specific
employee, then we recommend action."* This is a real, coherent mechanism — it's the same idea as
§3's recurrence scoring plus opportunity-adjusted risk, applied specifically to *narrowing a
suspect pool across repeated occurrences of the same event type*, rather than scoring one
individual in isolation.

**Mechanically, this needs:**
- A per-event-type log of "who was on the clock / had opportunity" at each occurrence.
- A running intersection: each new occurrence of the same event type narrows the candidate set to
  people present at *every* occurrence so far (classic process-of-elimination logic — this is
  exactly what §3's opportunity-adjusted risk + recurrence scoring already model, so this isn't a
  new engine, it's a specific *application* of the two engines already speced above, tracked
  per-event-type rather than per-employee).
- A threshold at which the candidate pool is "small enough" to recommend human verification —
  the owner didn't specify a number; needs his input on what "small enough to recommend action"
  means (a specific count? a probability threshold from the risk score itself?).
- **An evidence chain / audit trail** — the owner explicitly used the word "evidence" — meaning
  this needs to be built as something that could hold up to being shown to a person (a GM, HR, or
  law enforcement), not just an internal debugging aid. That has real design implications:
  immutable/append-only logging of what was flagged and when, not an editable risk-score field.

**This is the single most sensitive piece of this whole build, and it needs explicit owner
sign-off before it becomes an engineer dispatch — not because the mechanism is wrong, but
because of what it produces:**

1. **Data retention** — how long does a named-employee accusation trail persist? Does it expire if
   never escalated? What happens to it if the employee is later fully cleared (§3's exoneration
   analytics can *lower* a score, but does the historical record get deleted, or does it stay as
   "flagged, then cleared"?).
2. **Access control** — who can see a named suspicion trail on a specific employee? This is
   materially more sensitive than any other data in Meridian today — CLAUDE.md's RBAC table
   (Developer → Admin → Owner/OO → VP → DO → Supervisor → GM → Office Staff) wasn't designed with
   an "accusation" data class in mind, and GM-level access to a trail naming their own crew raises
   different questions than DO/VP access to it.
3. **Evidence-grade standard** — if this is ever meant to support real action (termination,
   report to law enforcement), does it need a different rigor bar than the rest of the app's
   analytics (chain-of-custody-style logging, tamper-evidence, an audit log of who viewed a given
   employee's trail)? This repo's existing security posture (per `CLAUDE.md`'s pending RLS
   hardening — currently ~92-107 tables on wide-open `using(true)` policies) is **not currently at
   a bar that should hold named-employee accusation data** until that hardening lands. This is a
   hard sequencing dependency, not just a nice-to-have: **the RLS hardening plan
   (`project-rls-hardening-plan.md`, referenced in `backlog-master-2026-08-19.md` §13) should land
   before this mechanism stores anything naming a real employee**, or the accusation data itself
   would sit behind the same wide-open access the hardening plan exists to close.

**Do not scope this into an engineer dispatch until the owner has answered 1–3 above.** Everything
else in this file (§2's detection rules, §3's scoring primitives) is safe to build incrementally
without an accusation-trail component — a rule can raise a risk score without yet wiring it into a
persistent, named, evidence-grade employee record. The process-of-elimination/evidence-chain piece
specifically is what should wait.

---

## 6. Rules Registry — proposed schema

From ChatGPT, `Security_Analytics_Session.md` §40, the strongest concrete implementation detail across all
three sources. Rules should be data, not code, so a threshold change or a new rule doesn't require
a deploy.

```text
RULE_ID                e.g. "CASH-014", "INV-087"
DOMAIN                 cash | inventory | labor | deposit | segregation-of-duties
SUBDOMAIN              e.g. "post-tender-void", "TvA-variance"
METHOD                 short name (matches §2's table entries)
DESCRIPTION            human-readable
DATA_REQUIRED          which source tables/streams this rule reads
LOGIC_TYPE             threshold | z-score | sequence | ratio | window-function
LOGIC_EXPRESSION       the actual computation, in a form the engine can execute
WINDOW                 rolling period this rule evaluates over
BASELINE_TYPE          personal | peer | store | network | none
THRESHOLD              tunable, per-location-overridable
SEVERITY               1 (informational) – 5 (critical)
WEIGHT                 contribution to composite risk score
CONFIDENCE             evidence-strength band this rule type typically produces
OPPORTUNITY_FACTOR     does this rule need an access/authority check to fire meaningfully
CORROBORATION_RULES    which other RULE_IDs strengthen this one if co-occurring
EXONERATION_RULES      which other RULE_IDs/checks can reduce this one's confidence
FALSE_POSITIVES        known legitimate-explanation categories (§1 principle 4)
INVESTIGATION_ACTION   what an investigator should do when this fires
SOURCE                 which of the three research passes this rule traces to
VERSION
ACTIVE                 boolean
```

This maps cleanly onto this org's existing stack (SQL/Supabase + React/Vite) — a `security_rules`
table with this schema, interpreted by a scoring job, rather than rules hardcoded into panel logic.
Matches this repo's existing pattern for tunable config (`org_config` table already does this for
territory/patch assignments — same idea, new table).

---

## 7. Recommended build order

Synthesized from all three sources' "priority"/"MVP" sections, reconciled into one sequence.
**This is a recommendation for scoping into dispatches, not a commitment to build all of it —**
that decision belongs to a PM pass that weighs this against the rest of the open backlog.

### Phase 0a — the actual first task: close rung 2, run the rung-3 probe

**Corrected on independent review, 2026-08-19, after the owner supplied a real Register Audit
export and confirmed Security Events / Suspicious Activity / Any Transaction have already been
explored in QSRSoft's UI.** This file's earlier draft treated data-availability as an open
research question; per §0 above, it's not — `data-acquisition-shopping-list.md`'s attribution
ladder already answers it, in more concrete detail than this file could add. The real Phase 0a is
two small, already-scoped engineering/investigation tasks, not open research:

1. **Dispatch the Register Audit auto-pull.** Parser (`parseRegisterAudit`), Supabase table
   (`audit_rows`), and scoring engine (`analyzeRegisterAudit`) already exist — the only gap is
   replacing the manual Excel upload with an automated QSRSoft pull, matching the two-path-auth
   pattern (`CLAUDE.md`'s standing rule for every new automated pull) already used by
   `lifelenz-pull.mjs`/`qsrsoft-*-pull.mjs`. This alone closes rung 2 (employee × store × day) for
   nearly all of §2.1's methods.
2. **Run the Any Transaction probe.** The three-tier Tier A/B/C design is already owner-approved
   (2026-08-14) — what's outstanding is capturing whether the report server-side-filters to
   exception types (Tier A viable), accepts a date range without filtering (Tier A needs a
   judgment call on egress cost), or is one-date-at-a-time only (Tier A dies, rung 2 carries all
   standing attribution instead). This determines whether true transaction-level timestamps (and
   therefore §3's sequence-detection ambitions) are reachable at all, or whether this build stays
   at daily grain indefinitely.

**Neither of these is blocked on the AI research in this file** — they were already scoped before
the three-engine research existed. If they haven't shipped by the time this file's Phase 1 gets
dispatched, dispatch them first; everything else in this file assumes rung 2 is flowing.

### Phase 0b — substrate (build once, everything else depends on it)
- Event normalization / Event DNA schema — for rung 2 (Register Audit), this is close to already
  shaped by the existing `audit_rows` columns; extend rather than redesign.
- Personal + peer + store baseline computation (§1 principle 2).
- Exposure normalization utilities (§1 principle 1) — this should probably live next to or reuse
  this repo's existing `metric-source.js`/`vs-ly.js` auto-first sourcing helpers
  (`CLAUDE.md`'s "source data through the shared helpers" standing rule applies here too — don't
  build a fourth way of reading `ds.laborRows` etc. for this).
- Rules Registry table + interpreter (§6).

### Phase 1 — MVP detection (highest value, lowest complexity)
- Cash-drawer variance rules with employee attribution (§2.1).
- Post-tender void/refund detection + peer ranking (§2.1 — the single most-corroborated method).
- TvA inventory variance by item/category (§2.2 — second-most-corroborated).
- Basic employee exception ranking (unweighted, single-domain).
- Explanation surfacing (§4's breakdown format) — build this from day one, not as a later
  polish pass; retrofitting explainability onto opaque scores is much harder than starting with it.

### Phase 2 — composite scoring
- Composite risk score combining Phase-1 rules with decay (§3 recurrence scoring).
- Cash + inventory cross-correlation (unrung-sale inference).
- ~~Deposit lapping / sequencing checks~~ — **cut, not deferred**: settled 2026-08-13 as structurally invisible in QSRSoft data (§0, §2.1). Revisit only if a bank-feed source is ever added.
- Opportunity-adjusted risk (§1 principle 3) layered onto existing rules.
- Segregation-of-duties matrix (§2.5).

### Phase 3 — advanced correlation
- Sequence engine (§3) and fraud-chain scoring.
- Change-point detection.
- Exoneration/explanation-library automation (§1 principle 4, §4's exoneration pass).
- Pattern portability across stores (§3).

### Phase 4 — the sensitive piece, gated on owner decisions
- Employee rule-out / evidence-chain mechanism (§5) — **only after** the owner has answered §5's
  three questions and the RLS hardening plan has landed.

### Explicitly out of scope for now (not rejected, just not requested)
- Video/CCTV integration — **correction, 2026-08-19: this is further along than assumed twice
  over.** QSRSoft's `/security/` menu already includes a `Camera Settings` report
  (`qsrsoft-report-catalog.md` §1), and the real `Any Transaction`/`Security Events` exports
  captured the same day both carry `View Details`/`Camera` columns in their schema — meaning
  camera linkage may already be wired at the transaction level, not just configured separately.
  Still out of scope for *this* plan's Phase 0–3 because nothing here depends on it yet and the
  columns were empty in the samples captured (all-sale rows, not exception rows — untested whether
  an exception row populates them) — worth a dedicated probe once rung 2/3 pulls are flowing.
- Smart-safe / non-retrievable-deposit hardware (§2.3) — this is a physical-control purchase
  decision, not a software build; noted here because it would obsolete some of the deposit-lapping
  *detection* rules by removing the opportunity rather than detecting after the fact, which is
  worth knowing before investing heavily in that specific rule.

---

## 8. Open questions for the owner (beyond §5's three)

- **Middle-tier / API layer:** the owner confirmed SQL + React + Vite as the stack in the Gemini
  session, but the API layer connecting Supabase to the React frontend for this specific feature
  wasn't decided (Node/Express vs. Python/FastAPI vs. reusing this org's existing Supabase Edge
  Functions pattern, which is what the rest of Meridian already uses — e.g. `sage-chat`). Given
  this repo already has a working Deno Edge Function pattern in production, **reusing that instead
  of introducing a new middle-tier framework is the default recommendation** unless there's a
  reason (e.g. heavier batch/nightly compute needs than Edge Functions comfortably handle) to
  deviate — flagging as a question rather than deciding it here since it's an architecture call.
- **AI-assisted scoring vs. SAGE:** `notes-67-queue.md` §1 already raised "what should migrate to
  SAGE" as an open design question — this system's explanation-tree/exoneration layer is a natural
  candidate for LLM-assisted narrative generation (turning a score breakdown into investigator-
  readable prose) but probably should NOT be SAGE itself, since SAGE is RBAC-scoped to whatever the
  logged-in user can see, and this system's whole point is to hold data more restricted than
  standard RBAC (§5). Recommend a separate, more tightly scoped tool if LLM assistance is wanted
  here at all — not a SAGE tool addition.

---

## References

**This org's own prior work (read these first — see §0):**
- `memory/data-acquisition-shopping-list.md` — the attribution ladder, Register Audit status,
  Any Transaction Tier A/B/C design, the deposit-lapping "do not chase" finding.
- `memory/qsrsoft-report-catalog.md` — the `/security/` endpoint menu, `suspicious_activity`
  capture and its 4 open measurement questions, the GEID-mapping gap.
- `memory/attribution-validity-register-login.md` — the attribution-confidence design
  (clean/contested/unknown), owner's stated primary fix, sequencing.
- `memory/project-sage-knowledge-grounding.md` — the disclosure-gating policy and mandatory
  handling notice this build should reuse rather than redesign.

**From the three source documents (Gemini/Grok/ChatGPT), kept for follow-up:**
- Loss Prevention Media: "Guardians of the Golden Arches: The McDonald's US Security Program"
- Association of Certified Fraud Examiners (ACFE) — Principles of Fraud Examination; anti-fraud
  data analytics testing guide: https://www.acfe.com/fraud-resources/fraud-risk-tools---coso/anti-fraud-data-analytics-tests
- CISA Insider Threat Mitigation Guide: https://www.cisa.gov/sites/default/files/publications/Insider%20Threat%20Mitigation%20Guide_Final_508.pdf
- CISA logging guidance: https://www.cisa.gov/audiences/small-and-medium-businesses/secure-your-business/use-logging-on-business-systems
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- Level CFO restaurant financial-controls checklists
- LiveStore / Vigilant Apps notes on McDonald's profit-protection configuration
- QSR Magazine, Solink, Envysion, QSRSoft, DTiQ materials on POS-video exception reporting
- Smart-safe case studies (Loomis SafePoint, Burroughs/Cache2Cash-style systems)

---

## How this file relates to the rest of the backlog

This is referenced from `backlog-master-2026-08-19.md` §15 (new section). That section carries the
short pointer + headline open decision (§5); this file is the full spec. When this gets scoped into
actual dispatches, break Phase 0/1 out as the first dispatch — don't try to dispatch the whole
system at once, per this repo's normal dispatch-sizing convention (Workstream-sized chunks, not
whole-project drops).
