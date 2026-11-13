// @ts-nocheck
export default {version:'5.769', date:'2026-11-13', changes:[
  '**Fix: first-run tour blocked the entire topbar — the "menu not dropping down" bug** ' +
  '(owner-reported, live-reproduced on a 390x844 mobile viewport). `TutorialOverlay`\'s backdrop ' +
  '(src/views/tutorial.js) used `position:fixed, inset:0, zIndex:500` — covering the whole ' +
  'screen, including AppTopbar\'s 44px bar. The topbar\'s hamburger/search/SAGE/bell/profile ' +
  'menu are static-positioned there, so they always lose the stacking fight against any fixed ' +
  'sibling, whatever z-index the topbar itself carries. While the tour was showing (or stuck ' +
  'showing, if its own localStorage write to mark it complete ever silently failed), every ' +
  'persistent topbar control was unreachable — tapping the hamburger looked like it did ' +
  'nothing. Fixed by starting the backdrop at `top:44` instead of `inset:0`, so the topbar is ' +
  'never covered; the tour dialog itself is unaffected (it already anchors to the bottom of the ' +
  'screen). Live-verified: hamburger now opens the sidebar correctly with the tour still showing ' +
  'underneath. Confirmed via direct testing that the hamburger/ProfileMenu/NotificationBell ' +
  'dropdowns all already render correctly outside of this specific overlap (the 2026-11-10 ' +
  'clipping fixes hold) — this tour-overlay gap was the one remaining way to lock a user out of ' +
  'the topbar. 2 new tests. Full suite (8031 tests) and build pass clean (702.72 KB eager, ' +
  'budget 850 KB).',
]};
