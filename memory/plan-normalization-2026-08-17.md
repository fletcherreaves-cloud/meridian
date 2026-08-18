---
name: plan-normalization-2026-08-17
description: The normalization plan — lift Meridian's hand-rolled mechanisms to industry standards (forecast precompute, query layer, event model, pipeline contract, design-system adoption, routing, shift-dimension join) plus the role-based voice principle and owner advisory notes. Sequenced behind Phase 0.
metadata:
  node_type: memory
  type: plan
---

# Normalization plan — 2026-08-17

Owner-directed, afternoon of 2026-08-17. Everything here is **planned and staged, not started.**

**Live artifacts (the detail lives here, this file is the durable index):**
- Architecture standards — https://claude.ai/code/artifact/639f1cf3-0146-4f41-80aa-f1faf73de7df
- Interface audit — https://claude.ai/code/artifact/63d6d472-113e-45b4-b9e7-672a55d224df
- Structural audit (Phase 0 origin) — https://claude.ai/code/artifact/2d9e73fa-7979-4741-a3ff-5769d462d159

---

## ⛔ SEQUENCING GATE — read before starting anything below

**Nothing in this plan starts until:**
1. Phase 0's ratchets are merged (R1/R3/R4 + R6, already landed), and
2. The open PR queue is merged **and verified** — #373, #374, #376, #377, the calendar fix, #392.

**Stated risk, owner-acknowledged:** architecture work is more interesting than finishing #374's post-migration verification, and interesting work displaces necessary work quietly. **The plan is not the priority; the queue is.** Anyone reading this before the queue is clear should close it and go merge something.

---

## The framing that produced all of it

Six bugs on 2026-08-17 were hand-rolled solutions to problems with standard answers, and each failed the way its category is known to fail:

- calendar event loss = a **cache-coherency race**
- `sales_ledger_daily` silence = a **pipeline with no assertion on what landed**
- 4.3s modal close = **computation in the wrong place**

**None are Meridian problems. They are categories.**

---

## Workstream A — move the forecast off the render path ⭐ HIGHEST RETURN

**Measured:** `weekProjections` = **76,503 ms of 82,221 ms** of render time (**93%**), 189 `forecastDay` calls per run (27 stores × 7 days), 14 runs. Every other instrumented span combined is under 1.6 s. Closing a modal costs up to **4.3 s**.

**Standard:** precompute where the data lives; the client fetches an answer, not inputs.

**The pattern already exists here twice** — `qsr_daily_activity_rollup` is exactly this, and `forecast_snapshots` already exists as a table. Forecasts simply never moved.

**Migration:** a scheduled job writes the week's projections per store; the panel reads them. **`forecastDay` is unchanged** — it becomes the job's engine rather than the render path's. Zero forecasting-logic change is what makes this safe.

**Do this FIRST of the workstreams.** It is the prerequisite for Workstream B not regressing performance (see the interaction warning there), and it converts routing from a performance rescue into a clean UX change.

Tracks: **#386**, **#369**, **#261** (which this re-scopes — the redesign is *not* the gate on the performance fix), **#256**.

---

## Workstream B — event model: scope + recurrence, expand on read

**Owner's idea, and it is the right one.** Currently 2,651 events materialise into **11,163 per-store day-entries** — 27 copies of Thanksgiving.

**Two distinct compressions, not equally valuable here:**

