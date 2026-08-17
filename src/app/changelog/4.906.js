// @ts-nocheck
export default {version:'4.906', date:'2026-08-08', changes:[
  'Fixed a regression that broke Dialed-In calibration for all 27 stores. The auto-first sourcing added in 4.904 was applied to a row set shared by the grid search, the clean-data detector and the last-year lookup; it is now scoped to the trend columns alone, which are the only part that needs recent days.',
]};
