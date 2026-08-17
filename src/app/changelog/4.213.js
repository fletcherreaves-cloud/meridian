// @ts-nocheck
export default {version:'4.213', date:'2026-06-19', changes:[
  'Different symptom this time: freeze on INITIAL load with zero data loaded — ruled out the AtAGlance fix as the cause, since there was nothing to compute',
  'Found a real gap: openIDB() had no onblocked handler. If another open tab/window holds an older-version connection to MeridianDB, a version-change request just hangs forever — never firing onerror, onsuccess, or onupgradeneeded. No heavy CPU, nothing to catch in a Performance trace — just a promise that never settles',
  'Given how many file versions have been opened back-to-back across this session\'s testing, a stale older-version tab is a very plausible explanation',
  'Fixed: added onblocked to both IndexedDB connections (MeridianDB and the separate McForecastPro_Sessions backup) — now rejects cleanly into the existing try/catch instead of hanging silently',
  'Practical step alongside this fix: close any other open Meridian tabs/windows before reloading, since that\'s the actual trigger condition if this theory is right',
]};
