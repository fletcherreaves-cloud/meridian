---
name: dispatch-50-implementation
description: Implements dispatch #50 (Security panel scroll fix + frictionless reveal for the privileged tier) end to end, plus INV-004 (waste-log padding, manager x day-part x store) after the owner corrected dispatch #48's "no day-part denominator" premise mid-session -- qsr_daily_activity already carries the hourly sales figure. Adversarially probed the new bulk-reveal RPC and the security_findings.daypart migration against a real local Postgres instance, not just read the SQL.
metadata:
  node_type: memory
  type: project
---

# Dispatch #50 implemented — scroll fix, frictionless reveal, and INV-004

2026-08-20/21. Full brief: `memory/dispatch-50.md`. Both Parts A and B shipped, plus INV-004 after
the owner's own mid-session correction to dispatch #48's premise (see below).

## Part A — the modal scroll fix

Root cause matched the dispatch's own diagnosis exactly: `security-panel.js`'s root flex column
(then :431) had NO `overflow` set, so it never qualified for CSS's "automatic minimum size is
zero" exception a flex item with non-visible overflow gets — it refused to shrink below its own
content, grew past `ModalShell`'s 88vh cap, and `ModalShell`'s own `overflow:'hidden'` clipped the
overflow instead of ever showing a scrollbar. `minHeight: 0` added at **both** the root column and
the body `flex:1/overflowY:'auto'` div — the dispatch's own instruction was to verify whether the
root needed it too, and structural CSS reasoning (documented inline) said yes: per spec the body
div's own `overflowY:'auto'` should already self-qualify, but the root div, having no overflow
property of its own, was the one actually refusing to shrink.

Verification renders through the real `SecurityPanel` (this repo's own established pattern —
`react-dom/client` `createRoot` + `happy-dom`, matching `security-panel.test.js`'s existing #46
render tests), not a standalone style-object assertion — 40 synthetic findings per domain, checked
across the Cash and Inventory tabs and through an expanded finding. happy-dom does not compute real
CSS layout (no `scrollHeight`/`clientHeight`), so this proves the fix is wired into the real render
output (a reverted JSX edit fails these tests) rather than literal pixel-level scroll behavior —
that still wants a click-through in the live app, per `feedback-verification-in-sandbox.md`'s own
honest split (Supabase-authenticated panel content can't be opened in this sandbox at all).

**Grep sweep for the same shape elsewhere**, per the dispatch's own instruction: found five other
`ModalShell` call sites using a custom `bodyStyle:{display:'flex',...}` internal layout (App.js's
Forecasting Reference and Forecast Audit modals, `management.js`'s Settings modal,
`performance-reviews.js`'s modal). None share Security's exact broken shape — each either has NO
intermediate flex-column wrapper between `ModalShell`'s own body and the scrolling content (Settings,
Forecast Audit — sidebar+content are direct children), or the intermediate wrapper already sets its
own `overflow:'hidden'` (Forecast Audit's row wrapper, Performance Reviews' `customize` tab div),
which per the same CSS reasoning should already self-qualify. **Listed, not fixed** — verified as
structurally different from Security's own bug, not confirmed broken, and none had an owner report
against them.

## Part B — frictionless reveal for the privileged tier

New RPC `reveal_employee_identities_bulk(p_tokens uuid[], p_reason text)`
(`schema-identity-vault-bulk-reveal.sql`), mirroring `reveal_employee_identity()`'s exact role gate
— same IF/ELSIF/ELSE-with-unconditional-final-ELSE shape the NULL-role-bypass incident fix
established, not restructured. Panel-side: a new mount-time effect (gated on `userRole === 'admin'`
only — "Developer/Admin/Owner" collapses to that one real DB role value; supervisor/manager/GM keep
the existing click-through path, unchanged) collects every distinct `empToken` from the loaded
findings and seeds `RevealName`'s already-lifted cache (`revealed`/`onReveal`,
`security-panel.js:376`) directly — `RevealName` itself needed zero changes, exactly as the dispatch
predicted.

**Log granularity, decided deliberately**: one row per session-view (`token_count`), not one row per
token — a hundred findings would otherwise write a hundred rows every panel open.
`identity_reveal_log.person_token` was `not null` and FK-constrained, so this required an actual
schema decision (`schema-identity-vault-bulk-reveal.sql`): `person_token` made nullable,
`token_count integer` added, a check constraint (`person_token is not null or token_count is not
null`) keeps the table from ever holding a genuinely empty row.

**Adversarially probed with a real local Postgres instance**, not just read as SQL — per the
dispatch's own "MANDATORY, not boilerplate" instruction and the standing incident this session keeps
citing (`incident-reveal-rpc-null-role-bypass-2026-08-20.md`, where a green test suite did not catch
a NULL-role bypass). Built a scratch Postgres 16 cluster (`initdb`/`pg_ctl`, run as the system
`postgres` user), a minimal `auth.uid()` stand-in reading a settable session config, and real `anon`/
`authenticated` Postgres roles matching Supabase's own convention. 11 probes, all as designed:
- **anon, no session claim** → `permission denied for function` at the GRANT level — never reaches
  the function body at all.
- **`authenticated`, no `profiles` row** (the exact incident shape — `get_my_role()` returns NULL) →
  rejected by the trailing unconditional `ELSE`, not silently passed.
- **office_staff** (entitled to nothing) → rejected.
- **manager, org flag off** → rejected with the specific message; **manager, flag on** → succeeds.
- **supervisor / admin** → both succeed, return both real names.
- **empty `p_tokens`** → zero rows returned, **zero log rows written** (verified via a before/after
  count).
