// @ts-nocheck
export default {version:'5.626', date:'2026-11-04', changes:[
  '**Fix: mobile nav drawer opened as a wall of bare icons, no labels (owner-reported, ' +
  'screenshot).** Root cause: AppSidebar\'s `collapsed` state (the desktop-only icon-rail mode, ' +
  'defaults to true since v5.6xx\'s "sidebar defaults to collapsed") was read unconditionally for ' +
  'every label/section-header/search-box render, with no check for mobile — so a mobile session ' +
  'inherited the same collapsed-by-default state even though the drawer already rendered at its ' +
  'correct 260px width. Fixed with a new `navCollapsed = collapsed && !isMobile` flag, swapped ' +
  'into the ~28 places that read the raw flag; the desktop icon-rail default (task #71) is ' +
  'unchanged. 2 new tests (mobile-full-labels + desktop-still-collapsed regression). 727/727 ' +
  'test files, 6648/6648 tests; build clean.',
]};
