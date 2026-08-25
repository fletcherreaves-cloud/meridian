# Dispatch #119 — Mobile: wide tables clipped with no horizontal scroll (Promo/Discount ROI + a ratchet)

**Owner's ask, verbatim (2026-08-25):** *"Throughout environment > need to add side scroll to be
able to see all data on mobile. > Reference Promo Discount ROI."*

## Confirmed instance — Promo/Discount ROI

`src/views/promo-roi.js`, the results table (~line 58-59): the table's scroll container is
`{border:..., overflow:'hidden', maxHeight:300, overflowY:'auto'}` with the `<table>` itself set
to `width:'100%'`. Setting the shorthand `overflow:'hidden'` and then overriding only
`overflowY:'auto'` leaves the horizontal axis at `hidden` — on a narrow mobile viewport, columns
that don't fit get clipped with **no way to scroll to them**, while `width:'100%'` on the table
element (rather than a natural/min-content width) hides the fact that the row content actually
needs more horizontal room than the container has. This is the exact "can't see all the data on
mobile" symptom the owner named.

## Scope — this dispatch, concretely

1. **Fix `promo-roi.js`'s results table**: give the scroll container `overflowX:'auto'` (in
   addition to its existing `overflowY:'auto'`), and let the `<table>` size to its content
   (drop/relax the `width:'100%'` in favor of e.g. `minWidth:'100%'` plus intrinsic column
   sizing, or an explicit `width:'max-content'` — whichever renders correctly; verify visually)
   so the columns that don't fit become horizontally scrollable instead of clipped. Confirm the
   existing vertical scroll/`maxHeight:300` behavior is unaffected.
2. **Add a ratchet test** for this exact anti-pattern across the wider codebase, mirroring the
   existing `src/__tests__/ratchet-modal-backdrop-bypass.test.js` pattern (same idea: grep-based,
   bidirectional — fails if the count rises OR falls without the ceiling being lowered). Target
   pattern: a scroll container with the horizontal axis effectively `hidden` (via the `overflow`
   shorthand with no `overflowX` override) directly wrapping a `<table>` (or another
   demonstrably-wide row of fixed-width cells) in `src/views/` + `src/features/`. A rough count
   taken during this dispatch's investigation (grep for `overflow:'hidden'` co-occurring with
   `h('table'` in the same file) found **13 files** carrying some form of this shape:
   `dt-speedofservice.js`, `store-dash.js`, `analytics.js`, `labor-tools.js`,
   `store-analytics.js`, `record-day.js`, `inventory.js`, `at-a-glance.js`, `calendar.js`,
   `smart-targets.js`, `location-intel.js`, `lifelenz.js`, `projections.js` — **that number is a
   rough same-file co-occurrence heuristic, not a verified live-bug count** (some of those
   `overflow:'hidden'` uses may be unrelated to the table in the same file, and `promo-roi.js`
   itself didn't match the loose grep despite being a confirmed real bug — write a tighter,
   actually-correct detector for the ratchet, and seed the `CEILING` from what that detector
   measures fresh on your own branch, not from the number above.
3. **Fix Promo/Discount ROI only** as this dispatch's actual code change to a panel — do not
   attempt all 13+ candidate files in one dispatch (that's real, separate, per-panel work with
   its own risk of visual regressions each). The ratchet's job is to stop new instances of the
   pattern and make the existing ones visible for **opportunistic** fixing the next time each of
   those panels is touched for something else — same standing model as this repo's other
   ratchets (see `memory/panel-contract.md`).

## Verification bar

- Render `promo-roi.js`'s results table at a real mobile-width viewport (e.g. Playwright
  `page.setViewportSize({width:390,height:844})`) with enough rows/columns that the table is
  wider than the viewport, and confirm every column is reachable via horizontal scroll — not
  clipped.
- Confirm desktop rendering and the existing vertical scroll (`maxHeight:300`) are unchanged.
- The new ratchet test passes on your branch (seeded to what it actually measures) and is written
  so it fails both if the count of this anti-pattern rises AND if it falls without the ceiling
  being lowered (bidirectional, per the existing ratchet's own convention).
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean.

## Do NOT

- Do not touch `promo-roi.js`'s ROI math (`matchedLift`/endogeneity — that's dispatch #113,
  already in flight, unrelated) — layout only.
- Do not fix all 13 candidate files in this dispatch — ratchet + one real fix + accurate
  measurement, not a mass sweep.
