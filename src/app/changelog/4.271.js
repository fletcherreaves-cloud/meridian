// @ts-nocheck
export default {version:'4.271', date:'2026-07-03', changes:[
  'EOM Supervisor: fix actSales to use fobRow.sales (correct field name — prodSales/netSales were wrong); fix OT Hours and OT $ to sum all daily labor rows for the month instead of using peak-day values; fix Crew Labor % to use sales-weighted average from monthly rows when FOB does not supply it.',
  'Weather: fix persistence on reload — OPFS path now falls back to IDB when weather missing from OPFS blob (common after weather fetch predates next file upload); auto-fetch now also saves to OPFS and updates idbCoverage so Data Manager shows fresh dates immediately; removed manual Fetch All Weather button (auto-fetch handles it).',
]};
