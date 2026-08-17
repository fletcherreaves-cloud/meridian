// @ts-nocheck
export default {version:'4.590', date:'2026-07-29', changes:[
  'Fixed the blank vs-LY on the Leadership One-Pager: Guest-Count-vs-LY in the scorecard and the "vs LY" column in District Outliers were empty because the vs-LY helper compared date-typed rows against the form\'s text date range (a type mismatch that silently dropped every day). Both now populate from the auto DAR\'s last-year figures. Added a regression test.',
  'Fixed the "Loaded Data" FOB pill showing "Invalid Date" and a doubled store count — it now parses each stream\'s date format and normalizes store numbers.',
]};
