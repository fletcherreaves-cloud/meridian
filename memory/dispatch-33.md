# Dispatch #33 — Security build Phase 0a: Register Audit auto-pull + Any Transaction probe

**Board (2026-08-19), at time of writing:** `main` will be at the commit merging PR #441
(`memory/plan-security-loss-prevention.md`, `memory/notes-67-queue.md`, backlog §15). Read that
plan file's §0 before starting this — it explains why this dispatch is small and already fully
scoped rather than a research task. **Full spec: `memory/plan-security-loss-prevention.md`. Full
data-readiness context: `memory/data-acquisition-shopping-list.md` §A and §B.**

This dispatch is two independent, ungated pieces of work — do them in either order, or in
parallel if you prefer. Neither touches anything the other depends on.

---

## Part 1 — Register Audit auto-pull

**Everything except the pull already exists.** This is not new design — verified fresh against
current `main`:

| piece | status | location |
|---|---|---|
| Parser | ✅ built | `src/parsers/index.js:974` `parseRegisterAudit` — handles the grouped-row shape (employee summary row, then carry-forward detail rows) |
| Supabase table | ✅ exists | `audit_rows`, PK `(loc, date, emp)` — `src/lib/supabase.js:859` `saveAuditRows` |
| Loader | ✅ built | `src/lib/supabase.js:915` `loadAuditRows(daysBack=400)`, paged |
| Risk-scoring engine | ✅ built | `src/utils/register-audit.js` `analyzeRegisterAudit` — per-employee aggregation + flags |
| **Auto pull** | ❌ **missing** | today it's manual Excel upload only — `auditRows` is listed in `MANUAL_FED_SOURCES` (`src/engine/metric-source.js:40`) |

**The task: write `scripts/qsrsoft-register-audit-pull.mjs`**, following the existing pull-script
convention exactly — `scripts/qsrsoft-ops-pull.mjs` is the closest structural match (same host,
`api.reports.myqsrsoft.com`, same report-export shape). Specifically:

1. **Auth: use `scripts/lib/qsrsoft-auth.mjs`**, not the older direct-token-then-Playwright-
   fallback pattern CLAUDE.md's top-level doc still describes. That module mints a fresh Cognito
   ID token in-process per run (`USER_PASSWORD_AUTH`, no SECRET_HASH — this app client has none)
   rather than reading a stored token, because `#312` found stored `QSRSOFT_TOKEN`/
   `QSRSOFT_COGNITO_TOKEN` secrets are a ~1-hour-TTL credential that's expired 23 of every 24
   hours. Every pull script written since `#312` landed uses this module — follow it, don't
   reintroduce the stored-token pattern.
2. **Find the Register Audit report endpoint.** It is not yet identified in this codebase —
   you'll need to capture it the same way `qsrsoft-ops-pull.mjs`'s endpoints were found (browser
   DevTools → Network tab, run the Register Audit export from the QSRSoft UI, capture the request).
   The owner has already downloaded manual exports from this report multiple times (most recently
   `Register_Audit_20260801_to_20260818.xlsx`, referenced in the plan file), so the UI path is
   known even though the API call isn't yet.
3. **Reuse `parseRegisterAudit` as-is** for turning the response into rows — do not write a second
   parser. If the API response shape differs from the Excel export's column layout, adapt the
   fetch to produce the same shape `parseRegisterAudit` expects, rather than forking the parser.
4. **Write to `audit_rows` via the existing `saveAuditRows`** — do not write a new save path.
5. **Two-path auth, per this repo's standing rule for every new automated pull**
   (`CLAUDE.md` → "Adding a new automated pull — do all of these, in the same PR"): direct-token
   path first (fast), Playwright fallback on 401 (captures a fresh session) — `qsrsoft-auth.mjs`
   already gives you the token-minting half of this; confirm whether Register Audit's specific
   endpoint needs the Playwright in-browser-fetch pattern (like the DAR does, per
   `memory/project-qsrsoft-daily-activity.md`) or accepts a direct server-side fetch with the
   minted token (like the newer Cognito-based pulls do) — **measure this, don't assume it matches
   DAR just because both are under `api.reports.myqsrsoft.com`.**
