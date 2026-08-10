---
name: notes-63-queue
description: Notes 63 field-note queue (2026-08-09) — multi-user startup-load architecture question (answered), Needs Attention structural gap (no sales-decline detector, Atoka), Food Cost Panel RLS root cause, EOM Change Monitor qty-variance + case-conversion, scoring-system revisit (Ops/Controls/District/Model Health), Swing Watch "acknowledged" home, Events & Tags duplicates.
metadata:
  type: project
---

# Notes 63 — captured 2026-08-09

Owner: *"Priority being to get as much done prior to UI/UX work."* Filed the same session PR #102
(shared `ModalShell` + full UX-coherence pass) merged to production — see [[vision-and-roadmap]]
Workstream D, now partially done. Everything below is genuinely non-UI/UX: one architecture
question, one structural detection gap, one live RLS bug, one "the data already exists, just
surface it" feature, one collaborative design topic, and two smaller features.

---

## Multi-user startup-load architecture — the owner's question, answered

Owner asked: *"If a user level has access to limited panels/resources how do we factor that into
the initial load? Are they dynamically not included, which would make load faster? Or does
everything get loaded for everyone and user level just determines what they have access to?"*

**Today: the second one — full load, then hide.** Two separate mechanisms exist and only one of
them is role-aware:

1. **Row-level scope** — Supabase RLS keyed off `profiles.accessible_locs` (per CLAUDE.md's RBAC
   table). This filters which *rows* a query can return, enforced by Postgres regardless of what
   the client asks for. This part already scales down correctly for a restricted user in
   principle — a GM's query for `qsr_daily_activity` literally cannot return another store's rows.
