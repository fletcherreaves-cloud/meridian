// @ts-nocheck
export default {version:'5.533', date:'2026-10-12', changes:[
  'Record Hour (v5.532) correction, measured live right after the owner applied ' +
  'schema-qsr-hourly-sales-records-view.sql: the view alone was NOT enough. The exact query the ' +
  "app's own loadHourlySalesRecords() runs through it hit a real 57014 statement timeout -- the " +
  'same unindexed-DISTINCT-ON symptom this repo already fixed once today for security_findings_latest. ' +
  'Added schema-qsr-hourly-sales-records-index.sql (companion index, CONCURRENTLY -- ' +
  'qsr_daily_activity is under active writes from 3 daily pull scripts). Until the owner runs it, ' +
  'the feature still degrades safely to the documented 60-day fallback (loadHourlySalesRecords\' ' +
  'own retry-then-give-up path), just slower and with a spurious DATA INCOMPLETE firing than it ' +
  "needs. Corrected this session's own overstated \"costs almost nothing to query\" claim in both " +
  'the view file and the loader\'s own comment -- not measured before it was written the first time.',
]};
