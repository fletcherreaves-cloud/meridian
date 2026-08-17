// @ts-nocheck
export default {version:'4.220', date:'2026-06-27', changes:[
  'Channel Intelligence: fixed non-DT channel data (Breakfast, MOP, Kiosk, Delivery) not displaying — added fallback to per-store % fields (bfPctTotal, mopPctTotal, etc.) when dollar-amount columns are not populated in the Operations Report Sales sheet',
  'Channel Intelligence diagnostic: warning banner now lists the exact column names Meridian looks for in the Operations Report, so column name mismatches can be identified and reported',
  'DOW Channel Heat-Map (Shift Analysis): applied same pctKey fallback so Breakfast/MOP/Kiosk/Delivery rows now appear in the heatmap when pctTotal data is available',
  'Shift Analysis guide strip: DOW Ops Metrics, OEPE Revenue Opportunity, 3 Peaks × Labor Gap, and Competitive Impact buttons now scroll to their respective sections on click (previously display-only)',
  'FOB Root-Cause Priority Matrix: swapped display order — Location (store name) now appears before Component label, matching natural priority-coaching order',
  'Base Food KPI card: removed "Theoretical cost — for reference only" label; now shows ▲/✓ vs-target comparison when tFOBBase target is available, or "No target set" when not',
  'Base Food target column: added more fallback patterns to column name matching (Base Food %, Base Food%, BaseFoodPct, Base Food Target)',
  'Channel column fallbacks: expanded patterns for Breakfast (BF Sales), MOP (MOB Sales, Mobile All Net Sales), Kiosk (KSK Sales, SOK Net Sales), Delivery (3PD All Net Sales, 3rd Party Net Sales)',
  'Print / PDF: added 🖨 Print button to Revenue Intelligence Engine, FOB Analysis, and Channel Intelligence panels',
  'Store KB: replaced free-text tag field with clickable Quick Tags organized into Performance / Management / Location / Physical / Context groups — single-click to toggle, auto-updates tag list',
  'Competitive Impact: replaced empty state (null/blank) with explanatory message directing user to Calendar to tag competition events',
]};
