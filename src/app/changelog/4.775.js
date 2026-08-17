// @ts-nocheck
export default {version:'4.775', date:'2026-08-03', changes:[
  'Above-Store One-Pager FOB% fix: the panel was reading FOB from the manual XLSX stream (percentage fields) but the dollar-weighted FOB engine needs the QSRSoft qsr_fob dollar stream (prodSalesAmt/compWasteAmt/…). The mismatch meant every FOB row was skipped and the FOB% tile, the per-store FOB column, and FOB in the AI/print all rendered blank since v4.767. Now sourced from ds.qsrFobRows — FOB% populates correctly.',
]};
