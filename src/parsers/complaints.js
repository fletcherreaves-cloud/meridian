// @ts-nocheck
// Parses raw customer-care case entries (propel.mcd.com getCustomerCareRestaurantCaseList) into
// upsert-ready rows for the customer_complaints table (supabase/schema-customer-complaints.sql).
// See memory/finding-complaints-propel-api-2026-08-26.md for the endpoint/payload documentation
// and memory/dispatch-231-complaints-metric.md for what this feeds.
//
// Flattens a "Multiple Issues" case's childCases[] into their own independent rows -- each nested
// entry carries its own real childCaseId (globally unique, same id space as a top-level case), so
// they get their own row rather than nesting; parentCaseId is kept for traceability back to the
// bundled case they came from.

function oneCaseRow(raw, store) {
  if (raw?.childCaseId == null) return null;
  return {
    store,
    childCaseId: raw.childCaseId,
    parentCaseId: raw.parentCaseId ?? null,
    issueCode: raw.issueCode ?? null,
    issueSubCode: raw.issueSubCode ?? null,
    incidentDate: raw.incidentDate ?? null,
    receivedDate: raw.receivedDate ?? null,
    caseStatus: raw.caseStatus ?? null,
    abbreviatedCustomerComments: raw.abbreviatedCustomerComments ?? null,
    customerComments: raw.customerComments ?? null,
  };
}

// entry = {store, name, case: <raw result[] element>} -- the wrapper
// scripts/browser-complaints-bulk-capture.js's seed carries (same {store, name, ...} convention
// as browser-graded-visits-bulk-capture.js, since the raw case payload carries no NSN itself).
// Returns an array (0, 1, or more rows) -- a "Multiple Issues" case with N childCases produces
// N+1 rows: the parent case itself PLUS each nested child, since each nested entry has its own
// real, independently-trackable childCaseId.
export function parseComplaintEntry(entry) {
  const store = entry?.store ?? null;
  const raw = entry?.case;
  if (!raw || !store) return [];
  const rows = [];
  const top = oneCaseRow(raw, store);
  if (top) rows.push(top);
  for (const child of (raw.childCases || [])) {
    const row = oneCaseRow(child, store);
    if (row) rows.push(row);
  }
  return rows;
}