- **empty reason** → rejected regardless of role.
- **log row shape after every successful call**: `person_token` NULL, `token_count` correct, **no
  employee name in any column of the log row** — only role/reason/count.
- **the legacy single-token RPC still works unchanged** — `person_token` set, `token_count` NULL,
  old and new log shapes coexist correctly.
- Eyeballed every error message printed across all 11 probes: none leak a name.

## INV-004 — owner correction mid-session, then built same-night

**The premise was wrong, and the owner caught it the same way the `manOverringQty` finding was
caught: check the schema before deferring.** Dispatch #48's original text said INV-004 needed a
day-part sales denominator that didn't exist. It exists: `qsr_daily_activity` carries
`net_sales`/`product_sales`/`transactions` per `(loc, dt, hour_slot)`, an hourly grain, finer than
day-part — confirmed live (a single sample row) before writing any code.

**Boundary, measured, not invented.** Checked live whether `qsr_waste.busn_dt` needs a
calendar-to-business-date shift before joining against `qsr_daily_activity.dt` (which is already
4am-aligned): 0 of 26,443 `qsr_waste` rows carry a `busn_tm` in 00:00-03:59, the one window that
would settle it directly. This is NOT because the business is closed then — `qsr_daily_activity`
confirms 238,781 real transactions across 26 stores in that exact wall-clock window over the DAR's
full history — it means waste specifically isn't logged there. With no live counter-example, this
follows the column's own name (`busn_dt` = business date) and `qsr_daily_activity`'s own established
alignment: joined directly, no shift applied. Day-part bucketing reuses `daypartOf()`
(`src/engine/labor-standard.js`, the VLH guide's own boundaries) rather than inventing a second
boundary set, via a small `daypartFromBusnTm()` wrapper that maps a wall-clock hour into that same
`05:00→28:00` wrapped shape.

**Scope: manager × day-part × store, the third subject grain** (beyond `computeFindingsForRule`'s
`(loc,empToken)` and `computeItemFindingsForRule`'s `(loc,wrin)`) — `qsr_waste` has no `wrin`
(event-level, not item-level), so item-level grouping stays INV-003's own territory. New
`computeManagerDaypartFindingsForRule()` in `scripts/security-rules-run.mjs`, reusing
`storeBaseline()` exactly as INV-003/005 do, pre-filtered to the SAME daypart (peer stores' own rate
for that same day-part, pooling across whichever managers logged waste there).

**`security_findings` schema change**: the existing subject shape (`emp_token` XOR `wrin`) had no
room for a third dimension — two findings for the same manager/store in different day-parts would
collide on the same `subject_key` and silently overwrite each other. Added a nullable `daypart`
column and extended the generated `subject_key` expression
(`schema-security-findings-daypart.sql`) — the existing `security_findings_one_subject` check
constraint needed no change (it already permits `emp_token` set / `wrin` null, exactly INV-004's
shape; `daypart` is an additive disambiguator, not a fourth subject type).

**This migration was also verified against a real local Postgres instance**, not just read: applied
the real `schema-security-findings.sql` + this migration in sequence, then proved (1) the same
`emp_token` in two different day-parts produces two distinct `subject_key` values, no collision;
(2) a repeated insert for the SAME `(emp_token,loc,rule,window,daypart)` correctly upserts via the
unique index rather than duplicating; (3) a pre-existing old-shape row (`daypart` never set) still
inserts and generates a stable key — backward compatible; (4) the untouched
`security_findings_one_subject` check constraint still correctly rejects a row with both `emp_token`
and `wrin` set.

**Measured 2026-08-20, live `qsr_waste` × `qsr_daily_activity` join, 2026-05-01 through 2026-08-20**
(grouping key for THIS measurement used the raw eID, since `qsr_waste.emp_token` — PR #498's own
vault-extension column — does not exist on the live table yet as of this migration; the dollar
distributions themselves don't depend on which identity column labels each bucket, only the actual
rule code reads `emp_token`): rate = wasteAmt/daypartSales×1000, n=636 subjects post
`min_denominator=250`, median=12.99, p90=47.06, max=1274.79. `daypartSales` denominator: 23 of 687
raw subjects had a non-positive sum (a real DAR data-quality artifact, some `(loc,dt,daypart)`
buckets sum to a small negative `product_sales`) — `min_denominator=250` clears all of these plus
the genuinely tiny-exposure tail, sitting comfortably below the unfiltered population's own p10
(666.29). Peer-baseline stdev (per-daypart, leave-one-out across stores, n≥5 peers), n=128: p5=5.83,
p10=5.96, median=7.40 — zero exact-zero, zero below 1, a well-behaved distribution unlike INV-005's
own metric — checked before shipping, per dispatch #45b's own standing lesson, not discovered live.
`min_value:13` (population median), `min_denominator:250`, `min_stdev:1` (comfortably below p5).
Lands `active: false`, per dispatch #48's own "all three land inactive" instruction — carried
forward even though the "no denominator" premise that originally justified deferring INV-004 was
corrected.

**Stated limitation, not discovered later**: until dispatch #49's vault re-key lands (Phase 0 has
not run as of this migration — checked live before writing this), INV-004's manager findings will
NOT group with that same person's CASH findings under one `emp_token` — separate token spaces
(`qsr_waste.manager` is an eID, `audit_rows.emp` is a name). Documented in the migration's own
header, not left to be found later.

## Verification

Full suite 1812/1812, build clean (entry-chunk unaffected — no new panel code beyond the two
`minHeight:0` edits and the mount-time reveal effect). `node --check` on the modified `.mjs`.
Two live adversarial local-Postgres probes (the bulk-reveal RPC's role gate; the `security_findings`
daypart migration's generated-column and constraint behavior) — both real Postgres 16 instances,
not read-only SQL review.
