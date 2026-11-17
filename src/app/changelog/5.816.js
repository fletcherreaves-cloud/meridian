// @ts-nocheck
export default {version:'5.816', date:'2026-11-17', changes:[
  '**Fixed a 4-month-silent Web Share Target break — mobile "Share to Meridian" has been a ' +
  'dead end since 2026-07-03.** Meridian has supported sharing a file (report download, etc.) ' +
  'straight from a phone\'s native OS share sheet into Meridian since v4.239 (no drag-and-drop, ' +
  'no separate upload step — tap Share, pick Meridian, done), on any platform whose browser ' +
  'supports the Web Share Target API (Android Chrome; iOS Safari does not implement this API ' +
  'at all, a WebKit limitation with no shipped timeline, not something fixable here). v4.276 ' +
  'bumped `public/sw.js`\'s share-cache name (`mf-share-v1` -> `mf-share-v4276`) purely to force ' +
  'an unrelated stale-bundle fix, not realizing that name is a cross-file CONTRACT with ' +
  '`App.js`\'s pickup code — which was never updated to match. Every shared file since then was ' +
  'silently stashed in a cache the app never read from, with no error and no visible failure. ' +
  'Fixed by giving the cache a version-free name (`mf-share-target`) on both sides, specifically ' +
  'so a future unrelated SW version bump can\'t collide with it again, and added ' +
  '`share-target-cache-contract.test.js` to catch a one-sided rename before it ships.',
]};
