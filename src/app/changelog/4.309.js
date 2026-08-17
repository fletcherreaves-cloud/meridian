// @ts-nocheck
export default {version:'4.309', date:'2026-07-04', changes:[
  'Signals: expanded from 11 to 36 correlation signals across 6 domains. New SERVICE signals: Park Rate→OEPE, Park Rate→Sales, DT Mix→OEPE, R2P Pace→Sales, Avg Check→OEPE. New LABOR signals: TPPH→Labor%, Avg Check↔TPPH (speed/ticket tradeoff), Scheduling Gap→OT Hours, Avg Wage Rate→Labor%, Guest Count→Labor% (volume leverage). New FINANCIAL/CONTROLS signals: Discount%→Sales, Drawer Opens→Cash O/S, Manual Refund→Labor%, Waste (Red B)→Food Cost%, POS Overrides→TPPH. New SALES signals: Monthly Sales→Food Cost% (leverage), TPPH→Food Cost%, Avg Check→Daily Sales. New CUSTOMER signals: Park Rate→OSAT, Avg Check→OSAT, Scheduling Gap→OSAT, Discount%→OSAT, Guest Count↔Avg Check (traffic/ticket tradeoff).',
]};
