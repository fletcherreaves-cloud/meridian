// @ts-nocheck
export default {version:'4.195', date:'2026-06-17', changes:[
  'calibrateStore full rewrite — holiday/event/DOW-specific/plus-up now in the evaluation formula',
  'ds.laborRows date-sort fix before .slice(-400) — root cause of inflated historical anomaly MAPEs',
  '_userEvents wired to every calibrateStore/forecastDay/forecastModels call site (was silently empty in many)',
  'detectCleanDataStart — automatic bad-data-period detection for Tishomingo/Elgin/Mossy Head/Ponce de Leon',
  'Holiday model redesign — fullClosure/partialClosure flags, real prior-year per-store holiday data',
  'autoTagHolidays — now runs automatically on every data load (Excel upload and IDB restore)',
]};
