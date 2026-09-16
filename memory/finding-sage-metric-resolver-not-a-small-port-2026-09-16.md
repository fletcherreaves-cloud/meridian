---
name: finding-sage-metric-resolver-not-a-small-port-2026-09-16
description: "SAGE generic metric-resolver (Task #60) — measured NOT a small port; do not re-attempt as scoped"
metadata:
  node_type: memory
  type: finding
---

## Task #60 ("SAGE generic metric-resolver") — the original scope is wrong-sized, measured 2026-09-16

**Original framing** (this week's vacation-project lineup, owner-approved): *"replace SAGE's 7
hand-built query tools in `supabase/functions/sage-chat/index.ts` with one generic metric-resolver
tool porting `metric-source.js`'s ~50-metric auto-first sourcing logic server-side."* This reads
like a small, mechanical swap. **It is not** — measured via a dedicated scoping pass before any
code was written, per this repo's own "measure it, don't reason about it" standing rule.

### What's actually true

- **The 7 existing tools** (`sage-chat/index.ts`, ~700-750 lines total: `query_daily_activity`,
  `query_lifelenz_labor`, `query_labor_summary`, `query_forecast_snapshots`, `query_promo_roi`,
  `query_eom_recount_impact`, `query_smg`) all run **raw PostgREST queries directly against tenant
  tables** via the service-role client, then aggregate in plain TS. **None of them import or reuse
  `metric-source.js`.** RBAC is real and server-side: `sb.auth.getUser` → `profiles.accessible_locs`
  → a shared `applyScope(stores, allowed)` helper (lines 301-306) filters per-store results after
  every tool queries all stores for district context — this is code-level enforcement, not just a
  prompt instruction. `query_eom_recount_impact` already imports `src/engine/eom-ledger-baseline.js`
  directly, proving cross-boundary `src/engine/*` imports into this Deno function already work.

- **`metric-source.js` itself is pure and portable** — zero imports, no browser/DOM/React/
  localStorage dependency, ~90 registry entries (a portion are internal numerator/denominator
  "leg" metrics feeding derived ratios, consistent with "~50" real user-facing metrics). A typical
  entry:
  ```js
  oepe: { mode:'pos', direction:'lower',
    srcs: [['glimpseRows','oepe'],['qsrActSummaryRows','oepe'],['opsServiceRows','oepe'],['opsRows','oepe']],
    derive: { inputs:['oepeNumSec','dtTransCnt'], fn:(num,cnt)=> cnt>0 ? num/cnt : null, kind:'ratio' } }
  ```

- **The actual blocker**: every `srcs` entry reads from `ds[src]` (e.g. `ds.qsrActSummaryRows`,
  `ds.glimpseRows`) — and those are **not raw Supabase rows**. They're the client's already-loaded,
  already-aliased dataset arrays, built by `src/lib/supabase.js` (5,400+ lines) via per-source
  loader functions (e.g. `_qsrActFromSummed()`/`_finalizeQsrAct()`, lines 2620-2760+) that remap raw
  columns into the field names the registry expects (`sales`, `oepe`, `r2p`, `tpph`, `kvst`, etc.)
  through nontrivial derivation math (division, held-time subtraction, TPPH computation). **~15
  distinct loaded-row arrays** are referenced across the registry, each with its own aliasing logic.
  There's also a client-only lazy-fill subsystem (`configureLazyFill`, module-level mutable state
  wired from `App.js`) for 3 sources that would silently never populate server-side.

### Verdict — porting "the resolver" without the loaders is porting in name only

Most `srcs` chains would resolve to nothing without also porting (or re-deriving server-side) all
~15 loaders' field-aliasing/derivation logic — that's re-implementing a meaningful slice of
`supabase.js`, table by table, and then keeping it in **permanent lockstep** with the client
version forever after (drift risk on a tool the owner uses for real business decisions). This is
categorically bigger than "port a ~50-entry registry," and — combined with this session's
inability to deploy or test against the live `sage-chat` Edge Function at all (same gap every
other Edge Function change this session hit) — attempting the full replacement in one
unverifiable pass would be reckless on a live tool that answers real operational questions.

**Not attempted this session.** Two safer paths were identified but NOT built (no clear signal on
which specific missing metrics the owner actually wants SAGE to answer, and guessing would be
low-value busywork):
- **Path A (additive)**: a new tool alongside the existing 7 — not a replacement — covering only
  the 3-5 most-requested metrics' specific source chains + their loader logic, proven against real
  data before anything existing is touched.
- **Path B (shell-only)**: extract just the RBAC/`applyScope`/pagination scaffolding shared across
  the 7 tools into a reusable shell, without touching any per-metric query/aggregation logic.

**Before re-proposing this task**: get the owner's steer on which specific metric(s) SAGE can't
currently answer that matter enough to justify a new tool (Path A), rather than re-attempting the
full generic-resolver framing — that framing's core premise (metric-source.js's registry as the
portable unit) is now measured false.
