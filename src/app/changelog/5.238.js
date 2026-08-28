// @ts-nocheck
export default {version:'5.238', date:'2026-08-28', changes:[
  'Dispatch #197 -- merged Time Punches into Crew Schedule Lookup as a Schedule/Punches tab ' +
  'strip on one page, per the owner live in this session: "Crew Schedule and Time punches can ' +
  'be merged to same page also. It makes sense." \'crew-schedule\' survives as the registry ' +
  'id/route (the earlier/more-established of the two, dispatch #123 vs #138); \'time-punches\' ' +
  'retired to kind:\'internal\' in panel-registry.js, with its old ?panel=time-punches deep ' +
  'link redirected to \'crew-schedule\' at the URL-parsing layer (routing.js\'s ' +
  'LEGACY_PANEL_REDIRECTS, same mechanism as \'leader-one-pager\') and its old modal id ' +
  'redirecting into the Punches tab, matching a real bookmarked link this id already had.',
  'Design calls made after actually checking both panels\' code, not assumed: SHARED across ' +
  'tabs are the LocationSelector scope and the employee search box -- both panels already ' +
  'filtered their directory by the identical id-or-name text match, so one shared search box ' +
  'genuinely reaches both tabs without retyping. NOT shared: the selected-employee state. ' +
  'Verified in src/lib/supabase.js that Crew Schedule keys its directory by LifeLenz\'s ' +
  '`assigned_employment_id` and Punches by QSRSoft\'s `geid` -- two different upstream ' +
  'systems\' opaque ids with no crosswalk table anywhere in the schema, so a key selected in ' +
  'one tab\'s identifier space has no meaning in the other\'s; each tab keeps its own local ' +
  'selection Set. Also NOT shared: the date range -- mechanically compatible (identical ' +
  'DateRangeControl on both sides) but semantically opposed (Schedule defaults 14 days ' +
  'forward, "upcoming schedule" being the whole point; Punches is necessarily backward-looking, ' +
  'a punch can\'t exist for a date that hasn\'t happened), so sharing one window would force ' +
  'one tab into the wrong direction for the other.',
  'src/views/time-punches-panel.js: TimePunchesPanel (a full standalone RoutePanelShell/' +
  'LocationSelector/search-box panel) is now TimePunchesTab, a body-only component taking ' +
  '`locs`/`query`/`onSummaryChange` as props from the merged host -- all pure logic (meal ' +
  'pairing, business-day bucketing, directory/filter/select helpers) unchanged. ' +
  'src/views/crew-schedule-panel.js: the original body became `ScheduleTab` (same props ' +
  'shape); the exported `CrewSchedulePanel` is now the merged host -- owns the shell, the tab ' +
  'strip, and the shared scope/query state, with `initialTab` seeding which tab opens first.',
  'panel-registry.test.js (route-panel count nineteen -> eighteen) and shell-nav-snapshot.test.js ' +
  '(nav-text snapshot + the analytics.store permission-gate list) re-captured fresh against the ' +
  'real rendered output, not hand-edited. Tests rewritten for the new prop-driven TimePunchesTab ' +
  'contract (time-punches-panel.test.js) and extended with a new describe block in ' +
  'crew-schedule-panel.test.js proving the actual merge behavior end to end: tab switching, ' +
  'initialTab, the shared search box genuinely filtering both tabs, and employee selection ' +
  'staying independent per tab. Full suite 3097/3097 passing; build clean, entry-chunk eager ' +
  'budget 546.08 KB gzip (budget 850 KB) -- time-punches-panel.js is no longer its own lazy ' +
  'chunk, folded into crew-schedule-panel\'s (12.91 KB / gzip 3.57 KB combined).',
]}
