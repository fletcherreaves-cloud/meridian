// @ts-nocheck
export default {version:'5.370', date:'2026-09-05', changes:[
  'New Customer Complaints panel (Operations, next to Graded Visits) -- dispatch #231\'s own ' +
  'explicitly-deferred follow-on ("a drill-down/detail view, if ever wanted, is a separate ' +
  'follow-on"). Browses the raw customer_complaints rows the Complaint Contacts/100K review ' +
  'metric already consumes: All->State->Patch->Store scope, date range, status filter, free-text ' +
  'search over issue/comment, click-to-expand full comment text, CSV export. Reads the same ' +
  'ds.complaintCases array the KPI itself filters, so the panel and the metric can never silently ' +
  'disagree on what counts as a case -- and does not recompute the /100K rate itself (that stays ' +
  'in Performance Reviews).',
  'First real capture landed the same day: 3033 raw cases across all 27 stores, upserted 3787 ' +
  'rows after two real data bugs surfaced and got fixed -- some cases have no incidentDate ' +
  '(falls back to receivedDate) and a "Multiple Issues" case can list its own childCaseId twice ' +
  '(deduped, keeping the more specific entry). caseStatus confirmed CLOSED and OPEN, resolving ' +
  'dispatch #231\'s last open data question.',
]};
