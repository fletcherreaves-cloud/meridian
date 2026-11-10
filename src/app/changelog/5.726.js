// @ts-nocheck
export default {version:'5.726', date:'2026-11-10', changes:[
  '**🐛 Fix: Security panel\'s new 🩺 Briefing district grid showed every store at 100/"Needs '+
  'attention" — no ranking at all.** Owner-reported live, minutes after last night\'s '+
  '`security_findings_latest` pagination fix unblocked real bulk data from reaching the health-'+
  'score engine for the first time. Root cause: `HEALTH_SCORE_SCALE` (the raw-contribution-sum-'+
  'to-0–100 display scale, `src/engine/security-health.js`) shipped as an unmeasured placeholder '+
  '(`8`) before any real data could flow through it. Measured live against the real dataset (884 '+
  'current findings across all 27 stores, raw per-store sums 45.00–1,480.40) — at scale 8, every '+
  'single store saturated the 100 clamp. Recalibrated to **0.1**, measured to give real tier '+
  'separation: only the one genuine outlier (nearly double the next-highest store) still pins at '+
  '100, the rest spread sensibly across watch/clean. No math changed — the severity×magnitude '+
  'scoring itself was already correct, only the display scale was wrong.',
]};
