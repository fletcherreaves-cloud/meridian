// @ts-nocheck
export default {version:'5.715', date:'2026-11-09', changes:[
  '**🧭 Spot-Check Ruler → "Count Follow-Up" (owner-directed rename, 2026-11-09)** — every user-'+
  'facing string renamed (modal title, share link title, prompt text, button labels); internal '+
  'code names (SpotCheckRulerModal, etc.) are unchanged, a pure display rename.\n\n'+
  '**Timezone "glitch" verified NOT a bug** — a direct SQL check confirmed zero duplicate '+
  '(loc, cls, count_date) rows in inv_count_sessions; the CDT/CST split some dates showed was the '+
  'real 2026-11-01 US fall-back DST transition landing inside the lookback window, not a '+
  'computation error. The recount-date display now formats dates plainly (no raw Date.toString() '+
  'timezone suffix) regardless.\n\n'+
  '**New Q2 — "What FOB component has the most opportunity for the current count?"** — derived '+
  'from the same driver set (Comp/Raw Waste, Condiments, Stat Variance) the EOM diagnosis report\'s '+
  'own FOB-over-target analysis already uses, picking whichever component is furthest over its '+
  'own target.\n\n'+
  '**Q5 (confidence) is now a 1-5 click rating scale**, not free text.\n\n'+
  '**Q6/Q7 split** — "did you review the reports?" is now a yes/no click, with a conditional "if '+
  'yes, what did you find?" follow-up that only appears once answered Yes.\n\n'+
  '7 questions total (up from 5). New `confidence_rating`/`reports_reviewed` columns on '+
  '`spot_check_ruler_notes` (applied live this session).',
]};
