---
name: notes-29-queue
description: Owner "Notes 29" (2026-07-26). Two prioritized workstreams — Inventory/EOM (Food Cost) and Performance Reviews — with a standing directive to keep both top-of-mind, pre-study them against industry best practice, and steer the owner toward them. Plus a "maybe crazy" gamification idea logged for later.
metadata:
  node_type: memory
  type: project
---

# Notes 29 (owner, 2026-07-26)

> **STANDING DIRECTIVE (owner, verbatim intent):** *"For Inventory (EOM) and Performance
> Reviews, these need to be prioritized and kept top of mind. Steer me toward them. Pre-study
> both using any available resources you have — even outside the project — pulling from other
> industry data to make them best-in-class / high-value. Ask when uncertain of expectations."*
> → On every session, if the owner is idle or between tasks, nudge toward EOM or Perf Reviews.
> → Do NOT over-build blind: these are ambiguous in places. Present pre-studied plans and ask
>   targeted questions before writing code (owner explicitly said "Ask when uncertain").

---

## 1. 🥇 INVENTORY / EOM (Food Cost) — Priority 1, next several days

**🔑 OWNER'S DOMAIN CONTEXT (from Notes 29, authoritative — this is how EOM actually works):**
- **EOM = a 3-day process, the last 3 calendar days of each month.**
- **Days 3-out and 2-out:** every location is required to count all **Food, Condiment, and Paper**
  classes. Can be done on either of those two days, and partially split across both if they choose.
- **Non-Product class:** must be counted on the **last day of the month** (day 1-out).
- **FOB (Food Over Base) covers the Food + Condiment classes ONLY.** It is "the meat of what we
  strive to control each month" = **24–28% of every revenue dollar.** Outside that band typically
  signals an operational issue (so 24–28% is the healthy target range, not a hard bound).
- **On-Hand Inventory is the count-progress signal:** pulling it (hourly, last 3 days) tells us if/when
  a store has finished counting. At **~90–95% complete the store generally believes they're done** —
  that's the trigger to notify the owner to begin review. **Incomplete counts are a primary driver of
  false food-cost variance** (undercounted ending inventory → overstated usage → worse variance).
- **Diagnosis fuel:** Variance Stat **Loss / Yields** identifies items needing follow-up; combine with
  the other reports. Goal = results that are **easy to understand and pointed to execute at store level.**
- **CoachQ = QSRSoft's own AI.** Owner wants (a) recommended FOB-diagnosis prompts surfaced in the panel,
  and (b) to explore Meridian tapping CoachQ directly — learn context, initiate prompts, or at least
  view/parse previous CoachQ prompts. "A great marriage." *(Exploratory — feasibility unknown, investigate.)*

**🏗️ BUILD STATUS (Claude, 2026-07-26 — foundation shipped, unblocked pieces only):**
- ✅ **Supabase tables** (schema.sql): `qsr_onhand`, `qsr_variance_stat`, `qsr_inventory_summary`
  (keyed `(loc, period, wrin)`, period='YYYY-MM'), plus `eom_count_status` (per-store dashboard row:
  count %, class-done flags, notified_90, diagnosis_status, comms_status/recipient/sent_at) and
  `eom_notification_settings` (flexible jsonb). ⚠️ **Owner must run these SQL blocks** (append at end of schema.sql).
- ✅ **Loaders/savers** (src/lib/supabase.js): save/load for all 5 tables (mirror the qsr_fob pattern).
- ✅ **Engine** (src/engine/eom-inventory.js) + **17 passing tests**: `computeCountProgress` (counts items
  whose last_counted/last_submitted falls in the last-3-days window; per-class + FOB-only completion;
  `believesDone` at 90%), `diagnoseIncompleteCount` (uncounted items ranked by $ at risk, rolled up by class),
  `rankVarianceFollowups` (recount-up vs verify-overcount, mirrors fob-eom priority heuristic), `buildStoreStatus`.
