// @ts-nocheck
export default {version:'5.665', date:'2026-11-06', changes:[
  '**Knowledge Base: fixed stale `signals_guide` (task #75).** The batch-12 sweep flagged this ' +
  'article as substantially stale — its own "Several tabs" list named only 5 (LiveOps, Baseline ' +
  'Anomalies, Speed of Service, Signal Lab, Scanner), and 2 of those 5 were not even real ' +
  'top-level tabs: Baseline Anomalies is a strip rendered inside Live Ops, not its own tab, and ' +
  'Speed of Service is a completely separate panel (`dt-speedofservice.js`, already covered by ' +
  '`speed_of_service_guide`) that Signals never contained. Measured the real tab bar directly ' +
  '(`src/views/signals.js`\'s `SignalsPanel`): 10 real tabs — Live Ops, Projection Accuracy, ' +
  'Park × OEPE, Store Controls, Built-in, Signal Lab, Scanner, Correlations, CSAT Drivers, ' +
  'Graveyard. Rewrote the article to describe all 10 from their real source files, correcting ' +
  'the Baseline Anomalies placement and removing the Speed of Service mix-up. 2 new tests.',
]};
