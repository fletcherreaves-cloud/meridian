# Backlog Master — 2026-08-19

> **Purpose:** one consolidated, de-duplicated backlog across the whole project, assembled
> 2026-08-19 from a sweep of 20 memory files (`project-backlog.md`,
> `plan-backlog-and-redesign-2026-08-15.md`, and `notes-24` through `notes-66`) plus the
> `plan-normalization-2026-08-17.md` workstreams and `vision-and-roadmap.md`. Every item below
> was extracted from an existing memory file at that time — this file does not invent new scope.
>
> **Known limitation, stated plainly:** most items below were graded as "open" **by the file they
> came from, at the time that file was written** — not independently re-verified against current
> code. Two follow-up PM passes (below) are tasked with re-verifying status per item against
> actual code/git evidence, since a fair amount is likely already shipped or in progress and this
> file doesn't yet know it. **Do not treat an unchecked box below as proof something is unbuilt —
> treat it as "last known status: open, not yet re-verified this pass."**
>
> **Status legend:** ✅ Done · 🟡 In progress · ❌ Open, not started · ❓ Needs owner input/decision
> before work can start · — Needs re-verification (default state for everything below until a PM
> pass checks it)
>
> ---
>
> ## PM review pass 1 — 2026-08-19
>
> **Scope:** the entire file, all 13 sections plus both bottom lists. Pass 2 runs after this
> merges, independently over the same whole file. (The original plan of two *concurrent* passes
> over *disjoint* sections was changed; the stale description at the bottom of this file has been
> corrected rather than left to contradict itself.)
>
> **What "verified" means here.** Every status changed below cites the file, line, test, or PR that
> settles it. Where code alone cannot settle an item — it needs a live Supabase read, a real
> device, a workflow run, or an owner decision — it is marked ❓ with the *specific* next step,
> **not** guessed at. Items left unchanged were checked and are genuinely still open; those carry
> a `(re-verified pass 1)` note so pass 2 can tell "checked, still open" from "not yet reached."
>
> **Coverage, stated honestly.** ~150 checkboxes; roughly 25 had decisive code/git evidence either
> way and are now settled. The remainder are dominated by owner-decision items (❓), open-ended
> design workstreams, and multi-part items where one clause is verifiable and the rest is not.
> Those are marked for what they are rather than force-graded. **Pass 2 should not read an
> unannotated line as confirmed-open by pass 1.**
>
> **Pass-1 follow-up (same day): three items added from direct PM experience, marked ⚠️ inline.**
> Originally framed as "the sweep could not have found these — they only ever lived in
> conversation." **PM review of the resulting PR (#434) found that framing wrong for two of the
> three, and corrected both in place rather than deleting them:**
>
> - **The changelog monotonicity gap (§13) and the PII/credential-handling item (§13) were both
>   already written down** — in `memory/pm-handoff-2026-08-15.md` and `memory/qsrsoft-report-catalog.md`,
>   neither of which was in this file's original 20-file sweep list. The findings themselves are
>   accurate (independently re-verified against code/git); only "unwritten, exists only in
>   conversation" was wrong. **This means the original sweep's file coverage was incomplete, not
>   just its per-item status grading** — a sharper version of the same lesson §0/§11 already taught
>   below. If two files were missed, more may have been; a future pass that finds another item
>   "not previously written down" should grep the full `memory/` directory before trusting that
>   claim, not just this file's own source list.
> - **The At A Glance Act-vs-Need item (§4) was struck entirely** — checked directly against
>   `src/views/at-a-glance.js:2276`, the specific line cited was already fixed by `#296 step 2`
>   (merged **2026-08-15**, four days before this item was written, not concurrent with it as
>   framed). Quoting old code as current is a different failure mode than a coverage gap — this one
>   is a stale-read, and the corrected entry explains it in place.
>
> Nothing here was found to be speculative or fabricated — all three items reflected real, accurate
> content. The errors were both about *provenance* (claiming "unwritten" for things that were
> written, just not indexed) rather than substance.
>
> **Root cause of the staleness, worth recording:** the two largest corrections below (§0 C and
> §11) were not races. `scripts/_pipeline-contract.mjs` landed in **#431** and this file landed in
> **#432** — confirmed via `git merge-base --is-ancestor` — so Workstream C was already built when
> the sweep wrote "Never started." The Bullseye tile has been on `main` since **v5.012 (#274)**,
> four PRs of which touched it. Both were inherited verbatim from source memory files without a
> code check, which is exactly the failure mode this pass exists to catch.
>
> ---
>
> ## PM review pass 2 — 2026-08-19
>
> **Scope:** the entire file again, independently, per the task brief — not a rubber stamp of pass
> 1 and not limited to what pass 1 left open. Branched off `origin/main` at `8357f9d` (post-#433,
> post-#434, post-#435 — pass 1's own PR plus its own follow-up correction PR were both already
> merged before this pass started).
>
> **What this pass did.** (1) Spot-checked a sample of pass 1's ✅ verdicts directly against the
> code/tests they cite, not against pass 1's prose description of them. (2) Independently
> re-verified several of pass 1's still-open (❌/🟡/❓) items the same way. (3) Went one layer
> deeper on two items where a first grep looked like it might contradict the existing verdict
> (§8 R2P, §6 Inventory Control) before concluding either way — both held, with sharper evidence
> attached. (4) Sharpened §0 Workstream G with real-world provenance (the labor-allocation panel is
> live, plus two more un-indexed memory files found). (5) Attempted to add two "never written down"
> items from first-hand knowledge — both turned out to already be written down; see the correction
> below.
>
> **Two real corrections found and fixed.** §2's white-alpha token-adoption item: pass 1 wrote
> "ratchet ceiling of 266... ~24 sites absorbed opportunistically." Reading
> `src/__tests__/light-mode-white-alpha.test.js` directly shows `CEILING = 241`, not 266 — 266 was
> the ceiling's value *before* #296 step 2 landed (2026-08-15), already superseded when pass 1
> wrote its note. Running the test's own grep gave **241**, exactly matching the current ceiling:
> zero sites absorbed since the ceiling was seeded, not ~24. Pass 1's raw count (241) was correct;
> only the ceiling it was compared against was one ratchet-step stale. Corrected in place at §2.
>
> Second, this pass made **the same mistake pass 1 made on 2 of its own 3 additions** (caught by
> the same fix that caught it there): first drafted the vs-LY young-store trap and the price-event
> engine as "never written into any memory file the sweep covered," from first-hand knowledge.
> Grepping the full `memory/` directory (not just this file) before finalizing found both already
> documented in detail in `memory/dispatch-20.md` — marked "✅ DELIVERED 2026-08-18," indexed in
> `MEMORY.md:250`, just not one of this backlog's 20 swept source files. Corrected in place under
> "Already confirmed done," same pattern pass 1 used for its own PR #434→#435 correction. **This is
> now the third memory file found un-indexed by this backlog's sweep** (pass 1 found two —
> `pm-handoff-2026-08-15.md`, `qsrsoft-report-catalog.md` — this pass found a third), which is
> itself the more important finding: the sweep's file-coverage gap, not any single item's status,
> is the recurring failure mode across both passes.
>
> **Spot-checks that held up exactly as pass 1 described, no correction needed** (citation
> re-verified against the actual file/line/test, not just re-read as prose): §3 Ponce de Leon guard
> (`_windowStart` at `backtest.js:201-220`, sharpened — see the "Already confirmed done" entry);
> §3 LifeLenz T&A probe (`scripts/lifelenz-ta-probe.mjs` + `.github/workflows/lifelenz-ta-probe.yml`
> both present); §0 C pipeline contract (`scripts/_pipeline-contract.mjs`, 75 lines, `CEILING = 18`
> in the R8 ratchet test, both confirmed exactly as cited); §4 6-Week Performance YoY guard
> (`_yoyPoint` at `forecast.js:642`, called from both `:659` and `:676`,
> `yoy-trend-guard.test.js` exists); §11 Bullseye equal-area rings (`bullseye-tile.js:41`, the
> `sqrt(1/3)`/`sqrt(2/3)` comment is real, file is 354 lines); §3 info-icon field scraper (both
> scripts present); §8 stray `* 2.js` cleanup (`find src -name '* 2.js'` → 0); §9 SAGE
> resolver-backed tool (grepped `supabase/functions` for `query_metric`/`metric_resolver`/
> `queryMetric` → zero hits, same as pass 1 found); §3 `ds.laborRows` direct-read count (measured
> 20 files under `src/views`+`src/engine`, matches pass 1's tracking number exactly).
>
> **Coverage, stated honestly, same standard as pass 1's own disclosure.** This pass did not
> re-derive all ~150 checkboxes from scratch either — roughly 15 additional items got a direct
> code/test check beyond what's summarized above and in the inline notes through the file; the
> remainder are owner-decision (❓) or live-data items pass 1 already correctly identified as
> unsettleable by grep, and this pass did not attempt to force-grade those. No item pass 1 marked
> `(re-verified pass 1)` was found to be wrong on re-check.

---

## 0. Normalization plan (`plan-normalization-2026-08-17.md`) — re-verified 2026-08-19, current

This section IS current — verified today, not stale. See `MEMORY.md`'s dispatch #22–#32 entries
for full detail on each.

- [x] **A — forecast render path.** ✅ Shipped (`forecast_week_cache`). 🟡 Follow-up: real
  click-trace (dispatch #31) found cache coverage is 100% but 66% of `AtAGlance`'s render cost is
  still unexplained by any span; instrumentation to localize it just shipped (PR #431).
- [x] **B — event scope + recurrence.** ✅ Shipped, RLS-verified in production.
- [x] **C — pipeline contract.** 🟡 **CORRECTED pass 1 — this was NOT "never started"; the first
  slice shipped in PR #431.** All three parts of the dispatch #25/#32 brief are on `main`:
  (1) `scripts/_pipeline-contract.mjs` exists, 75 lines, exporting `logPartitionCoverage` +
  `checkFreshness`; (2) a bounded slice is converted — 2 adopters, `scripts/lifelenz-pull.mjs`
  and `scripts/qsrsoft-dar-pull.mjs`; (3) the ratchet is seeded —
  `src/__tests__/ratchet-pipeline-contract-coverage.test.js` (R8, dispatch #32) at `CEILING = 18`
  unconverted named scripts, plus a unit test `src/__tests__/pipeline-contract.test.js`.
  **Genuinely remaining:** the other 18 scripts (drive the ratchet down), and **C2 (idempotent
  partition replace), which is still fully greenfield** — re-verified, no implementation found.
- [x] **D — design-system adoption.** 🟡 Two hand-conversions + panel contract + ratchet R7
  (seeded at 78) shipped (PR #431). Rest is intentionally opportunistic, no discrete finish line.
- [x] **E — routing vs modals.** ✅ Shipped (4 panels URL-synced). Remount cost is NOT fixed by
  this — folded into A's perf investigation above, not a separate open item.
- [ ] **F — role-based voice.** 🟡 First slice only (Visit Readiness verdict line). Count Cycle
  and DI Compare — the dispatch's own two evidence strings — still need the same treatment.
- [ ] **G — shift dimension.** 🟡 **Sharpened, pass 2 (2026-08-19) — first-hand knowledge, the
  panel is real and named.** `src/views/labor-allocation.js` (207 lines), shipped v5.069 (#428,
  "dispatch29"), lazy-loaded, registered in `panel-registry.js` as the "Labor Allocation" tab in
  the Scheduling hub, imports `src/engine/labor-standard.js` directly — this is not a stray
  unwired file, it's reachable in the running app. Three sub-views: District, By Store, Overnight.
  All three original claims independently re-checked:
  1. **Live-browser verification — still open, unchanged.** No code-level evidence either way;
     needs an actual browser session, which this pass (docs-only) cannot perform.
  2. **1,716-hr correction not folded in — CONFIRMED, and more precisely than before.** The
     panel's own shipping changelog (`src/app/changelog/5.069.js:8`) states this gap verbatim:
     *"the pre-open-hours-in-Breakfast correction... isn't yet folded into this panel's own
     Breakfast gap figure — the correction logic exists in the engine but wiring it into this
     specific number is a separate join this pass didn't attempt."* Not inherited from a stale
     source file — the shipping team said so themselves, in the same PR.
  3. **Zero perf instrumentation — CONFIRMED independently.** Grepped `labor-allocation.js` for
     any trace/span/performance-mark idiom: zero hits.
  **Coverage gap found, same pattern as pass 1's own §13 corrections:** `memory/dispatch29-labor-
  allocation-panel.md` (the panel's full writeup) and `memory/dispatch30-workstream-d-followup.md`
  (a later PR, v5.071, converted this same panel's hand-rolled modal to `ModalShell`) both exist
  on `main` and are referenced nowhere in this backlog file. If two more files were missed here,
  on top of pass 1's two, a wider re-sweep of `memory/` against this file's citations is probably
  warranted before trusting any "not mentioned anywhere" claim in this file at face value.

## 1. Strategic roadmap (`vision-and-roadmap.md`, set 2026-07-21)

- [x] P0 Accuracy-integrity primitives — ✅ substantially built into the engines (dollar-weighting,
  ratio-of-sums, now standing rules enforced repo-wide).
- [x] P1 Smart Targets Model v2 — ✅ shipped (median-of-three trailing model, backtested).
- [ ] P2 UX coherence pass + panel scorecard — 🟡 in motion via Workstream D above; the panel
  *content/flow* scorecard (distinct from modal chrome, already done) is still open.
- [ ] P3 Differentiators — 🟡 Visit Readiness (Graded-Visit Predictor) shipped. Profit-Leak Index,
  Operational Coherence Score — ❌ still just named ideas, not built.
- [ ] P4 Deployment: same-org multi-user → multi-tenant — ❌ multi-tenant design not started
  (same-org multi-user works today via existing RBAC).

## 2. UI/UX Redesign (container plan — `plan-backlog-and-redesign-2026-08-15.md`)

- [ ] #261 Phase 0 render-instrumentation capture — blocks the virtualization-vs-tile-split
  decision for the rest of this plan.
- [ ] #192 P2 panel scorecard — consistency checklist across all 97 panels.
- [ ] #225 viewport-scroll lock — fix applied, **unverified on a real phone** (devtools emulation
  insufficient per the issue itself).
- [ ] Token adoption chain (#276→#286→#287, 111 sites → #296 step 2) — visual-foundation
  prerequisite before any palette change. 🟡 **Count corrected pass 1: 241, not 265.** 🔴
  **Corrected again, pass 2 (2026-08-19) — the "ratchet ceiling of 266" and "~24 sites absorbed"
  claim does not hold up.** Read `src/__tests__/light-mode-white-alpha.test.js` directly:
  `CEILING = 241` (line 66), not 266 — 266 was the ceiling's *previous* value, before #296 step 2
  landed on 2026-08-15 (four days before this backlog file was even written), when it was lowered
  to 241 per the test's own header comment ("Lowered to match immediately... 241, from converting
  19 text/color-role sites"). Ran the test's exact grep myself:
  `grep -rEo "rgba\(255,\s*255,\s*255" src --include="*.js" --exclude-dir=__tests__
  --exclude-dir=changelog --exclude=changelog-latest.js | wc -l` → **241**, exactly matching
  CEILING. So the real state is **zero slack, zero sites absorbed since the ceiling was seeded** —
  the opposite of "~24 sites absorbed opportunistically." Pass 1's own count (241) was right; only
  the ceiling it compared against was stale by one ratchet-down. #296 step 2 itself is done (that
  part pass 1 had right); the *background/boxShadow follow-up sweep* (the ~197-site remainder the
  test's header calls out) is what's still open, at exactly today's measured count.
- [ ] Home-screen redesign (fewer/deeper widgets around the "learning loop") — ❓ 3 open design
  questions: owner's actual first move of the day; dynamic vs. user-customized vs. hybrid; widget
  count.
- [ ] #192 P0: FOB Report populates nothing; Change Monitor → Snapshot rename.
- [ ] Correctness bugs slotted opportunistically: #299, #300, #302, #303, #285, #228, #231, #289
  — status unconfirmed.
- [ ] **Spine 1** — one copyable panel design (District View → Location-tile pattern), pilot =
  Inventory Control, extend to Food Cost/FOB/Inventory.
- [ ] **Spine 2** — unify count-cycle.js / lastCountAnchor / inv_count_sessions behind one cycle
  selector.
- [ ] ❓ Menu restructure (owner's proposed IA) — parked, needs a planning session with the owner.
- [ ] SAGE persistent top-bar placement — parked UI-placement decision.
- [ ] Deferred: startup data-load gradient cue, loaded-data-strip repositioning, dev-mode
  diagnostic screen.
- [ ] Naming: Pace tab (collides with McDonald's internal "PACE" term), Help rename, Troubleshooting
  mode (End User/Dev).
- [ ] **IA/navigation reorganization — full detail in `memory/notes-67-queue.md` §1, 2026-08-19.**
  **Same topic as this section's "Menu restructure (owner's proposed IA) — parked" item three
  lines above — this is that planning session's actual content, not a separate ask.** New/changed
  top-level groupings (Reports, Inventory and Food Cost, Forecasting and Labor Projections,
  Analysis, HR — with Visit Readiness/Graded Visits explicitly flagged as misplaced under
  People/HR today); URL-view conversion for most standalone panels, with an explicit exception
  list that stays right-side-modal (SAGE, Knowledge Base, About, Metric Lineage, Feature Requests,
  Local News) — all of which need a minimize-and-close option that doesn't universally exist
  today; District Overview needs a back button; Lifelenz Bridge rename to "Recommended WFM
  Forecast Adjustments"; make all data tables filterable/sortable wherever possible; a design
  question on what (if anything) should migrate to SAGE vs. stay standalone. **None of this is
  scoped against current code yet** — needs a real panel/routing inventory before it becomes a
  dispatch.
- [ ] **New capability, from `notes-67-queue.md` §3:** side-by-side LifeLenz-forecast-vs-
  Meridian-forecast comparison view. Worth checking against this backlog's existing Lifelenz Gap /
  DI Compare items first — may be partially covered already rather than fully new.

## 3. Data Pipeline / Sourcing Correctness

- [ ] Finish auto-pull migration: Scheduling Intelligence, Schedule Summary, Labor Analysis (same
  root cause as the Schedule Summary labor% bug below).
- [ ] 🟡 **LifeLenz Time & Attendance — status advanced pass 1.** No longer "needs an owner
  DevTools capture": a read-only CI probe for the report-name slug shipped as **#350 / PR #355**
  (`571cfa6b`) — `scripts/lifelenz-ta-probe.mjs` + `.github/workflows/lifelenz-ta-probe.yml`, both
  on `main`. ❓ **Remaining, and it is not a code question:** the probe has to be *run* and its
  output read to learn the slug. Next step is a `workflow_dispatch` trigger and reading the job
  log — nothing here can be settled by grep. Source is still hand-transcribed until then.
- [ ] `labor_rows` (manual Labor Report) sweep — other raw `ds.laborRows` readers still hit
  staleness; only Dialed-In was rerouted through the resolver. ❌ **(re-verified pass 1, still
  open — measured: 20 files under `src/views` + `src/engine` still read `ds.laborRows` directly.)**
  That count is the tracking number for this item; it should fall as the sweep proceeds.
- [ ] Route `compute6wk` through the metric-source resolver (15 resolvable fields still read raw
  arrays); fix `avg6`'s zero-skip bug.
- [x] Ponce de Leon (43701) `detectCleanDataStart` returns a future date, breaking Dialed-In
  calibration for that store. ✅ **Done (high confidence) — CORRECTED pass 1.**
  `src/__tests__/calibrate-new-store.test.js` names this exact symptom in its header ("Notes 61
  #12: Ponce de Leon (43701) reported `recentOnly window starts 2027-04-16`") and was written
  against a live Supabase measurement on 2026-08-08 (133 rows). `src/engine/backtest.js` now
  carries an explicit future-date guard and applies `_windowStart` to `recentOnly` stores
  (`:145`, `:150`). ❓ *One residual for pass 2:* the test fixes the **generic** future-date class;
  whether Dialed-In now calibrates correctly for 43701 **against live data** is a browser/live
  check, not a code check.
- [ ] ❓ `dt-speedofservice.js`'s second "PM" daypart label — needs owner confirmation before
  renaming.
- [ ] **Metric Registry/Resolver unification** — merge `signal-registry.js` (110 metrics) and
  `metric-source.js` (~50 now); add lineage, aggregation metadata, catalog UI, CI enforcement.
  *(Named independently in 3 files — see Duplicates section.)* ❌ **(re-verified pass 1, still
  open — both `src/engine/signal-registry.js` and `src/engine/metric-source.js` exist as separate
  modules with no unification layer between them.)**
- [x] Info-icon field scraper (QSRSoft ℹ tooltips → `qsr_field_definitions`) + field dictionary.
  ✅ **Done — shipped v4.386/v4.387**, long before this file was written. `scripts/qsrsoft-field-
  scraper.mjs` (interactive ℹ-dialog capture) and `scripts/parse-field-defs.mjs`, both upserting to
  `qsr_field_definitions` on `onConflict:'page_key,field_label'`. Stale inheritance from the source
  note. *(If the intended remaining scope was **coverage** — which reports have been scraped — that
  is a live-table count, not a code question; re-file it as such rather than leaving this open.)*

## 4. Correctness Bugs (concrete, investigable)

- [x] 6-Week Performance chart can render 200,000–1,200,000% — `getDOWTrend` lacks a tiny-LY-
  denominator guard. ✅ **Done — CORRECTED pass 1.** The guard exists:
  `src/engine/forecast.js:642` `_yoyPoint(cur, ly)` returns `null` unless both are `> 0` **and**
  the growth sits inside `[YOY_MIN_GROWTH, YOY_MAX_GROWTH]`, applied at **both** call sites
  (`:659`, `:676`). Covered by `src/__tests__/yoy-trend-guard.test.js`, which drives the real index
  rather than the helper so it fails if either call site loses the guard. The ±300% bound is
  measured, not chosen: 39,357 of 40,000 store-days (98.4%) sit at or above 70% of their store's
  own median and only 76 fall below 25%.
- [ ] `[Violation] click handler 1382ms` on nearly every click — root cause not diagnosed.
- [ ] React render ≈100% of main-thread blocking in an older trace — fix direction known
  (coalesce `setDs` sites, defer `ds` to heavy views), not implemented. *(Possibly related to
  dispatch #31's fresh finding above — worth checking for overlap before treating as separate.)*
- [ ] "SAGE Scheduled Runs" tile appears twice as the single worst-cost click — unexplained.
- [ ] Smart Targets stuck on "Loading Sales History" indefinitely.
- [ ] Yearly Planning: YTD Actual/Targets likely wrong from a Jan–Mar upload gap.
- [ ] Morning Brief sales-divergence outliers — possible partial-day-vs-full-day artifact.
- [ ] District View: Forecast Table missing Goal/OEPE/TPPH/Labor%; Scorecards→Controls missing
  data; Action Plan missing TPPH; Forecast Accuracy "Scheduled Projection" reads too high.
- [ ] Labor Analysis week-start must follow the Wednesday setting — flagged as a **bug class**,
  needs an app-wide audit of every week-view.
- [ ] EOM Supervisor Summary: Op Supplies must pull actuals for the selected period.
- [ ] FOB Analysis panel capped at May 2026 — diagnosed (silent fallback to stale manual rows on
  cloud-read failure), **needs live verification it's actually resolved**.
- [ ] **New, from `notes-67-queue.md` §2 (2026-08-19):** Food Cost (Original) panel's date
  selector defaults to May 2026 even though all data displays correctly otherwise — a stale
  hardcoded default, not a data-availability issue by the owner's own description. **Possibly the
  same underlying symptom as the FOB Analysis "capped at May 2026" item directly above** — check
  whether Food Cost (Original) and FOB Analysis share a date-selector component before treating as
  two separate bugs. If distinct panels with genuinely separate causes, this one sounds like a
  quick grep for a hardcoded `'2026-05'`-shaped literal, not the deeper cloud-read-fallback issue
  diagnosed for FOB Analysis.
- [ ] **New, from `notes-67-queue.md` §2:** Speed of Service panel — DT History takes 15+ seconds
  to load. Flagged as a performance bug, not a design ask; per this repo's standing performance-
  budget rule, needs a real before/after measurement if scoped, not just "make it faster."
- [ ] **New, from `notes-67-queue.md` §2:** Forecast Audit panel appears greyed out — owner asks
  why. Reads as a gating bug (permissions? a data-readiness check firing false?) rather than a
  design ask — investigate before scoping as a build item.
- [ ] ❓ Food Cost Panel (`FOBAnalysisPanel`): `qsr_fob` returns empty under RLS for the
  anon/authenticated role. Root cause understood but unconfirmed — **needs a live `pg_policies`
  diff and explicit owner go-ahead before touching production RLS.**
- [ ] Two disagreeing Model Health Score implementations (`modelHealthScore` vs
  `computeModelHealth`). ❌ **(re-verified pass 1, still open — and confirmed live, not vestigial.)**
  Both are defined in the same file (`src/engine/forecast.js:847` and `:1868`), both are exported,
  and **each has its own consumer**: `src/views/at-a-glance.js` calls `modelHealthScore` (`:374`
  red-store filter, `:821` green/yellow/red tally) while `src/views/model-health-badge.js:10`
  imports `computeModelHealth`. So the same store can be graded by two different implementations
  depending on which surface you look at — that is the actual user-visible risk, and it is real today.
- [ ] District View 14-item visual-review punch list — mostly unconfirmed as fixed (Biggest Miss
  counting a partial day, missing labor at 10am, low-contrast Intelligence Brief, TPPH not
  populating in two panels, Tishomingo wrongly flagged "new model store," Records not all-time,
  Critical/Watch chips not clickable, and more — see source file for full list).
- [ ] `diffUserEventsForCloudSync` multi-day-span label-suffix gap — deliberately deferred.
- [x] ✅ **CORRECTION to the pass-1-followup item below, made during PM review of PR #434 — this
  specific site is already fixed, not open.** The item as originally written quoted
  `clr:(laborSec.avn||0)>=0 ? 'rgba(255,255,255,.8)' : '#f87171'` for At A Glance's Act-vs-Need
  tile and attributed it to "#296 step 2" as if that work were still in progress. Checked directly
  against `src/views/at-a-glance.js:2276`: the code now reads
  `clr:(laborSec.avn||0)>=0?'var(--text)':'var(--crit)'`, with its own comment recording *"#296
  step 2: was rgba(255,255,255,.8) -- literally the light themes' own text-on-surface identity,
  invisible."* `#296 step 2` (19 white-alpha sites, including this one) merged **2026-08-15** —
  commit `8298632`, PR #310 — four days before this item was written, not concurrent with it. The
  underlying reporting-integrity framing (a color scheme that shows only the unfavourable half of
  a metric's range is a correctness bug, not a contrast nit) is still a good general point — worth
  keeping in mind for whichever of the **241 white-alpha sites still open** (§2) turn out to share
  this same asymmetric-visibility shape — but nothing supports claiming any specific one does
  without checking it the same way this one just was. Not re-opening as a new open item on
  speculation; strike is correct here, not a downgrade to ❓.

## 5. New Data Sources / Automation

- [ ] Product Mix → Pricing Engine (auto-pulls, elasticity/what-if) — blocks product-mix↔sales
  correlations; ❓ owner to supply legacy spreadsheet.
- [ ] Graded Visits auto-pull from McDonald's (currently manual).
- [ ] Demographics per location (Census/ACS API).
- [ ] Register Audit engine (searchable, smart detection, SAGE+Signals integrated) — whole
  workstream, not started.
- [ ] Local News → event discovery, promoted into candidate Calendar events.
- [ ] Calendar Manager smart insights (news-discovered events → forecast flag → owner accept).
- [ ] **Online Reputation module** — research complete, 3-phase build plan ready, nothing built:
  Phase 1 (Google Business Profile API application — long-lead, DoorDash Reporting API request,
  direct-RSS local news), Phase 2 (GBP backfill + real-time alerts, DoorDash nightly, SerpApi
  gap-fill ~$25/mo), Phase 3 (Uber Eats manual CSV, Apple Business Insights). X/YouTube monitoring
  scoped but unbuilt. Explicitly skip: Facebook, TripAdvisor, Yelp, Bing, Grubhub, Postmates,
  Google Places, Instagram (no viable path).
- [ ] Write-back to QSRSoft (push Targets, two-way sync) — exploration only.

## 6. EOM / Inventory / Food Cost

- [ ] Inventory Control weekly-count completeness rules — **cannot be built on the current table**
  (`qsr_raw_item_detail` is $50-threshold-biased, zero Condiment rows); needs a switch to
  `qsr_onhand` + a mid-month concept that doesn't exist yet + paper-count inclusion. ⚠️ **Clarified,
  pass 2 (2026-08-19) — still fully open, do not read PR #411 as touching this.** A different
  Condiment bug (98.9% of Condiment items in the On-Hand API's `active_in_recipe` flag reading
  `false` district-wide, `src/engine/count-cycle.js`) was found and fixed separately this week.
  Different table (`qsr_raw_item_detail` here vs. the On-Hand API there), different root cause
  (data never present due to a $50 selection threshold, vs. a flag misread on data that *is*
  present) — the two are unrelated and the fix does not close this item.
- [ ] Variance chart loopback should anchor on `qsr_onhand.last_counted`, not the calendar month;
  build the per-item variance chart (data already computed, just not rendered).
- [ ] ❓ Items Recounted tile hidden ~21 days/month — needs an owner decision (widen window /
  dormant state / leave as-is).
- [ ] Quantity-variance display (case-pack suffix) — shipped for Change Monitor's Baseline-diff
  table only; still open for ItemJourneyView, FOB Root-Cause Recount Impact, FOB Report "Top item
  losers" (+ its printable HTML).
- [ ] Item Journey flow reconciliation to tie out exactly to the Variance Stat report (currently
  directional only).
- [ ] Remaining EOM list: Inventory-Summary/Physical-Inventory endpoint capture; wire
  `monthly_targets` into fob-components + variance threshold; on-demand raw-item-timing drill;
  store yield BAND; CoachQ curated prompts; notification-settings UI.
- [ ] FOB day-by-day curve through the month (early-month skew theory) — needs historical mapping.
- [ ] Custom reports for non-QSRSoft panels (SMG/Voice, LifeLenz, calendars) — PACE done as first
  slice, rest open.
- [ ] ❓ Inventory troubleshooting/variance-window engine with crew narrowing — explicitly never a
  verdict, confidence-scored only; parked, sensitive.
- [ ] ❓ Original Food Cost panel — auto-source or merge into the newer area; decision needed first.

## 7. Performance Reviews

- [ ] Personnel moves (loc↔loc, patch reassignment) tracking, editable override.
- [ ] Location-attribution rule tightening (day-weighted split + ≥70%-of-days flag) — AI
  recommendation given, not built.
- [ ] Shift Manager Summary — isolate individual manager performance (needs the QSRSoft report
  captured first).
- [ ] Missing-targets UI in ReviewEditor (banner + one-click Smart-Targets seed).
- [ ] FOB metric-definition fix: score on FOB% not fob$ (unblocks target auto-fill).
- [ ] ❓ Per-metric wiring blocked on owner sourcing: Shift Certified Mgrs/Total Headcount, 0-90
  Day Crew Turnover, FS EcoSure, FS Completion T-60 (Jolt/Squabble), EPB2B (Pace Portal).
- [ ] Per-metric doable, needs field confirmation: Op Supplies actual, Total Profit-vs-Target
  derivation, Digital App / Delivery GC-per-restaurant-per-day.
- [ ] Banked threshold-value corrections (OEPE floor, Shift-Certified count step, FOB/Labor
  Bonus-Eligibility module, Total Profit bands) — separate from the shipped authoring UI.

## 8. Leadership One-Pager

- [ ] Operator→DO pulse — 5-tile "any fires" card (design given, not built).
- [ ] Promotions/Training/Other-Initiatives area — not built.
- [ ] Top-of-Discussion report — pre-populate relevant names for scope.
- [x] R2P stays manual-only — no cloud source exists, documented limitation, not a bug to chase.
  ✅ **Confirmed, pass 2 (2026-08-19), with an actual citation — this had none before.** Nearly
  concluded the opposite on first grep: `src/engine/metric-source.js:78` lists
  `qsrActSummaryRows.r2p` (a genuine cloud stream, `loadQsrActSummary()` → `qsr_daily_activity_
  rollup`) ahead of `opsRows.r2p` (manual) in the resolver's source list. But one level deeper:
  neither `scripts/qsrsoft-dar-pull.mjs` nor the DAR schema ever writes an `r2p` column into that
  table — the "cloud source" entry is vestigial, resolves to `undefined` on every real row, and
  the resolver falls through to manual in practice. Exactly the trap CLAUDE.md's own standing rule
  warns about: a plausible code reference that doesn't survive one more check. Verdict unchanged,
  now evidenced rather than assumed.
- [ ] ❓ Labor% current-day DAR fallback — deliberately deferred pending owner's explanation of
  FL-vs-OK labor-usage differences.
- [x] Cleanup: stray CloudDocs duplicate files (`src/**/* 2.js`). ✅ **Done — CORRECTED pass 1.**
  `find src -name '* 2.js'` returns **0**. Nothing to clean; strike this item.

## 9. SAGE Enhancements

- [ ] Tool-breadth expansion — give SAGE the metric resolver as a generic query tool (flagged as
  the single biggest win available). ❌ **(re-verified pass 1, still open — grepped
  `supabase/functions` for a resolver-backed tool (`query_metric`/`metric_resolver`/`queryMetric`):
  zero hits. SAGE's tools remain the fixed per-table set.)**
- [ ] Feed CLAUDE.md/memory standing rules into the system prompt.
- [ ] Pass active panel state as context (not screenshots).
- [ ] Personality tuning (system-prompt only).
- [ ] ❓ Outbound web access — needs a cost/abuse-boundary decision first.
- [ ] Conversation persistence / self-learning loop — still on CLAUDE.md's own candidate list.
- [ ] **Corroboration, 2026-08-19 — SAGE self-report converges on the tool-breadth item above.**
  Asked directly what would expand its usefulness, SAGE named the same gap as its top pick,
  independently: turning the currently-static baked-in summary domains (food cost, OEPE, SMG
  VOICE, Controls) into live queryable tools, the same shape as the existing
  `query_daily_activity`/`query_lifelenz_labor`/`query_forecast_snapshots`/`query_promo_roi` tools.
  Two additional, more specific asks not previously in this backlog: **document/forms access**
  (the eBOS form library or Resource Library exposed as a queryable source — currently none of it
  reaches SAGE), and **deeper history/longer lookback windows** for trend and YoY work (SAGE's
  tools are described as fixed ~60-day summaries today).

## 10. Signals / Visit Readiness / Attention

- [ ] Product-mix correlations — blocked on Product Mix pull (§5 above).
- [ ] ❓ Visit Readiness rethink — "how to get ready and stay ready" diagnostic ruleset, needs a
  design session. *(Asked in 2 files — see Duplicates.)*
- [ ] Graded Visits — more correlation analysis (open-ended).
- [ ] Swing Watch "Acknowledged" placement at top of Needs Attention — fully scoped, not built.
- [ ] ❓ Scoring-system revisit (Ops/Controls/Combined/District/Model Health) — needs a joint
  owner session, findings already ready.
- [ ] Multi-user startup-load tiering (core vs. extended fetch by role) — design decision needed
  before P4 rollout, not urgent solo.
- [ ] Swing alarm's cross-metric report + AI-scour-for-causes sub-asks — detection/ack shipped,
  these two enrichment asks unconfirmed as built.

## 11. Bullseye Tile & State-of-Business Engine

- [x] Bullseye distribution chart (full spec: angle=market sector, radius=signed %-vs-target,
  equal-area rings, palette fix). ✅ **Done — CORRECTED pass 1; this is the largest stale entry in
  the file.** `src/views/bullseye-tile.js`, 354 lines, shipped **v5.012 (#274)** and embedded in At
  A Glance. Every clause of the "full spec" is implemented and documented in the component's own
  header: **angle** = market/state sector, subdividing to patch once a state is selected, arc width
  proportional to member count (`:44–49`); **equal-area rings** = three bands with boundaries at
  `maxR*sqrt(1/3)` and `maxR*sqrt(2/3)`, explicitly *not* equal-radius (`:17`, `:36–42`);
  **radius** = signed % vs the store's own target, positive = good, continuous across band edges
  (`:35–37`); **palette fix** = converted to `var(--good)`/`var(--warn)`/`var(--crit)` in #280/#282
  and the light-mode ring-stroke bug fixed in **#298** (the strokes had composited to contrast
  1.000 — literally the same pixel as the backdrop). Four PRs have touched this file. Strike it.
- [ ] ❓ State-of-business walkthrough engine (evidence-first, learning loop) — presentation
  format still undecided, not built.

## 12. Staged Experiments / Risk Tracking

- [ ] 🟡 `store_assessments` table — 8/20 scheduling-workshop stores rated as of 2026-08-14,
  remaining 12 due 2026-09-03; top-5-of-20 binary reconciliation also due then.
  ❓ **Cannot be verified from code (pass 1): `store_assessments` has ZERO references anywhere in
  `src/`, `supabase/`, or `scripts/`.** So this is a Supabase-side + owner-tracking item with no
  application surface — the rating count can only be settled by a live table read, and the anon key
  returns zero rows under RLS. **Two things pass 2 should not conclude from that zero:** it is not
  evidence the table is missing, and it is not evidence the ratings are undone. Someone with
  service-role read has to count it. Separately worth deciding: whether a table with no code
  reference should have a panel at all, or stays a spreadsheet-grade artifact.
- [ ] Living risk-factor engine for food cost + labor (computed track vs. assessed track, stored
  for trending) — owner suggests starting as a chip.

## 13. Docs / Deployment / Ops

- [ ] Internal docs repository / KB expansion + accuracy audit.
- [ ] Document uploads (Supabase Storage bucket + RBAC).
- [ ] Generalized form-builder (weights/scoring) — deferred, own workstream.
- [ ] "Where's my data?" catalog. *(Named in 2 files — see Duplicates.)*
- [ ] **Multi-tenant deployment path** — same item as P4 above; per-tenant isolation, credentials,
  onboarding, ops monitoring, billing posture.
- [ ] Backup/rollback story for Supabase. *(Named in 3 files — see Duplicates.)*
- [ ] Telemetry/usage DB (panel usage, error logs, pipeline health, tamper detection) — schema
  cheap, build is a real project; auto-shutdown should be flag-first, not automatic.
- [ ] Security sweep (from existing security-notes/RLS-hardening docs).
- [ ] ⚠️ **CORRECTED PROVENANCE (made during PM review of PR #434) — `changelog-version.test.js`
  does not guard version monotonicity, but this was already written down.** The finding itself
  checks out (confirmed independently: 10 `it()` blocks in the test — not 11, minor miscount —
  none of them compares the shipped version against the previous one; the v5.016/#309/#310/#321
  renumbering and the #298-before-#301 merge-order story both check out against real `git log`).
  **What's wrong is "not previously written down."** `memory/pm-handoff-2026-08-15.md:64-69`
  records this almost verbatim, same date, same "single most recurring near-miss of the session"
  framing: *"`changelog-version.test.js` guards desync between `changelog-data.js` and
  `changelog-latest.js`, NOT monotonicity — a backwards version ships green."* The gap is real; the
  claim that the original 20-file sweep couldn't have found it is not — `pm-handoff-2026-08-15.md`
  simply wasn't one of the 20 files swept. **Fix is cheap:** one assertion that the newest entry's
  version is strictly greater than the runner-up. Until it exists, the mitigation is manual and
  must be repeated on every changelog-touching PR.
- [ ] ⚠️ **CORRECTED PROVENANCE (made during PM review of PR #434) — this PII/credential-handling
  content already exists, in detail, in two memory files the original sweep didn't cover.** Not
  "unwritten, exists only in conversation" as originally framed — the sweep's 20-file list simply
  didn't include `memory/qsrsoft-report-catalog.md` or `memory/pm-handoff-2026-08-15.md`, both of
  which cover this ground more thoroughly than this item did:
  1. **`x-auth-token` sequencing.** `pm-handoff-2026-08-15.md`'s own "Security constraints (verbatim
     intent — preserve on every future handoff)" section (§8): *"Sequence any future capture request
     behind a rotation, never alongside one"* + *"Strip `x-auth-token` from every capture. Never
     write one to a file or a commit."* Same substance as this item's "cycle the session first, then
     take the capture."
  2. **`storePeoplePunches` exposes `ssn`.** `qsrsoft-report-catalog.md` has a dedicated `## ⚠️ PII
     — storePeoplePunches exposes ssn` section (line 1581) with the full column list spelled out,
     plus a broader, stricter follow-on instruction that `employeeRoster` exposes far more (SSN,
     DOB, address, phone, emergency contacts) and needs an explicit field allow-list, not just a
     `storePeoplePunches` never-select rule.
  3. **Roster workbook deletion.** Also already referenced in `qsrsoft-report-catalog.md` as
     *"This repo already has a standing instruction to delete roster workbooks."* ❓ Whether the
     deletion itself happened is still a real open question — that part of the item stands.
  **The actual gap, now correctly scoped:** this content is real, correct, and already written —
  it's just sitting in two files this backlog's sweep missed, which is a discoverability problem
  (fix: index these files, or fold their PII sections into `CLAUDE.md`'s own standing rules where
  they'd actually get read), not a "write it down for the first time" problem. Worth noting for
  whoever runs a future sweep of this backlog file: if two files were missed, more may have been.
  Deliverable is a short written capture protocol + the never-select field list. §13's existing
  "Security sweep" item is about RLS and does not cover this human-process surface at all.
- [ ] App Store readiness roadmap (deliverable = roadmap doc only).
- [ ] ❓ Capacity-review questions (usage/dev-pace vs. growth; onboarding readiness for new users).
- [ ] ❓ Needs clarification from owner: "Aug 19-21 JR" note; Google Reviews "fun for now"
  confirmation.
- [ ] ❓ Run the v4.839 retail-event seed/measure scripts — blocked on owner go-ahead
  (production-writing).
- [ ] Sooner Rd/Tinker AFB event tagging; broader Event Lookup (major-retailer proximity, pop-up
  event detection).
- [ ] Task Queue + Feature Requests panel merge (IA decision).
- [ ] Panel Manager — list every panel with a locked "core" reference section. *(Named in 3
  files — see Duplicates.)*
- [ ] Data Manager — show source report per data type, extend to auto-synced sources. *(Named in
  2 files — see Duplicates.)*
- [ ] Save/Restore Session — verify it backs up what's needed, relocate in nav.
- [ ] ❓ LifeLenz AOS — needs an explicit owner decision (rescope vs. close); should NOT be picked
  up as originally filed.
- [ ] Open question, never resolved: does the discarded-targets bug (#153/#167) also hit
  Projections' `sales_proj`?

---

## 14. Coverage-sweep additions — 2026-08-19 (memory/ files outside the original 20-file sweep)

**Source of this section.** After two independent status-verification passes on this file both
found real memory files un-indexed by the original 20-file sweep, a follow-on pass grepped every
remaining file in `memory/` (~96 of ~154 total, after excluding files already cited by this
backlog and the ~20 originally swept) specifically for open items this backlog is missing —
not re-verifying status this time, *finding gaps*. Four parallel reads covered the files; two of
the most surprising/highest-stakes claims below were independently re-measured directly against
the live repo before being written in here (marked ✅ **re-measured**); the rest carry their
source file's own citation and should get the same "measure it" treatment before being acted on,
same as everything else in this backlog. `notes-31-queue.md`, `notes-32-queue.md`,
`notes-33-queue.md`, `notes-58-queue.md` — the only "notes-NN" files with **zero** citation
anywhere in this backlog despite the header's "notes-24 through notes-66" framing — were read
directly rather than delegated; all but one item in them turned out to already be captured
elsewhere in this file under different wording (§6, §7, §8, §10) — the one exception is listed
first below.

### Security / RLS — highest priority, three independent sources converge on the same gap

- [x] **Wide-open RLS — FULLY CLOSED, 2026-08-20, by three live measurements.** The 92-107
  source-text count below was real and correctly grep'd, but measured committed SQL text across
  superseded schema files, not live database state. Three live, read-only diagnostics against
  production (`supabase/diagnose-schema-state.sql` + `diagnose-open-policies.sql` +
  `diagnose-rls-disabled-tables.sql`, all owner-run 2026-08-20) settle it completely: the
  anonymous-access problem is **closed** — a separate, already-applied multitenant migration
  replaced the wide-open policies on the overwhelming majority of tables with
  `tenant_id = current_tenant_id()` checks that correctly reject anonymous callers, the one real
  literal `using(true)` (`qsrsoft_kb`) is already known/intentional, and **all 87 tables in
  `public` have RLS enabled — zero exceptions.** `project-rls-hardening-plan.md`'s Phase 1 is
  done; only Phase 2 (`can_see_loc()`, per-loc isolation) remains real, unshipped scope. Full
  correction: `project-rls-hardening-plan.md`'s own correction note at the top of that file. **Do not
  re-cite 92-107 as a live exposure count anywhere — it never was one.** Original entry, kept
  below for the record of what was measured and how:
  ~~`grep -rEic "using\s*\(\s*true\s*\)" supabase/schema.sql` → **92** (a plain
  case-sensitive `using(true)` grep returns 0 — the real text is `USING (true)` with a space and
  mixed case, which is why a naive check would miss this). Across all `supabase/*.sql` files:
  **107**. `project-audit-2026-07-27.md`'s critical finding A1. `project-rls-hardening-plan.md`'s
  two-phase fix (Phase 1: close ~30 anonymous-access tables; Phase 2: per-loc isolation via
  `can_see_loc()`) has been owner-approved-to-draft since 2026-07-27 and never executed — and the
  real count (92-107) is 3-4× the ~30-table scope the plan assumed.~~ Two more related,
  unconfirmed pieces, still open regardless of the correction above: whether
  `supabase/schema-multitenant-phase3-registry-rls.sql` (closes the `tenants`/`tenant_stores` RLS
  gap specifically) was ever run in production (`rls-table-audit-119.md`), and whether the
  Supabase service-role key that was pasted into a chat log ever got rotated
  (`session-2026-08-07-perf-and-rls.md`) — no evidence either way in the codebase.
- [ ] `xlsx@0.18.5` has unpatched CVEs on npm (`project-audit-2026-07-27.md` B3) — deferred by its
  own follow-on doc (`project-security-notes.md`) until untrusted uploads exist; noted here so the
  two files aren't rediscovered as separate gaps later.
- [ ] Single global `ErrorBoundary` still wraps the entire app in `meridian.js`
  (`project-audit-2026-07-27.md` B6) — one runtime error anywhere blanks the whole page.
- [ ] SAGE knowledge-grounding sensitivity gating (restrict personnel-sensitive findings to DO+
  role, gate by subject not just caller role, fail-closed frontmatter) is designed but not built —
  safety-relevant, not just a nice-to-have: `memory/finding-padding-and-cash-hunt-2026-08-13.md`
  already names a GM by name, and nothing stops that reaching SAGE's context today
  (`project-sage-knowledge-grounding.md`). Sharper than §9's generic "feed CLAUDE.md/memory
  standing rules into the system prompt" line.

### Data pipeline / automation

- [ ] QSRSoft Cognito auth conversion is mostly unstarted. ✅ **Re-measured today:**
  `grep -rl getFreshToken scripts/*.mjs` → 2 files (`turnover-pull`, `ops-pull`);
  `grep -rl "QSRSOFT_TOKEN\|QSRSOFT_COGNITO_TOKEN" scripts/*.mjs` → 15 files still on the stale
  ~1h-TTL token, falling through to Playwright on nearly every run (`project-qsrsoft-cognito-
  auth-312.md`).
- [ ] Product Outage pull (`GET /reporting/v2/product/outages`) — fully scoped, cheapest pull on
  the list, backfillable to a year, zero remaining owner blockers (`data-acquisition-shopping-
  list.md`).
- [ ] Menu Price Comparison ("RFM Price Comparison") pull — ready-to-build, `nsn`+`menuItemNumber`
  grain, 0 duplicates measured (`data-acquisition-shopping-list.md`).
- [ ] Tiered "Any Transaction" exception-pull design (Tier A/B/C) — owner-approved 2026-08-14,
  pending only a probe run (`data-acquisition-shopping-list.md`).
- [ ] `parseLaborExceptions` parser exists (missed breaks, minors violations) with **zero**
  table/loader/pull wired to it (`data-acquisition-shopping-list.md`).
- [ ] No automated pull populates `qsr_inventory_summary` — `saveQsrInventorySummary` is defined
  but never called anywhere; the Inventory Intelligence panel reads this table and shows "no cloud
  data yet" for every store (`project-inventory-auto-wiring-214.md`).
- [ ] `storewide_controls` QSRSoft endpoint (per-store T-Red/HALO/skim/cash thresholds, discount
  %s) discovered but no pull script/table built to auto-populate `DEFAULT_TARGETS`/Signals
  thresholds instead of hardcoding them (`project-qsrsoft-controls-endpoint.md`).
- [ ] QSRSoft's own Alerts/Notifications GraphQL API (`api.sso.myqsrsoft.com/alerts/graphql`)
  discovered alongside CoachQ — pulling QSRSoft's own operational alerts into Signals is unbuilt
  (`project-qsrsoft-coachq.md`; the CoachQ curated-prompts item itself is already in §6).
- [ ] MOP/app transactions (`mop_transactions`) not yet added to the DAR pull
  (`project-qsrsoft-dar-columns.md`).
- [ ] `scripts/qsrsoft-ebos-pull.mjs` still runs the old dead SSO-first auth ladder instead of the
  working Playwright eBOS login already ported to the variance/on-hand pulls
  (`project-eom-diagnosis-flow.md`).
- [ ] #263/#265 pull-completeness ledger system has no backlog presence at all:
  `supabase/schema-data-completeness.sql` never run in production; only 2 of 7 pull streams have
  tolerance rules; restricted-handling UI/SAGE gating for the `notes` column not built
  (`project-pull-completeness-263-265.md`).
- [ ] **§5 status correction:** the Product Mix → Pricing Engine item currently reads "❓ owner to
  supply legacy spreadsheet" — stale. PMIX (#291) is now a real, tested pull (schema/loader/pull
  script all shipped); 5 concrete next steps remain instead: confirm the multi-store `loc` field,
  wire lazy-fill, add a GitHub Action + `sync-failure-watch.yml` entry, build the
  `productMixDiscount` pull, fix the manual-parser loc/date handling (`project-product-mix-291.md`).
- [x] ✅ **DONE 2026-09-02, owner go-ahead given.** The 994-row count was as of 2026-08-19; a
  dry-run just before executing found only **6** rows still matching the stub signature
  (`labor_pct=0 AND sales>0`, all also `tpph=0 AND ot_hrs=0`, 5 stores, 2025-01-22..2026-01-25) —
  the parser/save-path fix landed sometime in the interim and the rest had already been cleaned
  up another way. Ran `scripts/cleanup-labor-pct-stub-zeros.mjs`: backed up all 6 rows' pre-write
  state to `backups/labor-rows-cleanup-2026-09-02T17-51-33-198Z.json` (gitignored, local only),
  nulled `labor_pct`/`tpph`/`ot_hrs`/`ot_dollar` on all 6, `sales` left untouched. Verified live
  post-write: `labor_rows?labor_pct=eq.0&sales=gt.0` → `content-range: */0`, zero rows remain.
  **Not yet done:** the re-measurement of #236/#237's noise numbers this was meant to unblock —
  that's `scripts/measure-coaching-noise-threshold.mjs` /
  `scripts/measure-district-relative-noise.mjs`, a separate follow-on, not run in this pass.
- [x] ⚠️ **CORRECTED 2026-09-02 — both pending migrations are already run in production.**
  Measured live via `SUPABASE_SERVICE_ROLE_KEY` (this session has read access, per dispatch
  #133's finding): `qsr_daily_activity_rollup.total_scheduled_hours` exists and returns real
  (non-error) rows — `supabase/schema-qsr-rollup-scheduled-hours.sql` has already been applied,
  unblocking the Planning/Execution split (#210) rollup-path UI. `hourly_projection_accuracy`
  also exists with real rows back to 2026-08-13 (`schema-hourly-projection-accuracy.sql` already
  run), and its GitHub Action (`.github/workflows/hourly-projection-accuracy.yml`) is live. **Do
  not re-ask the owner to run either SQL block.** The two named follow-ups (rate/hours/sales
  decomposition needing `actual_punched_dollars`; generalizing Signals' `HourlyDetail` into a
  per-store hour×DOW gap grid; the 8-day afternoon sales-bias lead; `HOUR_LABELS` string/integer
  mismatch) were not re-verified in this pass and may still be open — re-check before acting.

### Correctness bugs (extends §4)

- [ ] #150 — `metricAvg` discards real KVS Healthy Usage 0% results as missing data, inflating
  district averages on the One-Pager/Morning Brief (`project-scoring-revisit.md`).
- [ ] #153 — `computeOpsScore` grades against static `constants.js` `tLabor` instead of the
  monthly-approved `tCrewLabor` (`project-scoring-revisit.md`).
- [ ] #156 — monthly-target precedence has device cache beating cloud at `App.js:2279`, backwards
  from the cloud-first policy (`project-scoring-revisit.md`).
- [ ] `pending_reports` stores report base64 blobs directly in a Supabase column instead of
  Storage (a 12.37 MB row observed) despite a code comment claiming a bucket upload
  (`docs-refresh-todo.md`).
- [ ] Tishomingo (43380) / Ponce de Leon (43701) store numbers collide with Excel's date-serial
  range; a date-formatted loader silently mangles them. Fix "queued," not shipped
  (`store-events-material-changes.md`).
- [ ] Coaching loop #208's core verify mechanism is nonfunctional in production. ✅ **Re-measured
  today:** `src/engine/coaching-loop.js:58` — `export const NOISE_THRESHOLDS = {};`, still empty,
  so `computeVerdict()` returns `null` for every cycle. District-differencing was tested as the fix
  and measured to not work (#237: reduction factor ~0.98-1.07× on FOB components, essentially
  none); the next candidate (longer measurement windows, or confidence-based non-binary verdicts)
  has no decision or build (`project-coaching-loop-208.md`, `project-noise-measurement-237.md`).
  Called "the single genuine differentiator on the table" in its own shipping changelog
  (`src/app/changelog/4.990.js`) — not referenced anywhere in this backlog until now.
- [ ] OEPE is a plain unweighted mean at 4 sites (`opsRows` carries no car/GC weighting basis); DAR
  re-sourcing would fix all four but hasn't been done. `src/views/scheduling.js`'s local
  `wAvgLaborPct`/`wAvgTPMH` still duplicate `src/engine/weighted.js` (`weighted-rollup-audit.md`).
- [ ] `LocationSelector`'s patch tier reads a static seed (`INV_ORG_COORDS[loc].sup`) while
  Inventory Control's own patch filter reads the live `_liveAssignments` override — unconfirmed
  whether the two stay in sync (`spine1-panel-controls-126.md`).
- [x] ✅ **DONE — already shipped by dispatch #166, re-measured 2026-09-02, do not
  re-implement.** OM/DO org-structure tiers exist: `constants.js`'s `DEF_SETTINGS` carries
  `doGroups` (seeded, e.g. `'Hugh Bonner'` → the MCDOK store list) and `omGroups` (`{}` scaffold,
  intentionally empty — "no OM names seeded yet; populate via Settings when ready"). Management →
  Settings has two dedicated `GroupsEditor` sections (`activeSection==='dos'`/`'oms'`,
  `src/views/management.js`), the same add/edit/sync-from-defaults UI pattern as the existing
  Operators/Supervisors sections. `one-pager.js` already reads both (`settings.doGroups`/
  `settings.omGroups`) for DO/OM scope filtering. Covered by
  `dispatch-166-management-do-om-sections.test.js` and `dispatch-166-onepager-do-scope.test.js`.
  Persisted the same way every other Settings field is (round-trips through the normal
  `settings`/`onUpdate` save path to Supabase) — no separate persistence work needed. **What is
  NOT done, if picked up later:** `omGroups` has zero real OM names seeded (by design, per its
  own comment) — the owner still needs to actually populate it via the Settings UI once ready;
  and the "AS" (Area Supervisor) abbreviation/relabel was never requested as a separate action
  item beyond the aside in the owner's original quote.
- [ ] `pending_reports.org` column exists but is never written or filtered — a second org would
  see the first org's uploaded files; also a 30-day window means new users miss old uploads
  (`project-sync-rework.md`). More specific than §13's generic multi-tenant item.
- [ ] `ds.storeIds` and `ds.loaded` are both manual-labor-derived (set from `laborRows`), the same
  silent-failure-on-cloud-only-device shape #270 was supposed to fix for SAGE. 10+
  `if(!ds.loaded)` gates in `analytics.js` alone are unaudited (`project-sage-manual-sourcing-
  270.md`).
- [ ] Four independently-maintained reimplementations of manual-first/auto-first merge logic
  (`analytics.js`, `store-dash.js`, `smart-targets.js`, `promo-roi.js`) need a consolidation pass —
  distinct from §3's Metric Registry/Resolver unification item, which is about merging
  `signal-registry.js`/`metric-source.js`, not this (`plan-data-integrity-sweep.md`). **Cross-
  checked and confirmed still genuinely open** after a concurrent session's PR #438 characterized
  this whole source file as "not an open-item file... a completed, delivered sweep report, not
  TODOs" — read the file directly: `plan-data-integrity-sweep.md:327-331` has its own explicit
  "Deferred, not part of this (HIGH-confidence) pass" section naming this exact item, in these
  exact words: "a consolidation pass on its own, not attempted, **still open**." The file is mostly
  a delivered report, but this one item inside it is not — worth recording since another pass
  concluded the opposite from the same file.
- [ ] §4's render-storm item currently reads as fully unfixed — it's partial. The tiered loader
  batches 22→3 renders, but ~19 renders remain unbatched across other effects (IDB restore,
  `loadLaborRows` merge, 6 `org_config` syncs, email/PDF auto-ingest, cross-device sync)
  (`project-startup-render-storm.md`).
- [ ] Canonical loc-identity normalization (a single `normLoc()` at every boundary) and "make
  silence loud" (parser contracts + loaders distinguishing no-data/error/row-cap) — named
  structural fixes for recurring bug classes, explicitly marked "❌ not planned"
  (`systemic-issues-and-next-phase.md`).
- [x] ⚠️ **CORRECTED same-day — golden-dataset regression tests are NOT still unbuilt.** Originally
  cited to `session-2026-08-07-perf-and-rls.md`'s "Still open" list — that list is dated 2026-08-07
  and was never updated as its items shipped; the citing agent read the file's own stale claim
  without checking current code, the exact failure mode both PM passes exist to catch. Checked
  directly: `src/__tests__/golden-dataset.test.js` exists (157 lines, a frozen 3-store/1-week/198-
  row real-production fixture testing resolution order + aggregation, built expressly because
  "none of the 768 existing tests" covered sourcing/aggregation over real row shapes). The same
  file's other three "Still open" items are also stale-resolved: PR #93 merged (`git log`:
  `d180f33 Merge pull request #93...`), the rollup table exists (`qsr_daily_activity_rollup`,
  4 schema files + `at-a-glance.js`), service-role key rotation and the eBOS Action are addressed
  elsewhere in this backlog/CLAUDE.md. **One real residual, from the test's own header, not a new
  claim:** it can't catch a LOADER field-mapping change, only resolution/aggregation — closing
  that needs the loaders to be importable outside a browser context. `systemic-issues-and-next-
  phase.md`'s "golden-dataset tests, highest-leverage addition" framing is similarly superseded —
  the addition shipped; broadening it (more windows, more stores) is the only thing left, and nowhere
  is that specifically asked for. Caught while reconciling this backlog against a concurrent
  session's PR #438, which flagged the same file's staleness independently — cross-checked myself
  rather than taking either side's claim on the other's word.
- [x] ⚠️ **CORRECTED 2026-08-23 (dispatch #79 item 4) — this was already chased and fixed, same
  day as the evidence this entry cites.** `374-recipe-item-verification-2026-08-18.md`'s
  `{crit:27}` measurement was taken to verify PR #410 (2026-08-18). PR #411, merged **later that
  same day** (`1d3b724`, v5.062), ran exactly `dispatch-20.md` §3's prescribed discriminator
  (non-today dates, real `qsr_onhand` pull) and found a genuine logic bug: a class with zero
  active items in a store's universe fell through to `(totals[loc][c] || Infinity) * COVER_FRAC`,
  which no count can ever satisfy — 17/27 stores had `Condiment` universe of exactly 0, making
  their weekly requirement mathematically impossible regardless of what they actually counted.
  Fixed (`src/engine/count-cycle.js`'s `detectSessions()` — a zero-universe class is trivially
  "covered"), measured against the same real 7,347-row pull: crit dropped **27 → 12**, a real
  varied distribution (10 ok / 5 warn / 12 crit), 4 new tests, full writeup in
  `memory/count-cycle-condiment-bug-2026-08-18.md`. Re-verified 2026-08-23: the fix is still live
  on `main` (`if (universe === 0) return true`) and its tests still pass (41/41 in
  `count-cycle.test.js`). This backlog entry was written 2026-08-19, one day after the fix
  merged, citing only the pre-fix evidence — the same shape as the `staff_assignments`/
  `eom_count_progress_log` corrections found in the same sweep this dispatch. Nothing left to
  chase here; the 12 stores still `crit` post-fix are a real, actionable operational signal, not
  an artifact (see that file's own "not chased further, correct next thing for whoever owns Count
  Cycle rollout" note).
- [ ] Two Supabase tables written by pull scripts but never read anywhere in the app
  (`eom_count_progress_log`, `staff_assignments`), plus 12 loader functions defined but never
  called — dead-write/dead-code surface not previously flagged (`metric-inventory-2026-08-07.md`).

### Unbuilt designed features (owner-approved or fully specced, zero backlog presence)

- [ ] **"Opportunity $"** — a fully-designed flagship feature: Labor/Food/GC three-pillar
  dollar-gap-to-internal-best-in-class engine, complete formulas + UX + phasing, zero new data
  needed, no build started (`design-opportunity-dollars.md`). §1's "Profit-Leak Index" is a
  different, vaguer named idea — this one already has a real design doc.
- [ ] Events redesign (owner signed off 2026-08-11): confirm/dismiss anomaly-tagging queue (the
  core new build), a Competition/baseline-shift forecast mechanism (owner: "changes everything
  potentially" — never filed as its own issue), an LTO-asymmetry check, and a school-calendar
  LY-alignment fix (`project-events-redesign.md`).
- [ ] Food Cost / Labor enhancement set, researched and prioritized, nothing built: data-discipline
  score (Missing Waste/Counts insight cards), low-supply depletion projection, masking-detection
  surfacing, labor 3-way split (Needed→Scheduled→Actual), rate/hours/sales labor-% decomposition,
  intraday deployment heat map, role-based-routine UX organizing principle
  (`project-food-cost-labor-enhancements.md`).
- [ ] Insight ledger (findings-memory design): step 1 instrumentation shipped and returned a first
  real reading (142 distinct situations/day); step 2 (persistence table + writers, dedupe by
  situation, close the loop by re-measuring after a fix) explicitly gated on more data and not
  started (`project-insight-ledger.md`).
- [ ] EOM count-complete notifications: push/email at 90% count-completion, plus auto-dispatching
  the FOB pull on count-complete — both deferred (`project-eom-scoreboard-notify.md`).
- [ ] Printable Forms: extend from 8 pinned forms to the full ~60-form QSRSoft library (pull-filter
  widen + scored-form field renderers + self-serve "add form" button)
  (`project-forms-library-index.md`).
- [ ] Attribution-confidence state (`clean`/`contested`/`unknown`) on employee-attributed exception
  metrics, detecting register logins that don't match punch times — needs a LifeLenz punch-
  timestamp extension (raw shifts currently never stored) or QSRSoft transaction-detail
  (`attribution-validity-register-login.md`).
- [ ] Six salvage items from the Decisions Panel Inventory retirement sweep, none built: cross-
  store transfer matcher, duplicate-WRIN detector, OEPE-dollarization for slow-DT ranking,
  daypart-asymmetry detector, forecast-calibration-gap flag, "This Week's Focus" problem-type
  ranking (`decisions-panel-inventory-2026-08-10.md`).
- [ ] VLH guide-based needed-hours calculation (DAR guest counts vs `actual_punched_hours`, per
  store per hour) — `store_vlh_config` was explicitly built as its foundation; the calculation
  itself isn't built (`project-vlh-config.md`).
- [ ] Inventory Control redesign's Labor instantiation of the generic Food-Cost shell
  (owner-approved 2026-08-11, "it must host Labor too") is on hold pending an owner-run
  measurement of `qsr_labor_summary` that resolves a contradiction in what "Crew Labor %" actually
  contains (`project-inventory-control-redesign.md`, `project-labor-pct-punched-vs-crew.md`).
- [ ] Org-assignment Tier 2 — route perf-review/analysis rollups through `whoRan(loc,date)` for
  true historical attribution instead of today's flat current-map. Distinct from §7's Tier-3
  day-weighted-proration item (`project-org-structure.md`).
- [ ] FS EcoSure/Audits/Tablet scoring mechanism still genuinely open (owner: "figure out
  together + TEST," no %-of-target design yet); "2026 PACE" review template blocked pending the
  full current-year Sales/Profit/People PACE weights from the owner (only RGR weights known so
  far) (`perf-review-excel-audit.md`).
- [ ] Performance Reviews Phase 2 punch list, none of these 5 in §7: Dev Plan tab, wage-review-
  section wiring, YoY trend view, hourly-manager reviews, tag/search by score
  (`project-perf-reviews.md`).
- [ ] Labor Analysis Config tab's hours-of-operation editor is still read-only (only the
  maint/prep/lobby fixed-hours inputs are editable) (`project-labor-analysis-flh.md`).
- [ ] Lazy-fill: dedupe duplicate startup requests (`auth`/`org_config`/`user_settings`); the
  gap-scoped `(stream,loc,dateRange)` demand queue was never built beyond a simpler whole-table
  version (`project-lazy-fill-191.md`).
- [ ] Correlate the Planning/Execution over-scheduling gap against `turnover_monthly` (already
  pulled) — named as "the strongest available test" to convert the overscheduling-is-chaos-not-cost
  finding from qualitative to measured (`finding-overscheduling-is-chaos-not-cost.md`).
- [ ] Two open probes from the register-leak/cash-hunt investigation: whether `qsr_daily_activity`
  carries register-level controls back to 2025-01 (would make the theory testable pre-dating
  `cash_sheet_daily`'s 2026-07-01 floor), and probing `inventory_history` retention depth via
  `workflow_dispatch` (#257 step 0) (`finding-padding-and-cash-hunt-2026-08-13.md`).

### Status corrections to existing items

- [ ] **§7 correction:** "Op Supplies actual, Total Profit-vs-Target derivation" is listed as
  open/needs-field-confirmation — both are already shipped (v4.540/v4.541) per
  `perf-review-data-sourcing.md`.
- [ ] **§7 correction:** the Shift Manager Summary item is stale as worded — the report pull
  already shipped (v4.550). The real open item is DM/shift-role review wiring: link a review to
  `geid`, choose which manager-attributed metrics score it (`session-handoff-2026-07-28.md`).
- [ ] **§8 addition (new, from `notes-31-queue.md`/`notes-32-queue.md`):** Leadership One-Pager FL
  FOB yearly total read ~14.88% against an expected ~4% (FL) when the owner reviewed the shipped
  panel live (2026-07-28) — flagged twice, "still to confirm with owner," and explicitly deferred
  to a fresh session because Supabase egress wasn't allowlisted yet at the time. CLAUDE.md now
  records egress as resolved (2026-07-31), so this is unblocked and just needs to actually be run:
  does FL normalize over a full month/YTD range now that `fobByRange` has the `prodSalesAmt<=0`
  guard shipped in the same round of fixes? Not referenced anywhere in this backlog.

---

## 15. Security & Loss Prevention Build — 2026-08-19

**Full spec: `memory/plan-security-loss-prevention.md`.** Owner went "all in" and ran the same
research question through three AI engines (Gemini, Grok, ChatGPT) plus his own follow-up rounds;
the plan file synthesizes all three, deduplicated by mechanism, against an architecture-first
design (baselines, exposure normalization, opportunity-adjusted risk, exoneration analytics,
sequence detection, a Rules Registry schema). **Not yet scoped into engineer dispatches.**

**Not greenfield — connects to substantial existing prior art**, discovered while writing the
plan (grep `memory/` before assuming anything is new, same discipline as the two backlog review
passes): `memory/data-acquisition-shopping-list.md`'s attribution ladder already maps the data
(Register Audit — parser/table/scoring-engine all built, only auto-pull missing; an owner-approved
Any Transaction Tier A/B/C design pending one probe capture), `memory/attribution-validity-
register-login.md` already has an owner-vetted attribution-confidence design (clean/contested/
unknown) for the "which employee actually did this" problem, and `memory/project-sage-knowledge-
grounding.md`'s disclosure-gating policy (DO-and-above, mandatory handling notice) already answers
most of the access-control question this build raises. Real QSRSoft exports captured 2026-08-19
(Any Transaction, Suspicious Activity, Security Events) confirmed `Security Events` — not
previously documented — is the raw per-event log to build against, and settled that
`suspicious_activity` is QSRSoft's own pre-aggregated judgment, not raw fact.

- [x] **Phase 0a real endpoints now confirmed (2026-08-19), both halves — full detail in
  `memory/dispatch-34-phase0a-findings.md`, do NOT re-scope either question:**
  - **Register Audit** — real endpoint captured (`GET api.reports.myqsrsoft.com/reports/mcd/
    controlsCash/regAudit`, one call covers all 27 stores × a date range). The shipped scaffold's
    (`scripts/qsrsoft-register-audit-pull.mjs`) "grounded hypothesis" endpoint guess was wrong;
    real field names captured, and dispatch #35 (PR #448, 2026-08-19) implemented `mapRow()`
    against them. **Implementation DONE, independently re-verified against the real consumer
    code during PM review** (`memory/dispatch35-register-audit-implementation.md`'s "PM
    verification pass" note) — every flagged field translation checked out. **`refundCnt` DECIDED
    2026-08-20**: keep cash+cashless (owner: "need to account for all refunds," cash flagged as
    likely the higher-priority security signal — noted for Phase 1 rule design, not resolved
    there). **Live-verification attempted 2026-08-20 — both runs failed.** Direct-token auth got
    a 403 (permissions, not expiry — likely the service account's QSRSoft role lacks
    `registerAudit`) and the Playwright fallback captured no token either. Owner needs to confirm
    the service account's role; full diagnostic in `dispatch35-register-audit-implementation.md`.
  - **Any Transaction Tier A is SETTLED DEAD** — two corroborating captures (a live query with no
    exception-type filter available, and the report's own filter-options endpoint offering only
    register/manager/cashier, no transaction-type dimension). Register Audit carries all standing
    attribution as the shopping-list's own fallback plan already said. **Tier B is confirmed
    viable** — a `transaction_detail` endpoint was also captured, returning full line-item +
    tender + operator/manager detail per transaction. Camera/video linkage question (plan file §7)
    is still genuinely open — the captured detail was for a normal sale, not an exception row.
    No further Tier A design work needed; do not re-run this probe.
- [ ] **Deposit lapping — invisible in QSRSoft data, but owner is actively exploring a fix
  (2026-08-19), not a dead end.** A deposit counts as accounted the moment it's entered, so no
  detection rule against current QSRSoft-sourced data would ever fire. Owner is checking bank-data
  access; two realistic paths once banking setup is known: a bank API feed (standing, daily,
  backfillable) or manual bank-statement upload (ships faster, matches this org's manual-fallback
  pattern). Full framing: `plan-security-loss-prevention.md` §2.1's Deposit lapping row.
- [x] **Phase 4 gating questions DECIDED, 2026-08-20 (owner interview) — all three answered.**
  (1) **Retention: indefinite, not auto-expiring** — the owner's own reasoning is cross-case
  recurrence value ("one that keeps reappearing becomes more focused"), so an exonerated finding
  stays as "flagged, then cleared," never deleted. (2) **Access: Supervisor tier can identify
  employees, GM access is optional/configurable** — a real, intentional divergence from the
  general DO-and-above disclosure-gating policy, scoped specifically to this mechanism, not a
  blanket RBAC change; "optional" still needs a concrete design (per-case toggle? store setting?
  DO-granted permission?) before this is dispatch-ready. (3) **Evidence-grade: yes, build it from
  day one.** Full reasoning: `plan-security-loss-prevention.md` §5. **Still blocked on two
  prerequisites unchanged by these answers**: `project-rls-hardening-plan.md` landing, and the
  Direction B identity-vault architecture (below) landing first — ready to scope once both do.
- [x] **Fourth axis of the same gate — identity architecture (PII/pseudonymization). DECIDED
  2026-08-20: Direction B (token/identity-vault architecture).** Owner delegated on "compliant,
  ethical, most functional"; full reasoning in `memory/plan-security-pii-architecture-2026-08-19.md`
  §4. **Verified finding behind the decision, not a design guess:** `audit_rows`/
  `analyzeRegisterAudit` key and store the employee's plaintext name today, with zero
  pseudonymization or logged identity-reveal step anywhere in the pipeline
  (`src/parsers/index.js:974`, `src/utils/register-audit.js:7-8,56`). **Sequencing implication:**
  should land before/alongside Phase 1, not after — Phase 1 is the first thing that writes new
  employee-attributed data and should write tokens from day one. **Dispatched 2026-08-20
  (`memory/dispatch-37.md`)** — owner chose to build this before Phase 1. Surfaces a real finding:
  CLAUDE.md's documented 8-tier RBAC isn't actually implemented (`profiles.role` only has 3 real
  values — `admin`/`supervisor`/`manager`); the reveal mechanism's access control is grounded
  against those real values, not the aspirational DO/VP/GM ladder. Also flags that GDPR/CCPA
  (what the AI research leaned on)
  almost certainly don't apply to an FL/OK-only operation — the real compliance anchor is state
  law/HR practice, needs real verification, not further AI reasoning.
- [x] **Phase 0b IMPLEMENTED and merged, 2026-08-19 (dispatch #36, PR #451) — independently
  PM-verified before merge.** Rules Registry table + interpreter (§6 schema, `threshold`/`ratio`
  implemented, `z-score`/`sequence`/`window-function` stubbed for Phase 2/3), personal/peer/store/
  network baseline computation, exposure normalization utilities (confirmed genuinely new — no
  existing `metric-source.js`/`vs-ly.js` primitive duplicated — built following their conventions).
  **SQL run against live Supabase 2026-08-20, confirmed independently** (`security_rules`
  returns `200 []` from the anon key — RLS filtering, not a missing table; verified against a
  genuinely nonexistent table returning `404` for contrast). **Phase 0b fully done.**
- [ ] **Phase 1 MVP — unblocked for real, not yet dispatched.** cash-drawer variance + peer ranking, TvA
  inventory variance (this slice already runs on data this org has — extends existing FOB math),
  explanation surfacing built in from day one rather than retrofitted. Not yet dispatched.
- [x] **Rule-evaluation compute DECIDED 2026-08-20: scheduled batch job, not an Edge Function.**
  Owner chose "scheduled batch job, like the pull scripts" over the Edge Function/`sage-chat`
  on-demand pattern. Means Phase 1 risk scores get **pre-computed on a schedule** (a new GitHub
  Actions workflow in the `*-pull.mjs`/`*.yml` family, evaluating `security_rules` against fresh
  `audit_rows` and writing results to a new table) rather than evaluated live when a panel loads —
  this is a new *compute* pattern for this repo (every existing scheduled workflow only ever
  pulls external data, none evaluate rules/scores), not a straight copy of an existing script.
  Cadence (hourly? daily, matching the DAR/eBOS 10:00 UTC pull?) not yet decided — scope when
  Phase 1 is dispatched.

---

## Cross-file duplicates — resolve to one canonical entry before triaging

**Header restored 2026-08-19.** PR #437 (the §14 coverage-sweep) deleted this section's header
line while inserting §14 above it, leaving the list below headerless and orphaned under §14 — as
if the 9 items below were new coverage-sweep findings rather than the pre-existing cross-file
duplicate list they actually are. Content was never lost (verified via `git show c62a31b` — the
diff shows exactly one line deleted, this header, alongside 239 insertions), only its header.
Restored in place, no content changed.

The sweep found the same ask filed independently in multiple source files. Listed here so a PM
pass consolidates rather than tracks both copies:

1. **Metric Registry/Resolver/Lineage** — `notes-57` (full plan), `notes-60` (self-flagged "same
   ask as n57, don't build twice"), `notes-61` (Resolver framing + SMG defs + metric listing).
2. **Panel Manager "show everything + core list"** — `notes-25` #9, `notes-27` #7, `notes-60`.
3. **Data Manager per-source labeling** — `notes-25` #8, `notes-27` #9.
4. **Backup/disaster-recovery** — `notes-54-56` §1.3, `notes-61` deferred item, `notes-24`
   deployment §5.
5. **Google Reviews / online reputation** — `notes-54-56` §3.6 (one-line mention) superseded by
   the full `notes-59` research + build plan (§5 above).
6. **Visit Readiness "rework/rethink"** — `notes-26` #7 and `notes-60`.
7. **"Where's my data?" source catalog** — `notes-26` #3 and `notes-24` §3(a).
8. **Auto-pull migration remnants (Schedule Summary)** — `notes-54-56` §2.3 and `notes-60`
   concrete-bug #3 — same root cause.
9. **EOM qty-variance / Item Journey reconciliation** — asked in `notes-29`, `notes-30`,
   `notes-62`; partially shipped in `notes-63` (Change Monitor table only).

## Already confirmed done — strike from any future list

- **Simple Models across projection streams** — shows as open in `notes-26` #6 and `notes-28` #1,
  but is confirmed **DONE** (v4.532) per CLAUDE.md. Stale duplicate, safe to remove.

**Added by pass 1 (2026-08-19), each with the evidence that settled it:**

- **Bullseye distribution chart** (§11) — `src/views/bullseye-tile.js`, v5.012 (#274), full spec
  implemented; palette fixed in #280/#282, light mode in #298.
- **`getDOWTrend` tiny-LY guard** (§4) — `src/engine/forecast.js:642` `_yoyPoint`, both call sites,
  `src/__tests__/yoy-trend-guard.test.js`.
- **Info-icon field scraper** (§3) — v4.386/v4.387, `scripts/qsrsoft-field-scraper.mjs` +
  `scripts/parse-field-defs.mjs` → `qsr_field_definitions`.
- **Stray CloudDocs `* 2.js` duplicates** (§8) — `find` returns 0.
- **Ponce de Leon future clean-data-start** (§4) — `src/__tests__/calibrate-new-store.test.js`,
  guard in `src/engine/backtest.js`. *(Code-level only; live Dialed-In behaviour unverified.)*
  **Re-verified pass 2 — substance confirmed, citation sharpened by one line-range.** Pass 1's
  `:145, :150` is the descriptive comment explaining the guard; the operative code that actually
  computes and applies `_windowStart` is at `:201-220`. Both are real; the guard genuinely exists
  either way this is read.
- **Workstream C first slice** (§0) — not "done", but decisively **not** "never started": module,
  2 adopters, unit test, and ratchet R8 all shipped in #431/#432.

**Added by pass 2 (2026-08-19), from first-hand knowledge — then corrected same-day after
following this pass's own "grep memory/ before writing 'unwritten'" instruction, which caught
exactly the provenance mistake pass 1 made on two of its own three additions (PR #434, corrected
in #435):**

- **vs-LY young-store trap.** ⚠️ **Corrected provenance — this WAS already written down, in
  `memory/dispatch-20.md` §2 ("The vs-LY trap: a young restaurant scores well for being young"),
  which is indexed in `MEMORY.md:250` and marked "✅ DELIVERED 2026-08-18" at its own top.** First
  drafted this as "never written into any memory file the sweep covered" — wrong the same way
  pass 1's two corrected items were wrong: not in the 20-file sweep list ≠ not written down
  anywhere. `dispatch-20.md` simply isn't one of the 20 files this backlog swept, same gap pass 1
  already flagged for `pm-handoff-2026-08-15.md` and `qsrsoft-report-catalog.md`. **The finding
  itself still checks out independently:** Tishomingo (opened 2024-12-16) ranked 2nd-best of 26
  restaurants on a district traffic study purely from its own opening-honeymoon LY base;
  `firstRealTradingDate()`/`lyQuality()` added to `src/engine/vs-ly.js`, wired into `RankingView`
  so a young store renders flagged ("New store") instead of ranking as a top performer, and a
  store with no LY twin renders "no LY" instead of blank/zero/−100%. Shipped PR #411 (v5.062).
  **Actual gap this exposes:** a third memory file (`dispatch-20.md`, in addition to pass 1's two)
  is on `main`, indexed in `MEMORY.md`, and absent from this backlog's own source list — worth a
  wider `memory/` re-sweep against this file's citations before trusting any future "not mentioned
  anywhere" claim at face value, pass 1 said the same thing and it was right twice now.
- **Price-event detection engine.** ⚠️ **Same correction, same source.** `memory/dispatch-20.md`
  §1 ("Meridian cannot see a price change. That is the gap.") documents this in full — the three
  district-wide price rounds found by hand-querying `qsr_product_mix`, the 14-day-flat-both-sides
  algorithm, and the same three consumers listed below — and is marked delivered at the top of the
  same file. First drafted as "never in the sweep's source list" with the implication of being
  unwritten anywhere; correcting to: not swept, but written. **Finding still independently
  re-verified this pass, not just cited:** `src/engine/price-events.js` detects a persistent step
  change in an item's base price (14 trading days flat on both sides, distinct from a promotion),
  wired to `signal-registry.js`'s Pricing metric group (`pxDaysSince`, `pxItemsChanged`,
  `pxMeanStepPct`), `utils/events.js`'s `computeEventFactors` via `_withPriceEvents` (synthetic
  calendar events, tested in `events-price-integration.test.js`), and `store-dash.js`'s "Last price
  change" line via `lastPriceChangeByStore`. Verified against 763k real `qsr_product_mix` rows,
  reproducing an exact 14-store/13-store repricing wave split with no tuning (regression-tested in
  PR #414). Shipped PR #411 (v5.062).

---

## What pass 1 did NOT settle — read this before assuming coverage

Listed explicitly so pass 2 can target them rather than re-walk the whole file blind. These were
looked at and left unresolved **on purpose**, because code alone cannot answer them:

1. **§2 #225 viewport-scroll lock** — searched `src/meridian.css` and `src/app` for
   `overscroll-behavior` / `touch-action` / scroll-lock idioms and found nothing conclusive. The
   item's own text says devtools emulation is insufficient, so this needs **a real phone**, not a
   deeper grep. Unchanged.
2. **§10 Swing Watch "Acknowledged" placement** — the acknowledge *mechanism* exists
   (`src/app/App.js`, `src/__tests__/swing-feed.test.js`), but the ask is specifically about
   **placement at the top of Needs Attention**, which is a rendering-order question this pass did
   not trace to a conclusion. Do not read the mechanism's existence as the item being done.
3. **§4 District View 14-item punch list** — a compound item; individual sub-claims were not walked.
4. **Every ❓ owner-decision item** across §2, §5, §6, §7, §9, §10, §13 — these are decisions, not
   code states. Grep cannot close them and pass 2 shouldn't try.
5. **Anything requiring a live Supabase read** — `qsr_fob` RLS (§4), FOB Analysis May-2026 cap
   (§4), `store_assessments` counts (§12). The anon key returns zero rows under RLS; **a zero is
   not absence**, and this repo has burned two sessions on exactly that inference before.

---

## How to use this file

Two PM review passes have now run, sequentially, re-verifying status against actual code (not
assumption) and correcting the checkboxes/status tags above. **Both are complete as of
2026-08-19.**

**Corrected 2026-08-19 (pass 1):** an earlier draft of this section described the two passes as
owning **disjoint sections** and running **concurrently**. That is not what happened. **Both
passes cover the ENTIRE file, and they ran SEQUENTIALLY** — pass 1 verified and merged, then pass
2 ran a full independent pass over the same whole file, partly to sanity-check pass 1's
conclusions and partly because pass 2 carried first-hand knowledge of work it personally built or
measured. Pass 2 branched off `main` after pass 1 (and pass 1's own follow-up correction PR #434)
had landed.

**Pass 2 is done — summary in the "PM review pass 2" section above.** Two corrections were made:
a pass-1 verdict (§2 white-alpha ratchet ceiling — pass 1 compared against a stale ceiling value;
the underlying count was actually right), and pass 2's own first attempt to add two "unwritten"
items, which turned out to already be documented in `memory/dispatch-20.md` — corrected in place
under "Already confirmed done" once found via a full `memory/` grep, the same fix pass 1 applied
to its own PR #434. No other pass-1 conclusion was found wrong on re-check. One first-hand
sharpening of an existing item was added (§0 Workstream G / labor-allocation panel).

**For anyone reading this file going forward:** lines carrying `(re-verified pass 1)` or a pass-2
citation were checked against real evidence and found genuinely open (or genuinely done, if ✅).
Lines with no annotation from either pass were **not** individually settled by either review and
should not be read as confirmed in either direction — a third pass, or whoever picks up a specific
item, should still verify it against code before acting on its current status tag alone.

**Targeted `memory/` coverage sweep (2026-08-19, PM, after both passes) — result: no new items
found, closing the recurring gap both passes hit.** Both passes independently discovered real
content in memory files the original 20-file sweep never covered (`pm-handoff-2026-08-15.md`,
`qsrsoft-report-catalog.md`, `dispatch-20.md` — all indexed in `MEMORY.md`, all on `main`). Rather
than run a third full re-verification pass, this was a bounded, mechanical check: every memory
file matching the same "handoff/session/plan"-shaped profile as those three, that was **not** in
the original sweep's file list, checked directly for open content. Five files matched the profile
(`handoff-data-refresh-sprint.md`, `handoff-smarttargets-graded-accuracy.md`,
`plan-data-integrity-sweep.md`, `session-2026-08-07-perf-and-rls.md`,
`session-handoff-2026-07-28.md`) — all five checked individually, not sampled. **Every open item
found in them is either already resolved (confirmed via `git log`/file existence: PR #93 merged,
`golden-dataset.test.js` exists, `qsr_daily_activity_rollup` exists, the "NOT STARTED" Smart
Targets multi-projector shipped in 3 layers per `vision-and-roadmap.md`) or already captured
elsewhere in this file** (service-role-key rotation traces into `project-rls-hardening-plan.md`,
already covered by §13's "Security sweep" pointer; the UI/UX items are already in §2).
`plan-data-integrity-sweep.md` turned out not to be an open-item file at all — a completed,
delivered sweep report with documented scope decisions, not TODOs. **This does not prove no other
file was missed** — it closes the specific hypothesis both passes raised (files in this
handoff/session/plan shape), not every possible gap. If a future pass finds another item claiming
"not previously written down," the standing instruction (grep `memory/` before trusting that
claim) still applies.