6. **Do all five items from the standing "new automated pull" checklist, in this same PR:**
   - Add the workflow's exact `name:` to `.github/workflows/sync-failure-watch.yml`'s `workflows:`
     list (`src/__tests__/sync-failure-watch.test.js` enforces this both directions — get the name
     wrong and the test catches it).
   - Register Audit's staleness must be visible **per-stream**, not pooled into a single
     `Math.max` freshness check (`#171`'s lesson — a pooled check hid a dead LifeLenz stream for 6
     days).
   - `audit_rows` already has `tenant_id`/RLS as an existing Supabase table — confirm it, don't
     assume; this is an existing table being fed a new way, not a new one.
   - **Keep the manual Excel upload as fallback** — do not remove it. Per the auto-first standing
     rule, the auto pull should be freshest-wins on top of it, never a replacement that breaks if
     the pull fails.
   - New GitHub Action workflow (`.github/workflows/qsrsoft-register-audit-pull.yml`), daily,
     matching the existing pull cadence (10:00 UTC, alongside DAR/eBOS) unless there's a reason to
     differ.
7. **Backfill.** Per CLAUDE.md's standing rule ("data depth is never the limiter — backfill it"),
   once the pull works, run it across the available history rather than starting the standing
   table from today forward — check how far back the Register Audit report itself goes before
   assuming a fixed window.

**What this unlocks (context, not part of this dispatch's own scope):** this is rung 2 of
`data-acquisition-shopping-list.md`'s attribution ladder — employee × store × day. It closes the
data gap for nearly all of `plan-security-loss-prevention.md` §2.1's cash/POS methods (T-Red
before/after, POS overrings, refunds by tender type, promo/discount rate, manager-meal abuse, cash
over/short — all already columns in the existing export). **Do not build the scoring/baseline
layer on top of it in this dispatch** — that's Phase 1, a separate, larger piece of work once this
data is flowing automatically and someone has looked at real auto-pulled rows.

---

## Part 2 — Any Transaction probe: settle the Tier A question

**This is a capture-and-report task, not a build task.** `data-acquisition-shopping-list.md` §B
already has an owner-approved three-tier design (Tier A: exception-transactions-only, district-
wide, daily standing pull; Tier B: full detail, one store × date range, on-demand; Tier C: full
district-wide standing — rejected). **The one open question that decides whether Tier A is
buildable:** can the Any Transaction report filter server-side to exception types, or does it only
return everything for a given store/register/date/time-window?

A real capture already exists (`Any_Transaction_3708_20260818_Register_13_10001300.xlsx`,
referenced in the plan file) — but it was filtered by **store + register + date + time-window**,
not by exception type, so it doesn't answer this question. What's needed:

1. In the QSRSoft UI, attempt to run an Any Transaction export **filtered to an exception type**
   (e.g. voids, refunds, or overrings only) rather than all transactions for a register/window.
2. Capture the actual API request (DevTools → Network tab) if the UI supports that filter, to see
   the parameter shape.
3. **Report back, don't build yet:**
   - If it filters server-side → Tier A is viable as designed; this becomes its own follow-up
     dispatch to actually build the standing pull.
   - If it only accepts a date range without an exception-type filter → flag this explicitly
     (per `data-acquisition-shopping-list.md` §B, "Outcome 2 is the one that needs a judgement
     call rather than a build" — full-firehose egress cost needs a real measured decision, not an
     assumption) rather than proceeding straight into implementation.
   - If it's one-date-at-a-time with no range and no filter → Tier A is dead; say so plainly.
     Register Audit (Part 1 above) carries all standing attribution in that case, and Any
     Transaction becomes Tier-B-only (on-demand, investigation-triggered).

Also worth confirming while you're in there, since it's free once you're looking at a response:
does a genuinely flagged/exception row populate the `View Details`/`Camera` columns that were
empty in the all-sale sample already captured? (Noted as an open question in the plan file §7 —
camera/video linkage may already be wired at the transaction level, unconfirmed.)

---

## Explicitly not in this dispatch

- Any scoring/baseline/risk-engine logic (Phase 1 of the plan file — separate, larger dispatch,
  after this data is flowing).
- The employee rule-out / evidence-chain mechanism (plan file §5) — gated on an owner decision
  and on RLS hardening landing first. Do not start this.
- Deposit lapping detection — settled unbuildable against QSRSoft data, do not scope it.
- Anything from `notes-67-queue.md`'s IA/navigation reorganization — separate workstream, needs
  its own scoping pass against current panel/routing structure before it's dispatch-ready.
