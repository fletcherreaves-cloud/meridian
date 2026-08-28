# Dispatch #206 — URL migration batch 3: route:true for the remaining 7 panels

## Context — closing out the "default to route:true" candidate list

Owner, 2026-08-28 (this session): *"I am a fan of own url except where it doesn't make sense... I
want to make sure we are converting pages to urls except where specified or you have a strong
opinion otherwise."* Dispatch #192 (batch 1, 6 panels) and dispatch #205 (batch 2, 6 panels, merged
as commit `a6e8961` / v5.246) already converted 12. This batch takes the **remaining 7** candidates
identified during #205's scoping pass — `dt-sos`, `news`, `inventory`, `loc-intel`, `my-reports`,
`smg-voice`, `task-queue` — closing out the list rather than splitting off a straggler batch 4.
Re-verified fresh against `origin/main` @ `a6e8961` (post-#205): all 7 are still live, unconverted
`kind:'nav'` panels, none retired/demoted/already-routed since the original list was made.

**Unlike #205, none of these 7 share a file with another panel** — each of the 7 files
(`dt-speedofservice.js`, `news-panel.js`, `inventory.js`, `location-intel.js`,
`report-subscriptions.js`, `smg-voice.js`, `task-queue.js`) exports exactly one panel-level
component, so there's no `analytics.js`/`labor-tools.js`-style per-file hit disambiguation needed
this time — simpler verification than #205, not harder.

## Baseline (re-check both fresh before starting, per the standing "never copy a number" rule)

- `ratchet-modal-backdrop-bypass.test.js`'s `CEILING = 47` (post-#205).
- `panel-registry.test.js`'s `ROUTE_IDS` = 24: `above-store, attention, brief, crew-schedule,
  delivery-mix, dicompare, eom-dashboard, fcst-ref, fob-analysis, fob-eom, forecast-reports,
  graded-visits, morning-brief, one-pager, operator-summary, perf-reviews, proj, promo-roi,
  ranking, report, sched-hub, security, signals, visit-readiness`.

## The seven panels

1. **`dt-sos`** (DT Speed of Service, `DTSpeedOfServicePanel`, `src/views/dt-speedofservice.js`) —
   one hand-rolled backdrop hit (matches the ratchet regex). Only the 3 standard App.js deep-link
   sites (Escape sweep, `modal===` dispatch, render gate).
2. **`news`** (`NewsPanel`, `src/views/news-panel.js`) — one hand-rolled backdrop hit. 3 standard
   sites only.
3. **`inventory`** (Inventory Intelligence, `InventoryIntelligence`, `src/views/inventory.js`) —
   **two hand-rolled backdrops under one component** (an empty-state early return + the main
   body) — the same "two backdrops, one component" shape `OperatorSummaryPanel` had under
   dispatch #205 (which itself echoed FOBAnalysisPanel under #188). Both need converting. 3
   standard sites only — other `'inventory'` string hits elsewhere in the codebase
   (`security-panel.js`, `pipeline.js`, parsers, `fob-eom.js`) are the unrelated data-domain
   string, not deep links; don't touch them.
4. **`loc-intel`** (Location Intelligence, `LocationIntelligence`, `src/features/location-intel.js`)
   — one hand-rolled backdrop hit. **Currently a static top-level import in App.js, not
   `lazyPanel()`-wrapped** like the other six in this batch. Fold lazy-wrapping into this
   conversion (same "lazy-wrap + route conversion together" bundling #205 did for `promo-roi`/
   `morning-brief`) rather than leaving it a standalone follow-up — it's free chunk-size headroom
   riding along with work already touching this file's App.js wiring. Also appears in
   `shell.js`'s `BETA_HIDDEN_EXTRAS = ['brief','loc-intel','one-pager']` nav-visibility list —
   not a blocker (both `brief` and `one-pager` are already `route:true` while still on that list),
   just don't let it read as a surprise.
5. **`my-reports`** (`ReportSubscriptions`, `src/views/report-subscriptions.js`, setter
   `setShowReportSubs`) — **already `ModalShell`-based, zero hand-rolled-backdrop hits.**
   Meaningfully lighter lift than the other six: just the `ModalShell`→`RoutePanelShell` shell
   swap (matching #205's `delivery-mix` precedent exactly), `route:true`, and registry wiring — no
   backdrop refactor needed. 4 deep-link sites (the extra one is the `onLaunch` close-and-relaunch
   callback inside the same App.js block, not an external launcher — still needs the `goRoute`
   rewrite like every other call site).
6. **`smg-voice`** (`SMGVoicePanel`, `src/views/smg-voice.js`) — **two real hand-rolled backdrops
   that evade the ratchet's regex**: both are `position:'fixed', inset:0, zIndex:1200,
   background:'rgba(0,0,0,.6)'` — the `zIndex:1200,` sitting between `inset:0,` and `background:`
   breaks the pattern match (the same regex-evasion shape this ratchet test's own comment history
   notes for an old `one-pager.js` `zIndex:4000` case). **Converting this is still real
   chrome-simplification work, but it will NOT move `CEILING`** — don't assume a reduction here.
   `shell.js` line ~213 gives this panel a live `NAV_EXTRAS` badge (`smgRows.length`) — cosmetic
   nav metadata, preserve it, not a routing concern. 3 standard sites only.
7. **`task-queue`** (`TaskQueuePanel`, `src/views/task-queue.js`) — **structurally not the overlay
   pattern at all**: the main render is `position:'fixed', inset:0, zIndex:400,
   background:'var(--bg)'` (opaque, full-page style, no rgba backdrop — already reads like a
   route), and its `AddEntrySheet` bottom sheet splits an `absolute inset:0,background:'rgba(0,0,0,.6)'`
   backdrop from the `fixed` sheet container across two different divs, also escaping the regex.
   **Same "won't move CEILING" caveat as `smg-voice`.** ⚠️ **Preserve the legacy alias**: `modal===
   'feature-requests'` shares this same setter/`setTqInitialType` combo (from dispatch #194's
   Feature-Requests→Task-Queue merge) — the converted dispatcher line must still redirect that id
   into the right `goRoute('task-queue')` + initial-type call, not just the `task-queue` id itself.

## Expected CEILING movement

Of the 5 panels that DO hit the ratchet's regex (`dt-sos` 1, `news` 1, `inventory` 2, `loc-intel`
1 = 5 hits), converting all of them would drop `CEILING` from 47 toward 42 — **but per the standing
"never copy a number" rule, re-measure fresh via the test's own exact scan after the real changes
land, don't arithmetic-subtract this estimate.** `smg-voice`/`task-queue` converting does NOT
contribute to this count (their backdrops evade the regex entirely, as detailed above) — don't be
surprised when the ratchet test needs no CEILING change attributable to those two.

## Task

1. **Convert all 7** to `route:true`, matching the established #192/#205 pattern — read #205's
   merged PR/commit (`a6e8961`) as your template, it's the freshest and covers both the "hand-rolled
   backdrop → RoutePanelShell" shape (5 of these 7) and the "already ModalShell → RoutePanelShell
   swap" shape (`my-reports`, matching `delivery-mix`'s precedent exactly).
2. **Fold `loc-intel` into `lazyPanel()`** as part of its conversion (see item 4 above) — don't
   leave it a static import.
3. **Preserve `task-queue`'s `feature-requests` legacy alias** (see item 7 above) — verify with a
   test that `?panel=feature-requests` (or whatever its current deep-link shape is) still resolves
   correctly post-conversion.
4. **Update `panel-registry.test.js`'s `ROUTE_IDS` ratchet** — hard-coded, alphabetically-sorted,
   24 entries as of #205. Add all 7 new ids, keep sorted, extend the running narrative comment by
   dispatch number (matching its existing style) — not optional, the test fails immediately without
   it.
5. **Re-measure `ratchet-modal-backdrop-bypass.test.js`'s `CEILING` fresh** — reproduce the test's
   own exact scan (regex + file-walk over `src/views/`+`src/features/`, excluding `*.test.js`)
   after your changes, set `CEILING` to the real measured count with a dated comment explaining the
   delta (which panels moved it and by how much, which didn't and why — matching #205's own comment
   style exactly). Per the scoping above, expect roughly 5 hits removed from the panels that match
   the regex, and confirm `smg-voice`/`task-queue` genuinely don't move it (don't just assume the
   scoping notes were right — re-verify against the live regex).
6. **`shell-nav-snapshot.test.js`** shouldn't need changes for a pure route:true flip — re-run it
   and confirm; if any of the 7 conversions also touches a label/section/nav-badge as a side effect
   (e.g. `smg-voice`'s `NAV_EXTRAS` badge), re-capture its EXPECTED array fresh from real output.

## Verification

- Each of the 7 panels opens via its own bookmarkable URL, closes back to no-route state correctly,
  and its old `showX`/`onOpenModal` entry points still work (now routing through `goRoute`) — grep
  for every call site per panel, don't assume there's only the standard 3; `my-reports` has a 4th
  (`onLaunch`) and `task-queue` has a 4th (`feature-requests` alias).
- `panel-registry.test.js`'s `ROUTE_IDS` ratchet passes with the 7 new ids added (31 total).
- `ratchet-modal-backdrop-bypass.test.js`'s `CEILING` freshly re-measured and passing, with the
  per-panel accounting spelled out in the comment (which of the 7 moved it, which didn't, why).
- `loc-intel` confirmed `lazyPanel()`-wrapped post-conversion (chunk-size headroom noted in the
  commit body, before/after per the standing speed-check rule).
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- `planning`/`events` (App.js-inline panels) — still a separately-scoped future dispatch, unrelated
  to this batch (none of these 7 share that inline shape).
- Any of the admin/chrome panels already intentionally skipped in #205's doc (`about`,
  `data-manager`, `kb`, `metric-lineage`, `panel-manager`, `settings`, `workflow`, `troubleshoot`,
  `forms-library`, `forms-print`, `sage`).
- Redesigning any of the seven panels' actual content — this is purely a shell/routing conversion.
