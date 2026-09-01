// @ts-nocheck
export default {version:'5.308', date:'2026-09-01', changes:[
  'Notes-67 re-verification: both owner-flagged UI bugs (Food Cost date default, Forecast Audit ' +
  '"greyed out") were re-measured against current main per the standing "measure it, don\'t ' +
  'reason about it" rule, since notes-67 is from 2026-08-19 and a lot has shipped since. Both ' +
  'were ALREADY fixed/addressed -- by dispatch #88 (v5.132/5.133, merged 2026-08-24), well before ' +
  'this session. No code change made; this entry records that the re-verification happened and ' +
  'what was checked, per the "already fine is valuable information too" instruction.',
  'Food Cost (Original) date default: dispatch #88 traced the real cause to a render-order race ' +
  'in FOBAnalysisPanel (src/views/analytics.js) -- the auto-select-most-recent-month effect used ' +
  '`!selMonth` as a run-once guard, which fired on the FIRST render, before the async qsrFobRows ' +
  'cloud fetch (starts null) resolved, against manual-upload-only months -- locking in a stale ' +
  'month and then permanently ignoring the cloud stream\'s newer months once they arrived. Fixed ' +
  'by gating the auto-select on `qsrFobRows!==null`. Re-confirmed this session: the guard is ' +
  'still in place unmodified, its regression test (fob-analysis-month-race.test.js, which ' +
  'reproduces the race against the original ungated code first) still passes, and no later ' +
  'commit touched this effect.',
  'Forecast Audit "greyed out": confirmed this is working-as-designed, not a bug -- the panel is ' +
  'intentionally disabled (`disabledWhen:\'noStore\'` in panel-registry.js) until a store is ' +
  'selected, since it audits one store\'s forecast. The confusing part the owner actually hit -- ' +
  'no explanation for WHY it was greyed out -- was already fixed pre-notes-67, in v4.945/PR#120: ' +
  'shell.js\'s navItem carries `title:disabled?\'Select a store first\':label`, so hovering the ' +
  'disabled item shows an explanatory tooltip. Re-confirmed this session: the tooltip string, its ' +
  'wiring, and its regression test (forecast-audit-disabled-hint.test.js, which renders the real ' +
  'AppSidebar consumer) are all still in place and passing.',
  'Also installed a missing `web-push` dependency (declared in package.json, absent from ' +
  'node_modules in this session\'s environment) so the full suite could run to completion -- 9 ' +
  'test files were failing to even load with "Cannot find package \'web-push\'" before this; no ' +
  'package.json/package-lock.json change resulted, and no source touched. ' +
  'Suite 3631/3631 (all files), build clean, 530.80 KB gzip eager payload (850 KB budget, ' +
  'unchanged shape -- no new eager imports, no source code changed for either bug).',
]};