| Compression | Collapses | Fit |
|---|---|---|
| **Scope** (owner's proposal) | 1 event → 27 stores | **Dominant.** This is the 27× factor. |
| **Recurrence** (RFC 5545 / RRULE) | 1 rule → N dates | Good for holidays + retail windows. **Wrong for football fixtures** — a dated list, not a rule. |

**Design:** one event row + scope (`all` / `OK` / `FL` / store list); expand only the visible window; **materialise only exceptions** (the RFC 5545 model). `RETAIL_EVENT_RULES` already proves the recurrence half works — six rules generating Black Friday across years. The mistake was freezing its output.

**Open design questions, decide before code:** per-store overrides (where does an edited Thanksgiving live), and holding rule-based *and* plain dated events cleanly in one schema.

> ⚠️ **INTERACTION WARNING.** Production currently runs `weekProjections` against **733** event entries because the calendar bug discards the rest. Once fixed and normalised it processes ~11,000 — **fifteen times more per run.** The calendar fix can ship a *slower* app. **Workstream A lands first, or the two are measured together.**

Tracks: **#388**.

---

## Workstream C — pipeline contract

**Three silent successes on 2026-08-17 alone:** pmix backfill wrote 0 rows and exited 0; email parse ran green for **30 consecutive runs** while `sales_ledger_daily` produced nothing; `catch{}` swallowed the calendar write. Different scripts, one missing contract.

**One shared runner module every script calls, owning three things:**
1. **Assert on what was written, not that it finished.** Zero rows over a window that should contain data → exit non-zero. #393 does this for pmix; it belongs to all 24.
2. **Per-partition counts in the log** — per store, per date. A 4-of-27 partial becomes visible instead of averaging into a plausible total.
3. **Freshness SLA per source** (`warn_after` / `error_after`), matched to real cadence. #171's insight applied at the pipeline rather than the panel.

**Plus idempotent partition replace** (Workstream C2): today's backfill pushed ~2.6M upserts and took Supabase into Cloudflare 522s, collapsing three sibling workflows and the SQL Editor. Standard is delete-then-insert per date partition, paced. Makes re-runs cheap and multi-year backfills routine.

Tracks: **#263**, **#336**, **#360** (whose real question is still open: *why did 30 green runs write no ledger rows?*).

---

## Workstream D — adopt the design system that already exists

**The finding that reframed the whole request: the design system is built, correct, and used by 1 of 55 modules.**

`src/components/PanelControls.js` exports `DateRangeControl({ presets, value, onChange, allowCustom })`, `DATE_RANGE_PRESETS`, `isValidCustomRange`, `LocationSelector`, `buildLocationHierarchy`, `ActionMenu(s)`.

| Control | Adoption |
|---|---|
| `DateRangeControl` | **0 / 55** |
| `LocationSelector` · `ActionMenus` · `PanelChrome` | **1 / 55** (`eom-dashboard.js`) |
| `ModalShell` | 9 / 55 |

**It is not merely written — it is *right*.** Its own comment records that trailing ranges end on the last **closed business day**, never a naive "yesterday," and it calls the shared `lastClosedBusinessDay()` helper because *"this bug has already recurred five separate times from hand-copies."* **Every panel that rolled its own date logic is a candidate for a bug this component already solved.**

**What got built instead:** 7,163 inline `style:{…}` objects · 3,702 hardcoded px font sizes · 27 bespoke `<input type="date">` · 413 "Last N" label literals · 61 distinct "no data" strings · 8 of 55 panels accept the app's `dateRange` prop.

**Why adoption failed** (matches the literature exactly): the compliant path costs more than the workaround, and **tokens exist in CSS but 7,163 inline JS styles bypass them** — which is the single root of #351, #368, #287, #306.

### How to land it — this part decides whether it works

1. **Make the compliant path cheapest FIRST.** If adopting `DateRangeControl` takes an afternoon per panel, it loses again.
2. **Convert two panels by hand** — one simple, one awkward. The awkward one reveals what the component is missing; **fix the component, not the panel.**
3. **Ratchet the bypass, not the adoption.** Seed at today's counts, only allow them to fall: inline styles, hardcoded sizes, bespoke date inputs. Same mechanism as Phase 0.
4. **Convert opportunistically, never as a sweep.** Any panel already open for a bug gets converted in that PR.
5. **Write the panel contract down** — every panel declares date mode, scope mode, actions, empty-state reason.

### Date-mode rule (the rule matters more than the component)

| Mode | Use when |
|---|---|
| **Presets only** | The window is part of the method; changing it invalidates the comparison (backtests, trailing diagnostics) |
| **Presets + custom** | Default is a preset but an arbitrary window is legitimate (most analysis panels, EOM exports #365) |
| **Period-anchored** | The unit is a business period, not N days (EOM, Projections, monthly targets) |

Today the mode is an accident of who wrote the panel. It should be a stated property of what the panel is for.

---

## Workstream E — routing vs modals

App.js is already a hybrid: three routed views (`command`/`district`/`store`) plus many modal panels. Which one a panel got was an accident of when it was written.

**Measured consequence:** `view==='command' && !anyModalOpen && h(AtAGlance,…)` means **opening any modal unmounts the panel underneath**, so closing remounts from scratch — the 4.3 s `✕` cost. The modal architecture is directly implicated in the worst interaction cost measured.

**The rule (owner-endorsed):**
> **Route** anything that is a *destination* — a panel you go to, work in, and might return to or share.
> **Modal** anything that is an *interruption* — confirm, pick, log, quick-edit.

**Test that settles almost every case: "would I ever want to send someone a link to this?"** Yes → route.

By that rule most current modals are misclassified — DI Compare, Projections, Forecast Accuracy, Date-Range Report are destinations implemented as overlays.

**Biggest win:** shareable URLs. *"Here's Duncan's labor view for last week"* as a link to a supervisor is impossible today. Also: one layout contract (kills the size inconsistency by construction), one scroll behaviour, working back button, mobile, and route-level code splitting which fixes #232 as a side effect.

**Sequence:** after Workstream A and before the broad panel conversion in D — converting 55 panels to a shell that is about to change would be doing it twice.

---

## Workstream F — role-based voice ⭐ THE OWNER'S OWN PRINCIPLE

**Owner, verbatim intent (2026-08-17):** he is more comfortable with complex data than the vast majority of eventual users; the information *"needs to be able to be presented to an average user at a level to which they will actually understand and act upon it."* And explicitly: **preserve the analytical depth — this is BOTH, not a replacement.**

**The distinction to build around:**
> **An analyst needs a number. An operator needs a decision.**
> *"Labor 21.4% vs 22% target"* → a number.
> *"Labor's fine. Your 11–1 is short 1.5 hours — pull someone off close."* → a decision.

Same data, different product. The second requires knowing which gap matters and what to do — **exactly the judgment the owner has and the audience doesn't.** Presenting it as a metric wastes it.

**The trap is "simplify the UI"** — that loses the analysis the owner needs. This is **audience segmentation, not simplification**: same engine, different surfaces.

**The mechanism already exists: RBAC.** Today roles gate *access* but not *presentation*. **Role should determine the voice, not just the visibility.** GM → a sentence and one action. DO/Supervisor → patch view. Owner/Developer → the full instrument. One computation underneath.

**Reframe worth considering: for a GM, SAGE may be the primary interface and dashboards the drill-down.** A paragraph that says what to do beats a panel showing what happened, for someone on a phone mid-shift.

**Evidence the gap is real** (all from 2026-08-17): Count Cycle said *"No complete weekly count on record"* to a store that had counted · DI Compare says *"Not Dialed-In is better — recalibrate"*, an instruction to a modeller · the Signals Scanner surfaces Pearson r, Spearman and Benjamini–Hochberg FDR.

**Standard to adopt:** every surface answers **"so what do I do?" in its first line.** If it can't, it is an analyst surface and should be labelled as one.

**Test it empirically, not by opinion:** hand it to someone and see whether they take the right action without being told.

---

## Workstream G — join the third dimension: **who was on the shift**

**Owner-directed 2026-08-17**, in answer to *"one opportunity, best advice, something we haven't discussed."*

Meridian pulls and stores three dimensions. Two of them are joined everywhere and the third is joined to almost nothing.

| Dimension | Where it lives | Grain | Joined to outcomes? |
|---|---|---|---|
| **Where** | every `(loc, dt)` table | store | ✅ everywhere |
| **When** | `hour_slot` (24 slots), daypart — **32 files**, a whole DAR Analysis panel | hour | ✅ everywhere |
| **Who** | `employee_skills`, `roster_role_counts`, LifeLenz shifts, Shift Manager Summary | person / shift | ❌ **almost nowhere** |

**Measured, 2026-08-17 — the capability is built and unused, not missing:**

- `rollupShiftsByEmployee()` — `src/engine/lifelenz-shift-jobs.js:124`. Maps shifts to people. **Its only caller is its own test** (`src/__tests__/lifelenz-shift-jobs.test.js:81`).
- `SHIFT_ATTRIBUTABLE_ROLES = ['AM','DM','SM']` — `src/engine/review-engine.js:14`, with a comment naming these as the roles whose results attribute to their own shifts. Referenced in **one panel**, `performance-reviews.js` — a twice-a-year artifact.

**So nothing on the daily operating surface knows who was standing there.**

### Why it matters

Every panel answers *what happened at a restaurant*. A restaurant does not run a shift; a person does. "3708's drive-thru is slow" is not coachable — nobody can act on a building. "3708's DT is fine at breakfast and comes apart 5–8pm, Tuesdays and Thursdays" is a conversation with a named person about a named shift.

This is **Workstream F one level deeper**: F fixes the *wording* (say the decision, not just the number); G fixes the *dimension*. A number attached to a building is rarely a decision, because a building cannot change.

It is also the one thing the incumbents structurally cannot do — QSRSoft owns the outcome data, LifeLenz owns the people data, and **neither owns both.** Meridian has both in one database and currently joins them nowhere.

### ⛔ Constraints — these shape the design, they are not footnotes

1. **Attribute to the SHIFT, not the person — at least first.** Daypart × day-of-week × store captures most of the value with none of the HR exposure. `scripts/qsrsoft-employee-roster-pull.mjs:10` states *"No individual-employee data is stored anywhere"* — that was a considered choice; **keep it.** Surface the pattern, let the human take the last step.
2. **Small n.** A shift manager works ~20 shifts a month. Any per-person metric on that base is mostly noise. Apply the discipline already in Scanner — effect-size floor + FDR — not a naked ranking.
3. **The confound is real.** Good managers get assigned to hard shifts. A naive ranking punishes exactly the people worth keeping.

**Build it as pattern surfacing, never as scoring.** That is also the version that survives being seen by the people it describes.

### The probe (cheap screen, run before committing to the workstream)

**PROBE G-1 is a screen, not the answer.** It measures whether *within-store* variation exists at all — necessary for a person to have anything to explain, not sufficient to prove people cause it. If a store performs identically across its own week, G is dead and costs nothing further.

Full SQL: `memory/probe-g1-shift-dimension.sql`. Verdict rule:

- `median_within_store_spread` **≥** `between_store_spread` → the dimension is real; build G.
- Within **< ~half** of between → stores are uniformly good or bad across their own week; **drop G.**

### Findings from writing the probe (already banked, independent of the verdict)

- **`qsr_daily_activity` carries hourly speed-of-service for every station** — `dt_untilserve`/`dt_trans_cnt`, `fc_*`, `mfy1/2_*`, `bev_*` — **and `actual_punched_hours` at the same `hour_slot` grain.** Outcome and labor are already on one row, at one key. The join G needs does not require a new pull.
- **Unit defect found and fixed (same commit).** `constants.js:521-529` documented 8 DT timing fields as **microseconds** ("divide by 1,000,000"). Every shipped consumer divides by **1,000** — `graded-visits.js:47` `secOf`, and six sites in `dt-speedofservice.js` including that panel's own tooltip. Milliseconds is correct (µs would put DT total time at 0.18s). The field-definition table is **user-visible**, and it is exactly what a person writing a new query would trust — this probe nearly shipped 1000× wrong off it.

---

## What NOT to do

Optimisation is a candidate list, not a mandate. These cost more than they return:

- **No framework migration.** Next.js / RSC / SSR solve problems a single-operator internal tool doesn't have.
- **No Redux or global client store.** Nearly all state here is *server* state; a query layer covers it.
- **Don't split the pulls into services.** 24 scripts sharing one runner is right.
- **Don't replace the click-trace.** Homegrown, and it produced the single most actionable measurement of the week. **Keep it.**
- **Don't chase TypeScript.** Real benefits, but this week's recurring defects were data-flow and lifecycle bugs types would not have caught. The ratchets address the actual classes far cheaper.

---

## Advisory notes to the owner — recorded because they are easy to lose

Context: 33 years in the industry, every position inside a McDonald's environment short of ownership, DO experience plus maintenance programs, strong record growing sales and guest counts. Building solo, partly by design.

1. **The asset is not the app.** Every competitor renders dashboards. Nobody else has 33 years of knowing which numbers mean something, **encoded as executable rules** — `COVER_FRAC = 0.75` backed by a measured bimodal distribution, the Topic 6 catch, the 4am business day, punched-vs-crew labor. The panels are a delivery mechanism. Protect and invest accordingly.

2. **Nobody is measuring whether any of it changed a store's performance.** Everything is validated for *correctness of measurement*. The loop — insight → action → outcome vs counterfactual — is not closed. This is the question BI products live or die on and it is almost always unmeasured. Best positioned to close it because he controls the operation *and* the instrument.

3. **The bus factor is him, and the mitigation is not the code.** Memory files are organised around **projects**, not **decisions**. A successor could read the code and never learn *why* 0.75, why punched labor, why Wednesday weeks — the things that look arbitrary and get "cleaned up." **A decision log is a different artifact.** Ten one-page entries (decided / rejected / evidence / what would change our mind) preserve more than a hundred project notes.

4. **Solo is defensible; name the trade.** The corrections register is full of the PM's errors and the owner's corrections. **Who corrects his premises?** The PM is agreeable by construction — a good check on arithmetic and consistency, a poor substitute for a peer with skin in the game. **The strongest argument for a second operator is epistemics, not revenue.** Before more multi-tenant work: is that operator real and committed, or aspirational? If aspirational, defer multi-tenancy hard.

5. **The vacation test.** 27 restaurants, 24 scheduled pulls, expiring tokens, one maintainer. **Can he be unreachable for two weeks?** Today a token expiry and a Cloudflare wobble both needed him. Raises the priority of **#312** (runtime token minting) for sustainability reasons, not engineering ones.

6. **What happens when a wrong number reaches someone else.** Four confidently-displayed wrong numbers found on 2026-08-17. In his hands, recoverable. In a GM's, a wrong labor target is a real decision about a real person's hours. **Before a second user: state which numbers are load-bearing, which are directional, and how the app itself says which is which.**

7. **The analytical output may be worth more than the software.** The McValue brief is a document no other operator in that room can produce. Applied to growth applications, lease conversations and FBP forums, that may be the highest-value thing the project generates. **Treat it as a strategy, not a byproduct.**

8. **The curse of knowledge is structural, not personal.** He cannot un-know the 4am business day, so every judgment he makes about "is this clear?" is made by someone who cannot experience the confusion. **The only reliable mitigation is empirical: watch a GM use it and don't help.** Not "is this clear?" — watch where they stop, scroll past, misread, never click. That single hour beats any amount of design theory and is the one validation unavailable from data or from the PM.

---

## Recommended order

1. **Finish Phase 0 + the open queue.** (Gate — see top.)
2. **Workstream A** — forecast off the render path.
3. **Workstream B** — event normalisation (now safe).
4. **Workstreams C + C2** — pipeline contract; independent of the front end, can run in parallel.
5. **Workstream E** — routing rule, before the broad panel conversion.
6. **Workstream D** — design-system adoption, opportunistic + ratcheted.
7. **Workstream F** — role-based voice, once the shell is stable.
8. **Workstream G** — shift dimension. **Gated on PROBE G-1**, which can run any time (it is one read-only query and depends on nothing above).

The query-layer item from the standards artifact (server state ≠ client state) is deliberately last and starts only when something above forces the question — **never as a rewrite.**
