// @ts-nocheck
export default {version:'5.484', date:'2026-09-27', changes:[
  'IA reorg backlog Phase 1 (memory/backlog-open-2026-09-06.md §2 "shared non-blocking, ' +
  'minimizable popup shell" item): extracted SAGE\'s bespoke minimize-to-a-floating-pill pattern ' +
  '(~25 lines of hand-rolled JSX directly in App.js) into two reusable components in ' +
  'src/components/ModalShell.js -- DrawerShell (right-anchored, no-backdrop fixed drawer; ' +
  '`minimized` is a controlled prop that toggles display without unmounting, so an in-progress ' +
  'session survives a minimize/restore cycle) and MinimizedDock (rendered once at the app root, ' +
  'stacks one restore pill per currently-minimized panel, generic -- holds no state and knows ' +
  'nothing about any specific panel).',
  'SAGE retrofitted onto both as a pure refactor -- same showSage/sageMin/sageBusy state, same ' +
  'visuals and mechanics (right-anchored drawer, red/green thinking-vs-ready dot in the header ' +
  'and on the restore pill, 44px touch targets on minimize/close). Z tier gains a named `drawer` ' +
  'entry (360, was a hardcoded magic number in App.js) so the dock pill (Z.drawer + 1) has a ' +
  'home in the same tier system as modal/nested/alert/toast.',
  'Out of scope for this pass (Phases 2-3, separate design decisions per the backlog item): ' +
  'About, Knowledge Base, Metric Lineage, and Task Queue do not adopt DrawerShell/MinimizedDock ' +
  'yet.',
  '15 new tests (src/__tests__/dispatch-drawer-shell-phase1-2026-09-27.test.js) render the real ' +
  'components directly -- confirmed to fail against the pre-fix App.js/ModalShell.js (14/15 red) ' +
  'before the fix, all green after. Full suite green. Build clean, eager payload 552.63 KB gzip ' +
  '(budget 850 KB).',
]};
