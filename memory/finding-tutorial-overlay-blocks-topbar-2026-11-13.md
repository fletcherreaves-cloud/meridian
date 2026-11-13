# Finding: first-run tour backdrop blocked the entire topbar ("menu not dropping down")

**Reported by owner, date of report not pinned (surfaced in a backlog review 2026-11-13).**
Verbatim symptom as relayed back to him in that review: *"the topbar 'menu not dropping down'
bug — you said it still didn't work after a hard refresh."* No screenshot or exact repro steps
survived to this session; the original report predates this transcript.

## What was actually reproduced (live, Playwright, 390x844 mobile viewport)

Three topbar controls tested directly against running code (`npm run dev`, chromium at
`/opt/pw-browsers/chromium`):

1. **Hamburger → sidebar** (`AppSidebar`'s `mobileOpen`, shell.js) — works correctly once past
   first load.
2. **ProfileMenu dropdown** (shell.js) — renders correctly, properly portaled to `document.body`,
   not clipped. The 2026-11-10 clipping fix (portal + `position:fixed` from
   `getBoundingClientRect()`) holds.
3. **NotificationBell dropdown** (shell.js) — same, works correctly.

**The one real, reproducible defect found:** `TutorialOverlay` (`src/views/tutorial.js`), the
first-run walkthrough, rendered its backdrop as `position:'fixed', inset:0, zIndex:500` — a
full-viewport overlay sitting on top of literally everything, including AppTopbar's 44px bar.
AppTopbar's hamburger/search/SAGE/bell/profile-menu row is static-positioned (no explicit
`position`), so it always loses the stacking fight against ANY `position:fixed` sibling
regardless of the topbar's own z-index — this is a CSS stacking-context fact, not a bug in the
topbar's styling. While the tour is showing, **every persistent topbar control is unreachable.**

## Why this plausibly explains the report, and why it's not certain

- `shouldShowTutorial()` gates on `localStorage.getItem('mf_tutorial_v1')`; `finish()` sets that
  key in a bare `try { } catch {}` — a silent failure there (storage quota, some private-mode
  edge cases, an in-app webview with non-persistent storage) would make the tour re-trigger on
  every load forever, each time eating the first tap into dismissing the backdrop rather than
  opening anything.
- **But a plain hard refresh does not clear localStorage**, and the owner specifically said a
  hard refresh didn't fix it — which argues against this being his exact mechanism, since the
  tour (once genuinely dismissed) would not reappear on refresh alone. This is flagged, not
  swept under the rug: the fix below is right regardless of whether it was his exact bug, but
  this was NOT independently confirmed as his specific failure mode.

## Fix shipped (v5.769)

`TutorialOverlay`'s backdrop now starts at `top:44` instead of `inset:0` (left/right/bottom
still 0) — the topbar is never covered, tour dialog is unaffected (it already anchors to the
bottom of the screen via `alignItems:'flex-end'`). Live-verified: hamburger opens the sidebar
correctly with the tour still open underneath. 2 new tests
(`src/__tests__/tutorial-topbar-reachable.test.js`).

## Not fixed / not touched

The `localStorage.setItem` silent-failure path in `finish()` was **not** hardened — no evidence
it actually fails for him, and per the standing "reproduce before fixing" rule this would be
fixing a hypothesis, not a measured defect. If the "menu bug" recurs after this fix, that's the
next thing to look at, with a real repro in hand this time.

## Open

If the owner can get a screenshot or exact repro (which menu — hamburger vs. profile vs. bell —
what device/browser, whether this was a plain refresh or something else) that's still needed to
close this out with certainty rather than "most plausible fix found and shipped."
