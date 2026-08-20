---
name: dispatch43-security-panel
description: Implements dispatch #43 Phase 1 — the Security panel, a read-only investigation surface for security_findings, grouped by subject (not by rule). Owner-requested 2026-08-20. security_findings had zero references anywhere in src/ before this.
metadata:
  node_type: memory
  type: project
---

# Dispatch #43 — the Security panel, Phase 1 implemented

2026-08-20. `memory/dispatch-43.md`. Owner-requested: *"We should build out the security panel
UI... an entire modal to house security events."* Before this, `security_findings` (dispatches
#39/#40/#42) had zero references anywhere in `src/` — the batch job wrote findings, nothing read
them. The only way to see one was a SQL query pasted into the Supabase console.

## The central design call — group by SUBJECT, not by rule

The batch job's natural output is rule-major (4 cash rules × 670 subjects = 2,680 rows). Rendered
that way, one employee flagged on three independent signals reads as three unrelated rows in three
lists — the single most informative fact about them (convergence across independent signals) is
the one thing rule-major rendering destroys. `groupFindingsBySubject()` collapses to one row per
`(loc, subject)`, carrying every rule's verdict, sorted by how many rules agree (`flaggedCount`
desc) then by the worst flagged value. This also implements plan §1 principle 4 (exoneration) for
free — a subject's PASSED rules render right next to the one they failed, since every verdict is
kept, not just flags.

## What was built

**`src/lib/supabase.js`** — three new loaders, following the existing conventions:
- `loadSecurityFindings()` — paginated via the existing `fetchAll()` helper (dispatch #40's own
  INV-001 rule alone produced 5,165+ rows on its first live run, past the 1000-row cap).
- `loadSecurityRules()` — rule metadata (`method`, `description`, `active`, `baseline_type`,
  `severity`, `window_days`) for the "calibration honesty" requirement below.
