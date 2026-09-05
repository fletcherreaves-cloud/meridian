// @ts-nocheck
export default {version:'5.369', date:'2026-09-05', changes:[
  'Dispatch #231 Tasks 1-3: built the full Customer Complaints pipeline. ' +
  'scripts/browser-complaints-bulk-capture.js (browser-console script, paste into DevTools on a ' +
  'signed-in propel.mcd.com tab) walks all 27 stores and pulls timeFrame=5 (History) complaint ' +
  'cases via the confirmed customer-care endpoint. New src/parsers/complaints.js flattens a ' +
  '"Multiple Issues" case\'s childCases[] into their own rows. New supabase/schema-customer-' +
  'complaints.sql (customer_complaints table, tenant_id+RLS) + scripts/import-complaints-' +
  'history.mjs (idempotent upsert on child_case_id).',
  'App.js now loads customer_complaints into ds.complaintCases at startup (T2 stage, same pattern ' +
  'as gradedVisits/smgFullscale). review-engine.js\'s Complaint Contacts/100K metric moved from ' +
  'src:\'manual\' (zero automated actual-data source) to src:\'auto\': case count for the review ' +
  'month (bucketed by incidentDate) ÷ guest count for the same month × 100,000, computed in ' +
  'autoPopulateKPIs. Falls through to manual entry until a real capture has been run -- an empty ' +
  'ds.complaintCases means no capture yet, not a real zero.',
  'Not yet run against production -- the owner runs the capture script and the import next.',
]};
