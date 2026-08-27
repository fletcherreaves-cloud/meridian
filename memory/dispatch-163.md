# Dispatch #163 — Fix the pooled freshness check (#171) that let LifeLenz silently fail for
# 6 days without alarming

**Context (2026-08-27):** CLAUDE.md's Dev Rules cite this as still-open: *"Make its staleness
visible per-stream, not pooled. At-A-Glance's freshness check takes a single `Math.max` across
feeds, so one dead stream is invisible while any sibling is current — that is WHY the six days
went unnoticed. See #171."* This is a real, already-diagnosed root cause from a real incident
(LifeLenz sync silently dead 2026-08-06 → 08-11) — this dispatch is the fix that was flagged but
never built.

## What already exists (read the code, don't re-derive)

- **At-A-Glance's freshness banner** — find the actual `Math.max`-across-feeds computation
  (grep for the freshness/staleness banner logic in `src/views/analytics.js` or wherever At-A-
  Glance's top-level tiles live — CLAUDE.md's Data-Refresh sprint notes mention this banner was
  "re-anchored to the newest date across all auto streams" as a v4.4xx fix, which is the SAME
  pooled-max pattern this dispatch needs to move away from, not duplicate).
- **`.github/workflows/sync-failure-watch.yml`** and its own test
  `src/__tests__/sync-failure-watch.test.js` — CLAUDE.md's standing rule requires every scheduled
  pull workflow to be watched here. This is a DIFFERENT mechanism (GitHub Actions-level failure
  detection) from the in-app freshness banner this dispatch targets — read both to understand
  which layer actually would have caught the 6-day LifeLenz gap (a failure THAT LOOKS LIKE
  SUCCESS — the workflow ran, but the underlying data didn't update — is exactly the kind of
  failure `sync-failure-watch.yml` may not catch either; confirm this before assuming either
  mechanism alone is sufficient).
- **The known list of auto/emailed streams** (CLAUDE.md, "Adding a new automated pull" standing
  rule): DAR `qsr_daily_activity`, `qsr_fob`, `qsr_ebos_daily`, `lifelenz_schedule`; emailed
  `daily_glimpse_daily`/`sales_ledger_daily`/`cash_sheet_daily`. Each needs its OWN
  last-updated-date surfaced, not folded into one pooled max.

## Scope

1. Find the exact freshness-banner code and confirm the pooled-`Math.max` pattern lives there
   (measure, don't assume — the banner may have already changed shape since the LifeLenz
   incident; read the CURRENT code before writing a fix for a bug that might already be gone).
2. If the pooled pattern is confirmed still present: change the banner (or add alongside it) a
   **per-stream** staleness indicator — each of the named streams above shows its own
   last-updated date, and the banner/alert fires per-stream, not only when ALL streams are stale
   at once. A single dead stream behind fresh siblings must be visible.
3. Decide the UI shape (a small per-stream badge row, an expandable detail under the pooled
   summary, or replacing the pooled summary entirely with per-stream rows) — your call, but the
   pooled headline number can stay as a quick-glance summary IF the per-stream detail is always
   reachable, not hidden behind a debug mode.
4. Tests: a scenario with one stream stale and the rest fresh must surface a visible alert for
   the stale one specifically — the exact case that went undetected for 6 days. Render-based,
   touching the real banner component.

## Explicitly out of scope

- `sync-failure-watch.yml`'s own mechanism — if you find a gap there too, flag it as a separate
  follow-up, don't expand this dispatch into rewriting GitHub Actions config.
- Adding new data streams or pull scripts — this is a freshness-DISPLAY fix only.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`. `npm run build` clean, report before/after entry-chunk gzip.
- PR body must state: (a) whether the pooled-max pattern was confirmed still present, with the
  exact file/function; (b) the per-stream UI shape chosen and why; (c) confirmation the new test
  reproduces the LifeLenz-class failure (one stale stream hidden behind fresh siblings) and would
  have caught it.
