// @ts-nocheck
export default {version:'4.206', date:'2026-06-19', changes:[
  'Performance: found the actual cause of recurring slowness — compute6wk() makes ~28 avg6() calls per invocation, each independently re-scanning the FULL multi-year, all-27-store array for one field',
  'Runs 3x per store (p/p2/p4 windows) x 27 stores = 2,000+ full array passes every time the store list recomputes — on load, on settings save, on Dialed-In calibration',
  'Added a per-store row index (laborByLoc/opsByLoc/ctrlByLoc/darByLoc), built once at every data-load and session-restore path — same 5 places the existing per-day index already gets built',
  'compute6wk and buildStore\'s pSales/pLY loop now operate on the pre-filtered per-store slice instead of the full district-wide array — identical math, identical semantics, far less to scan',
  'Fixed the most common load path too (App startup IndexedDB restore) — confirmed via existing code comments to be more frequent in practice than fresh Excel upload',
]};
