// @ts-nocheck
export default {version:'5.625', date:'2026-11-04', changes:[
  '**Knowledge Base: 6 new Panel Guide articles — Graded Visits, Security, Customer Complaints, ' +
  'Crew Schedule, Labor Analysis, Task Queue (task #75).** All six are named directly in the ' +
  'real GM/Supervisor job routines (memory/plan-role-based-panel-gating-2026-11-03.md), so ' +
  'they\'re high-traffic, not an arbitrary pick. Each written against the real source file, not ' +
  'guessed: Graded Visits explicitly cross-references Visit Readiness (ground truth vs. ' +
  'prediction); Security explains the subject-grouped four-verdict shape (Flagged/Clear/' +
  'Undetermined/Hygiene) and the real org_config.gm_identity_reveal_enabled access gate; ' +
  'Customer Complaints states plainly it is the raw case feed, not the Complaint Contacts/100K ' +
  'rate itself; Crew Schedule documents the two tabs\' separate, uncrossed employee-identity ' +
  'spaces (LifeLenz assignedEmploymentId vs. QSRSoft geid); Labor Analysis distinguishes this ' +
  'weekly Fixed/Floor/VLH planning tool from Scheduling Hub\'s day-to-day Labor Analytics tab; ' +
  'Task Queue explains the T1/T2/T3 task tiers and the dual tasks/feature_requests table merge. ' +
  '12 new tests (2 per article, mounting the real KnowledgeBasePanel). 726/726 test files, ' +
  '6646/6646 tests; build clean.',
]};
