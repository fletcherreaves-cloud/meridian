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
    hasBand3 && div({ style: _bandStyle },
      actions != null && div({ style: { display: 'flex', alignItems: 'center', gap: 8 } }, actions),
      tabs != null && div({ style: { display: 'flex', gap: 4, marginLeft: 'auto' } }, tabs),
    ),
  );
}

export default PanelChrome;