- ✅ **On-Hand pull WIRED (endpoint confirmed 2026-07-26)** — `scripts/qsrsoft-onhand-pull.mjs` +
  `.github/workflows/qsrsoft-onhand-pull.yml` (hourly cron, in-script last-3-days gate). Real endpoint +
  eBOS auth ladder + real field mapping in place; field mapping is unit-tested against the actual
  store-3708 response (see eom-inventory.test.js "real QSRSoft On-Hand shape"). **Confirmed endpoint:**
  ```
  GET prod.ebos.qsrsoft.com/api/inv/{nsn}/on_hand/rawitems?date=YYYY-MM-DD&type={F|C|P|N}&recipe=all&non_zero_on_hand=false&duplicate=false
  Headers: X-Auth-Token (eBOS token), X-Current-Nsn: {nsn}
  Auth ladder: QSRSOFT_EBOS_TOKEN → SSO exchange from QSRSOFT_TOKEN → Playwright (same as qsrsoft-ebos-pull.mjs)
  Response: { on_hand_records:[{ full_wrin, long_desc, invty_class, invty_class_cd, case_count,
              inner_pack_count, loose_count, total_units, unit_price, on_hand_amt, nonRoundedOnHandAmt,
              last_counted "MM/DD/YYYY HH:MM", last_submitted }], total_on_hand_amt }
  ```
  `type` = inventory class filter (F=Food captured; C/P/N iterated). Sample last_counted = 07/21–07/24 on
  the 26th (pre-window) → progress reads 0 until the store recounts in the 29–31 window (correct).
  ⚠️ **To go live this month:** add a **`QSRSOFT_EBOS_TOKEN`** GitHub secret (or rely on QSRSOFT_TOKEN SSO
  exchange, which already works for the eBOS ledger), then run the workflow (`workflow_dispatch`, force=1)
  to smoke-test before the 29th. CONFIRM the type codes C/P/N actually return data (F verified).
- ✅ **EOM Dashboard BUILT (v4.575)** — `src/views/eom-dashboard.js`, nav **"EOM Dashboard" 📦** (OPERATIONS
  group, under EOM Supervisor; modal `eom-dashboard`, perm `analytics.district`). All-stores table: count-progress
  bar + per-class (F/C/P/N) chips, last-count date, FOB % (dollar-weighted MTD from qsr_fob) + FOB $, and
  **editable Diagnosis + Communication status** (persist to `eom_count_status`). Summary tiles (stores reporting /
  believe-done / avg complete / window open). Period selector (current + prior 3). Renders empty-state until the
  On-Hand pull populates `qsr_onhand`. Build + 303 tests green.
- ✅ **Notification loop CLOSED (v4.576)** — the On-Hand pull now **imports the app's engine**
  (`computeCountProgress`, pure ESM, zero drift) and upserts `eom_count_status` per store each run:
  count %, class-done flags, and the **~90% "believes done" trigger fires once** (notified_90/notified_at,
  preserves human-set diagnosis/comms). Dashboard shows a **🔔 "ready for review" banner** (believesDone
  AND diagnosis still 'pending'; clears when you set it to In-review).
- ✅ **Incomplete-count comms generator (v4.577)** — `buildIncompleteCountMessage` (engine, tested):
  for a store that believes it's done but has high-value items on an old count date, generates a
  ready-to-send recount message (subject + body, by-class summary, $ at risk). Dashboard **✉️ Draft**
  per store → modal with Copy + "Mark as sent" (sets comms_status). This is the COUNT-PHASE comms;
  the VARIANCE-diagnosis comms come after the owner's teach-me notes.
- ✅ **DIAGNOSIS ENGINE + ALL ENDPOINTS SHIPPED (v4.535–537, 2026-07-26 eve).** Owner supplied the
  diagnosis-process notes AND rapid-fired the full eBOS endpoint set; both are now wired:
  - **Endpoints CONFIRMED + recorded** (`memory/project-eom-diagnosis-flow.md`, tokens redacted): Variance
    Stat `stat_variance/monthly/{date}` + `/daily` + `/yields`; Waste `raw_waste_promo`; Transfers
    `transfers`; Raw-item DETAIL `raw_detail/{itemId}` (forensic count-timing register) + catalog `raw_detail/rawitem`.
  - **`src/engine/eom-parsers.js`** — pure mappers (client + pull share, zero drift): mapVarianceRows (Food/Paper
    carry $, Condiment unit-only), mapYieldGroups + yield-band cause, mapWasteEvents + per-manager summary,
    mapTransferLines + summary, mapRawItemHistory (count events w/ variance/difference/manager). +16 tests.
  - **`eom-diagnosis.js`** checks LIT UP: variance-top5 (+ yield-band cause link), variance-50, incomplete-count,
    **waste-patterns** (per-manager $ share + edited flags), **raw-items-timing** (attributes variance to its
    count date, judges recount value: early=cascaded, late=recountable), **transfers** (unposted/large).
    normClass now maps eBOS single-letter class codes (F/C/P/N/S/M/L).
  - **Data pipeline**: `qsr_waste` + `qsr_transfers` tables + variance yield_val/pct_sales/raw_item_id cols
    (schema.sql); save/load in supabase.js; **`scripts/qsrsoft-variance-pull.mjs`** + daily workflow
    (10:30 UTC) pulls variance/yields/waste/transfers for all 27 stores via the eBOS auth ladder.
  - **EOM Dashboard 🔬 Diagnose** button per store → runs runDiagnosis() on the cloud streams → modal with
    action items (severity-ranked) + full report (copy/attach to email) + pending-checks note + Mark diagnosed.
