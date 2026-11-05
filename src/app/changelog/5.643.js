// @ts-nocheck
export default {version:'5.643', date:'2026-11-05', changes:[
  '**Store Cockpit "What Moves With Food Cost"/"What Moves With Labor %" cards now lead with ' +
  'plain language.** Owner: "Most people would have no clue what that even means" re: the bare ' +
  '"Pearson r · Benjamini–Hochberg FDR-guarded · dot = significant" subtitle. The stats jargon ' +
  'stays exact and reachable on hover (a new `JargonTip` helper, `src/views/store-cockpit.js`); ' +
  'the subtitle now opens with a plain one-liner ("a dot means the pattern is real, not random ' +
  'noise") per CLAUDE.md\'s "Voice by role" rule. The main Signals Scanner/Correlations tabs ' +
  '(`src/views/signals.js`) already led with plain language — checked, nothing to fix there.',
  '**Investigated the Avg Wage Rate ↔ Base Food % correlation (r=+0.91 screenshot) against real ' +
  'production data — does not survive scrutiny, no feature built.** Measured against live ' +
  'Supabase (`ctrl_rows`/`fob_rows`/`daily_glimpse_daily`/`qsr_daily_activity_rollup`, full ' +
  '2022-2026 history, 27 stores): every full-history cross-store slice is NEGATIVE (-0.43 ' +
  'pooled, -0.85 cross-sectional on store averages) — opposite sign from the screenshot. The ' +
  'cross-sectional pattern is substantially an FL-vs-OK market/minimum-wage confound (the top 7 ' +
  'highest-wage stores are exactly the 7 FL stores; removing the split roughly halves the ' +
  'correlation, -0.85 → -0.52 within OK alone). The within-store time-series relationship (the ' +
  'one test of an actual wage→food-cost lever) is weak and runs the wrong direction for the ' +
  'hoped-for story (+0.24 to +0.28), and is inconsistent store-by-store (range -0.34 to +0.71). ' +
  'The one slice that matches the screenshot\'s MAGNITUDE — July 2026, the single calendar month ' +
  'where the auto wage stream and the manual Base Food % upload actually overlap — comes back ' +
  'r=-0.891, n=27, i.e. a thin one-month cross-section, not a trend. Full writeup: ' +
  '`memory/finding-wage-food-cost-correlation-2026-11-05.md`.',
]};
