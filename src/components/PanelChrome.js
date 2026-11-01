// @ts-nocheck
// PanelChrome (issue #126, Spine 1 step 1) — renders the two shared control bands ("band 2"
// and "band 3") that sit in ModalShell's `subHeader` slot. Pure addition: nothing imports this
// yet — panels migrate to it individually in step 2 (the Inventory Control pilot named in the
// issue), one call-site change at a time, not as part of this PR.
//
// Band order is fixed and enforced here, not left to callers to assemble by hand:
//   band 2 = location · date · export   (what, when, out — left to right)
//   band 3 = action menus (left) · view tabs (right, via marginLeft:auto)
// A panel omits a band it doesn't need by not passing any of that band's slots; PanelChrome
// never reorders them and never adds a fifth. Styling is copied verbatim from the reference
// panels the issue names (analytics.js's DistrictLensPanel band at the time of writing).
import * as React from 'react';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);

const _bandStyle = {
  padding: '8px 16px', background: 'var(--surf2)', borderBottom: '.5px solid var(--bdr)',
  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
};

export function PanelChrome({ location, dateControl, exportSlot, actions, tabs }) {
  const hasBand2 = location != null || dateControl != null || exportSlot != null;
  const hasBand3 = actions != null || tabs != null;
  if (!hasBand2 && !hasBand3) return null;

  return div(null,
    hasBand2 && div({ style: _bandStyle },
      location != null && div({ style: { display: 'flex', alignItems: 'center', gap: 8 } }, location),
      dateControl != null && div({ style: { display: 'flex', alignItems: 'center', gap: 8 } }, dateControl),
      exportSlot != null && div({ style: { marginLeft: 'auto' } }, exportSlot),
    ),
    // Owner req (2026-11-01): on a phone, this row (Reports/Scans/Monitor/Pulls action menus +
    // the view tabs) was wider than the viewport and simply ran off the right edge with no way
    // to reach what was cut off. `minWidth: 0` is the actual fix -- a flex item defaults to
    // `min-width: auto`, which refuses to shrink below its own content width and is exactly what
    // let the row blow out past 100% instead of clipping to the viewport and scrolling; without
    // it, `overflowX: 'auto'` alone is a no-op. Each of the two groups scrolls independently so a
    // long action-menu list doesn't steal scroll room from the tabs, or vice versa. This is now
    // the app's standard pattern for an overflowing band — reach for it on any other panel's
    // control row before reinventing a scroll fix, not just Inventory Control's.
    //
    // ⚠️ Regression fixed same day (owner screenshot: a Reports▾ dropdown's own items were
    // trapped in "a scrollable window that does not expand down"). Root cause: `overflowX:
    // 'auto'` was set with no explicit `overflowY` -- per the CSS overflow spec, when one axis is
    // non-`visible` and the other is left at its `visible` default, the UA computes the visible
    // one as `auto` too (never two independent axes). That silently clipped the Y axis as well,
    // and ActionMenu's own dropdown (PanelControls.js — `position:'absolute', top:'calc(100% +
    // 4px)'`) is a DESCENDANT of this wrapper, so it got clipped into a tiny box instead of
    // overlaying the page below the row. `overflowY: 'visible'` pins the vertical axis explicitly
    // so only X ever scrolls/clips -- the dropdown escapes vertically exactly as it did before
    // this row gained horizontal scrolling.
    hasBand3 && div({ style: _bandStyle },
      actions != null && div({ style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflowX: 'auto', overflowY: 'visible', WebkitOverflowScrolling: 'touch' } }, actions),
      tabs != null && div({ style: { display: 'flex', gap: 4, marginLeft: 'auto', minWidth: 0, overflowX: 'auto', overflowY: 'visible', WebkitOverflowScrolling: 'touch' } }, tabs),
    ),
  );
}

export default PanelChrome;
