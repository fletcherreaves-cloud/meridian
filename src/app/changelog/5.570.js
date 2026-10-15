// @ts-nocheck
export default {version:'5.570', date:'2026-10-15', changes:[
  'New report: Pay Rate History (owner request -- "a report... to show history of each ' +
  'employee\'s wages and rates of pay... see when a pay rate changes and be able to have ' +
  'analysis on its expected impact to overall labor"). Covers both populations: crew (derived ' +
  'on demand -- no logged change event exists, so the report IS the detector, from a new ' +
  'lifelenz_shift_pay table joined to the existing shift-assignment stream) and management ' +
  '(GM/AM/DM/SM -- a real logged change event, written by the roster pull\'s own diff against ' +
  'qsr_employee_tenure, which otherwise keeps no history). Every change shows its dollar impact: ' +
  'crew uses that employee\'s own measured hours the week the new rate took effect; management ' +
  'uses a flagged, explicitly-labeled standard 40hr/week assumption (no measured-hours source ' +
  'exists for that population).',
  'Owner/Admin/DO only, by explicit owner decision (not broader). Real enforcement is at the ' +
  'RLS layer -- two new tables (lifelenz_shift_pay, employee_pay_rate_changes), each with its ' +
  'own role- and loc-scoped policies -- not just the new payroll.view UI permission, since RLS ' +
  'restricts rows, not columns: the existing lifelenz_shift_assignments table is deliberately ' +
  'broadly readable (names/scheduling, no reason to hide), so wage data could not simply be ' +
  'added as columns there without leaking to every role with Crew Schedule access.',
  'New route panel (pay-rate-history, People section, 💰), wired the same way every other route ' +
  'panel is (goRoute + deep-link dispatcher + panel-registry entry), lazy-loaded so it costs ' +
  'nothing on the entry chunk (6.81 KB / 2.71 KB gzip chunk).',
  '16 new tests (4 engine unit tests already landed earlier this session + 4 new panel-render ' +
  'tests exercising the real PayRateHistoryPanel component, not the engine in isolation) plus ' +
  'ratchet-test updates for the new nav entry (shell-nav-snapshot.test.js: 💰 now has two owners, ' +
  'Opportunity $ and Pay Rate History) and the new route panel (panel-registry.test.js). Full ' +
  'suite green (613/613 files, 5719/5719 tests), build clean, within budget (562.50 KB eager / ' +
  '850 KB budget).',
]};
