// @ts-nocheck
export default {version:'5.632', date:'2026-11-05', changes:[
  '**Sidebar default reversed to expanded (owner-requested).** Task #71 (2026-11-03) set the ' +
  'sidebar to open collapsed (48px icon rail) by default; the icon-only first impression read ' +
  'as confusing, not a convenience. `AppSidebar`\'s `initialCollapsed` now defaults to `false` ' +
  '— the sidebar opens with the full labeled nav, same as before #71. Still session-local only, ' +
  'no persistence either direction. Updated both sidebar-default tests to assert the new ' +
  'behavior rather than leaving them wrong; the mobile-icon-only regression test ' +
  '(dispatch-mobile-sidebar-icon-only) now pins `initialCollapsed:true` explicitly so it no ' +
  'longer depends on — or breaks on — whatever the desktop default happens to be. 731/731 ' +
  'test files, 6662/6662 tests; build clean.',
]};
