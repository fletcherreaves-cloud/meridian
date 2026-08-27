// @ts-nocheck
export default {version:'5.196', date:'2026-08-27', changes:[
  'Simplified v5.195\'s FOB fix per owner directive: "whatever the latest data pulled is the '
  + 'number that should be used." An audit of the shipped fix surfaced one residual case it '
  + 'didn\'t cover -- a window spanning a month boundary (e.g. a week straddling the 1st) still '
  + 'diffed its pre-boundary month segment against a frozen baseline and got zero for that '
  + 'segment, since the fallback was deliberately restricted to single-month windows only. '
  + '`fobByRange()` (`src/engine/one-pager-data.js`) now applies the same latest-pulled-total '
  + 'fallback unconditionally, per month segment, regardless of how many months the overall '
  + 'window spans -- this source cannot support a true sub-month delta at any window shape, so '
  + 'there is no scenario where trying to net one out is more honest than surfacing the latest '
  + 'settled number.',
]};