2. **Panel/nav visibility** — `perm()` checks gate which nav items and views *render*
   (`shell.js`/`panel-registry.js`, per CLAUDE.md's RBAC section). This is UI-only. The startup
   data pipeline (`App.js`'s big loader sequence — labor/controls/ops/FOB/glimpse/cash/sales-ledger/
   schedules/SMG/DAR streams) is **not gated by role today** — it fetches the same set of streams
   for every logged-in user, then the nav simply doesn't show panels a lower role can't open. A GM
   today likely triggers close to the same startup fetch volume as the owner, even though most of
   it never renders.

**So the owner's instinct is correct, and it isn't how the app works yet.** Two consequences worth
naming explicitly before multi-user rollout (P4 in [[vision-and-roadmap]]):

- **Performance**: a lower-role user gets no load-time benefit from having less to look at. Given
  the standing rule in [[feedback-performance-budget]] that speed is a feature, this is a real gap
  once a second real user (not just the owner) is on the app day-to-day.
- **Defense-in-depth**: relying on RLS as the *only* filter, with the client always requesting the
  broad set, means a bug in one RLS policy (see the Food Cost Panel finding below — `qsr_fob`'s
  policy currently returns empty for the anon/authenticated role) fails *closed* today only by
  accident, not by design. If a future policy bug fails *open* instead, a restricted user's browser
  would hold data it was never supposed to see, in memory, even if the UI never renders it.

**Recommended shape (not yet built):** two load tiers, gated by role capability rather than by
individual panel:
- **Core tier** — whatever the lowest role (GM) needs: their own accessible store(s)' daily
  metrics, targets, forecast. Fetched for everyone, always.
- **Extended tier(s)** — cross-store/district-wide streams (Signals' Scanner correlations, SAGE's
  broader tool surface, Model Assignment backtests, org-wide rollups) fetched only when
  `perm()` says the role can reach a panel that needs them — either gated at startup by role, or
  fetched lazily the first time that panel actually opens (mirrors the existing `lazyPanel()`
  code-splitting pattern, applied to *data* fetches instead of *code* chunks).

This doesn't need to be built now — the owner is currently the only user, so there's no live
consequence yet. But the design decision (tiered-by-role fetch vs. current flat fetch) should be
made *before* the first second user is provisioned (P4), not discovered mid-rollout. Filed as a
concrete P4 sub-task rather than a vague "harden RLS" line — see [[vision-and-roadmap]].

---

## Needs Attention — structural gap, not a threshold problem (Atoka / 10422)

Owner: *"Atoka (10422) is on a horrible sales decline, yet it does not show up as needing
attention in this panel."*

**Root cause found — this is not a tuning issue.** There are two different panels and only one of
them was actually checked:

- **"Needs Attention"** (🔴, sidebar nav, `AttentionPanel` in `src/views/analytics.js:5026`) groups
  stores by `findings` from `buildBrief()` (`src/engine/pipeline.js:188-254`). Every flag pushed
  there — cash O/S, T-Red, overtime, petty cash, deposit, R2P, floor compliance, OEPE, labor,
  discounts, parking, TPPH, POS-over — is an *operational controls/labor* signal.
  **There is no rule anywhere in `buildBrief` that turns a sales-vs-LY decline into a `crit` or
  `warn` finding.** The only sales-adjacent line pushes `t:'fc'` (forecast note), which the panel's
  own filters (`f.t==='crit'`, `f.t==='warn'||'watch'`) never count. A store can be in freefall on
  sales and show zero here as long as controls/labor/speed are clean — exactly Atoka's profile
  (already tagged in `constants.js:323` as "Untapped potential... volume below what demographics
  suggest"). **This is the panel the owner is almost certainly looking at, and it structurally
  cannot flag a pure sales decline — this is a missing detector, not a mistuned one.**
- **"Attention Now"** (🎯, a *separate*, less-discoverable panel — `WhatNeedsAttentionPanel` in
  `src/views/attention-now.js`) DOES check sales-vs-LY correctly, through the shared
  `matchedVsLY` helper (`src/engine/vs-ly.js:59`) per the data-sourcing standard. Its
  `salesBehindLY` detector (`src/engine/attention-feed.js:52-67`) has its own gaps though: requires
  `ly > 0` (a data-completeness gate that silently drops stores with thin matched-LY coverage,
  `attention-now.js:84-85`), needs a **$1,000 minimum gap**, and only escalates to `'warn'` past a
  **5% decline** (below that it's `'info'`, buried under `'crit'` items in a max-20 list). It also
  only evaluates the current `dateRange` (defaults to `thisWeek()`), so a real multi-week decline
  that doesn't clear 5%/$1,000 in any single week could still slip through or under-rank.

**Fix, two parts:**
1. Add a sales-vs-LY detector to `buildBrief`/`AttentionPanel` (the one literally named "Needs
   Attention"), OR retire the split entirely and point the "Needs Attention" nav item at
   `buildAttentionFeed` instead — worth deciding which, since running two differently-named,
   differently-powered "attention" panels side by side is itself confusing (this doubles as the
   rename/merge question already open in [[notes-60-queue]]: *"either broaden it to cover all
   current AND future data, or rename"*).
2. In `WhatNeedsAttentionPanel`, evaluate sales decline over a rolling multi-week window in
   addition to the current single-week `dateRange`, so a real trend doesn't need to clear the
   threshold in one specific week to surface.

Related: [[notes-60-queue]] (naming ask), [[notes-58-queue]] (Atoka is also the swing-alarm test
case), [[notes-59-online-reputation]] (Atoka social backfill deferred).

---

## Food Cost Panel — capped at May 2026 (real bug, root cause found, needs a live RLS diff)

Owner: *"We previously addressed this, or I thought we did. Please verify and correct."*

**Verified — it was fixed once and quietly regressed.** The component is `FOBAnalysisPanel`
(`src/views/analytics.js:2805`, nav-labeled "Food Cost" — the *other* food-cost view, `FOBEOMPanel`
in `fob-eom.js`, has no month dropdown at all and isn't the one in question).

- Commit `61355aa` (v4.545) correctly made this cloud-first: the month dropdown
  (`analytics.js:2857-2861`) is built from `fobRowsEff`, which merges the auto-synced `qsr_fob`
  cloud table with manual `ds.fobRows` only as a gap-filler — the right architecture per
  [[project-data-redundancy]].
- Commit `c552b33` (v4.885, Aug 8) re-diagnosed the symptom, made the manual-fallback warning
  legible, but explicitly left the root cause **unconfirmed**: *"service role reads `qsr_fob`
  fine, anon gets an empty array... asked the owner for the `pg_policies` diff between `qsr_fob`
  and `news_mentions`."* No commit since has touched this.
- **`loadQsrFob()` is returning `[]` for the normal logged-in role**, so `fobRowsEff` silently
  collapses to manual `ds.fobRows` alone — whose last month with real sales is May 2026. That IS
  the cap. `FOBAnalysisPanel`'s code needs no further changes once the read works.
- Two RLS migrations landed around when this symptom was (re-)reported and both touch `qsr_fob`:
  the per-loc RESTRICTIVE policy (`supabase/schema-rls-phase2-loc.sql:41-64`) and the tenant-scoping
  policy (`supabase/schema-multitenant-phase2-rls.sql:46,88`, `tenant_id = current_tenant_id()`).
  Either is a plausible culprit.

**This needs a live diagnostic against the real Supabase project, not another guess** — per the
standing rule in [[feedback-measure-dont-reason]], and because this exact bug already burned one
session on an unconfirmed theory. Concretely: diff `pg_policies` for `qsr_fob` against a table that
still works for anon (`news_mentions`), confirm whether `profiles.accessible_locs` is actually
still `NULL` for the owner's profile (the phase2-loc migration assumed this stays true), and check
whether the authenticated session's `tenant_id`/JWT claim actually matches what's stamped on
`qsr_fob` rows. **This is a live security-boundary change on a production RLS policy — flagging
for the owner to either run the diff directly or explicitly green-light before I touch policy SQL.**

Related: [[mac-session-todo-2026-08-06]] (same "original vs merge" open question), [[notes-54-56-triage]].

---

## EOM Change Monitor — variance QTY + case-pack conversion

Owner wants, per item: the variance at *each* submission when an item was counted more than once
in a day, but most importantly the **final/binding** variance for the day — plus, everywhere a
variance qty is shown, an explicit secondary "= X.XX case(s)" reference (never replacing the raw
qty). Also confirmed: Weekly counts are Food + Condiment every week, Paper 2x/month; Daily is
generally Food only.

**Good news — the engine already computes everything asked for; this is a UI-surfacing task, not
new data-model work.**

- `src/engine/eom-count-sessions.js` already groups raw count events into a *session* per
  count-day (`itemCountSessions`, lines 30-83), the **last entry in a session is already treated as
  binding** (line 81), and cross-session moves are already graded helped/hurt/held. Each session
  object already carries `unitVar` (qty variance) alongside `dolVar` (dollar variance) — both per
  submission and for the binding final value.
- `src/engine/eom-change-monitor.js`'s `diffSnapshot` (lines 39-70) likewise already computes
  `baseQtyVar`/`curQtyVar`/`dQtyVar`/`baseQty`/`curQty` per item.
- **None of this is rendered.** The Change Monitor modal table (`eom-dashboard.js:3037-3066` and
  `:3002-3069`) only pulls the dollar fields today.
- A per-item **case-pack size already exists end-to-end**: parsed from the item's UOM string
  (`fob-eom.js:161-167`), persisted as `case_sz` on `qsr_raw_item_detail`, and already threaded into
  `eom-dashboard.js`'s `rawByLoc`/`caseSzByWrin` maps. It's already used for case conversion in
  three places — `ActionItemsProvenance` (`eom-dashboard.js:862`), the diagnosis report's `casesOf`
  helper (`eom-diagnosis.js:876`), and `ItemJourneyView`'s summary line (`eom-dashboard.js:898`).
  Those three are the reference pattern to copy, not build from scratch.

**Fix — add qty columns + case-conversion suffix, no new tracking needed, in this order:**
1. Change Monitor: add qty columns (per-submission qty variance, Final Qty variance) to the
   Progression view and Baseline-diff view tables, next to the existing $ columns.
2. Thread `caseSz`/`caseSzByWrin` into `progByLoc` items and diff-view items (already computed
   elsewhere in the file — just not passed into these two structures), and render "= X.XX case(s)"
   next to every qty variance number added in step 1.
3. Same treatment, same reference pattern, in the other spots that show a variance qty with no
   case conversion today: `ItemJourneyView` timeline rows (`eom-dashboard.js:940-943`, the summary
   line already has it), FOB Root-Cause Analysis's Recount Impact section (`:2470-2488`), and the
   FOB Report modal's "Top item losers" (`:2431-2432`) + its printable HTML (`:1457`).
4. `inventory.js`'s count/excess panels already do this extensively — confirmed correct, no changes
   needed there; useful as a second reference pattern alongside `ActionItemsProvenance`.

Related: [[notes-30-queue]], [[notes-29-queue]] (original EOM qty-variance ask), [[project-fob-context]],
[[session-handoff-2026-07-28]] (#65 EOM qty-variance + Item-Journey reconcile).

---

## Scoring systems — Ops / Controls / District / "Trusted Health" — needs a joint session

Owner: *"I don't want to abandon them, I love the concept, I just want them to mean the right
things... I need the two of us to spend time getting this part right."* **Filing findings only —
not touching the formulas until we sit down on this together, per the owner's explicit ask.**

Current state (documented, not evaluated):

- **Ops Score** / **Controls Score** — `computeOpsScore()` / `computeCtrlScore()`
  (`src/engine/pipeline.js:131`, `:154`), called from `buildStore()`. Ops Score: tiered credit
  against target across OEPE, KVS-Time, KVS-Healthy, DT-Parked, TPPH, Labor% → 0-100 (neutral 50 if
  no metrics have data). Controls Score: tiered "lower is better" credit (max 40pts) across
  Cash O/S%, T-Red A%, OT hours, cash refund count, discount%, plus a flat +3 structural allowance;
  recently patched so uncovered metrics shrink the denominator instead of scoring as a zero.
  Combined into a **Combined Score = Ops×0.6 + Controls×0.4**, shown as per-store badges
  everywhere (Store Dashboard, Store Analytics, coaching briefs).
- **"District Score"** (`store-dash.js:1918`) = average Combined Score across all loaded stores —
  a KPI card in the Store Dashboard's district summary bar. **Note for the owner:** this lives on
  the Store Dashboard, not the main At-A-Glance page — worth confirming that's actually where you
  want it before we redesign it.
- **"Trusted Health"** doesn't exist under that literal name. The closest match is the forecast
  **Model Health Score**, and it has a real problem worth surfacing on its own: **two separate,
  independently-maintained implementations** — `modelHealthScore()` (`forecast.js:830`, used by
  Store Analytics + the AAG red-store counter) and `computeModelHealth()` (`forecast.js:1801`, used
  by the main analytics dashboard tile) — each scoring Calibration/Freshness/MAPE/Sample-size with
  slightly different thresholds and different grade labels ("Trusted"/"Healthy" vs
  "Healthy"/"Fair"/"Needs Attention"). **This divergence is itself evidence the owner's instinct to
  revisit is right** — two scores claiming to answer the same question can already disagree.

**Proposal for the joint session:** bring (a) this doc, (b) a short list of stores where Ops/Controls/
Combined/Model-Health disagree sharply with your own gut read of that store's actual performance,
so we calibrate against real cases rather than starting from the formulas. Simple-but-trustworthy
is the target, per the owner's own framing — not more inputs, better-chosen ones.

---

## Swing Watch — acknowledgment already exists; the real ask is a persistent "home"

Owner: *"Needs a way to acknowledge like the critical. Both need to land in a home so when they
are acknowledged they are still available. Natural location would be top of Needs Attention."*

**Correction: Swing Watch already has a full acknowledge/dismiss mechanism** —
`src/components/SwingAlarm.js` (persistent banner + a blocking `CriticalSwing` modal for critical
severity), backed by `src/engine/swing-feed.js` (`ackKey`, `acknowledge`, `pruneAcks` — 120-day
expiry), wired in `App.js:2772-2807` and **persisted to Supabase** (`user_settings` via
`loadUserSetting`/`saveUserSetting`, with `who` captured from the live session for an audit trail).
This is already the most mature ack pattern in the app — there is no separate "critical" ack
implementation elsewhere to copy from; this **is** the reference implementation.

**So the actual gap is exactly what the owner described in the second sentence**: once
acknowledged, an item just disappears — there's no "home" to go back and see what was acknowledged,
by whom, and when. Building that:
1. A new "Acknowledged" section, at the **top of the Needs Attention panel** (owner's own proposed
   location) — a simple list pulling from the swing-feed acks already in Supabase, each row
   showing store, what was acknowledged, who, and when.
2. Once "Needs Attention" gets its sales-decline detector (above), the same acknowledged-history
   pattern extends naturally to those findings too, so "Both" (Swing Watch + whatever Needs
   Attention flags) land in one shared home as the owner asked, rather than building two.

Related: [[notes-58-queue]] (the original swing-alarm ask this fulfilled), [[feedback-measure-dont-reason]]
(the swing threshold itself, -10%, is measured from 676 store-weeks — not being revisited here).

---

## Events & Tags — find and remove duplicates

Owner: *"We need a way to find duplicates and easily remove them."* Continues directly from
[[notes-62-queue]]'s Event Tags panel ask (the 450-tagged-days finding) — build together, don't
build two panels.

Current data model: local `mf_events` (`localStorage`) is a `{loc: {date: entry}}` map — structurally
**one entry per (loc, date)**, so a second write to an occupied slot **silently overwrites** the
first with no warning. That's arguably the more urgent bug (silent data loss, not a visible
duplicate) hiding under the same complaint. The cloud `org_events` table intentionally allows
multiple rows per (loc, date) with different labels (`unique(loc, date_start, label)`), which is
correct — a store can legitimately have two different tagged events the same day.

**No duplicate-detection or merge logic exists anywhere today**, and "duplicate" isn't defined
consistently: the local map's implicit rule is same-loc+same-date (any type/note collides); the
cloud table's rule is same-loc+same-date+same-label. The known sync gap in `diffUserEventsForCloudSync`
(`events-import.js:173-183` — a multi-day org-sourced span's per-day delete can silently no-op) is
a likely source of actual duplicate/orphaned cloud rows worth checking first, since it's a
different failure mode than the silent-overwrite one above.

**Build as part of the notes-62 Event Tags list panel** (not standalone): define duplicate as
same-loc+same-date+same-label (matching the cloud constraint) surfaced as a "Possible duplicates"
filter/action within that panel, with a merge-or-delete action per group. Fix the local
silent-overwrite behavior (warn before overwrite, at minimum) as a small, separate, immediate bug
fix regardless of when the full panel ships.

Related: [[notes-62-queue]] (Event Tags panel ask this continues), [[panel-catalog]] (Calendar
Manager overlap — same triage question applies).

---

## Feature ideas — explicitly deferred by the owner, filed so they aren't lost

Owner: *"Long term, not a normal app feature... I like it! But others may be confused by it."*

- **Startup data-load visual cue** — a subtle color gradient (bar or chip) that lands on green once
  all data streams are present, shown only during app startup. Owner's own caveat: this is a
  power-user delight, not something to ship broadly without confusing other future users. Proposal:
  gate behind the existing dev-mode pattern (see next item) rather than the default UI.
- **Loaded-data-strip** — currently useful for planning/debugging, but the owner wants it moved or
  removed once the app is redesigned and stable, reconsidered at that point.
- **Dev-mode live screen** — the owner's own proposed solution to both of the above: a togglable
  dev-mode environment that keeps this kind of diagnostic UI available without it being a
  default-on "normal app feature." Worth building as a real, named toggle (not just leaving debug
  UI in production) once any of the above are ready to ship, so they have a home.

**Not scheduled — explicitly UI/UX and explicitly "not now" per the owner's own stated priority
this session.** Revisit during the Workstream D "score & polish" pass in [[vision-and-roadmap]].

---

## Priority order (this session's proposal, non-UI/UX first per the owner's instruction)

1. Needs Attention sales-decline detector (Atoka) — real, high-visibility bug; fully scoped.
2. EOM Change Monitor qty + case-conversion — fully scoped, engine already supports it, no new data
   model needed.
3. Swing Watch "Acknowledged" home at the top of Needs Attention — fully scoped, reuses existing
   Supabase-backed ack data.
4. Events & Tags duplicate finder (+ the silent-overwrite fix as an immediate small patch) — build
   inside the already-requested notes-62 Event Tags panel.
5. Food Cost Panel RLS diagnostic — root cause is understood, but this touches a live production
   security policy. **Needs the owner's go-ahead (or the owner running the `pg_policies` diff
   directly) before any policy SQL changes.**
6. Scoring-system revisit — **needs a joint session**, not solo execution; findings above are ready
   whenever the owner wants to schedule it.
7. Multi-user startup-load tiering — a design decision to make before P4 (multi-user rollout, per
   [[vision-and-roadmap]]), not urgent standalone work while the owner is the only user.
8. Deferred UI/UX feature ideas (startup gradient, data-strip repositioning, dev-mode screen) — not
   scheduled this pass, per the owner's own priority call.

---

Related: [[vision-and-roadmap]], [[notes-62-queue]], [[notes-60-queue]], [[notes-58-queue]],
[[feedback-measure-dont-reason]], [[feedback-performance-budget]], [[project-data-redundancy]],
[[project-fob-context]].
