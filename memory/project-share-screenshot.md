# App-wide Screenshot Share (2026-09-01)

Owner request, verbatim: *"I want that expanded app wide though! Let's scope that... it would super
handy to be able to also include in the share menu the ability to share a screenshot of the users
screen. Even better if it screenshots the whole screen (even the part unviewable due to
scrolling)."*

Follows the same-day "🔗 Share" link ship (v5.309, `shareOrCopy()`/`src/utils/share.js`) — that
feature was narrow (two pre-existing report-link buttons, Count Cycle + EOM Scoreboard). This is
the actual `memory/project-backlog.md` "native OS Share sheet" ask: a single, panel-agnostic
control, no per-panel wiring.

## Architecture

- **Lives in `RoutePanelShell`** (`src/components/ModalShell.js`), rendered unconditionally in the
  header, not the existing `headerExtra` slot (that's opt-in per panel, populated ad hoc by ~25
  call sites — building there wouldn't be app-wide). Every `route:true` panel (32 today — CLAUDE.md
  and `memory/panel-contract.md` both corrected in the same PR from a stale "13 of 101") gets the
  button automatically.
- **Phase 1 boundary, deliberate:** `route:true` panels only. Hub-tab content (Count Cycle, EOM
  reports, Labor Analytics, etc. — `kind:'hub-tab'`) never mounts `RoutePanelShell` at all, so it's
  out of scope here. A real follow-on if wanted, not a gap discovered after the fact.
- **Capture target:** `RoutePanelShell`'s own body div (`bodyRef`), not `window`/viewport. That div
  carries no `overflow` of its own — the app's real scroll container is an ancestor
  (`App.js`'s `.mf-main-content`, `overflowY:'auto'`) — so the body's full content is genuinely
  present in the DOM at its natural height; `html2canvas` walking that node's subtree captures the
  whole thing regardless of what's currently scrolled into view. `capturePanelScreenshot()`
  (`src/utils/panel-screenshot.js`) additionally finds and resets the actual scrolled ancestor to
  `scrollTop:0` before capture (restored after) — belt-and-suspenders against html2canvas's
  documented history of geometry-sampling bugs when a distant ancestor is mid-scroll.
- **Library: `html2canvas`** (not `html-to-image`/`dom-to-image`). The latter serializes via SVG
  `foreignObject`, which has more real-world CSS gaps; `html2canvas` manually walks and paints the
  render tree, more robust for a dense, table-heavy app like this. Lazy-loaded via
  `src/lib/html2canvas-lazy.js` (same memoized-promise shape as `xlsx-lazy.js`), pinned to its own
  chunk in `vite.config.ts`'s `manualChunks` — confirmed in the build output: 46.78 KB gzip, in its
  own `html2canvas-*.js` chunk, NOT part of the eager total (532.20 KB / 850 KB budget, only +1.4KB
  over the pre-feature baseline from the button/wiring itself).
- **Output chain** (`shareFileOrSave()`, `src/utils/share.js`): native OS share sheet with the PNG
  as a real `File` (Web Share API *Level 2* — `navigator.share({files:[...]})`, gated by
  `canShare({files})` when present, `AbortError` treated as a deliberate cancel, same pattern as
  the existing link-`shareOrCopy()`) → clipboard-image (`navigator.clipboard.write` +
  `ClipboardItem`) → plain PNG download (`downloadBlob`, same shape as `eom-supervisor.js`'s local
  `downloadFile`). Deliberately its own function, not an overload of `shareOrCopy()` — the fallback
  chain is genuinely different (no "copy the URL" equivalent for an image).
- **Naming:** `📸 Share`, not `🔗 Share` — the existing link-share buttons (Count Cycle, EOM
  Scoreboard) already own that label for a different affordance (a URL, not an image); reusing it
  here would read as the same feature.
- **Explicitly not doing:** unifying existing per-panel Print/CSV/Copy buttons into this control.
  Those stay as-is (print-as-formatted-report is genuinely better than print-as-screenshot-image
  for anything with real tables) — this is additive, not a refactor.

## The one real fidelity risk, and how it was closed — not just reasoned about

`eom-supervisor.js`'s own `openPrintWindow` comment documents a REAL, previously-shipped bug: an
earlier print mechanism tried resolving this app's theme CSS custom properties (`var(--bg)` /
`var(--surf)` / etc.) inside a **separate** `window.open('', ...)` document with no stylesheets and
no `data-theme`/`data-mode` attributes — on dark mode, every token resolved to nothing, producing
near-invisible white-on-white text. `capturePanelScreenshot()` avoids the SAME class of bug
structurally, not by chance: it captures the LIVE node in place (`html2canvas` clones the actual
document — same stylesheets, same `<html data-theme data-mode>` — into an offscreen iframe, it
never starts from a blank one).

**Verified for real** (not just reasoned about, per this repo's "measure it, don't reason about it"
standing rule), 2026-09-01, via a real headless Chromium (Playwright) driven against the Vite dev
server:
- Harness: `<html data-theme="command" data-mode="dark">` with the real token values inlined
  (`--bg:#0f1117; --surf:#171a23; --text:#e8ecf3`), a `.mf-main-content`-shaped ancestor
  (`overflow-y:auto`, 400px tall) wrapping an 1965px-tall content div with a marker at the top and
  one at the very bottom (1800px+ below the fold).
