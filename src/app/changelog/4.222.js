// @ts-nocheck
export default {version:'4.222', date:'2026-06-27', changes:[
  'Channel Intelligence root cause fix: dedup merge now rescues channel sales/pct fields (bfSales, mopSales, kioskSales, delivSales, and their GC/AvgChk/PctTotal counterparts) from discarded rows into the surviving row. This fixes the case where a Labor Analysis file loaded after an Operations Report would silently overwrite the richer channel data with zeros for the same dates, causing Breakfast/MOP/Kiosk/Delivery to show 0% in Channel Intelligence and the DOW Heat-Map even though the Operations Report was present.',
]};
