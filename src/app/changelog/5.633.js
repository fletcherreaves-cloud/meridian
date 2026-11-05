// @ts-nocheck
export default {version:'5.633', date:'2026-11-05', changes:[
  '**Nav: merged the People and HR sidebar sections back into one "People & HR" (owner request).** ' +
  'HR (added 2026-09-25) had sat with just one member (Performance Reviews); People had three ' +
  '(Crew Schedule, Pay Rate History, Security) that didn\'t obviously belong together either. ' +
  'Performance Reviews now renders alongside the other three under one combined header. **Also ' +
  'fixed while touching this:** `skills-matrix` carried an inert `section:\'people\'` tag — ' +
  'confirmed via App.js\'s own modal router that it\'s actually a Scheduling hub tab, never ' +
  'rendered under People — corrected to `section:\'scheduling\'`. `perf-calc`/`targets-editor` ' +
  '(hub-tabs nested inside Performance Reviews) needed no change: their existing ' +
  '`section:\'people\'` tags, previously inert while their host was tagged `\'hr\'`, are now ' +
  'truthfully correct automatically. 731/731 test files, 6662/6662 tests; build clean.',
]};
