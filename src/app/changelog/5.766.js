// @ts-nocheck
export default {version:'5.766', date:'2026-11-13', changes:[
  '**Metric Lineage now has two real tabs** (owner request): **Calculated** (today\'s view — ' +
  'composed metrics with their exact formula and inputs, 44 entries) and a new **Direct / ' +
  'Source Data** tab (67 entries) for values read straight from one source with no math — ' +
  'instead of a blank Formula/Inputs column, these show an Automation badge (Auto-pulled / ' +
  'Emailed / Manual upload, read straight off each entry\'s own report text) since "is this ' +
  'fresh and where does it come from" is the useful fact for a direct read, not math that ' +
  'doesn\'t exist. The registry (`engine/metric-provenance.js`) already auto-generates an entry ' +
  'for every one of `metric-source.js`\'s 97 auto-first chains (dispatch "Notes 61") — this ' +
  'ships the Calculated/Direct split the owner asked for on top of that, not a rebuild. Added a ' +
  'hand-curated entry for the Visit Readiness PACE composite (Speed 35% / Accuracy 30% / ' +
  'Quality 20% / Leadership 15%), the one real composite score that wasn\'t in the registry yet. ' +
  '4 new tests. Full suite and build pass clean within budget.',
]};
