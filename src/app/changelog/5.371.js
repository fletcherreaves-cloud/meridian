// @ts-nocheck
export default {version:'5.371', date:'2026-09-05', changes:[
  'Fixed a real duplicate-rows bug in the new Customer Complaints panel, caught immediately by ' +
  'the owner\'s first live look at it: loadCustomerComplaints() ordered its paginated read by ' +
  'incident_date alone, which is not unique -- many complaints share the same date (multiple ' +
  'cases/day across 27 stores), so Postgres has no deterministic tiebreaker across the separate ' +
  'range()-paginated requests fetchAll() makes. The same row could land in two pages (visible ' +
  'duplicate rows) while another tied row silently never appeared at all -- and since ' +
  'review-engine.js\'s Complaint Contacts/100K metric reads the exact same ds.complaintCases ' +
  'array, this was quietly capable of over- or under-counting that KPI too, not just a cosmetic ' +
  'panel glitch. Fixed by adding child_case_id (the table\'s own unique key) as a secondary sort, ' +
  'the same pattern every other paginated loader in supabase.js already uses.',
  'Customer Complaints panel: added a Case # column and split the single Date column into ' +
  'Incident Date and Received Date (owner-requested after the first live look), both in the ' +
  'table and the CSV export.',
]};
