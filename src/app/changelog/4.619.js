// @ts-nocheck
export default {version:'4.619', date:'2026-07-30', changes:[
  'Operations Report auto-pull — groundwork: a new pull (scripts/qsrsoft-ops-pull.mjs + daily workflow) captures the whole QSRSoft Operations Report as store-level daily REST data — Controls (discount, T-Reds before/after, meals, drawer, refunds), Labor (OT hours/$, crew, needed hours), Service (CTP/OEPE/DT/MFY/KVS/RTP), channel sales mix, and the 3 Peaks — all WITH last-year values. Kills the manual Operations/Controls upload dependency. (Ingestion layer; the tile wiring lands next.)',
  'Leadership One-Pager: the OSAT B2B (1★) target now reads the effective/yearly targets (was only reading the static defaults), so the "Overall Satisfaction B2B" target from the yearly-targets file lands.',
  'EOM diagnosis: removed the unverified "QSRSoft force-zeros deactivated items ~30–45 days" phrasing (owner is verifying) — the write-off-before-close guidance stands on its own.',
]};
