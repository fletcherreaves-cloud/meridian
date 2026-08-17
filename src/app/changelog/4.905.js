// @ts-nocheck
export default {version:'4.905', date:'2026-08-08', changes:[
  'Corrected the metric resolver: 30 of 35 source chains were consulting manual uploads BEFORE the automatic feeds, so a stale manual value could override cloud-fresh data. Being stored in the cloud does not make a stream automatic — what matters is what feeds it. Now enforced by a test, so it cannot drift back.',
]};
