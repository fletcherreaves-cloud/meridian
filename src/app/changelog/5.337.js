// @ts-nocheck
export default {version:'5.337', date:'2026-09-03', changes:[
  'Fix: features/morning-brief.js\'s storeDistance() read b.lng/a.lng, but STORE_COORDS ' +
  '(constants.js) only carries {lat,lon,tz} -- lng is always undefined, so every real store-pair ' +
  'distance computed NaN, and NaN<=radius is always false. views/analytics.js imports ' +
  'storeDistance directly to power the "regional broad-event" candidate queue in the AI ' +
  'batch-tagging flow, so that queue has never surfaced a single nearby-store suggestion. Fixed ' +
  'to read .lon.',
  'Fix: the same file\'s regionalRadius() read STORE_COORDS[loc].org, a field that does not ' +
  'exist on that table at all (the real org lookup is constants.js\'s getStoreOrg(), returning ' +
  'lowercase \'emerald\'/\'mcdok\', never \'Emerald Arches\') -- always fell through to the ' +
  '150-mile default, so the tighter 80-mile Florida/Emerald-Arches radius never applied. Fixed ' +
  'to use getStoreOrg(loc)===\'emerald\'.',
  'Both bugs were surfaced while writing test coverage for these two previously-untested ' +
  'functions, not reported independently -- fixed and covered together (9 new tests, ' +
  'src/__tests__/morning-brief-geo.test.js). Full suite (3817 tests) and build both clean ' +
  '(533.29 KB / 850 KB eager budget). Smoke-tested via dev server + headless Chromium, zero JS ' +
  'errors.',
]};