- Ancestor scrolled to `scrollTop:1000` (simulating a real "user scrolled down, then tapped Share"
  moment) before calling the REAL `capturePanelScreenshot()` (imported live from
  `src/utils/panel-screenshot.js` via the dev server, not a reimplementation).
- Result: PNG dimensions **500×1965px** (the full content height, not the 400px visible slice) —
  confirmed by reading the PNG's own IHDR chunk. `scrollTop` was `1000` both before AND after
  capture (the temporary reset-to-top-then-restore round-tripped cleanly, no visible side effect).
  Visual inspection of the saved PNG: the top marker (red bg, light text), the full dark
  background, and the bottom marker (blue bg, light text) — the part that was off-screen — are all
  present and legible. No console errors from the capture itself (`html2canvas` module load +
  `canvas.toBlob()` all resolved cleanly; the one console message logged was an unrelated
  `favicon.ico` 404 from the harness page).
- Light mode was not independently re-run — same mechanism, and light mode was never the failure
  case (its tokens are already light-on-white; the historically broken case was specifically dark
  mode's light-on-transparent tokens resolving to nothing). Worth a quick spot-check if this ever
  regresses, not required to ship.

## Desktop platform behavior — measured, not assumed (2026-09-01, same-day follow-up)

Owner asked to "check on the desktop app share behavior too" after using the feature live.
**Owner-confirmed: works correctly on their own desktop** — the real native OS share sheet
appeared, not a fallback. Cross-checked against a real measurement (not general web knowledge)
before writing this down, per the "measure it" rule:

- Ran the actual shipped `capturePanelScreenshot()` + `shareFileOrSave()` (imported live from the
  dev server, same as the fidelity test above) in a real headless Chromium instance with a
  spoofed **desktop Windows Chrome** user-agent, 1440×900 viewport, `clipboard-read`/
  `clipboard-write` permissions granted.
- Result: `typeof navigator.share === false` — **the API itself does not exist** in this
  environment, not merely "file-sharing is unsupported." `navigator.canShare` is also absent.
  `navigator.clipboard.write` and `ClipboardItem` ARE both present and functional.
- `shareFileOrSave()` called end-to-end (the real button's call path, not an isolated unit test):
  correctly skipped the (absent) share-sheet branch and fell through to clipboard-image, which
  **succeeded** — `{method:'clipboard', ok:true, cancelled:false}`. So even on a platform with zero
  Web Share API support, the button still does something useful; it never dead-ends.
- Reconciling this against the owner's own working result: this measurement ran on a **headless
  Linux** Chromium — and per MDN's own browser-compat-data tracker (github.com/mdn/
  browser-compat-data#16823), `navigator.share` on desktop Chrome/Chromium is a **platform-gated**
  feature — supported on Windows and ChromeOS, historically absent on Linux, regardless of a
  spoofed user-agent (the UA string doesn't change what OS-level share integration the browser
  binary was actually built with / can access). The owner's desktop is evidently Windows or macOS,
  where the API is real. **So both results are correct simultaneously**, for different platforms:
  Windows/macOS desktop Chrome → real native share sheet (owner's live result); Linux desktop
  Chrome/Chromium → no `navigator.share` at all, clean clipboard-image fallback (this measurement).
- Practical implication: a Meridian user on Linux desktop Chrome (or any browser without
  `navigator.share` — older Chrome/Edge, Firefox entirely per that same MDN tracker, older Safari)
  gets a "📸 Share" button that silently does clipboard-copy instead of opening a sheet — this is
  already the intended, tested fallback behavior (see `share-file-util.test.js`'s
  "falls back to clipboard.write" case), not a bug to fix. Nothing to change in the code; this
  section exists so a future session doesn't re-diagnose "why didn't the share sheet open on
  Linux" as a defect.

## Tests

- `src/__tests__/share-file-util.test.js` — `shareFileOrSave()` unit tests (share/AbortError/
  canShare-reject/clipboard-fallback/download-fallback/no-file), same Node 20/22 navigator-guard
  shape as `share-util.test.js`, plus a bare `ClipboardItem` polyfill (browser-only global, doesn't
  exist under plain `node` at all).
- `src/__tests__/route-panel-shell-screenshot-share.test.js` — real-render tests against
  `RoutePanelShell` with **generic, non-panel-specific children** (proves "app-wide, zero
  per-panel wiring" directly, not by inspecting one panel that happens to have opted in): the
  button exists on any consumer; clicking it calls `html2canvas` on the panel's own body node
  (asserted via `capturedNode.contains(bodyDiv)`, not window/document); the resulting file reaches
  `navigator.share` with the right MIME type and a slugified filename; a status label
  (`✓ Shared`/etc.) appears and clears. `html2canvas` itself is mocked at the module boundary in
  these tests — real capture fidelity is the Playwright verification above, not something
  happy-dom's canvas stub can meaningfully assert on.
