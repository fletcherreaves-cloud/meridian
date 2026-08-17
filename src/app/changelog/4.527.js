// @ts-nocheck
export default {version:'4.527', date:'2026-07-24', changes:[
  'Fix: Visit Readiness couldn\'t see your graded visits — the Graded Visits panel loaded them into its own state, but Visit Readiness reads them from the shared data set, which was never populated. So Model Check said "0 stores with a recent visit" and the Visit Patterns section stayed hidden even though 60 visits were loaded. Graded visits now load into the shared data at startup (same Supabase source), so Visit Readiness sees them — Model Check gets real numbers, the per-store "last visit" shows, and Visit Patterns (day/daypart/channel + cadence) appears.',
]};
