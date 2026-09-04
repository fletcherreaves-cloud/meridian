// @ts-nocheck
export default {version:'5.343', date:'2026-09-04', changes:[
  'Events Phase 3 (a) of memory/project-events-calendar-redesign-2026-09-04.md: the Events & ' +
  'Tags / Event Impact / Calendar nav entries fold into one unified, URL-addressable "Events" ' +
  'panel (src/views/events-panel.js, panel-registry.js\'s events entry flips to route:true; ' +
  'event-impact retires to kind:\'internal\', redirecting into the new panel\'s Impact pill, ' +
  'same treatment calendar-manager got under dispatch #191).',
  'Two genuinely new views ship as real flat tab content under one RoutePanelShell: Upcoming ' +
  '(default -- date-grouped, one row per event with a "N stores" scope chip that expands ' +
  'in-place, confidence glyph [⬤ measured / ◐ estimated / ○ assumed] sourced from ' +
  'the Event Impact Registry) and Log (the same ledger, filtered to visibility:\'log\' via the ' +
  'EVENT_TYPE_VISIBILITY map from Phase 2 (1/3)).',
  'Calendar/Impact/Rules pills stay their existing components (CalendarManagerPanel, ' +
  'EventImpactPanel), opened as an overlay exactly as they were before -- deliberately NOT ' +
  'flattened into shared-header tab content this pass. Both are large, fully self-contained ' +
  'components (own backdrop, own header, own controls) that were never built to be embedded; ' +
  'rebuilding them risked ~2000 lines of working, tested UI this environment cannot visually ' +
  'verify (no live browser + authenticated Supabase session here). Owner decision: "thin shell ' +
  'now, full merge later" over a much larger, harder-to-verify rewrite.',
  'The old "List" ledger (EventCalendar -- search/filter/sort/inline-edit/CSV export) stays ' +
  'fully reachable too, via a small "Full ledger" link on Upcoming/Log -- Upcoming/Log are ' +
  'read-only summaries, not a replacement for its edit/export capability.',
  'CalendarManagerPanel gained an additive initialTab prop (defaults to \'grid\' -- unchanged ' +
  'behavior for every other caller) so the Rules pill can open straight into its Rules tab.',
  '"Events & Tags" relabeled "Events" in the sidebar, matching its now-broader scope.',
  'Full suite (4317 tests, +0 net -- shell-nav-snapshot/panel-registry updated in place for the ' +
  'nav/route-id changes, no new test file this pass) and build both clean.',
]};
