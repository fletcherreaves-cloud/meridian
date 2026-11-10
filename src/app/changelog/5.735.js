// @ts-nocheck
export default {version:'5.735', date:'2026-11-10', changes:[
  '**🔎 Security Health score now rewards convergence and persistence, not just severity.** '+
  'Closes two gaps the owner\'s own Security Health Dashboard design doc named as open follow-on '+
  'work: a subject flagged by 2+ independent rules at once (convergence — corroborating signals '+
  'agreeing is real corroboration), and a subject flagged on the SAME rule for many consecutive '+
  'windows running (persistence — a 21-day chronic single-rule flag is a bigger deal than a '+
  '2-day multi-rule one). Both now add real weight to a store\'s health score, feeding the '+
  'district grid and the Security Command Center heat map. Convergence needs no new data '+
  '(computed from findings already loaded); persistence reuses the exact multi-window history '+
  'already fetched for drift — never a second query. Deliberately NOT attempted in this pass: '+
  'the Theories-ranked concentration-pattern corrective-action layer (person/register/daypart/'+
  'store/fleet) from the same design doc — that needs a genuinely new query and stays open '+
  'follow-on work.',
]};
