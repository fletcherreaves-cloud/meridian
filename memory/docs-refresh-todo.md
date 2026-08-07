---
name: docs-refresh-todo
description: Owner ask (2026-08-07) — the in-app changelog and other vital project docs need updating after the v4.856–v4.875 sprint. Lists exactly what is stale and where.
metadata:
  type: project
---

# Docs + changelog refresh — owed after the v4.856–v4.875 sprint

Owner flagged this on 2026-08-07: *"we need to update change log and other vital
information and documents."* Nothing below is done yet.

## 1. In-app changelog (`src/app/App.js`)
The changelog array in App.js has entries through roughly v4.855. The whole PR #98 sprint
is missing. Worth entries for the things a USER would notice, not the internals:

- **Swing alarm** — a store losing sales or guests for two weeks running now blocks the
  app until acknowledged, with who/when recorded. Atoka fired on day one.
- **Count Cycle panel** (Operations → Count Cycle) — enforces "Food + Condiment every
  week, Paper on the mid-month count".
- **Watch counts fixed** — "Watch Flags", the Watch filter, and the Watch tab had ALWAYS
  read zero. They now show real numbers, so counts will appear to jump.
- **Items Recounted tile** — was reporting "No ledger detail" while the data existed.
- **Startup** — removed 10 full-table scans per login; failed reads now announce
  themselves instead of looking like empty data.

## 2. CLAUDE.md
- Panel table needs **Count Cycle** and the swing alarm.
- The "Top Priorities" block still describes the v4.426 data-refresh sprint as current.
- Add the standing lesson from 2026-08-07: **a failed read must never be indistinguishable
  from an empty one.** That single confusion hid six broken tables.
- Note that `?trace=1` profiles startup and `?tablecounts=1` is separate (deliberately, so
  profiling doesn't add load to the thing being profiled).

## 3. `memory/panel-catalog.md`
Add Count Cycle. Cross-check against `src/app/panel-registry.js`, which is now the
authoritative list of all 79 panels and is enforced by tests — the catalog should point at
the registry rather than duplicate it.

## 4. Known-issue notes worth writing down
- **`pending_reports` stores base64 in a column, not Storage.** `supabase.js:126`'s own
  comment claims it uploads to a bucket; it does not. A 12.37 MB row is the symptom.
- **T1 startup is ~14.2s vs a 12.2s baseline.** Verified NOT caused by PR #98 (the T1
  await line is byte-identical to main). Leading suspicion is the per-loc RLS policies,
  which went live after the baseline was measured. Needs its own measured session — two
  hypotheses were already disproven by measurement on 2026-08-07, so do not guess.
