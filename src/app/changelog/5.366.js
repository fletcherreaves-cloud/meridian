// @ts-nocheck
export default {version:'5.366', date:'2026-09-05', changes:[
  'PEAK bulk backfill (dispatch #230) ran end-to-end: 190 raw visit surveys captured across 17 ' +
  'stores, 189 enriched into graded_visits (1 no-match, expected -- a visit too recent for the ' +
  'separate CFV import pipeline to have created a row yet).',
  'Added per-page diagnostic logging to scripts/browser-peak-visit-detail-bulk-capture.js -- the ' +
  'run only found 17 of ~27 known stores, which conflicts with this repo\'s own earlier-recorded ' +
  'measurement that Stores/Paged returns 27 stores over 3 pages. The script previously only logged ' +
  'page 1\'s raw response, so there was no way to tell whether a later page silently dropped (same ' +
  'failure class as the two live-run fixes already shipped today) or whether this account\'s PEAK ' +
  'view is genuinely narrower. It now logs every page.',
]};
