// @ts-nocheck
export default {version:'5.728', date:'2026-11-10', changes:[
  '**🛡 Security Briefing: drift/trajectory detection — red flags BEFORE a metric crosses its own '+
  'static threshold (the deep-dive doc\'s own §4), additive to Phase 1\'s severity×magnitude score.** '+
  'New `src/engine/security-drift.js`: `classifySubjectDrift()` looks at a subject+rule\'s own last '+
  '3-4 real windows and flags a monotonically-worsening trajectory even while the latest window is '+
  'still pass:false — weighted lower pre-threshold, higher once it does cross (two independent '+
  'signals now agree). Materiality floor (15% net relative rise) measured against real production '+
  'history (CASH-002/INV-001/INV-002/INV-003, every real monotone-rising 4-window sequence in each '+
  'rule\'s full history) to filter the daily-rolling-window autocorrelation noise a flat "monotonic" '+
  'check alone would fire on ~8-9% of the time. District grid tiles now carry a real ↑ worsening / '+
  '→ flat / ↓ improving arrow (never shown before the drift fetch resolves — no fabricated "flat"), '+
  'and narrative cards carry an Escalating / Recurring / First flag badge, reusing the existing '+
  'chronic/new trend axis rather than a second classifier. Bounded, NOT a full-district eager pull: '+
  'candidates are the real currently-flagged-or-near-threshold population (measured 1,877 of '+
  '~20,800 subjects district-wide), fetched once, lazily, only when the Briefing view opens. Rides '+
  'the SAME HEALTH_SCORE_SCALE (now 0.1, v5.726) rather than a second scale — drift contributions '+
  'are expressed in the same raw severity×magnitude units, applied before that one multiplication.',
]};
