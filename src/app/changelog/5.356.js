// @ts-nocheck
export default {version:'5.356', date:'2026-09-05', changes:[
  'Graded Visits: added a date-range selector -- confirmed missing (memory/finding-ecosure-' +
  'propel-api-2026-08-22.md), the panel only filtered by location and type before this, with no ' +
  'way to scope the table/CSV/print views to a period at all.',
  'Reuses the shared DateRangeControl (src/components/PanelControls.js), the same component ' +
  'already wired into dt-speedofservice.js/security-panel.js/others, per panel-contract.md -- no ' +
  'new picker invented. Unlike most DateRangeControl consumers this does NOT default to a narrow ' +
  'preset (e.g. 90d): graded visits are sparse (a handful per store per YEAR, not per day), so a ' +
  '90-day default would silently hide most of a store\'s history behind a filter nobody chose. ' +
  'Defaults to "All" (every visit on file); the user opts INTO a range, and "All" is always one ' +
  'click back.',
  '460 files / 4423 tests pass (no new tests -- the filter predicate is a plain useMemo addition ' +
  'matching this panel\'s own existing, equally-untested activeLocs/typeFilter inline filtering; ' +
  'DateRangeControl\'s own pure helpers (resolveDatePreset/isValidCustomRange) already carry ' +
  'their test coverage from the shared-component build). Build clean, eager-payload budget ' +
  'unaffected.',
]};
