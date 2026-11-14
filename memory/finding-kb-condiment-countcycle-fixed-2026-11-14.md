---
name: finding-kb-condiment-countcycle-fixed-2026-11-14
description: "Task #75 -- condiment_pct and count_cycle_guide, re-confirmed unresolvable across 6+ batches (16-22), are now actually wired. Owner directive: fix the real gap (no labeled render anchor existed for either) instead of re-documenting it as permanent."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# condiment_pct / count_cycle_guide: fixed by creating the anchor, not working around its absence (2026-11-14)

## Why this supersedes `memory/finding-kb-batch22-no-new-wiring-2026-11-14.md`

Every batch since 16 reached the same correct-at-the-time conclusion: neither key had a real,
non-arbitrary standalone label to attach an `InfoIcon` to, so wiring either would have been a
worse version of the "attaching to something that isn't really a header" problem. That
diagnosis was right. The fix isn't to keep re-confirming it — it's to give each render site the
label it was missing.

## condiment_pct

**Site:** `src/views/at-a-glance.js`, the "FOB COMPONENTS" grid inside the FOB & Food Cost
section. Six sibling tiles (Unexplained / Comp Waste / Raw Waste / Condiment / Emp Meal / Stat
Var) render from one `.map()` over a plain array of `{l, v, ok, fl, prior, tgt}` objects — no
tile had its own distinct, defensible anchor, and singling out Condiment visually among 5
identical siblings would have been arbitrary.

**Fix:** Condiment is the only one of the six with an actual written KB article
(`condiment_pct` in `KB_ARTICLES`, `src/engine/forecast.js:1274`). Its array entry now carries
`articleKey:'condiment_pct'`; the render attaches `h(InfoIcon,{articleKey:item.articleKey})`
next to the label **only when `item.articleKey` is set**. This isn't visually singling out one
tile for no reason — it's rendering help where help exists. The other 5 siblings have no KB
article and still render with no icon, exactly as before. If any of them ever gets written up,
the same mechanism picks it up with one line (`articleKey:'...'` on that object), no further
render changes needed.

## count_cycle_guide

**Site:** `CountCycleSection`, `src/views/count-cycle-panel.js`. `eom-dashboard.js`'s own
comment explains why this tab (`mode==='compliance'`) is different from its siblings: it
deliberately bypasses the shared `PanelChrome`/tab-header machinery and "renders its OWN
compact summary line inline" — which turned out to mean literally no title text at all, just
`` `${sum.stores} stores · ${sum.crit} critical · ${sum.warn} watch · ${sum.ok} on cycle` ``.
There was nothing resembling a header to attach an icon next to.

**Fix:** Added the actual missing label. The summary row now reads a bold "Count Cycle" title
(matching the tab's own on-screen name, `['compliance', 'Count Cycle']` in the tab list) followed
by an `InfoIcon{articleKey:'count_cycle_guide'}`, then the existing stats string as a sibling in
the same flex row. This is the real fix for the root cause the prior 6 batches correctly
identified (no header existed), not a workaround.

## What shipped

- `src/views/at-a-glance.js` — `articleKey:'condiment_pct'` added to the Condiment grid item;
  `.map()` conditionally renders `InfoIcon` per item.
- `src/views/count-cycle-panel.js` — imports `InfoIcon` from `../engine/forecast.js`; adds a
  "Count Cycle" label + `InfoIcon{articleKey:'count_cycle_guide'}` before the existing stats line.
- `src/__tests__/dispatch-kb-batch23-condiment-countcycle-2026-11-14.test.js` — 2 new tests:
  mounts `CountCycleSection` directly and confirms the label + working InfoIcon; mounts the real
  `AtAGlance` -> FOB Components call site and confirms exactly one of the 6 sibling labels (the
  Condiment one) carries a working InfoIcon, matching this repo's "verification must touch the
  call site" rule (not the engine/component in isolation only).
- `src/app/changelog/5.788.js` + regenerated `src/app/changelog-latest.js`.

No schema change, no new KB article content (both already existed in `KB_ARTICLES`) — this was
purely a render-site fix. Full suite (8169 tests) and build pass clean.

## Unwired-key count after this fix

Batch 22 measured 22 unwired keys: 20 deliberately-permanent exceptions (18 Forecast Engine
internals + `panel_index`) plus these 2. After this fix, 20 unwired keys remain, all in the
permanent-exception category already documented across batches 16-22 — not re-litigated here.
