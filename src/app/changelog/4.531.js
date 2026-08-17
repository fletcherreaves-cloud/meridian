// @ts-nocheck
export default {version:'4.531', date:'2026-07-25', changes:[
  'Recent-window metrics fill in from the auto streams: OEPE, KVS, Labor %, TPPH and the loss-prevention numbers were showing "—" (or "-100%") on recent periods when a manual Operations Report / Controls upload hadn\'t landed yet. They now fall back to the emailed Daily Glimpse / auto DAR — so Rankings, Org Summary, and the forecast table populate on the current week instead of going blank.',
  'Under the hood (the part that keeps this from ever creeping back): all of that metric sourcing now runs through ONE shared resolver with a per-metric source-priority list — manual first, then auto — instead of each screen reading the raw data its own way. Paired with the shared vs-LY helper from earlier, this is now the single global system for where operating numbers come from; any future data-source change is one edit and every screen benefits.',
]};
