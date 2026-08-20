# Meridian Project Memory — Master Index

> Read this to discover what's documented. **Newest work is at the top.** When resuming a
> session, read the most-recent handoff first, then the relevant thread files.

## 🛑 BEFORE YOU THEORIZE ABOUT DATA — these questions are already answered

**Added 2026-08-16 because rediscovery, not bugs, was the largest single cost of that day's work.**
Three separate re-derivations in one day, each of an answer already sitting in this directory:
`#243` re-proposed from scratch what `#327` then built (four days apart, same two atoms); a PM
day-boundary theory was written into CLAUDE.md and refuted an hour later by a file from 08-07; and
`#330`/`#331` were filed twice, twelve seconds apart, by two agents who couldn't see each other.

None of that was carelessness. **`dar-vs-ops-reconciliation.md` was not in this index** — 43 of 124
memory files weren't. The answer existed and nothing pointed at it.

| If you are about to ask… | Read this FIRST | It already says |
|---|---|---|
| "Has the June McValue price increase been separated from the McValue traffic effect?" | [analysis-mcvalue-price-waves-2026-08-18.md](analysis-mcvalue-price-waves-2026-08-18.md) | **Yes — measured 08-18.** Price alone costs −1.17 to −1.46 pp of the full-window OK decline (gated, band-widened after a non-zero placebo). The clean six weeks (B1–B3, −3.14 pp) need no correction at all — lead with that number, not the full-window one |
| "Is the DAR aligned to the 4am business day?" | [dar-vs-ops-reconciliation.md](dar-vs-ops-reconciliation.md) | **Yes — measured 08-07.** `hour_slot` runs `05:00→28:00` = 04:00→04:00. Boundary RULED OUT as the cause of DAR-vs-Ops deltas. Also: deltas are ~0.01% **only on days with a complete 24 slots** |
| "Which labor % basis do we use, and does it include managers?" | [project-labor-pct-punched-vs-crew.md](project-labor-pct-punched-vs-crew.md) | Standardized on **Punched (all-hourly)** so FL and OK compare like-for-like. Crew Labor % silently includes salaried-manager $ where a store is configured that way (**FL is, OK isn't**). *"Read before touching any labor-basis code"* |
| "What's the 4am cutover helper?" | `src/utils/date.js:101,117` (code, not memory) | `businessDate()` / `lastClosedBusinessDay()`. Consolidated after recurring **five times** as signature #4 — see [plan-data-integrity-sweep.md](plan-data-integrity-sweep.md). Never re-derive inline |
| "Can I verify this from a sandbox session?" | [feedback-verification-in-sandbox.md](feedback-verification-in-sandbox.md) | The working Playwright/Chromium recipe, the CORS hard stop, and the merge-resolution class the suite does NOT catch |
| "Is this metric averaged correctly?" | [weighted-rollup-audit.md](weighted-rollup-audit.md) | Full average-of-averages sweep — what was fixed, what was already right, what was left alone and why |
| "Does the hourly projection have a known bias?" | [project-hourly-projection-accuracy.md](project-hourly-projection-accuracy.md) | Corroborates the 4am/`hour_slot` mapping independently (`:81`) |

**The discipline this encodes:** CLAUDE.md's *"check whether an affordance already exists before
adding one"* covers code. It applies just as hard to **explanations**. Search `memory/` and
`src/utils/` before writing a mechanism into any durable doc — the grep that refutes you costs
seconds, and the theory that survives one costs a PR.

## ⭐ READ FIRST — latest handoff & vision
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [30 WRINs with broken expected-usage mapping — a data-hygiene work list](project-inventory-data-hygiene-2026-08-20.md)** —
  **NEWEST.** The answer to the analysis file's open (a)-vs-(b) question, and a genuinely valuable
  by-product. **It is (a) — the ruler is bent, decisively.** The top-30 items by median TvA
  variance are a catalogue of hard-to-count/unit-ambiguous stock (bag-in-box syrups, FCB mixes,
  bulk condiments, sprinkle-quantity freeze-dried toppings) plus **packaging in mid-promo
  transition** (`BIG MAC CRTN/2026 SUMMER BRAND`, `10PC NGT/2026 SUMMER BRAND REL`, McCrispy
  carton/pouch). Three independent tells: the magnitudes are **impossible as shrink**
  (`BREADED CHICKEN BREAST STRIP` at a **798% median** = actual usage ~8× expected, i.e. a
  unit-of-measure or recipe-coefficient error); many items show at **all 27 stores every period**
  (loss concentrates, this is uniform); and QSRSoft's own Inventory Analysis Report has dedicated
  topics for exactly this failure class (3/5/6/7 — items not in a recipe, duplicate WRIN
  suffixes, inactive-but-in-active-recipe, incomplete recipes). **Not a suspect list — a
  data-quality work list**, and its value isn't confined to the security build: `exp_usage`
  feeds FOB reporting, the EOM workflow, count-cycle completion, and the Inventory Analysis panel,
  so everything downstream inherits the error. Fix is mostly **QSRSoft config, not Meridian code**.
  Includes a triage order (chicken strips first — a rollout whose recipe was likely never set up),
  a **corrected query** (the original over-counted via a period fan-out: `store_count` read up to
  108 = 27 stores × 4 periods, *not* 108 stores; medians unaffected), and a recommended stopgap to
  **deactivate `INV-001`/`INV-002`** until dispatch #42 lands, so nobody works a queue of 2,603
  measurement artifacts and loses trust in the system on first contact. **Standing caveat:
  "predominantly measurement error" is not "entirely" — real loss can hide in a noisy signal.
  Do not cite this as evidence that inventory loss is absent.**
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Evaluating the first real detection run — the 21% median question](analysis-inventory-variance-baseline-2026-08-20.md)** —
  The first *business* read of the security build's output, as opposed to dispatch
  #42's calibration read of the same run. **INV-001's measured median is 21.25% variance across
  5,165 live store-item observations — 4–7× the plan's own §2.2 flag guidance of ">3–5%"**, which
  is itself the synthesis of three independent industry research passes. Median, not tail. Two
  explanations with *opposite* correct responses: (a) `exp_usage` isn't a trustworthy baseline in
  this org's data and/or counting practice is noisy — in which case **threshold tuning is the
  wrong response entirely**, you'd be calibrating an instrument against its own noise; or (b) real
  widespread inventory loss, in which case it's the most important operational finding this build
  has produced. **Explicitly NOT established as fact** — the median is uncontrolled for a known
  confound (low-volume items structurally inflate percentages; ~190–200 items/store means a long
  tail likely dominates), which makes dispatch #42's exposure floor a *prerequisite for
  measurement*, not just noise-suppression. Two concentration queries in the file separate (a)
  from (b): a measurement problem is uniform across stores, an operational one concentrates.
  **Also identifies a real gap in both shipped rules:** plan §2.2's own strongest-named signal is
  variance *"not matched by a corresponding waste-log entry"* — and `qsr_variance_stat` already
  carries `raw_waste`/`comp_waste` (`schema.sql:1367-1368`), loaded by the batch job on every run,
  used by neither rule. Buildable today with no new data source, and would be the build's first
  implementation of plan §1 principle 4 (exoneration — a rule that searches for its own
  counter-evidence). Scope as `INV-003` after #42.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #42 — make security detection baseline-relative + calibrate from measured data](dispatch-42.md)** —
  **Phase 1/1b is LIVE** — all three schema files run against production 2026-08-20 and
  the batch job completed a real `workflow_dispatch` run: `10330 finding(s) upserted across 6
  rule(s), 0 error(s)`. This dispatch acts on what that run actually produced; every number in it
  is measured from live `security_findings`, not guessed. **Reordered 2026-08-20 before being
  dispatched to anyone** — an earlier draft led with threshold recalibration; that was wrong.
  Writing `analysis-inventory-variance-baseline-2026-08-20.md` surfaced why: **a z-score against
  peer stores for the same item is robust to the "bent ruler" problem, and absolute thresholds are
  not.** If `exp_usage` is systematically wrong for item X it's wrong for all 27 stores equally, so
  a store-relative comparison cancels that bias out while an absolute threshold inherits it whole.
  So the z-score work is valuable *regardless* of how the measurement-validity question resolves,
  and threshold tuning is entirely *contingent* on it. Corrected order: **Step 0** — run the
  analysis file's two concentration queries first (cheap, read-only) to establish uniform (bent
  ruler) vs concentrated (real signal); **§3, the main deliverable** — implement `z-score`;
  **§4** — threshold work, scoped by Step 0's answer (if uniform, demote both to permissive
  materiality floors rather than invest in false precision); **§5** — a minimum-exposure
  floor, unconditional, since it's a *prerequisite for measurement* not just noise-suppression.
  **§5 widened 2026-08-20 from INV-001 to every rule with a denominator**, for two reasons: the
  engine already guards the denominator at a single shared choke point
  (`security-rules.js:65,74`), so the general version is the *simpler* build than special-casing
  one rule around it; and the cash rules stopped being starved that day — #487 fixed the Register
  Audit pull and landed **9,947 rows across 27/27 stores**, so CASH-001..004 fire on their next
  scheduled run having never run against real data, and the owner's value check found the same
  tiny-denominator signature there (172 T-Reds per transaction, a $318 avg check). An inventory
  false positive wastes an afternoon on a WRIN; a cash false positive puts a **person's name** in
  an investigation queue — and unlike INV-001/002, the cash rules are `active = true` with no
  protection. §5a records that the cash *mapping* is verified sound (zero rows dropped; `ratio()`
  and the manual parser's `parsePct()` agree on scale; nothing reads the stored `_pct` columns),
  so a future session doesn't re-litigate it.
  The measured facts behind it: INV-001's threshold (20) sits **below its own median (21.25)** so
  it flags 50.4% of everything, while INV-002's (10) is **~77× its own maximum (0.13)** so it can
  never fire — and INV-002 is **not** a broken join, `null_value: 0` proves the `qsr_fob` join
  works, only the constant is wrong. **The core gap — `baseline_type` does not currently drive
  detection at all.** Both rules declare
  `baseline_type:'store'` and the batch job computes and persists a real baseline into
  `baseline_context`, but `evaluateRule()` never reads it (`security-rules.js:104-106` is a flat
  `cmp(value, threshold)`). So the rules answer "is this rate absolutely high?" — meaning an
  inherently high-variance item flags at **all 27 stores forever** — instead of the plan's actual
  §1-principle-2 design, "is *this store* unusual *for this item* vs peers." This dispatch
  implements the `z-score` LOGIC_TYPE stubbed since dispatch #36 (baseline passed via an additive
  `{loc, baseline}` opt; **both call sites need reordering** — they currently call `evaluateRule()`
  before computing the baseline), with honest nulls for zero-stdev/insufficient-n/absent-baseline
  and an absolute materiality floor retained alongside the z-score (unusual-vs-peers is not enough
  on its own: 3σ on $4 of variance is worthless). Not yet implemented — this is the dispatch brief.
  **Outranked in priority by a data blocker outside its scope:** `CASH-001`–`CASH-004` produced 0
  findings because `audit_rows` stops at 2026-06-30 against a 28-day window — the Register Audit
  pull has been failing since the same-day 403, leaving half of Phase 1 inert.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #41 — reconcile the two Model Health Score implementations, dispatched](dispatch-41.md)** —
  Not a security-build item — a separate, independently-discovered live correctness
  bug (`backlog-master-2026-08-19.md` §4). `modelHealthScore` and `computeModelHealth`
  (`forecast.js:847`/`:1868`) share the same 30/25/25/20 rubric shape but diverge for real —
  different day-thresholds, different MAPE-window priority, **and one function can never hit a
  true zero on 3 of 4 components** (verified line-by-line: `computeModelHealth`'s floors are
  6/3/5/3, `modelHealthScore`'s are all 0) — meaning a store dead for 900 days still banks 17/100
  points in one of the two. Both render **on the same store page, at the same time**
  (`store-analytics.js:1758` and `:1804`), so a user can see two disagreeing scores stacked
  vertically for one store. Also found a shared, independently-verified dead-field bug: both
  check a `settings._fp`/`settings._settingsFp` fingerprint that's **never assigned anywhere in
  the app** (grepped confirmed) — one function's version of this always fires its penalty, the
  other's never does. **Owner explicitly asked for external industry due diligence before
  finalizing this** (the same discipline the loss-prevention build used — ACFE/CISA/NIST, not
  reasoning from scratch) — research (43 cited sources: M4/M5 forecasting-competition methodology,
  AWS SageMaker/Vertex AI/Evidently/Arize/WhyLabs model-monitoring conventions, FICO/SLA/NPS
  composite-scoring precedent, SRE burn-rate alerting) confirmed the floor-masking bug is a known,
  named failure mode every recognized model-monitoring platform avoids, and surfaced a real,
  **deliberately deferred** finding: MAPE's asymmetry is real and industry practice has moved to
  WAPE, but `mape6w`/`mape4w`/`mape2w` are shared infrastructure computed once in
  `backtest.js`'s `_computePeriodMape` and consumed by `at-a-glance.js`/`analytics.js` too, with
  "MAPE" in rendered UI labels — swapping the underlying metric is a real, separate,
  higher-blast-radius dispatch, not a rename bundled into this one. This dispatch fixes the true
  bug (reconcile to one implementation, true-zero floors, a weakest-link override gate, the
  dead-field check, and wiring a red grade to actually default the store to the Simple/trailing
  model per this project's own v4.483 finding) without touching the shared MAPE computation.
  Persisting the score as a versioned time-series (also research-grounded, real gap: today it's
  recomputed live on every render with zero history) is flagged as a separate future dispatch, not
  bundled in. Not yet implemented — this is the dispatch brief.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #40 — security build Phase 1b, inventory-domain TvA rule, implemented](dispatch40-inventory-tva-rule.md)** —
  **NEWEST, implemented, awaiting PR merge (same PR/branch as #39).** The follow-through on the
  correction below: `INV-001` (item-level TvA variance rate, store baseline, plan §2.2's own
  formula, single-table) and `INV-002` (dollar-variance rate normalized against sales, store
  baseline — denominator is a real `qsr_fob` join, NOT `qsr_variance_stat.pct_sales`, whose
  semantics are unconfirmed from this sandbox). Subject is `(loc, wrin)`, never an employee —
  `storeBaseline()` is the only baseline function usable here (`personalBaseline`/`peerBaseline`/
  `networkBaseline` all hard-require `emp`). `security_findings` needed **zero migration** —
  dispatch #39 built its nullable-`emp_token`/co-equal-`wrin` shape in anticipation of this exact
  dispatch, before the table ever went live, off a same-day PM heads-up. `scripts/security-rules-
  run.mjs` extended with a second rule-type branch (still one job, one loop): `mapVarianceStatRow`
  (`date: r.period`, NOT `period + '-01'` — a real string-comparison correctness point, see the
  writeup), `joinStoreMonthSales`, `computeItemFindingsForRule` (same-item-only baseline
  population). Condiment-class rows excluded from BOTH rules uniformly. 11 new tests, 1663/1663
  suite passes. No UI, no recipe/BOM pull (confirmed not needed — `exp_usage` already IS the
  theoretical figure). Original brief: [dispatch-40.md](dispatch-40.md), superseded by the
  implementation writeup above.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #39 — security build Phase 1, real cash-domain rules, implemented](dispatch39-phase1-cash-rules.md)** —
  **NEWEST, implemented, awaiting PR merge.** First dispatch in this build with real,
  `ACTIVE=true` output — everything before it was substrate. **Phase 1 as shipped is cash-domain
  only** (the TvA-exclusion theory was corrected same-day, see the entry above — TvA data exists
  and is already pulled, what's missing is employee attribution, a real Phase 2/3 follow-up, not
  a permanent cut): `supabase/schema-security-rules-phase1.sql` activates `CASH-001`/`CASH-002`
  and adds `CASH-003` (manual-refund rate, personal baseline, opportunity_factor=true) and
  `CASH-004` (promo/discount rate, peer baseline, opportunity_factor=false — examined, not
  assumed; threshold 100=10% is measured from `register-audit.js`'s own existing `discPct` amber
  band, not invented). `supabase/schema-security-findings.sql` — the first output table,
  token-keyed (`emp_token`, never plaintext `emp`), full explanation breakdown stored as jsonb,
  RLS gated to the same tier as `reveal_employee_identity()`, no write policy at all (service-role
  only). `scripts/security-rules-run.mjs` — the new scheduled batch job (this repo's first
  *compute* workflow, not a pull), own field mapping (does not import the browser-oriented
  `loadAuditRows()`), scheduled 11:00 UTC (one hour after the audit pull it depends on). **A real,
  non-obvious behavior found and verified by test**: an untokenized employee can never be a
  finding's *subject* but their row still anonymously contributes a rate to peers' baseline
  populations (`personalBaseline`/`peerBaseline` group by raw name, unmodified) — correct, not a
  bug, documented explicitly. A real test-fixture bug (missing `data_required`, silently zeroing
  every assertion) was caught by running the suite and fixed before it shipped. 13 new tests,
  1652/1652 suite passes. No UI — mirrors the #37→#38 split; a findings-viewer is the recommended
  next dispatch. Original brief: [dispatch-39.md](dispatch-39.md), superseded by the
  implementation writeup above.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #38 — reveal-UI for the Register Audit panel, implemented, PR #465 superseded, 2026-08-20](dispatch38-reveal-ui.md)** —
  The `RevealName` component: click → required reason (`window.prompt`, matching
  `eom-dashboard.js`'s established pattern) → `reveal_employee_identity()` (dispatch #37's RPC,
  completely unmodified — no role-gating/logging duplicated client-side) → cached, shared-state
  reveal lifted to `RegisterAuditTab` so one reveal resolves everywhere in the same panel view.
  Wired into 4 mechanical table-cell sites + 5 narrative-paragraph sites that needed real
  restructuring (`text` changed from a flat string to a mixed string/`RevealName`-element array).
  A real, separate bug found and fixed along the way: `AITabInsight`'s AI-prompt builder still
  read `.emp`, a field dispatch #37 already removed — silently stale to always `'?'` since PR
  #459 merged; now reads `e.id`, deliberately still not wired to reveal (no click target).
  **PM verification caught something real before merge**: the implementing session's own PR
  (#465) carried a stale copy of `supabase/schema-identity-vault.sql` and
  `memory/dispatch37-identity-vault.md` that would have **reverted the same-day
  `reveal_employee_identity()` anonymous-bypass security fix** (see the incident entry below) —
  almost certainly a local checkout that predated that fix, landing in the same commit as the
  unrelated dispatch-38 UI work. Rather than merge PR #465 as-is or wait on that session (idle/
  disconnected at the time), the genuine dispatch-38 diff was extracted and independently
  re-applied on top of the current, already-fixed `main` — full suite (1639/1639) and build
  reverified clean against that combination, not against PR #465's own claim. **PR #465 is left
  open as a stale draft — do not merge it**, its schema/memory-file changes are a regression.
  9 new tests (7 component-level + 2 integration, the integration test mounting the actual
  `RegisterAuditTab` consumer per CLAUDE.md's "would this verification still pass if reverted"
  rule — proving the prop-threading landed at all 9 call sites, not just that the component works
  standalone). Full writeup: [dispatch38-reveal-ui.md](dispatch38-reveal-ui.md); original brief
  [dispatch-38.md](dispatch-38.md).
- **✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅ [Backfill script logged "0 rows updated" for all 449 employees — CLOSED, live data confirmed clean, 2026-08-20](incident-backfill-count-undercount-2026-08-20.md)** —
  First live run of `scripts/backfill-identity-vault.mjs` printed `449 distinct
  untokenized employee name(s) found` / `449 token(s) resolved` / **`0 row(s) updated`** — an
  internally inconsistent result (zero successes, zero failures, 449 attempts) that was treated as
  a signal to verify, not a clean exit code to trust. Root cause confirmed by reading the actual
  installed `@supabase/postgrest-js@2.108.2` source, not assumed from memory of the API: `count`
  belongs in `update(values, {count})`'s own second argument; the script instead tried
  `.select('*', {count:'exact', head:true})` chained *after* `.eq()/.is()`, which resolves to
  `PostgrestTransformBuilder.select(columns?)` — a different method whose real signature only
  takes `columns`. The `{count,head}` object was silently dropped (plain `.mjs`, no TS
  enforcement), so no count header was ever requested and `updated += count||0` added 0 every
  time — while the underlying `PATCH` requests (zero reported errors) most likely still succeeded.
  **Most likely real outcome: the 449 writes actually happened and only the log was wrong** — but
  this is inferred from library source, not yet confirmed against live data. Fixed in the repo
  (`count:'exact'` moved to `update()`'s own options, the broken trailing `.select()` removed).
  **Confirmed live the same day**: owner ran the read-only SQL check —
  `tokenized: 21929, still_untokenized: 0`. All 449 employees' rows were actually updated on the
  first run; the "0 rows updated" line was purely the broken log, never a failed write. Closed.
- **🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨 [SECURITY INCIDENT — reveal RPC anonymous role-gate bypass, found + fixed same day, 2026-08-20](incident-reveal-rpc-null-role-bypass-2026-08-20.md)** —
  `reveal_employee_identity()` (dispatch #37's vault, PR #459) shipped with a
  PL/pgSQL `NULL`-role trap: an anonymous caller's `get_my_role()` is `NULL`, and
  `NULL not in ('admin','supervisor')` evaluates to `NULL` — which an `ELSIF` with no trailing
  `ELSE` treats as "skip," not "reject." Result: a fully anonymous caller (public anon key, no
  login) fell through the entire role gate and reached the token→name lookup. **Found live** by
  probing production directly with the anon key (per CLAUDE.md's "measure it, don't reason about
  it" — the PR's own verification had read the function's logic and judged it correct, but never
  adversarially probed it), **not by re-reading the code**. This was caught the same session the
  owner ran `scripts/backfill-identity-vault.mjs` for the first time (so real names were freshly
  in the vault) but **before** dispatch #38's reveal UI exists for any user to have discovered a
  real token through — no confirmed real-name disclosure, full reasoning in the incident file's
  "Actual exposure" section. **Fixed same day**: role gate restructured so the reject path is an
  unconditional trailing `ELSE` (a `NULL` condition can never skip an `ELSE`), plus an explicit
  `revoke execute ... from anon` (a second, distinct finding — `revoke ... from public` alone did
  not stop the anon key from invoking the function at all). Owner ran the hotfix live; **re-
  verified live with the same anon-key probe, confirmed closed** — the exact same call now
  correctly returns `"role none is not permitted to reveal identities"` instead of reaching the
  lookup. `supabase/schema-identity-vault.sql` updated to match. **Standing lesson: a security-
  sensitive `SECURITY DEFINER` function needs a live adversarial probe as part of its own
  verification — a correct-looking code read is not enough.** Full incident writeup, including an
  open/unconfirmed hypothesis about a possible project-wide default-privileges gap worth auditing
  later, in the incident file itself.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #38 — reveal-UI for the Register Audit panel, dispatched](dispatch-38.md)** —
  2026-08-20. **NEWEST.** Follow-up to dispatch #37: the vault retrofit deliberately stripped
  plaintext names from `analyzeRegisterAudit`'s output ("blind mode," working as designed), which
  left `store-analytics.js`'s Register Audit panel showing `'Unknown'`/`'?'` at every one of its
  10 display sites with no way for an authorized viewer to see who's being flagged. This dispatch
  closes that the way Direction B intends: a shared `RevealName` component (click → reason prompt
  → `reveal_employee_identity()` RPC → cached, shared-state reveal), wired into 4 easy table-cell
  sites and 5 harder narrative-paragraph sites (string → mixed string/element array restructuring)
  in `RegisterAuditTab`/`RegisterAuditNarrative`. The 10th site (`AITabInsight`'s AI-prompt
  builder) is explicitly excluded — no click target, out of scope. Not yet implemented by an
  engineer — this is the dispatch brief, scoped directly against the real code (not from memory).
  **Prerequisite, owner-side, not blocking this dispatch's code:** run
  `supabase/schema-identity-vault.sql` (sent via SendUserFile) and then
  `node scripts/backfill-identity-vault.mjs` against live Supabase — until then the vault has no
  real token↔name data for the reveal RPC to return.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [RLS anonymous-access question fully CLOSED — three live measurements, 2026-08-20](project-rls-hardening-plan.md)** —
  **NEWEST.** The "92-107 tables wide open to anonymous access" figure repeated across this
  backlog and `plan-security-pii-architecture-2026-08-19.md` was real (a correct grep of
  committed SQL text) but measured the wrong thing — source text across superseded schema files,
  not live database state. Three live, read-only diagnostics against production (all owner-run
  same day) settle it completely: (1) the anonymous-access gap is already closed at the policy
  level via a separate, already-applied multitenant migration (`tenant_id = current_tenant_id()`,
  which correctly rejects anonymous callers — a first pass misread this diagnostic's own headline
  number as "70 open policies" before actually inspecting the `WITH CHECK` clauses, corrected
  same session, before it went further than a chat message); (2) the one real, literal
  `using(true)` found (`qsrsoft_kb`) is already known/intentional; (3) **all 87 tables in
  `public` have RLS enabled — zero exceptions, confirmed against the full table list, not a
  sample.** `project-rls-hardening-plan.md`'s own Phase 1 (closing the anonymous hole) is
  **DONE**, shipped via the multitenant migration rather than that plan's own design. **Phase 2
  (`can_see_loc()`, per-loc isolation) genuinely has not shipped** — the one real piece of that
  plan's original scope still open, separate from the anonymous-access question. Full correction
  chain: `project-rls-hardening-plan.md`'s own correction note at the top of that file.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #37 — identity-vault architecture (Direction B), merged](dispatch37-identity-vault.md)** —
  2026-08-20. **NEWEST, merged (PR #459), independently PM-verified before merge** — the schema/
  RPCs, the shared JS helper, both write-path wirings, the `analyzeRegisterAudit` retrofit, and
  the backfill script were all read directly and diffed against the claims, not taken from the
  summary. One correction from the relayed summary: `store-analytics.js`'s affected panel only
  ever reads `.emp`, never `.id`, so the real behavior is uniformly `'Unknown'`/`'?'` — never a
  raw token surfacing in the UI (the PR's own memory doc already had this right; only the chat
  summary was imprecise). **Recommended next dispatch: a reveal-UI wiring a button into those 9
  sites**, calling `reveal_employee_identity()` per-click with a required reason — not yet
  dispatched. Owner chose to build this before Phase 1, per the plan's own sequencing note.
  `supabase/schema-identity-vault.sql`: `employee_identity_vault`
  (token↔name, zero RLS policies for any role) + `identity_reveal_log` (append-only, admin-read-
  only, indefinite retention, no update/delete policy at all) + `audit_rows.emp_token` (additive,
  PK/`emp` untouched) + two `SECURITY DEFINER` RPCs — `get_or_create_employee_token()` (the shared
  write path, safe to expose broadly, never returns a name) and `reveal_employee_identity()` (the
  ONE path to a real name: admin/supervisor always, manager gated on an explicitly-flagged
  org-wide placeholder toggle, reason required, logged before returning). All role checks use the
  real `admin`/`supervisor`/`manager` values only, per the dispatch's own RBAC finding.
  `src/engine/identity-vault.js` (`getOrCreateToken`/`tokenizeRows`, one RPC call per distinct
  name) wired into both `saveAuditRows()` twins + `loadAuditRows()`; `scripts/backfill-identity-
  vault.mjs` for existing rows (owner-run, not run from this session). `analyzeRegisterAudit`
  retrofit: `e.id` is now the token, no plaintext name survives in the return value anywhere.
  **A real conflict found and flagged, not silently resolved**: `store-analytics.js`'s
  RegisterAuditNarrative panel reads `.emp` directly at 9 sites to display names — this dispatch's
  own "no UI" scope leaves those showing `'Unknown'`/tokens until a follow-up reveal-button
  dispatch, an anticipated cost of Direction B's "blind mode" property, not accidental breakage.
  28 new fixture tests. Original brief: [dispatch-37.md](dispatch-37.md), superseded by the
  implementation writeup above.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Security build — six owner decisions in one morning, 2026-08-20](plan-security-loss-prevention.md)** —
  2026-08-20. Every open owner-gated question on this build got answered in one sitting —
  read `plan-security-loss-prevention.md` §4/§5 and `plan-security-pii-architecture-2026-08-19.md`
  §4 for full reasoning, not just the list below:
  1. **Identity architecture: Direction B** (token/identity-vault) — owner delegated on
     "compliant, ethical, most functional," B wins all three. Should land before/alongside
     Phase 1. Not yet scoped into a dispatch.
  2. **Phase 4 retention: indefinite, not auto-expiring** — explicitly for cross-case recurrence
     value ("one that keeps reappearing becomes more focused"); exonerated findings stay as
     "flagged, then cleared," never deleted.
  3. **Phase 4 access: Supervisor tier + optional GM** — a real, intentional divergence from the
     general DO-and-above disclosure-gating policy, scoped to this mechanism only. "Optional" for
     GM still needs a concrete design (per-case toggle? store setting?) before dispatch-ready.
  4. **Phase 4 evidence standard: evidence-grade from day one.** Phase 4 is now fully design-
     decided but still blocked on RLS hardening landing + Direction B landing first.
  5. **`refundCnt`: keep cash+cashless** (the richer auto-pull definition) — owner wants all
     refunds counted, cash flagged as the likely higher-priority signal for Phase 1 rule design.
  6. **Phase 1 rule-compute: scheduled batch job**, not an on-demand Edge Function — a new
     compute pattern for this repo (every existing scheduled workflow only pulls data, none
     evaluate rules).

  **Also: both live-run attempts of the Register Audit pull failed, 2026-08-20** — direct-token
  auth got a 403 (permissions, not expiry — likely the service account's QSRSoft role lacks
  `registerAudit`, cross-referenced against dispatch #34's SSO capture), and the Playwright
  fallback logged in but never captured a token (report page likely needs a UI interaction, not
  just navigation). Owner needs to confirm the service account's role; full logs in
  `dispatch35-register-audit-implementation.md`.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Phase 0b's SQL run, confirmed — Phase 1 unblocked for real, 2026-08-20](plan-security-loss-prevention.md)** —
  **NEWEST.** `supabase/schema-security-rules.sql` run against live Supabase — verified
  independently, not taken on the owner's word: `security_rules` returns `200 []` from the anon
  key (RLS correctly filtering an unauthenticated request), contrasted against a genuinely
  nonexistent table returning `404 PGRST205`. **Phase 0b is fully done. Phase 1 is unblocked, not
  yet dispatched** — next up is either Phase 1 itself or the Direction B identity-vault
  architecture (§4, `plan-security-pii-architecture-2026-08-19.md`), which the plan's own
  sequencing note says should land first since Phase 1 is the first thing that will write new
  employee-attributed data.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #36 — Security build Phase 0b: the substrate, implemented](dispatch36-security-phase0b-substrate.md)** —
  2026-08-19. **Merged (PR #451), independently PM-verified before merge** — interpreter
  logic, baseline math, and the `org_config` RLS pattern-match were all checked line-by-line
  against real code, not taken from the summary; the "no existing normalization helper" claim was
  independently re-grepped and confirmed. Phase 1's actual fraud-detection rules
  are gated on this landing first (`plan-security-loss-prevention.md` §1: "do not start by coding
  individual fraud rules... a rule written before this substrate exists will need to be rewritten
  once it does"). Part 1: `supabase/schema-security-rules.sql` (`security_rules` table, §6's
  schema field-for-field, `org_config`'s RLS shape + `tenant_id`) + `src/engine/security-rules.js`
  (interpreter — `threshold`/`ratio` implemented, `z-score`/`sequence`/`window-function` stubbed
  not thrown) + 2 `ACTIVE=false` seed rules from §2.1 as test fixtures. Part 2:
  `src/engine/security-baselines.js` — `exposureRate()` (the per-$1,000/per-1,000 normalization
  primitive) + `personalBaseline`/`peerBaseline`/`storeBaseline`/`networkBaseline`, each a
  distribution not a blended number, built fresh (confirmed `metric-source.js`/`vs-ly.js` have no
  existing rate-normalization primitive to extend) but following their dollar-weighted/honest-null
  conventions. `peerBaseline`'s same-store cohort is a documented data-limitation proxy for the
  plan's ideal role/daypart/tenure/volume-band grouping — `audit_rows` doesn't carry those columns
  yet. 22 new fixture tests, 2 of which round-trip the seed SQL's exact `logic_expression` JSON.
  No UI — data-layer + interpreter only, per the dispatch's own scope. Original brief:
  [dispatch-36.md](dispatch-36.md), superseded by the implementation writeup above.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #35 — Register Audit implemented, PM-verified](dispatch35-register-audit-implementation.md)** —
  2026-08-19. **NEWEST, merged (PR #448).** Phase 0a is now code-complete — `mapRow()` implemented
  against dispatch #34's confirmed endpoint, resolved field-by-field against the actual consumer
  (`analyzeRegisterAudit`) rather than guessed. **Independently re-verified during PM review, not
  rubber-stamped**: every load-bearing mapping claim (`drawerGC`=`transactions`, five unconsumed
  pct/avg fields, `manualRefAmt` vs `posOverAmt` staying distinct) checked out against `main`'s
  real code. **One real, non-blocking finding from that review: `refundCnt` semantics diverge**
  between manually-uploaded rows (cash-only, by construction) and auto-pulled rows
  (cash+cashless) — not risk-scored today, flagged for resolution during the still-needed
  live-verification pass (no session in this build's history has had real QSRSoft credentials).
  **Two things remain before this data is trusted**: live-verify against a real API response, and
  resolve the `refundCnt` drift. Neither blocks starting Phase 1 (cash-drawer variance + peer
  ranking), but both should close before Phase 1's output is treated as reliable. The original
  dispatch instructions are [dispatch-35.md](dispatch-35.md) — superseded by the implementation
  writeup above, kept for the record of what was asked.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Security PII/identity architecture — logged, not decided](plan-security-pii-architecture-2026-08-19.md)** —
  2026-08-19. Owner follow-up research (Grok/Gemini/ChatGPT) on how security apps
  handle employee PII, checked against a **verified** current-code finding: `audit_rows`/
  `analyzeRegisterAudit` store and key on the employee's **plaintext name today, with zero
  pseudonymization or logged identity-reveal step anywhere** (`src/parsers/index.js:974`,
  `src/utils/register-audit.js:7-8,56`). Two directions laid out (extend the existing role+subject
  disclosure gate with a logged reveal, vs. a real token/identity-vault architecture) — **not
  decided**, added as a fourth axis to `plan-security-loss-prevention.md` §5's existing owner-gated
  decision. Reviewers named: Fletcher Reaves (owner). Also flags GDPR/CCPA likely don't apply to
  this FL/OK-only operation — needs real HR/counsel verification, not more AI reasoning.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #34 — Phase 0a live-capture findings](dispatch-34-phase0a-findings.md)** —
  2026-08-19. **NEWEST.** Follow-up to dispatch #33 (below): the owner captured real DevTools
  sessions settling both of #33's open pieces. (1) Register Audit's real endpoint + field names are
  now confirmed — the shipped scaffold's endpoint guess was wrong; `mapRow()` implementation is the
  remaining work, with a translation table of confirmed vs. still-uncertain field mappings. (2) Any
  Transaction Tier A is **settled dead** (two corroborating captures: no exception-type filter
  exists anywhere in the API or its own filter-menu endpoint) — Register Audit carries all standing
  attribution; Tier B is confirmed buildable via a newly-found `transaction_detail` endpoint.
  Bonus: QSRSoft's own SSO role model was captured, informing a pending Meridian settings request
  (Operations Manager/DO/AS tiers, see Backlog Master §14). Full context:
  [plan-security-loss-prevention.md](plan-security-loss-prevention.md).
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #33 — Security build Phase 0a](dispatch-33.md)** —
  2026-08-19. Two ungated, already-scoped tasks: (1) Register Audit auto-pull —
  parser/table/scoring-engine all already exist, only the QSRSoft pull itself is missing (today
  manual-Excel-only) — **scaffold shipped (PR #444), implementation pending real-endpoint data now
  in dispatch #34 above**; (2) one Any Transaction capture filtered to an exception type, to settle
  the owner-approved Tier A/B/C design's one open question — **settled in dispatch #34 above, do
  not re-run.** The engineer's own writeup of what shipped and what blocked them (no QSRSoft
  credentials/egress in that sandbox) is [dispatch33-register-audit-pull.md](dispatch33-register-audit-pull.md)
  — superseded by dispatch #34's real capture for the endpoint questions, still useful for the
  scaffold/save-path implementation notes.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Backlog Master — 2026-08-19](backlog-master-2026-08-19.md)** —
  One consolidated, de-duplicated backlog assembled from a sweep of 20 memory files
  (`project-backlog.md`, `plan-backlog-and-redesign-2026-08-15.md`, `notes-24` through `notes-66`)
  plus the normalization plan and `vision-and-roadmap.md`. **Status update:** two full PM review
  passes have since run **sequentially** over the whole file (not concurrently/disjoint-sectioned,
  despite an earlier draft of this note saying so), plus a targeted coverage sweep and two
  follow-on correction rounds (PRs #433–#440) — see the file's own "How to use this file" section
  for the real history. §15 (Security & Loss Prevention Build) and notes-67's IA-reorg items were
  added 2026-08-19, same round as dispatch #33.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #32 — Workstream C: pipeline contract, wired](dispatch32-pipeline-contract.md)** —
  2026-08-19. **DELIVERED same day** (v5.072, squashed into PR #431) — the last of the 7
  normalization workstreams to ship real code. **Corrects both this dispatch's and #25's own
  "2/19 scripts guarded" measurement**: that grep missed `scripts/lib/pull-outcome.mjs` (PR #269,
  pre-existing) — a separate shared module already imported by **8** scripts, already
  implementing assert-on-zero-rows. Real prior adoption was ~40% (8/20), not ~10%. New
  `scripts/_pipeline-contract.mjs` correctly does NOT duplicate that piece — it only adds the two
  genuinely-missing pieces (unconditional per-partition coverage logging, a freshness SLA
  checker), shipped as pure functions matching `_retry.mjs`'s convention. Two hand-conversions on
  the highest-stakes daily pulls (`lifelenz-pull.mjs`, `qsrsoft-dar-pull.mjs`) — the freshness
  threshold on `lifelenz-pull.mjs` directly targets the CLAUDE.md-cited 6-day silent outage class,
  at the source this time. New ratchet **R8** tracks the remaining 18 scripts, seeded fresh.
  C2 (idempotent partition replace) explicitly deferred, tracked under #336, not dropped.
  **`memory/dispatch-32.md` (the PM re-verification that preceded this) is now superseded — kept
  for the record with a correction notice at its top, not as current guidance.** Independently
  verified: 1584/1584 tests pass, build clean, all claims (the 8/20 count, CEILING=18, the
  pre-existing `pull-outcome.mjs`) reproduced directly against the code by a separate PM pass.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #31 — real click trace corrects dispatch #27, finds a bigger
  problem](dispatch-31.md)** — 2026-08-19. **Instrumentation shipped same day**
  (PR #431, v5.070) — queried `forecast_week_cache` live and found **100% coverage, all 27
  stores, for the entire current business week**, ruling out incomplete cache coverage as the
  cause of the unexplained 66%. New `count()` export in `click-trace.js` (an untimed tally —
  `mark()`'s 1ms floor would silently drop a cache-hit count) reports
  `weekProjections:storeCacheHit`/`storeCacheMiss` per render; new `_mark()` spans wrap the
  three previously-uninstrumented setup blocks (`eventFactors`/`cacheIndex`/`cloudActualsIndex`)
  and both per-day branches (`cacheReadDay`/`liveForecastDay`) so the next real click-trace
  session sees exactly which bucket the remaining cost sits in. Purely additive, no computed
  value changed. Full trace: [dispatch31-weekprojections-instrumentation.md](dispatch31-weekprojections-instrumentation.md).
  Still needs a real-browser `?clicktrace=1` run to actually populate these marks — the sandbox's
  in-browser `fetch` to Supabase fails even though server-side reads work (same limitation
  dispatch #27/#29 already hit). Real Mac Mini click trace on v5.069 —
  the exact real-data verification both dispatch #27 and #29 flagged as unmeasurable from the
  sandbox. **Correction**: dispatch #27's "the 4.3s modal-close figure almost certainly dropped"
  is refuted — modal-close (`✕`) is **32 clicks, avg ~1453ms, total 46,497ms, 52% of all
  long-task time** in the session. The Workstream E route-panel back button (`←`) costs the
  **same** per click as a modal close (~1435ms avg) — routing gave 4 panels URLs, it did not
  reduce the remount cost for them. **Bigger, unanticipated finding**: `compute:weekProjections`
  (Workstream A's target) is only **34%** of `AtAGlance`'s own render cost (22,499 of 65,715ms
  self-time) — the other **66% (43,216ms) has no named span**, meaning either cache coverage is
  incomplete across the district's 27 stores right now, or the cost has moved to uninstrumented
  work (event factors, cloud-actuals indexing, React reconciliation/DOM commit) that caching
  never touched. Recommends instrumenting the cache-hit rate directly (`at-a-glance.js:1575`)
  before assuming either cause. `AtAGlance` render+commit is 92% of all React work measured in
  the session (65.7 of 71.7s).
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #30 — Workstream D follow-up](dispatch-30.md)** — 2026-08-19.
  **DELIVERED same session** (v5.071) — both hand conversions done: `labor-allocation.js`
  (the "awkward" one — its dead `!embedded` standalone-modal branch, hand-rolled backdrop and
  all, converted to `ModalShell`) and `report-subscriptions.js` (the "simple" one — converted to
  `ModalShell` **and** `LocationSelector`, with a small `scope`↔`{level,id}` adapter so the
  persisted string shape never changes). New ratchet **R7**
  (`ratchet-modal-backdrop-bypass.test.js`) seeded at a freshly-measured **78** (independently
  reproduced, not copied from any prior estimate) — bidirectional, catches both a new hand-rolled
  backdrop and a stale-high ceiling after a future conversion. The panel contract deliverable is
  written: [panel-contract.md](panel-contract.md) — shell (`ModalShell` for modals,
  `RoutePanelShell` for `route:true` panels, nothing else rolls its own), grounded in the two real
  conversions rather than speculated. Full trace: [dispatch30-workstream-d-followup.md](dispatch30-workstream-d-followup.md).
  D was dispatched (#26) but never started — checked, no PR touches
  `PanelControls.js` adoption and no bypass-volume ratchet exists. The one thing that changed:
  D's blocker (Workstream E's routing decision) **cleared** — E shipped in PR #426, but not into
  one unified shell as D expected; `ModalShell.js` now also exports `RoutePanelShell` as a
  deliberate **second** shape (route panels replace the view, no backdrop/centering; modals
  overlay it) — D's "one layout contract" now has to name both, not unify them. Re-measured
  adoption fresh (56 panels now, `labor-allocation.js` added): `DateRangeControl` 0/56,
  `LocationSelector`/`ActionMenus` 1/56, `ModalShell` 9/56, `dateRange` prop 8/56 — zero movement
  across two more merged workstreams. **Freshest proof**: `labor-allocation.js`, merged this same
  session, uses **none** of the shared components — rolls its own modal shell and tab styling from
  scratch, live evidence the compliant path still isn't the cheapest one. Recommends it as one of
  the two hand-conversions (multi-tab + custom shell = the "awkward" one), alongside D's original
  five-step sequence, unchanged otherwise.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #29 — Workstream G: join the third dimension (who was on the
  shift)](dispatch-29.md)** — 2026-08-19, the last of the 7 workstreams.
  **DELIVERED same day** (PR #428, v5.069) — `labor-standard.js` wired into a new "Labor
  Allocation" tab (Scheduling hub): District/By Store/Overnight views, TPPH extended to hour_slot
  grain (`dt_trans_cnt`-denominated, kept separate from `METRIC_SOURCES`' daily `tpph` chain
  rather than force-fit into it), Overnight tab classifies open-vs-closed first and shows both the
  schedule-config and data-driven signals per store rather than picking one. Also found & fixed a
  real bug while wiring: `loadDailyActivityRange()` was missing `total_scheduled_hours` from its
  `select()` entirely — every future caller would have gotten `null` for `scheduledVsGuide`/
  `punchedVsScheduled` forever. Full trace: [dispatch29-labor-allocation-panel.md](dispatch29-labor-allocation-panel.md).
  Open items, stated plainly in the PR: real-data verification against live Supabase needs a
  session with real browser+auth access; the 1,716-hr pre-open-hours Breakfast correction isn't
  yet folded into this panel's own gap figure. Unlike A–F, G's finding is already **proven** by
  five owner-run probes
  (`plan-normalization-2026-08-17.md` G-1→G-5) — this dispatch grounds what's built vs. what's
  wired up, not what's proposed. `src/engine/labor-standard.js` (the engine behind the proven
  allocation finding — deficit −20,485/−14,207 corrected, surplus +32,701, 1.6× coverage — in
  `analysis-labor-allocation-2026-08-18.md`) **exists, is tested, and has zero callers outside its
  own test** — the #366 failure mode, a *third* time this session. TPPH auto-sourcing from the DAR
  is **partially done**: daily-grain via `qsrActSummaryRows` is already live in
  `metric-source.js:133`, but the hour_slot-grain TPPH the daypart analysis (G-3/G-4/G-5) actually
  needs is still probe-SQL-only, not an app metric. `rollupShiftsByEmployee()` remains unwired,
  unchanged since 2026-08-17 — and per the workstream's own constraints, should **stay** unwired
  for this first slice (attribute to shift, not person). Gives the engineer a concrete 3-step task:
  wire `labor-standard.js` into a panel (gated by `overnightOpenness()` — never rank TPPH/speed
  across open and closed stores on one axis, the G-5 "killer pair" mistake), extend TPPH to
  hour_slot grain, leave person-level for later. Also flags an unresolved open/closed classifier
  disagreement (Ardmore-Cooper/12th vs. Freeport) a real panel should show both sides of, not pick.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #28 — Workstream F: role-based voice](dispatch-28.md)** — 2026-08-19.
  **DELIVERED, first slice** (PR #426, v5.068) — Visit Readiness's `topDrivers` extended with a
  `buildVerdict()` one-line decision (food-safety risk prioritized over readiness band), wired into
  the panel's default collapsed row, both printable reports, and `attention-feed.js`'s `visitRisk()`
  (now reads the same verdict instead of re-deriving its own generic text, so the two surfaces can't
  disagree). Count Cycle and DI Compare — the dispatch's own two evidence strings — explicitly
  deferred as next slice, not forgotten. Full trace: [dispatch28-voice-by-role.md](dispatch28-voice-by-role.md).
  Grounds the plan's "role should determine voice, not just visibility"
  premise: both cited evidence strings (`count-cycle.js:235` "No complete weekly count on record",
  `analytics.js:6895` "Not Dialed-In is better — recalibrate") still reproduce unchanged.
  `src/engine/permissions.js` confirmed access-only (boolean toggles, zero presentation fields) —
  the plan's "gates access not presentation" claim holds exactly. The one working precedent is
  SAGE's role framing (`sage-chat/index.ts:690-698`), but it's a binary supervisor/not-supervisor
  branch that only steers LLM prose, not a finished pattern to copy onto a deterministic panel.
  **New scoping fact:** the DB only enforces **3** roles (`schema.sql:13` — `admin`/`supervisor`/
  `manager`), not the 8-tier ladder CLAUDE.md's RBAC table conceptually lists — no tracked migration
  adds `developer` or the other five values, so voice tiers should target the 3 real roles, not the
  aspirational 8. Flags Morning Brief (the plan's own "best next home") as still metric-only
  (zero decision-shaped language, grepped), and `visit-readiness.js:419`'s existing "Top risk
  drivers" ranking as the cheapest near-miss to extend into a decision line — it already computed
  *which* gap matters, the hard half of the problem. Reiterates CLAUDE.md's own "Voice by role"
  standing rule is binding already, not new scope to propose.
- **⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #27 — Workstream E: routing vs modals](dispatch-27.md)** — 2026-08-19.
  **DELIVERED** (PR #426, v5.067) — the four flagged panels (DI Compare, Forecast Accuracy,
  Projections, Date-Range Report) are now URL-synced routes (`?panel=`) via new dependency-free
  `src/app/routing.js`, replacing their `showX` modal state; `panel-registry.js` gets a `route:true`
  field on exactly those four, ratcheted by `panel-registry.test.js` so a fifth requires deliberate
  choice. Verified in a real browser via Playwright (deep links, back/forward, in-panel back).
  Full trace: [dispatch27-routing-vs-modals.md](dispatch27-routing-vs-modals.md). Open item: the
  4.3s remount re-measurement still needs a session with real auth (the dev sandbox's bypass can't
  populate real `ds`). Confirms the plan's hybrid routing architecture is unchanged in current
  `App.js`: a `view` state var plus `anyModalOpen` (`App.js:2486-2489`) that unmounts the
  background view behind any open modal. DI Compare, Forecast Accuracy, and Projections are still
  modals; "Date-Range Report" is registered `kind:'nav'` but still opens as a modal. **Correction**:
  the unmount-on-modal-open behavior is not an accident — `App.js:2470-2485`'s own comment records
  it as a deliberate v4.212 perf fix (AtAGlance kept recomputing while hidden), so the plan's cited
  "4.3s modal-close" figure is a side effect of that fix, not a bug, and should be re-measured
  post-Workstream-A (cache hits likely already cut it) rather than cited as-is. **New scoping
  fact**: zero URL-routing infrastructure exists anywhere in `App.js` (no `pushState`, no router) —
  shareable URLs are new plumbing, not a relabel. Points at `src/app/panel-registry.js` +
  `panel-registry.test.js` as the existing enforcement infra to extend with a route-vs-modal
  distinction, rather than building parallel bookkeeping. Carries the owner-endorsed rule (route =
  destination you'd link to, modal = interruption) and flags DI Compare/Forecast
  Accuracy/Projections/Date-Range Report as the four still-misclassified panels to start with.
  Notes Workstream D's broad panel-shell sweep waits on this workstream's routing decision; the
  ratchet/hand-conversion mechanics do not.
- **⭐⭐⭐⭐⭐⭐⭐ [Dispatch #26 — Workstream D: adopt the design system](dispatch-26.md)** — 2026-08-19.
  Re-measured `PanelControls.js` adoption fresh against `main`: unchanged
  since the 2026-08-17 plan despite three workstreams' worth of merged PRs —
  `DateRangeControl` 0/55, `LocationSelector`/`ActionMenus` 1/55 (`eom-dashboard.js`), `ModalShell`
  9/55, `dateRange`-prop panels 8/55. Flags that the plan's bypass-volume counts (inline styles,
  hardcoded px, etc.) do **not** re-measure to the exact same digits under any pattern tried —
  instructs the engineer to re-measure fresh with the ratchet's own exact pattern before seeding
  any `CEILING`, per the precedent already written into this repo's own
  `ratchet-raw-metric-rows.test.js` header. Carries the plan's landing sequence (compliant path
  cheapest first, two hand conversions before any sweep, ratchet the bypass not the adoption,
  convert opportunistically) and a reminder that the broad panel-shell conversion specifically
  waits on Workstream E's routing-vs-modals decision — the ratchet/contract-doc mechanics don't.
- **⭐⭐⭐⭐⭐⭐ [Dispatch #25 — Workstream C: pipeline contract](dispatch-25.md)** — 2026-08-19.
  Corrects the plan's own motivation before scoping the work: of the three
  cited "silent success" incidents, #263 (pmix zero-rows) is already fixed (v5.047,
  `qsrsoft-pmix-pull.mjs`) and #360 (`sales_ledger_daily`) was a self-corrected misdiagnosis, not
  a real gap — only the *generalization* is open. Measured directly: **2 of ~19** pull/write
  scripts have the zero-rows-exits-nonzero + per-partition-count discipline; the other 17 are
  named explicitly. Points at `scripts/_retry.mjs` (6 adopters) as the existing shared-module
  convention to follow, and confirms C2 (idempotent partition replace) is genuinely greenfield —
  522 is already a defensive **read**-side failure mode in 5 scripts but no script has
  delete-then-insert-per-partition on the **write** side. Carries explicit scope guidance: build
  the module + convert a bounded slice + ratchet-track the rest, not a 19-script sweep.
- **⭐⭐⭐⭐⭐ [Dispatch #24 — Workstream B: event scope + recurrence](dispatch-24.md)** — 2026-08-19,
  **DELIVERED** (PR #420, v5.066, migration run and RLS-verified). Standalone Workstream B brief, superseding dispatch-23's §2 now that §1
  is delivered and both of B's prerequisites (Workstream A's render-path fix, §1's precompute
  event-factor fix) are on `main`. `org_events`' `unique(loc, date_start, label)` PK has no scope
  concept, so `applyEventToStores` (`calendar.js:213`) writes N duplicate rows for an N-store
  event ("27 copies of Thanksgiving"); `RETAIL_EVENT_RULES`/`expandRetailEvents`
  (`retail-events.js`) already prove the recurrence half works but freeze their output the same
  way via `saveOrgEvents`. Fix is upstream of `orgEventsToDayMap` (`events-import.js:146`) —
  `forecastDay`/`computeEventFactors` need zero changes. Carries a re-measure reminder:
  Workstream A only removed the `forecastDay` inner-loop cost for cache-hit stores, not
  `computeEventFactors`'s own O(events) indexing pass, which still runs every render regardless
  of cache status. **DELIVERED** (PR #420, v5.066) — full design writeup, including the mid-flight
  RLS finding (a new permissive scope-aware policy would have OR'd past tenant isolation; fixed by
  replacing `org_events`' one existing RESTRICTIVE per-loc policy instead) and both open design
  questions' answers (`org_event_exceptions` table for per-store overrides;
  `collapseScopedEvents()` for one schema holding both rule-based and manual events), in
  [dispatch24-event-scope-design.md](dispatch24-event-scope-design.md). **Migration run and
  verified** (2026-08-19) — `supabase/schema-org-events-scope.sql` applied against production;
  `select policyname, permissive from pg_policies` confirmed `org_events_loc_scope` and
  `org_event_exceptions_loc_scope` both came back `RESTRICTIVE` (not a new permissive policy),
  the exact thing the RLS finding above was protecting against.
- **⭐⭐⭐⭐ [Dispatch #23 — precompute event-factor gap](dispatch-23.md)** — 2026-08-19,
  **§1 DELIVERED** (PR #417, v5.065; full trace, verified real-data delta, and an honest scope
  correction — most real stores' assigned models early-return before the event-adjustment tail,
  so today's district-wide impact was smaller than this dispatch implied — in
  [dispatch23-precompute-event-factors.md](dispatch23-precompute-event-factors.md)). §2
  (Workstream B) is **superseded by dispatch #24 above** — read that one, not this section.
- **⭐⭐⭐ [Dispatch #22 — Workstream A: forecast off the render path](dispatch-22.md)** —
  2026-08-18, **DELIVERED** (PR #415, v5.064). First workstream dispatch since [plan-normalization-2026-08-17.md](plan-normalization-2026-08-17.md)'s
  sequencing gate cleared (Phase 0 ratchets + the open PR queue all confirmed merged on `main`).
  Scopes the `weekProjections` render-path migration (`src/views/at-a-glance.js:1519-1560`, 93% of
  render time, 189 `forecastDay` calls/run) against the repo's real prior art
  (`qsrsoft-dar-pull.mjs`'s `refreshRollup`) and flags that `forecast_snapshots`' existing shape
  (backtest/MAPE record, no LY column) doesn't cleanly fit the weekly-rollup need — an open design
  call for the engineer, not dictated. Carries the Workstream B interaction warning (733 vs ~11,000
  event entries) as a hard sequencing constraint. **Full implementation trace:**
  [dispatch22-workstream-a-forecast-precompute.md](dispatch22-workstream-a-forecast-precompute.md) —
  the `forecast_snapshots` rejection reasoning, the model-assignment localStorage shim, what was
  verified against live Supabase data, and what could NOT be verified (no live click-trace) — the
  same gap dispatch #23 above found reading this code the next day.
- [Dispatch #20](dispatch-20.md) — price-event detection engine, vs-LY young-store trap, and the
  Condiment count-cycle bug. **Delivered**, shipped in PR #411 (v5.062).
- [Dispatch #21](dispatch-21.md) — handoff notice (PM session switch), not a task list; the one
  optional ask (price-wave regression test) shipped in PR #414 (v5.063), reviewed 2026-08-18.
- **⭐⭐ [McValue price-wave analysis 2026-08-18](analysis-mcvalue-price-waves-2026-08-18.md)** —
  **NEWEST work, and the McValue 2.0 FBP document's current source of truth for anything price or
  traffic.** Located three district-wide price rounds by measuring persistent step changes in
  `qsr_product_mix` base price (2026-02-25 all 27 restaurants, 06-13 wave of 14, 06-26 wave of 13)
  after a naive tier-set comparison failed (preserved marked FAILED in the same file so it isn't
  retried). The two-wave stagger became a natural experiment isolating the price effect from
  McValue itself (four gated checks: D, D-ROBUST, D-PLACEBO, D-PLACEBO-TRIMMED — final band −1.17
  to −1.46 pp of the full-window Oklahoma traffic decline). Query E then found the **six clean
  weeks after launch (B1–B3) are clean of price too**, giving a −3.14 pp headline that needs no
  correction — and forced **retiring a load-bearing framing** ("traffic got worse as national
  marketing support increased") that the price data contradicts. Query F closed the document's
  second publish gate (March free-item promo) without needing the 2025 calendar. Runnable SQL with
  every result recorded inline: [mcvalue-verification.sql](mcvalue-verification.sql). Current
  draft: [mcvalue-fbp-draft3.html](mcvalue-fbp-draft3.html). **`project-mcvalue-2-fbp-document.md`
  has a 2026-08-18 top section pointing back here — read that file's top section before its body,
  same as this one.**
- **[HS Football 2026 org_events verification](org-events-hsfb-verify.sql)** — 2026-08-18. The
  10-school PARTIALS-completion swap (43→100 games) cross-checked three ways: workbook internal
  consistency against its own README (100 rows, 49/51 home/away, all 6 judgment calls, all 10
  Thursday games — all reproduced exactly), the one contested removal (Tishomingo vs. Oklahoma
  School for the Deaf) owner-confirmed correct, and the live Supabase table confirmed to carry zero
  stale rows post-swap. Note the first version of the stale-rows check was unscoped and answered
  nothing (caught after running it, fixed in the same file) — a reminder that a query returning
  rows is not the same as a query answering the question it was written for.
- **⭐ [Normalization plan 2026-08-17](plan-normalization-2026-08-17.md)** — **NEWEST plan.** Where the
  app gets normalized against industry norms and against itself: forecast off the render path
  (`weekProjections` = 93% of render time), event scope+recurrence instead of 27 copies of one event,
  pipeline freshness/assertion contract, **design-system adoption** (`PanelControls.js` measured at
  **0/55** panels for `DateRangeControl` and **1/55** for `LocationSelector`/`ActionMenus` — the
  standard exists and is unused), routing-vs-modals, and **role-based voice** (say the number AND the
  decision; preserve analytical depth). Carries the sequencing gate, an explicit what-NOT-to-do list,
  and 8 advisory notes on running this solo.
- **⭐ [PM handoff 2026-08-15](pm-handoff-2026-08-15.md)** — **NEWEST handoff. Start here if you are taking the
  PM seat.** The PM/engineer arrangement and its disciplines, the live PR board (#298/#301/#297 awaiting
  review; #292/#286/#269 held and why), the engineer dispatch order, the owner's action list, the three
  Product Mix / `user/settings` captures and what they settled, PM debts not yet filed, the McValue FBP
  deadline (25 Aug), the corrections register, and the security constraints.
- **[Session handoff 2026-07-28](session-handoff-2026-07-28.md)** — MASTER handoff: everything
  shipped this session (v4.535–544), locked decisions, the next task (build QSRSoft pull scripts),
  access/settings, and pending items. **Start here after a session switch.**
- [Vision & roadmap](vision-and-roadmap.md) — ⭐ north-star, Smart Targets Model v2, accuracy-integrity
  system, deployment paths, prioritized roadmap.
- [North-star discovery lens](north-star-discovery-lens.md) — bridge QSRSoft's gaps, don't clone it;
  correlations, real-world decision trees, "learn and burn."

- [Docs + changelog refresh TODO](docs-refresh-todo.md) — owed after the v4.856–v4.875 sprint;
  lists exactly what is stale in the in-app changelog, CLAUDE.md and the panel catalog

## 🗂 Owner "Notes" working queues (most recent = most relevant)
- [Notes 67 queue](notes-67-queue.md) — IA/navigation reorganization (URL-view conversion, section
  regrouping into Reports/Inventory & Food Cost/Forecasting & Labor Projections/Analysis/HR),
  right-side-modal exception list, two concrete bugs (Food Cost date-selector defaults to May
  2026, DT History 15+ sec load), and the security-build directive that spawned
  [plan-security-loss-prevention.md](plan-security-loss-prevention.md).
- **⭐ [Panel decisions 2026-08-10](decisions-panel-inventory-2026-08-10.md)** — owner's keep/merge/retire
  call on all 97 panels; **the input the UI/UX redesign scopes from.** Carries the standing rule that
  RETIRE means harvest-then-remove, never delete-on-sight.
- [Notes 63 queue](notes-63-queue.md) — multi-user startup-load architecture answer, Needs Attention
  structural gap (no sales-decline detector — Atoka), Food Cost Panel RLS root cause, EOM Change
  Monitor qty-variance + case-conversion, scoring-system revisit (Ops/Controls/District/Model Health),
  Swing Watch "acknowledged" home, Events & Tags duplicates
- [Notes 62 queue](notes-62-queue.md) — SAGE capability audit, Event Tags panel, 1382ms click bug, 1.2M% chart bug
- [Notes 61 queue](notes-61-queue.md) — mobile perf, District View pass, the Resolver engine concept, SMG definitions
- [Notes 60 queue](notes-60-queue.md) — large triage: shared panel design system + cycle-agnostic engine spines,
  concrete bugs, new capabilities, naming
- [Notes 59](notes-59-online-reputation.md) — online reputation/social analytics: Google/FB/Yelp/Reddit/3PO
  ratings + reviews per location, local news, community-sentiment source tracing. Key constraint:
  **prominence beats recency** (what is displayed as current matters, even if old)
- [Notes 58](notes-58-queue.md) — Inventory Control weekly-count rules (Food+Condiment every week,
  floating mid-month Paper count); per-item variance charts; Items Recounted tile blank;
  ⚠️ **absolute must** — one-directional swing alarm w/ click-ack + auto-compiled cause report (store 10422)
- [Notes 32](notes-32-queue.md) — Perf-Review target auto-fill + per-metric sourcing; 1:1 Checkpoint;
  One-Pager round-2 (weekly Opportunity blow-up fix, cascade focus, R2P/TPPH).
- [Notes 31](notes-31-queue.md) — One-Pager v2 (metricSeries range bug, FOB anomaly, range compare,
  L/F/G, cascade dropdown).
- [Notes 30](notes-30-queue.md) — target write-back to QSRSoft; EOM qty-variance; Perf-Review KPI
  directory + threshold authoring; One-Pager scope + generic printable.
- [Notes 29](notes-29-queue.md) · [Notes 28](notes-28-queue.md) · [Notes 27 + feedback](notes-27-and-feedback.md)
  · [Notes 26](notes-26-queue.md) · [Notes 25](notes-25-queue.md) · [Notes 24 UX architecture](notes-24-ux-architecture.md)

## 👥 Performance Reviews
- [Perf-Review data sourcing](perf-review-data-sourcing.md) — QSRSoft People/Digital/Delivery report
  specs + the built+validated parsers (`src/engine/people-reports.js`); job-code taxonomy; cross-check
  finding; owner-confirmed decisions (shift-cert scope, 0-90 turnover).
- [Perf-Review Excel audit](perf-review-excel-audit.md) — threshold decisions vs the authoritative
  workbook; ROUND 2 banked corrections (OEPE %-of-target, Shift-Certified step, Bonus-Eligibility, etc.).
- [Performance Review System](project-perf-reviews.md) — engine, data model, scoring, roadmap.

## 📋 Leadership One-Pager + Opportunity $
- [Opportunity-$ design](design-opportunity-dollars.md) — Labor/Food/GC gaps → recoverable dollars;
  benchmark modes; the engine (`opportunity.js`) + adapter (`one-pager-data.js`) + view.

## 🖨 Forms
- [Forms library index](project-forms-library-index.md) — Pre-Shift Checklists + Travel Paths printable
  blanks; QSRSoft forms auth (Cognito ID token in localStorage).
- [Unified form engine design](design-unified-form-engine.md) — normalize→render, the pull method.

## 🔗 QSRSoft data & intelligence
- [QSRSoft report catalog](qsrsoft-report-catalog.md) — full system map from the owner walkthrough (what
  QSRSoft does, per-menu, to inform Meridian's roadmap).
- [QSRSoft RBAC & permissions](qsrsoft-rbac-and-permissions.md) — SSO getOrgInfo taxonomy.
- [QSRSoft email pipeline](project-qsrsoft-pipeline.md) · [Daily Activity + Shift Dashboard](project-qsrsoft-daily-activity.md)
  · [DAR columns](project-qsrsoft-dar-columns.md) · [CoachQ](project-qsrsoft-coachq.md) +
  [query patterns](coachq-query-patterns.md) · [Controls endpoint](project-qsrsoft-controls-endpoint.md)

## 🎯 Scoring
- [Ops Score attribution: #183/#181/#164](labor-park-oepe-score-attribution.md) — worked
  four-stage before/after (baseline → OEPE fix → park removal → labor basis fix) showing which
  fix moves a store's Ops Score by how much and why. Synthetic performance numbers, real targets.

## 📈 Signals / Smart Targets / Accuracy
- [Signals scanner](project-signals-scanner.md) — auto-correlation across metric pairs, guardrails.
- [Simple-models propagation](simple-models-propagation.md) — T3M/T6W/T3W family engine-wide.
- [Smart Targets / graded / accuracy handoff](handoff-smarttargets-graded-accuracy.md) ·
  [Accuracy layer](project-accuracy-layer.md) · [Graded Visits PACE](project-graded-visits-pace.md)

## 🧮 EOM / Inventory / FOB
- [EOM diagnosis flow](project-eom-diagnosis-flow.md) · [Item Journey](project-eom-item-journey.md) ·
  [FOB context](project-fob-context.md)

## 🧠 SAGE
- [SAGE AI](project-sage.md) — edge fn, live tools, RBAC, auto-scheduling, self-instrumenting.

## 🖱 UI / UX defects
- [Modal/scroll sizing defect (#192 P1)](project-modal-scroll-defect-192.md) — the "one shared
  ModalShell bug" framing was wrong (none of the 5 reports actually use ModalShell); records the
  4 real, separate mechanisms and the guard test that found the anti-pattern was 4x more
  widespread than reported.

## 📦 Inventory
- [Inventory auto-wiring (#214)](project-inventory-auto-wiring-214.md) — wired the Inventory
  Intelligence panel (Service/Production/Overstock/Transfers) to qsr_inventory_summary,
  auto-first with manual gap-fill. Key finding the issue's own body missed: the table has
  NO producer script yet (confirmed via grep) — the wiring is correct and load-bearing the
  moment a pull ships, but shows honest "no cloud data yet" today. Folded in #207 batch-2's
  first item (inventory.js → lazyPanel, ~10.4KB gzip reclaimed) since it required splitting
  parseInventoryData out to parsers/inventory-parse.js anyway.

## 🎯 Coaching spine (Push 3: #209 → #210 → #208)
- [Waste-entry data-discipline (#209)](project-waste-discipline-209.md) — the trust leg.
  Derives each store's OWN expected waste-submission days-of-week from 8 weeks of observed
  qsr_waste history (reuses count-cycle.js's measured COVER_FRAC=0.75, not a new guess),
  flags recent gaps, estimates $ impact landing in Unexplained. "Missing != zero" throughout —
  qsr_waste has no null-vs-zero column. New engine/waste-discipline.js, new
  metric-source.js isLazyFillError() export, surfaced in FOBAnalysisPanel.
- **⭐ [Coaching feedback loop v1 (#208)](project-coaching-loop-208.md)** — the verify leg,
  the only genuine differentiator on the table per the owner. New coaching_cycles table
  (owner needs to run the migration), engine/coaching-loop.js (5 rules enforced
  structurally: auto-captured baseline, follow-up lands in Needs Attention as a new
  coaching-review item type, starts from an existing finding, verdict measured via a
  NOISE_THRESHOLDS map that ships EMPTY per the issue's own v1 fallback — every verdict is
  null until a future session runs measure-coaching-noise-threshold.mjs). Real correctness
  fix found while building: that noise-threshold script's FOB math was a mean of daily
  ratios, not dollar-weighted — fixed to match computeFOBMetrics' own convention. New
  src/views/coaching-modal.js (start/review), Patch Heatmap FOB/Labor "🎯 Coach" buttons,
  Needs Attention "🎯 Log Verdict →" action.
- [Labor gap split (#210)](project-labor-gap-split-210.md) — the diagnose leg. Splits the
  combined actual-vs-needed labor gap into planning accuracy (scheduled-needed, coach the
  scheduler) and execution (actual-scheduled, coach the shift manager). Found and fixed a real
  gap: loadQsrActSummary never carried total_scheduled_hours through on either read path, so
  the split was impossible from data Meridian actually read even though qsr_daily_activity
  always had it. New rollup-table migration (owner needs to run it) + engine/labor-gap-split.js
  (Wed-Tue pay week, signature #4 in-progress-day exclusion, null-vs-fabricated-zero when the
  migration hasn't landed yet). New Labor Tools tab: 🎯 Planning/Execution.
- **⭐ [Over-scheduling is a chaos problem, not a labor-cost problem](finding-overscheduling-is-chaos-not-cost.md)**
  — first finding Push 3 produced, measured within minutes of #210 going live: 21/27 stores
  grossly over-schedule (Ada 66% above need), but the district nets to only +9 hrs vs need
  (matches the Overview tile independently) because over-scheduling and mid-week cutting
  cancel — invisible on the P&L, real operational chaos the owner had suspected for years.
  Validates ranking by combined-magnitude (already shipped) and is the first case where
  "dollarize and sort by $" would be the WRONG instinct — it costs ~nothing but damages the
  operation. Coach column gate confirmed correct as-is. Open: why schedules run so high is
  still unknown; turnover_monthly correlation is the next measurable test.
- **✅ [Patch Heatmap bands + rollup tiles (#219/#220)](project-patch-heatmap-calibration-219.md)**
  — DONE. #219: owner ran the measurement script against production, found a structural bug
  (badAt is not the flag line — watch fires at 0.2*badAt, critical at 0.5*badAt), shipped
  Sales 27 / FOB 1.9 / Labor 8.8 / Speed 73 (was 15/3/3/20). #220: new patch-level rollup row,
  patchDimensions() aggregates raw dollars/sales FIRST then derives dimensions — never colours
  by worst store. Grouping via the LIVE supervisorGroups() (constants.js), not the frozen
  INV_ORG_COORDS.sup snapshot. Controls excluded from both (composite score, correctly out of
  scope). 18 new tests across both issues.

## ⚡ Performance
- [Instrument fix (#189)](project-instrument-fix-189.md) — click-trace's App-tree/AppSidebar
  spans were nested (same-commit layout effects end at one flush), not additive — a misreading
  already caught once by hand. Extended the same pattern to the 4 active-panel views and added
  automatic same-commit subtraction to the report. Not measured live; owner needs to re-capture.
- [Lazy fill + qsr_fob parallel pagination (#191)](project-lazy-fill-191.md) — auditRows now
  loads on demand instead of eagerly at startup (scoped to auditRows only, not gap-scoped —
  records why); qsr_fob switched from serial to parallel pagination. Records the 3 non-resolver
  consumer decisions and what's deliberately NOT verified live (no Supabase session here).
- [Startup render storm (#184 item 0)](project-startup-render-storm.md) — batched the 22
  ds-touching tiered-startup-loader stages behind 3 per-tier flushes (22 commits → 3); the
  ~19-commit remainder (IDB restore, org_config syncs, email/PDF auto-ingest) is enumerated but
  not yet fixed.

## 🏗 Data-refresh sprint & standards (standing rules)
- [Data-refresh sprint handoff](handoff-data-refresh-sprint.md) — the At-A-Glance freshest-wins rework.
- [⭐ Measure it, don't reason about it](feedback-measure-dont-reason.md) — **standing rule.** Diagnose by
  reproducing, not by plausibility; verify a command's output before reporting it. Real costs from 2026-08-07.
- [⭐ PM / worker split](feedback-pm-worker-split.md) — **standing rule.** Two-session arrangement: who owns
  which files (worker owns MERIDIAN_CHANGELOG, always), one task in flight, worker opens draft PRs / PM
  reviews+merges, and the PM review checklist. Written after two same-day cross-session collisions.
- [Data-sourcing standard](data-sourcing-standard.md) — metric-source.js / vs-ly.js; never filter raw
  rows for a metric. **Standing rule.**
- [Data source redundancy](project-data-redundancy.md) — auto/emailed-first, manual = last-resort fill.
- [Panel catalog](panel-catalog.md) — every panel + status.

## 🔒 Infra / security / deploy
- [Security & Loss Prevention build](plan-security-loss-prevention.md) — **not RLS/infra security,
  fraud/theft detection.** Design spec synthesized from three AI-engine research passes
  (Gemini/Grok/ChatGPT), architecture-first (baselines, exposure normalization, opportunity-
  adjusted risk, exoneration analytics, Rules Registry), connected to existing prior art
  ([data-acquisition-shopping-list.md](data-acquisition-shopping-list.md)'s attribution ladder,
  [attribution-validity-register-login.md](attribution-validity-register-login.md)'s
  contested-attribution design, SAGE's disclosure-gating policy). Not yet scoped into dispatches.
- [RLS hardening plan](project-rls-hardening-plan.md) — require-auth policies (Phase 1 done).
- [Project audit 2026-07-27](project-audit-2026-07-27.md) · [Supabase priority](project-supabase-priority.md)
  · [Data model](project-data-model.md) · [Sync rework](project-sync-rework.md) · [Hosting](project-hosting.md)
- [Deploy rule](feedback-deploy.md) — push to branch; Vercel auto-deploys. [Selector UI standard](feedback-selector-ui-standard.md).
- [LifeLenz session](lifelenz-session.md) — token lifecycle, dead ends. [VLH config](project-vlh-config.md).
- [Labor Analysis FLH](project-labor-analysis-flh.md) · [LifeLenz schedule/jobs](project-lifelenz-schedule-jobs.md)
  · [Crew skills matrix](project-crew-skills-matrix.md) · [Feature Requests](feature-requests.md)
- [Performance budget + manual-sourcing audit](feedback-performance-budget.md) — speed is a feature; MANUAL_ONLY stays 0
- [Data-integrity sweep plan](plan-data-integrity-sweep.md) — greppable defect signatures + measured site counts
- `src/components/ModalShell.js` — shared modal shell (Workstream D, ✅ done v4.938–v4.939): standardizes
  the close-button/header pattern app-wide. See [[vision-and-roadmap]] Workstream D and [[notes-63-queue]].
- [PWA Share bug](project-pwa-share-bug.md) · [Backlog](project-backlog.md) · [Meridian status](project-meridian.md)

## 📇 Previously unindexed (added 2026-08-16)

**43 of 124 files were on disk but absent from this index** — measured, not estimated
(`comm -23` of the directory against every `.md` referenced here). Descriptions below are each
file's own front-matter, not a summary written after the fact. Several are cross-referenced above
in the "before you theorize" table because their absence has already cost real work.

### Data reconciliation & measurement
- [dar-vs-ops-reconciliation.md](dar-vs-ops-reconciliation.md) — why DAR-derived totals differ from the manual Ops Report, what was ruled out (**the 4am boundary WAS**), and why auto-first is still correct
- [project-labor-pct-punched-vs-crew.md](project-labor-pct-punched-vs-crew.md) — Notes 35: Labor % standardized on Punched; Crew silently includes salaried-manager $ (FL yes, OK no)
- [project-hourly-projection-accuracy.md](project-hourly-projection-accuracy.md) — tracks whether QSRSoft/LifeLenz hourly projections are systematically biased
- [weighted-rollup-audit.md](weighted-rollup-audit.md) — average-of-averages sweep, incl. what was deliberately left alone for want of a weighting basis
- [metric-inventory-2026-08-07.md](metric-inventory-2026-08-07.md) · [reference-r2p-formula.md](reference-r2p-formula.md) — R2P reconciled to the penny · [notes-57-metric-registry-plan.md](notes-57-metric-registry-plan.md)
- [project-noise-measurement-237.md](project-noise-measurement-237.md) · [project-labor-pct-tail-236.md](project-labor-pct-tail-236.md) — the 994 nulled rows (#243)
- [store-events-material-changes.md](store-events-material-changes.md) — the legitimate-gap ground truth #269's tolerance list is built on
- [count-cycle-condiment-bug-2026-08-18.md](count-cycle-condiment-bug-2026-08-18.md) — chased #410's
  "all 27 stores crit" flag to a real cause: 98.9% of Condiment items reading `active=false`
  district-wide. Fixed in dispatch20/PR #411
- [374-recipe-item-verification-2026-08-18.md](374-recipe-item-verification-2026-08-18.md) — #374's
  acceptance-criteria check for the `recipeItem` Topic 6 rescue in `count-cycle.js`'s `isActive()`
- [project-pull-completeness-263-265.md](project-pull-completeness-263-265.md) — #263 makes a pull say so when it KNOWS it failed; #265 catches the gaps a pull never saw at all (QSRSoft had no row, nothing threw, success was reported truthfully). Neither substitutes for the other — **neither the Sulphur nor the Marietta outage would have been caught by #263 alone**

### QSRSoft / pulls / auth
- [project-qsrsoft-cognito-auth-312.md](project-qsrsoft-cognito-auth-312.md) — the #312/#323 token conversion + backfill record
- [project-product-mix-291.md](project-product-mix-291.md) — #292's design notes and next-session ordering
- [data-acquisition-shopping-list.md](data-acquisition-shopping-list.md) — every candidate endpoint, incl. addenda K (Product Outage) and L (Menu Price Comparison)
- [reference-shift-manager-summary.md](reference-shift-manager-summary.md) — per-daypart manager-on-duty attribution · [qsrsoft-kb-digest.md](qsrsoft-kb-digest.md)

### Security / RLS / infra
- [rls-table-audit-119.md](rls-table-audit-119.md) — full 82-table RLS audit; one real gap, one non-reproduction
- [session-2026-08-07-perf-and-rls.md](session-2026-08-07-perf-and-rls.md) — cold start 183s→59s, per-loc RLS after a rollback, **seven wrong assumptions caught by live queries**
- [project-security-notes.md](project-security-notes.md) — accepted-risk vs needs-fix tracker
- [attribution-validity-register-login.md](attribution-validity-register-login.md) · [project-salaried-coverage-guard-242.md](project-salaried-coverage-guard-242.md)

### Design & product threads
- [project-coaching-feedback-loop.md](project-coaching-feedback-loop.md) — the loop that turns Meridian from reporting into management
- [project-events-redesign.md](project-events-redesign.md) · [project-inventory-control-redesign.md](project-inventory-control-redesign.md) — both owner-signed-off designs
- [project-insight-ledger.md](project-insight-ledger.md) · [project-food-cost-labor-enhancements.md](project-food-cost-labor-enhancements.md) — the two P&L lines that are ~50% of sales
- [project-org-structure.md](project-org-structure.md) — supervisor→store, data-driven since v4.570, incl. the retroactive-attribution caveat
- [project-eom-scoreboard-notify.md](project-eom-scoreboard-notify.md) · [project-scoring-revisit.md](project-scoring-revisit.md) — a MEASURED divergence between two Model Health scorers
- [spine1-panel-controls-126.md](spine1-panel-controls-126.md) · [project-mcvalue-2-fbp-document.md](project-mcvalue-2-fbp-document.md)
- [project-sage-knowledge-grounding.md](project-sage-knowledge-grounding.md) — the handling-notice gate #269 deliberately did not bypass · [project-sage-manual-sourcing-270.md](project-sage-manual-sourcing-270.md)

### Process, capacity & planning
- [systemic-issues-and-next-phase.md](systemic-issues-and-next-phase.md) — **four recurring bug classes measured from 977 commits**, and the structural fix for each
- [plan-backlog-and-redesign-2026-08-15.md](plan-backlog-and-redesign-2026-08-15.md) — how the open issues collapse into a working order
- **⭐ [analysis-labor-allocation-queries.sql](analysis-labor-allocation-queries.sql)** — the four runnable queries behind the allocation analysis, on the VLH guide's own daypart boundaries. Query 2 (concentration) is the one to run BEFORE acting; Query 4 is a re-run owed before any speed number reaches a GM
- **⭐ [analysis-labor-allocation-2026-08-18.md](analysis-labor-allocation-2026-08-18.md)** — hours are in the WRONG DAYPARTS. 58% of drive-thru volume is served under the VLH guide (Breakfast 0.928, Lunch 0.922) while 42% is served over it (Afternoon 1.171, Dinner 1.085, Late 1.207). 826 busy breakfasts under guide vs 2,569 soft afternoons/dinners over. Cost-neutral if the hours net out — a reallocation, not a labour increase
- [gate-pmix-backfill.sql](gate-pmix-backfill.sql) — run BEFORE anything reads `qsr_product_mix`. The pmix pull's fail-fast guard (#393) is unmerged, so a green Action does not mean rows landed — the first attempt wrote 0 rows and exited 0. Gates on distinct loc/date, **never `count(*)`** (price is in the conflict key, so a price change adds a row)
- [probe-g1-shift-dimension.sql](probe-g1-shift-dimension.sql) — the Workstream G screen: does DT speed vary as much *within* a store's own week as *between* stores? Carries the verified DAR facts (business-day-aligned `dt`, 24-slot completeness guard, `dt_untilserve` is **milliseconds**) — read it before writing any new hourly-DAR query
- [plan-normalization-2026-08-17.md](plan-normalization-2026-08-17.md) — ⭐ the successor to the above: seven workstreams (forecast off render path · event scope+recurrence · pipeline contract · design-system adoption · routing vs modals · role-based voice), the sequencing gate, and what not to do
- [feedback-verification-in-sandbox.md](feedback-verification-in-sandbox.md) — what a sandbox session can and cannot prove
- [benchmark-daily-readiness.md](benchmark-daily-readiness.md) — read before quoting any readiness number
- [capacity-and-onboarding-review.md](capacity-and-onboarding-review.md) — how many users can onboard today, and what must land first
- [mac-session-todo-2026-08-06.md](mac-session-todo-2026-08-06.md) — items that require the owner at a Mac
- [finding-padding-and-cash-hunt-2026-08-13.md](finding-padding-and-cash-hunt-2026-08-13.md)

### Owner notes queues
- [notes-33-queue.md](notes-33-queue.md) · [notes-54-56-triage.md](notes-54-56-triage.md) · [notes-66-bullseye-and-state-of-business.md](notes-66-bullseye-and-state-of-business.md) · [notes-66-staged-experiments-and-risk.md](notes-66-staged-experiments-and-risk.md)

---
*Index maintenance: when adding a memory file, add it here. Newest handoff always pinned at top.*
*Drift check — run it, don't trust the habit:*
```
comm -23 <(ls memory/*.md | xargs -n1 basename | grep -v '^MEMORY.md$' | sort) \
         <(grep -o '[a-z0-9-]*\.md' memory/MEMORY.md | sort -u)
```
*Empty output = index complete. It printed **43 filenames** on 2026-08-16 and is empty as of that
fix (125 files, 125 referenced). An index nobody can verify drifts back — run this, don't trust
the habit of "I added it."*
