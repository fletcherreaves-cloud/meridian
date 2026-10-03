// @ts-nocheck
export default {version:'5.494', date:'2026-10-03', changes:[
  'Recount-Impact Report (EOM Dashboard): closed 3 real gaps found auditing it against the ' +
  'owner\'s original ask -- (1) a per-location "recounted: yes/no" summary table, so a store ' +
  'with zero recounts this period is no longer simply invisible in the report; (2) each ' +
  'recounted item\'s FOB impact now shows a percent alongside the existing dollar figure ' +
  '("$-300 (-0.30%)"), computed from that store\'s already-loaded period sales, no new data ' +
  'pull; (3) an EOM/Weekly mode toggle -- EOM (last 3 calendar days of the month) stays the ' +
  'default, Weekly reuses the same recount-detection already proven live on the At-A-Glance ' +
  '"Items Recounted" tile, so weekly coverage exists as a real option. Owner: "EOM actually ' +
  'matters, weekly would be nice but needs to begin mattering as well."',
  '3 new tests in dispatch-227-eom-reports.test.js (percent display, location Y/N summary, ' +
  'EOM/Weekly toggle actually changes detection), plus one pre-existing test fixed for the new ' +
  'location-summary table. Full suite: 5261/5261 passing. Build clean, eager payload 555.57 KB ' +
  'gzip (budget 850 KB).',
]};