- ⏸️ **REMAINING (task #60, mostly polish/owner-action):** Inventory-Summary/Physical-Inventory endpoint still
  to capture (table ready); wire monthly_targets into fob-components + variance "over target" (currently a
  0.25% floor); raw-items-timing on-demand drill (pull raw_detail for a flagged WRIN from the Diagnose modal);
  store yield BAND (not just actual) so the yield-cause overlay fires from DB data; CoachQ curated prompts;
  notification-settings UI (table ready). **Owner action:** run the qsr_waste/qsr_transfers/variance-alter SQL;
  add `QSRSOFT_EBOS_TOKEN` secret (or rely on QSRSOFT_TOKEN SSO). **Perf Reviews = next unblocked workstream (task #59).**

**Context already in the codebase (do not rebuild):**
- `src/views/fob-eom.js` — "FOB EOM Check" panel (built 2026-06-30). See `memory/project-fob-context.md`
  for the full domain model. FOB = Food Over Base (~24–28% of revenue), 6 controllable components
  (Completed Waste, Raw Waste, Condiments, Emp/Mgr Meals, Variance Stat, Unexplained). Already parses
  6 QSRSoft report types (Contributors, On Hand Inventory, Inventory Summary & Usage, Inventory History,
  Variance Stat, Total P&L Cost). Analysis tabs: Priority Recount (≥$50 neg variance), Case Count Review
  (≥4 cases & >9 days supply), Count Compliance (last 3 days), Operational Issues, Files.
- Core diagnostic logic already encoded: **undercount ending inventory → usage overstated → variance
  worse.** Find large-negative-variance items with low on-hand → correct the count up.
- `qsr_fob` table already feeds At-A-Glance FOB tile (dollar-weighted MTD + last completed month).

**What Notes 29 asks for (the build list):**
1. **Wire QSRSoft data pulls onto the Inventory screen** — automate the reports the owner reviews at EOM:
   Variance Stat / Yields, Food Over Base, Physical Inventory, Waste, On-Hand Inventory. (Auto-first,
   freshest-wins, standing rule — cloud stream primary, manual upload fallback only.)
2. **Teach-then-automate:** owner will "teach how I analyze this data currently" → encode that workflow →
   automate → produce a **detailed report + action-item summary** routed to the appropriate person(s).
   *(AMBIGUOUS — owner has not yet walked through their current analysis. Must capture this before deep
   build. This is the primary open question for the whole workstream.)*
3. **Auto-pull On-Hand Inventory hourly on the last 3 days of the month** (count window).
4. **Notification when a store completes ~90–95% of its count.**
5. **Auto-diagnose incomplete counts** using Variance Stat Loss/Yields (flag items likely miscounted).
6. **A repository / context generator for communications** — canned + data-filled messages to GMs/sups.
7. **EOM dashboard** — all locations' count-progress + FOB + Components (percents AND dollars) using the
   FOB table template + per-store diagnosis status + communication-verification (who was told what).
8. **CoachQ:** add CoachQ recommended prompts; explore tapping QSRSoft's CoachQ AI directly.

**Pre-study crib (industry best-practice for a QSR EOM food-cost close — to make this best-in-class):**
- Theoretical vs actual usage variance is THE food-cost KPI; component attribution (waste vs portioning
  vs count error vs theft) is what turns a % into an action.
- Count integrity is the #1 source of false variance — validate counts before trusting the variance
  (days-of-supply sanity, zero-on-hand on high-velocity SKUs, unit/case confusion). Meridian already does
  a version of this — extend it.
- Perpetual/hourly count capture in the final days lets you catch a store that's counting wrong WHILE they
  can still fix it, not after the period locks. This is the differentiator vs QSRSoft's own tooling.
- Close-loop accountability: a diagnosis is only valuable if it becomes a specific message to a specific
  person with a deadline, and you can later verify it landed. Hence #6 + #7's comms-verification.

**OPEN QUESTIONS to ask owner before building (do not guess):**
- Q1: Walk me through your current EOM analysis step-by-step (which report first, what you look for, the
  decision tree). This is the #2 "teach me" item and gates everything.
- Q2: Who receives the action-item summary, and through what channel (in-app, email, text)?
- Q3: Count-progress % — is there a QSRSoft field/endpoint that reports count completion, or must we
  infer it from On-Hand rows present vs the store's SKU master?
- Q4: For the 90–95% notification — notify whom, how?

---

## 2. 🥈 PERFORMANCE REVIEWS — Priority (alongside EOM)

**Context already in the codebase:** `src/engine/review-engine.js` + `src/views/performance-reviews.js`
(nav "Perf Reviews" 📋), config in localStorage `mf_review_config_v1`. See `memory/project-perf-reviews.md`.
Current model: overall = metrics 70% / behavioral 30%; category weights (rgr/sales/profit/people);
per-role competencies (GM/AM/AS/OM); `rateMetric`→1–4; reviews in `mf_perf_reviews_v1`.

**What Notes 29 asks for:**
1. **Customizable + savable templates** with custom names.
2. **Customizable weights** — add / remove / modify / reorder; **must total 100%** (enforce).
3. **Dynamic rating thresholds wired to the weights** (thresholds/blocks scale as weights change).
4. **Drag-to-rearrange competencies.**
5. **Editable job-title options**, arranged by hierarchy low→high role.
6. **Verify** the rating-threshold blocks/scales from the **original Excel** are fully implemented
   (audit current impl vs the source workbook).

**Pre-study crib (best-practice performance-review design):**
- Weighted competency models are standard; the make-or-break is (a) weights that sum to 100 and are
  transparent to the reviewee, and (b) anchored rating scales (behaviorally-anchored rating scales / BARS)
  so a "3" means the same thing across reviewers. Meridian's 1–4 metric rating is a start — the templates
  should carry explicit anchor text per level.
- Template + versioning matters: a review done under last quarter's template must stay reproducible even
  after weights change → **store the resolved template snapshot on each saved review**, don't just
  reference the live config (or historical reviews silently re-score).
- Role hierarchy ordering (GM > AM > AS …) should drive default templates AND the job-title picker.

**OPEN QUESTIONS to ask owner:**
- Q1: Should saved reviews snapshot their template (recommended) so changing weights never re-scores
  history? (Strong recommend yes.)
- Q2: Do you have the original Excel handy to diff against (for #6), or should I audit against
  `memory/project-perf-reviews.md`'s recorded scales?
- Q3: Templates global (shared across all reviewers) or per-user? (Multi-tenant future implies per-org.)

---

## 3. 💡 "Maybe a crazy idea" — GAMIFICATION (logged for later, NOT scheduled)

Owner idea, parked intentionally. A points/engagement system for GMs + Supervisors:
- Award points for: knowing your metrics, using SAGE, completing daily challenges, opening the app,
  reading the Daily Brief, and **auto-awarding for acting on identified opportunities** (e.g. correcting
  a bad inventory count that Meridian flagged — closes the loop with EOM workstream #5/#7).
- A scoreboard; rewards TBD.
- Ties naturally into EOM (reward count-correction) and the accuracy-integrity north-star (reward good
  data hygiene). Revisit once EOM + Perf Reviews land. Do not build unprompted.

---

## Outstanding infra items — ALL RESOLVED (owner confirmed 2026-07-26)
- ✅ **Supabase SQL blocks** — owner ran them; all returned "already exists." Nothing pending.
- ✅ **SAGE RBAC redeploy** — done (`sage-chat` redeployed). RBAC hard-filter is live.
- ✅ **SAGE auto-scheduling runner** — runner user + secrets set up previously. Scheduler can fire.
→ No outstanding infra debt as of 2026-07-26. Clean slate for EOM + Perf Reviews.

## Sequencing + method decisions (owner, 2026-07-26)
- **EOM FIRST** (owner picked EOM over Perf-Reviews-first). Perf Reviews queued next.
- **"Teach me the EOM analysis" = a JOINT session** ("we will plan to do this together"), method =
  a **combination of chat walk-through + other methods** (real reports, worked examples). Do NOT
  build the diagnosis decision-tree solo — co-map it with the owner.
- **Perf Reviews:** build with **template-snapshot on each saved review** (no silent re-score when
  weights change) — owner approved, "no objection."

## EOM open questions still to resolve with owner (gating / need answers)
- **Q-A [GATE]:** On-Hand in QSRSoft Network tab — **JSON API call** (→ JSON mapper, clone qsrsoft-pull.mjs)
  **or Excel/CSV download** (→ reuse fob-eom.js parsers server-side, email-parse pattern)? Determines pull plumbing.
- **Q-B [GATE]:** capture the **On-Hand endpoint** (URL + query params + X-Auth-Token) from DevTools —
  first, since it's the count-progress signal + this-month time-sensitive. Then the other 4 reports.
- **Q-C:** 90–95% count-complete notification — **notify whom, via what channel** (in-app / email / push)?
- **Q-D:** action-item summaries + store comms — **recipients + channel** (copy-paste / email / in-app)?
- **Q-E:** count-progress % — does QSRSoft expose a "% counted" field, or infer completion from On-Hand
  rows-present vs the store's item master?
