// @ts-nocheck
export default {version:'5.361', date:'2026-09-05', changes:[
  'Fixed: the PEAK Visit Detail section (v5.359) never actually rendered in the app -- ' +
  'loadGradedVisits() (src/lib/supabase.js) does select(\'*\') from Supabase, so the raw row DID ' +
  'carry peak_detail, but the function then remaps every row into a hand-picked camelCase object ' +
  'literal that never included it. The DB write, the RLS read, and the component\'s render logic ' +
  'were all correct in isolation -- the field was silently dropped in the one place that ' +
  'translates a raw DB row into what the rest of the app actually sees. Caught live by the owner ' +
  'testing in the app (incognito window, no console errors -- correctly ruled out caching).',
  'Fixed by adding `peakDetail: r.peak_detail` to loadGradedVisits()\'s mapping and updating ' +
  'graded-visits.js to read `v.peakDetail` (this file\'s own established camelCase convention) ' +
  'instead of the raw snake_case `v.peak_detail` it was reading before.',
  'The original test suite never caught this: its fixtures used the field name `peak_detail` too ' +
  '-- matching the bug, not the real loader\'s actual output shape -- so it exercised the ' +
  'component correctly while missing the one broken seam between the loader and the component. ' +
  'Fixed the fixture naming and added a new source-inspection test ' +
  '(dispatch-graded-visits-peak-detail-loader.test.js) that reads loadGradedVisits()\'s real ' +
  'function body and asserts the peakDetail mapping exists -- revert-sensitive, so this exact ' +
  'failure mode fails the suite instead of silently shipping again.',
]};
