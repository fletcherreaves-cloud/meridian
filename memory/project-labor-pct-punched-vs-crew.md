---
name: project-labor-pct-punched-vs-crew
description: Notes 35 decision — Labor % is standardized on Punched (all-hourly) for every store so Florida and Oklahoma compare like-for-like; Crew Labor % silently includes salaried-manager $ where a store is configured that way (FL is, OK isn't), which is not comparable across markets. Reconstructed 2026-08-12 — cited at parsers/index.js:315/:441 since Notes 35 shipped (v4.583) but this file itself was never committed. Read before touching any labor-basis code, including the #211 generic-shell Labor instantiation.
metadata:
  type: decision
  status: shipped (Notes 35, v4.583); Labor-instantiation follow-on ON HOLD pending a real-data measurement
---

# Labor % basis — Punched vs Crew vs Total

**This file has been cited by two live code comments (`parsers/index.js:315`, `:441`) since
v4.583 (2026-07-29, "Notes 35") and never actually existed in any commit.** The decision
survived only as those two comments. Reconstructed 2026-08-12 from those comments, the v4.583
changelog entry, and the owner's #211-dispatch requirements, because #211's generic shell needs
a real design doc for Labor's third axis, not a citation to a file nobody wrote.

## The problem Notes 35 fixed

Owner-verified, 2026-08-03: store 6178 read **Actual 25.84%** vs **Punched 23.23%** for the
same period — not the same number. QSRSoft's data model carries three separate labor-%
fields, and they mean genuinely different things:

| Field | What it measures | Comparability |
|---|---|---|
| `punchLaborPct` | Punched Labor % — **all hourly**: crew, maintenance, prep, hourly shift managers, hourly department managers | Present and comparable at **all 27 stores** |
| `crewLaborPct` | QSRSoft's "Crew Labor %" column, which **adds salaried-manager dollars** where a store is set up that way | **FL has this setup, OK does not.** Not comparable across markets |
| `totalLaborPct` | Full accounting labor % | Only meaningful where that accounting setup exists |

**Naming trap, don't reason from the field name**: in the McDonald's system, "crew labor" is a
decades-old misnomer for the hourly bucket. In this data model, `crewLaborPct` is the
**salaried-inclusive** one. A reader who assumes `crewLaborPct` means "just the crew" will get
it backwards.

Before Notes 35, the app's headline Labor % mixed these — reading FL higher than OK for
identical real performance, purely because of which fields were configured, not because FL
actually ran heavier labor.

## The decision (Notes 35, shipped v4.583)

**Headline Labor % = Punched Labor % (`punchLaborPct`), for every location, always.** It's the
only field with an even playing field across all 27 stores. Crew and Total remain available
separately, for transparency and a future Total-Labor view, but neither is the default and
neither should be blended into a district rollup alongside stores that don't have it.

A row with no punched value yields `null` (the resolver falls through to the auto Daily-Glimpse
punched %) rather than silently substituting Crew — silently swapping in a different-market
basis would reintroduce exactly the bug Notes 35 fixed.

## #211 requirement: Labor's shell "class" axis is labor basis, not crew-vs-management

An earlier framing of #211's Labor instantiation treated the third axis (alongside scope/period)
as a crew-vs-management split or filter — that framing was wrong on two counts. First, it wasn't
actually an open design question — Notes 35 already decided this. Second, it wasn't even the
right shape: it's not a two-way split, **it's `mode: 'filter'` over the three NAMED bases above,
defaulting to Punched.** A side-by-side crew/management column split would recreate the FL/OK
mixing bug Notes 35 fixed — the whole point of the axis is that Crew and Total are not safe to
show next to Punched as if they were comparable, and mixing configured with unconfigured stores
in one rollup is the exact failure mode this file exists to prevent.

### Five hard requirements for any shell/panel that surfaces this axis

1. **Default basis = Punched, every scope, always.** It is the only even playing field. Crew
   and Total are opt-in views, never the default.
2. **Crew/Total must render "not configured" for unconfigured stores — never `0`, never blank.**
   A zero here reads as "no management cost," which is false; it means the field doesn't apply.
   Same discipline already established for `darSchedHrs`: `v.total_scheduled_hours ?? null`
   (`supabase.js:1914`), where `|| 0` would have shown every store wildly under-scheduled.
3. **Any scope mixing configured and unconfigured stores must suppress or hard-flag the
   Crew/Total rollup.** Not a footnote — refuse to render a number that can't honestly be
   compared. This is the entire reason the axis exists.
4. **Derive "is this store configured?" from the data, per-store per-period** — from
   `salariedManagerHours` in `qsr_labor_summary` (`scripts/qsrsoft-ops-pull.mjs:61`) and `salMgr`
   on the Ops Report (`parsers/index.js:290,332` / `:469,497`). **Do not hardcode an FL/OK
   list.** The owner: the FL setup can change, and this is explicitly a multi-tenant concern —
   a future operator's configuration won't necessarily match this tenant's.
5. **Do not rename `crewLaborPct` / `tCrewLabor` / `monthly_targets.crew_labor_pct`.** Blast
   radius: `constants.js` (27 stores × target blobs), `store-dash.js`, `analytics.js`,
   `smart-targets.js`, `labor-basis.js`, and a live DB column. Display labels only — label the
   punched basis as **"Punched Labor % (all hourly)"** in any new UI, and carry a code comment
   recording the misnomer wherever `crewLaborPct` is read.

### Note: this is a DIFFERENT axis than `labor-basis.js`'s target-basis resolver

`src/engine/labor-basis.js`'s `resolveLaborTarget()` / `LABOR_BASIS_FIELDS`
(`tCrewLabor`/`tLabor`/`tBonusLabor`/`tCombLabor`) resolves which **target** field a store's
labor-% goal comes from (`DEFAULT_LABOR_BASIS = 'tCrewLabor'`) — a different concern from this
file's **actual**-side punched/crew/total basis. Don't conflate the two just because both use
the word "crew." See "No target/actual basis mismatch" below for why this doesn't matter in
practice today.

## ⚠ OPEN CONTRADICTION, 2026-08-12 — Labor instantiation is ON HOLD pending a measurement

The owner separately stated the formula: **Crew Labor % + Manager Labor % = Total Labor %**,
and **Punched Labor % is hourly-only**. Read at face value, this says Crew is a bucket that
does NOT yet include management dollars — Manager is the separate piece that gets added to
reach Total.

That directly contradicts this file's own shipped code comment (`parsers/index.js:313-317`),
which says Crew Labor % **already includes** salaried-manager dollars where a store is
configured that way — i.e. Crew already IS (Punched-equivalent-hourly + salaried), not a
distinct third bucket that combines with a separate Manager figure to produce Total.

**Do not resolve this by reading more code or by reasoning about it further.** Both framings are
internally consistent with different plausible QSRSoft column semantics, and the only way to
know which is actually true is a measurement against real `qsr_labor_summary` rows — something
neither the owner's PM session nor this session can run from this sandbox (the anon key returns
`[]` on that table; it needs the owner's authenticated access).

**Status: the owner is running that measurement.** Until the answer comes back:
- Labor instantiation for the #211 generic shell is **on hold** — building against the wrong
  definition of Crew would mean either mislabeling a real number or building a rollup formula
  that's silently wrong.
- **Food Cost is unaffected and unblocked.** Its class axis (Food/Condiment/Paper/Non
  Product/Op Supplies) was already fully decided independently of this question — keep building
  the generic shell with Food Cost as the first instantiation.
- Everything else in this file (the three-basis model, the five hard requirements, the
  no-rename constraint) stands regardless of how the Crew-definition question resolves — none
  of it depends on knowing exactly what's inside the Crew bucket, only on treating it as
  "possibly not comparable across stores" until proven otherwise per-store.

When the measurement comes back, update this section with the answer and remove the hold.

## No target/actual basis mismatch (confirmed by the owner, 2026-08-12)

Labor **targets and projections are hourly-basis in both markets** — so Punched actuals
(hourly-basis) grade against them correctly today. There is no target/actual basis mismatch to
chase here, despite `labor-basis.js`'s target-basis resolver defaulting to a field also named
`tCrewLabor`. **Recording this explicitly because this is the kind of cross-basis question that
gets re-litigated every six months** — the next person who notices "the target field says Crew
but the actual field defaults to Punched" and wonders if that's a bug should read this
paragraph before re-investigating.

## Multi-tenant implication

This tenant's configuration (FL has salaried-manager tracking, OK doesn't) is not universal.
**A future operator may have salaried management fully configured at every store** — in which
case Total Labor % becomes the meaningful, comparable basis for THEM, and Punched becomes the
comparability fallback rather than the default. The shell (and any future labor-basis UI) must
not assume this tenant's configuration — Punched-as-default and the per-store-derived coverage
predicate (requirement 4 above) are what make this portable; a hardcoded "OK stores don't have
Crew" branch would not be.

## Related

- `src/parsers/index.js:313-320` (DAR/summary parser) and `:436-443` (Ops Report parser) — the
  two shipped code comments this file was reconstructed from
- `src/engine/labor-basis.js` — the separate TARGET-basis resolver, not to be conflated with
  this file's ACTUAL-basis model
- `memory/project-inventory-control-redesign.md` §12b — #211's Labor-instantiation scoping,
  which cites this file for the class-axis design
- v4.583 changelog entry (`src/app/App.js`) — Notes 35's original ship note
