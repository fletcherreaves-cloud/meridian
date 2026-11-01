// @ts-nocheck
export default {version:'5.596', date:'2026-11-01', changes:[
  '**Fixed a regression in today\'s earlier PanelChrome scroll fix** -- the Reports▾/Scans▾/' +
  'Monitor▾/Pulls▾ action menus\' own dropdown items got trapped in a tiny scrollable box instead ' +
  'of expanding down over the page, making them hard to navigate (owner screenshot).',
  'Root cause: the earlier fix set overflowX:\'auto\' on band 3\'s action/tab wrapper divs with no ' +
  'explicit overflowY. Per the CSS overflow spec, when one axis is non-visible and the other is ' +
  'left at its visible default, the browser computes the visible one as auto too -- there is no ' +
  'such thing as independent X/Y visibility once either is touched. That silently clipped the Y ' +
  'axis as well, and ActionMenu\'s own dropdown (position:absolute, a descendant of this same ' +
  'wrapper) got clipped into the wrapper\'s own small box instead of overlaying the page below it.',
  'Fix: overflowY:\'visible\' pinned explicitly on both wrapper groups in src/components/' +
  'PanelChrome.js, so only the X axis ever clips/scrolls -- the dropdown escapes vertically ' +
  'exactly as it did before band 3 gained horizontal scrolling.',
  '2 new regression tests (overflowY assertion + a real ActionMenu rendered inside the wrapper, ' +
  'opened, and confirmed its items still show) alongside the existing band-3 scroll test.',
]};
