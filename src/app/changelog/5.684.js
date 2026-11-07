// @ts-nocheck
export default {version:'5.684', date:'2026-11-07', changes:[
  '**New: first-login nav walkthrough (task #107) — deliberately narrow, 4-step spotlight tour.** ' +
  'Owner idea, scoped down on discussion rather than built as a full per-panel product tour (a ' +
  'maintenance trap in a nav that’s already been reshuffled several times this year — sidebar ' +
  'collapse, section accordion, panel promotions). Covers only the stable shell landmarks: the ' +
  'sidebar itself, Home, Data Manager, and the 🔔 notification bell. Shown exactly once, right ' +
  'after a brand-new user’s first sign-in — the SAME first-sign-in moment the notification-' +
  'consent screen (v5.683) uses, via a sessionStorage flag `AuthGate.js` sets right before handing ' +
  'control to the real app. Deliberately not a DB-backed flag: that would start NULL for every ' +
  'existing account too, retroactively re-showing the tour to users who already know the app — ' +
  'the exact trap the consent screen’s design already avoided. Skippable at every step ' +
  '("Skip tour"), with Back/Next, and auto-skips any step whose anchor isn’t on screen for the ' +
  'caller’s role rather than spotlighting nothing. The Data Manager step needed a real fix, not ' +
  'just a test seam: that nav item lives in the sidebar’s "admin" section, which starts ' +
  '**collapsed by default for every user** (task #72’s accordion) — without opening it first, ' +
  'this step would silently skip for literally everyone, defeating the point of including it. ' +
  '`shell.js`’s `AppSidebar` gained a small `mf:expandSection` event (same decoupled-custom-' +
  'event pattern as the existing `mf:toggleNav`/`mf:openPalette`) that the tour dispatches before ' +
  'measuring that step. New `src/components/OnboardingTour.js`; `data-tour` hooks added to ' +
  '`AppSidebar`’s container, the Home/Data Manager nav items, and `NotificationBell`.',
  'Also captured: **Notes 73**, five further ideas explicitly queued for later (not built) — ' +
  'per-panel info-icon help, an app-wide UI/UX consistency pass across menus/dropdowns/selectors, ' +
  'systematic role-based depth/terminology tuning, more interactivity (contextual help links, ' +
  'cause-to-remedy coaching, celebrating wins), and a "lean and mean" real-estate review of what ' +
  'has earned prime placement. See `memory/notes-73-queue.md`.',
]};
