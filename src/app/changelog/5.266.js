// @ts-nocheck
export default {version:'5.266', date:'2026-08-30', changes:[
  'EOM Diagnosis report ("Obsolete / Discontinued / Inactive" table, EOM Dashboard + the public ' +
  'Share view -- both driven by the same formatDiagnosisReport()) -- owner feedback: the per-row ' +
  '"Action" column repeated one of only two possible strings, identical across every row within a ' +
  'class, when the single "Rule:" line already printed directly below the table states both ' +
  'class-based actions (Food/Condiment vs Paper/Non-Product) once. Removed the redundant column; ' +
  'the Rule line is unchanged and is now the only place the action is stated.' +
  '\n\n' +
  'Suite 3413/3413 passing, build clean (526.80 KB gzip eager, within 850 KB budget).'
]};
