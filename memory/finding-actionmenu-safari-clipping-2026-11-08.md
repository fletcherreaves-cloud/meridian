---
name: finding-actionmenu-safari-clipping-2026-11-08
description: Task #119 — Inventory Control's Reports/Scans/Monitor/Pulls dropdowns didn't open on Mac/iPhone. Root cause was Safari clipping an absolutely-positioned dropdown inside an overflowX:'auto' scroll row more strictly than Chrome/Firefox. Fixed by portaling the open menu to document.body.
metadata:
  type: finding
---

# ActionMenu dropdowns clipped on Safari (Mac + iPhone) — task #119

## Symptom

Owner screenshot: Inventory Control's grouped action menus (Reports ▾ / Scans ▾ / Monitor ▾ /
Pulls ▾ — `ActionMenu`/`ActionMenus`, `src/components/PanelControls.js`) didn't open on Mac or
iPhone. Worked fine on Chrome/Windows.

## Root cause

`PanelChrome.js`'s band 3 wraps the action menus in a row with `overflowX:'auto'` (added
2026-11-01, owner req, so the row scrolls instead of overflowing the viewport on a phone). The
same commit pinned `overflowY:'visible'` explicitly, reasoning that only the X axis should
clip/scroll.

That pin works on Chrome/Firefox, which don't enforce the CSS Overflow spec's computed-value
coercion (one axis non-`visible` forces the other to also compute as `auto`) as strictly here.
Safari — the same WebKit engine on **both** Mac and iPhone, which is exactly why the bug hit both
platforms and not Windows/Android Chrome — does enforce it, so `ActionMenu`'s dropdown (an
absolutely-positioned descendant of that same row) got clipped into the row's own tiny scroll box
instead of overlaying the page below it. `open` was flipping `true` correctly; the menu was just
invisible.

## Fix

`ActionMenu` (`src/components/PanelControls.js`) now renders its open dropdown through
`createPortal` into `document.body`, positioned (`position:'fixed'`) from the toggle button's own
`getBoundingClientRect()` rather than relying on CSS position inside the scroll row. A portaled
element is a DOM *sibling* of every scrollable ancestor, not a descendant, so no browser's
overflow/clipping behavior — Safari's strict one or anyone else's — can clip it.

Outside-click-to-close now checks both the toggle's own ref and a second ref on the portaled menu
(previously there was only one ref, which worked because the menu was a DOM descendant of it).
The menu closes on scroll/resize instead of re-measuring its position — simpler, and matches how
briefly it's actually open (click → pick an item).

`createPortal` from `react-dom` was already an established pattern in this codebase
(`src/views/sage.js`'s modals) — reused, not introduced.

## Test-suite fallout (worth knowing before touching ActionMenu again)

`ActionMenu` backs the "Export ▾" menu on every report built on `ReportShell.js`, plus several
panels' own "Reports ▾" grouped menus (EOM Dashboard, One-Pager). **16 existing test files**
asserted the open menu's items via `container.querySelectorAll('button')` after clicking the
toggle — valid when the menu was a DOM descendant of the mounted `container`, broken the moment it
portals to `document.body` instead. Fixed by switching those specific lookups (only the ones
reading the *open dropdown's* contents, not every container query in the file) to
`document.querySelectorAll('button')`. Any *new* test that opens an `ActionMenu` and reads its
items needs the same: query `document`, not the test's own `container`.

## Status

Shipped (v5.691). Full suite 7207/7207 (post-fix), `npm run build` clean (679.20 KB eager,
unchanged from the baseline this sat on top of, within the 850 KB budget). New regression test
(`src/__tests__/dispatch-panel-chrome-scroll-visibility-2026-11-01.test.js`) asserts the open menu
is never a DOM descendant of the `overflowX:'auto'` wrapper — the actual mechanism of the bug, not
just "some button exists somewhere."