- `loadGmIdentityRevealEnabled()` — reads `org_config.gm_identity_reveal_enabled` client-side
  (that table's RLS is "authenticated read," so this is a real, permitted read, not a bypass).

**`src/views/security-panel.js`** — the panel itself (new file, lazy-loaded, its own chunk):
- `securityPanelAccess(userRole, gmRevealEnabled)` — pure. admin/supervisor always allowed
  (matches `security_findings`' RLS exactly); manager allowed ONLY when the org flag is on;
  everything else denied. **RLS returns `[]` to an unauthorized role, indistinguishable from "no
  findings" on the wire** — this function is the one place that decision gets made, and the panel
  never lets an empty read stand in for a permission check. For admin/supervisor, no network call
  is needed at all (known allowed from the role alone); for manager, the panel awaits the live
  `org_config` check before ever calling `loadSecurityFindings()`.
- `verdictState(pass)` — the honest three-state mapping (`true`→flagged, `false`→clear,
  `null`→undetermined). Rendering null as clear was named a correctness bug in the dispatch, not a
  display nicety — this is the one place that mapping happens.
- `groupFindingsBySubject(findings)` — described above.
- `scopeMatches(loc, scope)` — All → State → Org → Store, per
  `memory/feedback-selector-ui-standard.md`.
- The component itself: domain tabs (Cash/Inventory — employee subjects vs. WRIN subjects, never
  mixed in one list), scope pills, rule + minimum-agreeing-signal filters, a subject list
  (signal-count badge, `RevealName`-gated identity for cash subjects, per-rule verdict chips), and
  an expand-in-place drill-down showing each rule's `value`/`threshold_used`/`baseline_context`
  and honest-null reason. Every rule's `active` state renders inline (⏸ + dimmed) and a finding
  from an inactive rule is visibly marked historical, not current truth — the "calibration
  honesty" requirement: `INV-001`/`INV-002` are `active=false` right now (dispatch #42), and this
  panel must never present their old output as current.
- Reused, not rebuilt, per the dispatch's own instruction: `RevealName` (`store-analytics.js`,
  dispatch #38) for the click → reason → RPC → cached-name flow; `ModalShell` for the shell.

**Permission wiring is two layers, deliberately**:
1. `permissions.js` gets a new `security.view` key — `admin: true`, `supervisor: true`, `manager:
   true`. This is a STATIC per-role template and can't express an org-wide runtime flag, so
   `manager: true` here only means "let them see the nav entry and let the panel resolve the real
   answer" — never treated as sufficient on its own.
2. `securityPanelAccess()` inside the panel does the REAL, live check — the one that actually
   matches RLS. Documented explicitly at both call sites so a future reader doesn't mistake the
   static key for the real gate.

`panel-registry.js` — new `security` entry (`kind:'nav'`, `section:'people'`, `perm:
'security.view'`). `shell.js` — nav item in the PEOPLE / HR section. `App.js` — `showSecurity`
state, `onOpenModal` dispatch, `ModalShell` render, `anyModalOpen` inclusion, Escape-hatch
inclusion — all four of `panel-registry.js`'s own documented "don't hand-edit these lists
separately" wiring points, verified against the actual live code by `panel-registry.test.js`
(20/20 passing, unmodified — the existing suite is what confirms the wiring, not a new one).

## A real bug found by the STRICTER test, not by inspection

The data-loading `useEffect` originally depended on `[permState, dataState]` — but the effect
itself SETS `dataState` (first to `'loading'`, later to `'loaded'`). That self-reference is a real
React footgun: setting `dataState` triggers a re-render, which changes one of the effect's own
dependencies, which makes React re-run the effect — but React always runs the PREVIOUS effect
instance's cleanup first, and that cleanup set `cancelled = true`. The in-flight fetch that was
about to call `setDataState('loaded')` checked `if (cancelled) return` and silently discarded its
own result. Net effect: the panel got stuck on "Loading findings…" forever, immediately after the
very state transition meant to end that state.

This was NOT caught by the first version of the "admin, real findings" test — that test only
asserted the loader was called and the panel didn't say "not permitted," both of which stayed true
even while genuinely stuck loading forever. It WAS caught by a stricter test explicitly checking
that a permitted-but-empty result reads a different, positive message ("no findings match") — that
assertion could never pass while stuck loading, which is exactly the point of writing an assertion
that pins the actual end state rather than just the absence of a wrong one. Fixed by dropping
`dataState` from the effect's dependency array (the internal guard `dataState !== 'idle'` still
does its job; it just must not also retrigger the effect).

## What's explicitly NOT in this dispatch (Phase 1 scope, per the brief)

- **Phase 2 (triage state — reviewed/dismissed/escalated)** — a new `security_finding_status`
  table, deliberately a separate PR from Phase 1 per the dispatch's own instruction.
- **Coexistence deep-links** (Register Audit tab flag markers, an `attention-now.js` candidate
  surface) — the dispatch says "evaluate it, don't force it." Not built this pass; a real,
  reachable Phase 1 investigation surface (the modal itself) is the actual deliverable, and these
  are additive polish once real findings exist to link into.
- **Rule authoring/editing UI**, **notifications/alerting**, **SAGE integration** — explicitly out
  of scope per the dispatch's own §7.
- **WRIN item descriptions** — the inventory-domain subject list shows the raw WRIN code, not the
  item description (`qsr_variance_stat.descr`). Findings alone are the source of truth per the
  "reuse, don't recompute" instruction; joining in `qsr_variance_stat` just for a label is a real,
  small follow-up, not done here to keep this loader single-table.

## Verification

- 15 new tests (`src/__tests__/security-panel.test.js`): pure-logic coverage for all four exported
  helpers, PLUS component-level **wiring** tests (standing rule from #366) — permission states
  (admin/supervisor never query `org_config`; manager does and is gated by its result; an
  ineligible role is denied without any network call), three-state verdict grouping/sorting on a
  hand-built 5-finding/3-subject fixture, and the "permitted-but-empty ≠ not-permitted" distinction
  that caught the effect bug above.
- `panel-registry.test.js`: 20/20 passing unmodified — confirms the four wiring points (nav,
  dispatch, render, anyModalOpen/Escape) actually match the live code, not just this file's claims.
- Full suite: 1705/1705 passing (159 files). `npm run build` clean — `security-panel` is its own
  lazy chunk (8.33 KB / 3.31 KB gzip), not part of the eager entry bundle. Entry chunk moved
  510.39 KB → 510.94 KB gzip (the small, eager `panel-registry.js`/`permissions.js`/`shell.js`
  metadata additions) — still 337 KB under the 850 KB budget.
- No `rgba(255,255,255,X)` literals — checked directly, theme tokens used throughout.
- **Not verified**: an actual browser click-through. This sandbox's Supabase project requires
  real magic-link auth to reach an authenticated session, which cannot be completed headless here
  — stated plainly rather than claimed. Component-level tests cover the states a live click-through
  would otherwise exercise (three permission states, three-state verdict rendering, subject
  grouping/sorting), but a real session's first open of this panel is worth a manual check.
