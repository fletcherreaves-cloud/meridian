// @ts-nocheck
export default {version:'4.711', date:'2026-08-01', changes:[
  'Fixed SAGE FOB numbers reading near-zero. SAGE was pulling FOB from the stale/unscaled MANUAL food-cost upload AND averaging percentages; it now reads the authoritative auto qsr_fob stream and dollar-weights everything (district FOB + each component = Σ$ ÷ Σ sales), the same engine the dashboard uses. District FOB, the component breakdown, and the per-store ranking are now real, and SAGE is told these are authoritative over any uploaded file. Client-side (system-prompt context) — no redeploy needed.',
]};
