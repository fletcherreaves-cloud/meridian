// @ts-nocheck
export default {version:'5.486', date:'2026-09-28', changes:[
  'RBAC: manager/gm/sm_am_dm can now actually reach Inventory Control -- the previous night\'s ' +
  '"My Store" recap default view (v5.485) shipped correctly, but the panel\'s own nav/route perm ' +
  '(panel-registry.js) was still analytics.district, which none of those three roles have. ' +
  'Widened to analytics.store (owner: "Narrower fix, store specific at that level unless ' +
  'overridden in settings").',
  'The fix is narrower than a bare perm-flip: eom-dashboard.js\'s SINGLE_STORE_ROLES gained ' +
  '\'manager\' alongside \'gm\'/\'sm_am_dm\' -- a manager whose accessible_locs resolves to exactly ' +
  'one store lands on the single-store recap, same as a GM, rather than the full 9-tab district ' +
  'dashboard. A manager with accessible_locs widened past one store (or left null/unrestricted) ' +
  'falls through to that full dashboard instead -- the owner\'s "unless overridden in settings" ' +
  'lever, reusing the existing accessible_locs field rather than a new toggle. VP/DO/OM/AS/Admin/ ' +
  'Owner are unaffected either way (all already analytics.district).',
  'Two legacy redirects into eom-dashboard (the EOM notification bell\'s per-store deep link, and ' +
  'the plain nav-click path) widened to analytics.store alongside the panel itself. Two others ' +
  '(eom-summary\'s Supervisor Rollup redirect, count-cycle\'s compliance redirect) deliberately ' +
  'stayed analytics.district -- that content is genuinely multi-store/supervisor-oriented, not ' +
  'part of the new single-store audience.',
  'A real bug the plain perm-flip would otherwise have introduced, caught and fixed in the same ' +
  'pass: the mode-init useState read `initialMode || (singleStoreLoc ? \'mystore\' : ...)`, so the ' +
  'notification bell\'s own initialMode:\'scoreboard\' would have won over \'mystore\' for a ' +
  'single-store role -- landing them on a mode their narrowed TAB_LIST has no tab button for. ' +
  'Flipped to check singleStoreLoc first; every other role\'s existing initialMode-first behavior ' +
  'is unchanged.',
  '7 new tests (dispatch-eom-manager-rbac-2026-09-28.test.js) render the real EOMDashboardPanel ' +
  'directly -- manager-single-store, manager-multi-store-override, manager-null-override, ' +
  'VP-unaffected, and the mode-init fix itself (including confirming a multi-store VP\'s legacy ' +
  'initialMode is still honored, proving the fix is scoped to singleStoreLoc roles only). 3 of the ' +
  '7 confirmed to fail against the pre-fix code via a real revert-and-rerun. shell-nav-snapshot.test.js ' +
  'and dispatch-202-eom-supervisor-rollup.test.js updated for the perm/icon-ownership changes this ' +
  'causes (Inventory Control moves from the analytics.district to analytics.store hidden-set, ' +
  'taking its shared 📦 icon and the whole Inventory & Food Cost section header with it; Reports ' +
  'takes over as the "survives a store-only denial" contrast case).',
  'Full suite: 544/547 test files, 5146/5149 tests passing. The 3 failing tests are unrelated to ' +
  'this change and pre-existing on main -- confirmed via direct testing at the v5.484 (pre-#1342) ' +
  'commit, where they already failed identically, before either #1342 or this fix touched ' +
  'anything. Not fixed here (out of scope for a narrow RBAC change); likely date-dependent ' +
  'fixtures now that the sandbox clock has advanced. Build clean, eager payload 552.86 KB gzip ' +
  '(budget 850 KB).',
]};
