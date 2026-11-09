// @ts-nocheck
export default {version:'5.714', date:'2026-11-09', changes:[
  '**🎨 Bold-fill buttons, badges & hero numbers (owner-directed 2026-11-09, "Today vs Bolder" '+
  'design study) — Phase 1 of a broader color/boldness pass.** Owner: *"the more I interact with '+
  'other apps I realize how freaking awesome very bright and distinct coloring looks so good to '+
  'the appearance... it also sharpens the view and makes it easier to read."* The common thread '+
  'across the reference apps he shared wasn\'t more hues — it was flat full-saturation fills '+
  'instead of ~10% tints, and bigger/bolder scale for the one number that matters.\n\n'+
  '**Buttons & pills (`meridian.css`, theme-wide — every panel, instantly):** `.btn-a`/`.btn-red`/'+
  '`.pill.on`/`.pill.red`/`.pill.grn` go from a thin-border 10%-tint ghost look to a flat, pill-'+
  'shaped, full-saturation fill. Caught a real accessibility gap doing this measured, not '+
  'eyeballed: white text on the existing `--crit` (#f43f5e) measures 3.67:1 — below WCAG AA\'s '+
  '4.5:1 floor for text this small (10-11px bold doesn\'t clear the "large text" 3:1 exception). '+
  'New `--crit-fill` (#e11d48, same red family) measures 4.70:1. `--crit` itself is untouched '+
  'everywhere else — it\'s correctly tuned for its own text/border contexts per #276\'s own ΔE '+
  'comment. Gold-fill (11.90:1) and green-fill (6.55:1) pairings measured clean with the existing '+
  'tokens.\n\n'+
  '**New reusable `.badge`/`.badge-crit`/`.badge-warn`/`.badge-ok` classes** for the status-chip '+
  'pattern repeated ~71 times as hand-rolled rgba(color,.1) chips across `src/views/*.js`. This '+
  'pass migrates Visit Readiness\' band/EcoSure badges (`visit-readiness.js`) as the first real '+
  'call site — the rest is an easy follow-on now the classes exist.\n\n'+
  '**Hero numbers:** At A Glance\'s Visit Readiness tile\'s score (the one figure the whole tile '+
  'exists to show) goes 22px → 36px, same "give the number that matters the scale to match" '+
  'pattern as the Weather-app reference screenshot.\n\n'+
  'Role-curated AAG/District View by role tier (Owner/Area Supervisor/GM, with a chart-at-top-'+
  'plus-locations-below treatment for multi-location roles and a trend-chart treatment for '+
  'single-location roles) is the agreed Phase 2 — mocked up, not yet built.',
]};
