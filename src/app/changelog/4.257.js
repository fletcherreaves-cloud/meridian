// @ts-nocheck
export default {version:'4.257', date:'2026-07-01', changes:[
  'EOM Summary: OT Hours and OT $ now auto-populated from Operations Report period-summary row (manual entry still overrides). projLaborPct now checks tCrewLabor OR tLabor — fixes blank Crew Labor projection when monthly targets were loaded from Supabase (which stored tCrewLabor, not tLabor). Monthly targets + meta now persisted to OPFS alongside row data — survive refresh without Supabase round-trip.',
]};
