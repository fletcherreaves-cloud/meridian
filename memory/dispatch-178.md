# Dispatch #178 — Inventory Intelligence panel: get it SOME cloud automation before Sat 8/29 (best-effort)

## Owner context (2026-08-27, EOM inventory-count audit, count starts Sat 2026-08-29)

Item #3 from a PM-run audit: the Inventory Intelligence panel (`src/views/inventory.js`) reads
`qsr_inventory_summary`, which has **never been populated by any pull script** — confirmed live
(`select=*&limit=1` → `[]`). The panel already handles this gracefully (shows a `"☁ no cloud data
yet"` badge, falls back to manual Excel upload only, per code at `inventory.js` ~line 530-538) —
this is not a crash, it's a genuine automation gap. Owner: *"let's do whatever we can to fix
number three also"* — explicitly a best-effort ask given the short runway, not a demand for full
automation by Saturday. **Do not force a risky, rushed pull into production two days before a
physical count if it isn't clearly safe** — a partial, well-labeled improvement is a fine outcome;
report back precisely what you found either way.

## What `qsr_inventory_summary` actually needs, and two real leads — investigate both

`saveQsrInventorySummary`/`loadQsrInventorySummary` (`src/lib/supabase.js` ~line 3770-3805) expect,
per WRIN per period: `startInv`, `purchases`, `endInv`, `actualUsage`, `usagePerDay`,
`daysSupply`, `caseSz`, `cost` — a period-over-period USAGE/TURNOVER shape, not a point-in-time
snapshot. This is a genuinely different report than what's already pulled — confirmed by checking
what IS already live:

- `qsr_onhand` (already pulled, fresh, 7,592 rows for period 2026-08 as of today) is a
  POINT-IN-TIME on-hand snapshot per WRIN (`cases`/`packs`/`loose`/`total_units`/`on_hand_amt`/
  `last_counted`) — NOT the same shape. Cannot be a drop-in substitute alone.
- `qsr_ebos_daily` already carries daily purchase $ by category (food/paper/ops/hm/other) — could
  supply the `purchases` leg, but only in aggregate, not per-WRIN.
- `qsr_raw_item_detail`'s `history[]` (per-WRIN transaction ledger: `invoice`/`pos_sales`/`waste`/
  `inventory` events with qty deltas) is EXACTLY the kind of data `startInv`/`endInv`/`actualUsage`
  could be derived from — but today it's only pulled for the top ~20 (about to become top ~50 per
  dispatch #179) highest-variance WRINs per store, not the full catalog. Would need to cover every
  WRIN to fully replace the missing report, which may not be practical by Saturday.

**Lead A — a real QSRSoft report may already exist and be reachable.** `qsrsoft_kb` (public-read
Supabase table) has an article titled **"Video - Inventory Summary and Usage Report"**
(`html_url`: `https://support.qsrsoft.com/hc/en-us/articles/8554441459991-Video-Inventory-Summary-and-Usage-Report`)
— a video-only entry (no `body_text` to read directly), but its EXISTENCE as a named report
strongly suggests a real QSRSoft page with exactly this shape (start/end/purchases/usage). Check
whether it's reachable via the SAME eBOS session `scripts/qsrsoft-ebos-pull.mjs` already
authenticates (same domain family, `prod.ebos.qsrsoft.com`) or a related `api.reports.myqsrsoft.com`/
`v3.myqsrsoft.com` endpoint the ops-pull scripts already use — check for an endpoint path
resembling `inventory_summary`/`usage` the way `purchase/store_ledger` and `raw_detail/{id}`
already work. If a real endpoint is found with a similar auth shape to what's already working,
this is likely the fastest, safest path (reuses existing, already-battle-tested auth — no new
credential/session risk).

**Lead B — derive from already-pulled atoms, per this repo's own standing rule** ("Data depth is
never the limiter... prefer deriving from already-pulled atoms over adding a new manual upload").
If Lead A doesn't pan out quickly: could a MEANINGFULLY USEFUL subset of `qsr_inventory_summary`
be derived today from what's already live — e.g. `startInv`/`endInv` from two `qsr_onhand`
snapshots (start-of-period vs. most-recent), `purchases` from `qsr_ebos_daily` (aggregate, or
per-WRIN once `qsr_raw_item_detail`'s coverage widens per #179), `actualUsage` as the derived
remainder? This wouldn't need a new QSRSoft endpoint at all — just a computation over data already
in Supabase. Likely won't be 100% complete (aggregate purchases can't be split per-WRIN without
`qsr_raw_item_detail` coverage), but a partial, clearly-labeled fill may beat an empty panel.

## Task

1. Spend a bounded amount of time (a few hours, not multiple days) chasing Lead A first — it's the
   cleaner outcome if it exists. Use the existing eBOS DevTools-capture / endpoint-discovery
   pattern already established in this repo's other pull scripts as the method.
2. If Lead A doesn't produce a safe, well-understood endpoint in that window, evaluate Lead B —
   implement it only if the derived numbers can be validated against something real (e.g.
   `qsr_onhand`'s own `on_hand_amt` as a sanity check on a derived `endInv`), and clearly mark
   which fields are DERIVED (lower confidence) vs. a real report (if any fields do end up
   API-sourced from Lead A for a subset of WRINs).
3. **If neither produces something safe to ship by Saturday**: do not force it. Instead: (a)
   confirm the panel's existing "no cloud data yet" fallback messaging is accurate and the manual
   Excel upload path still works correctly (a quick smoke check, not a new feature), and (b) write
   up exactly what you found for both leads — endpoint paths tried, what worked/didn't, and what a
   focused follow-up dispatch would need — in a `memory/finding-*.md` file, matching this session's
   established investigation-write-up convention.
4. Whatever you ship (full auto pull, partial derive, or neither), it must go through this repo's
   standard "new automated pull" checklist if it adds a new cloud stream (CLAUDE.md's Dev Rules:
   wire it into `sync-failure-watch.yml`, add its `dsField` to `stream-freshness.js`'s `STREAMS`,
   `tenant_id` + RLS, keep manual upload as fallback, two-path auth) — but only the pieces that
   actually apply to whatever you build; don't build scaffolding for a pull that doesn't exist.

## Verification

- If a real pull ships: prove it against live data the same way dispatch #172/#175 did (name the
  credential, show the real response, show it landing correctly in `qsr_inventory_summary`), plus
  standard suite + build.
- If a derived fallback ships: a test proving the derivation is arithmetically correct against a
  known fixture, and that it's clearly distinguishable from a "real" pull in the data/UI.
- If neither ships: the finding write-up itself is the deliverable — no code change required, but
  don't skip writing it up. Confirm you didn't touch the panel's existing (working) manual-upload
  and empty-state behavior.

## Out of scope

- `fob-components`/`purchases-posted` (dispatches #176/#177 — unrelated checks).
- A full rebuild of the Inventory Intelligence panel's UI/scoring — this dispatch is about getting
  SOME cloud data flowing into the existing panel, not redesigning it.
