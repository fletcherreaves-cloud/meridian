// @ts-nocheck
// ── Security Controls Playbook — curated reference content (dispatch 2026-11-09) ───────────────
// Owner's own ask: "generally available techniques on how to best control cash controls on the
// floor." General, well-known QSR/retail loss-prevention practice -- NOT derived from this org's
// own data (no rate, no threshold, no measured number lives here). Deliberately separate from
// security_rules' own already-live fields (description/investigation_action/false_positives,
// rendered by RuleDirectoryRow in src/views/security-panel.js) -- this is the narrative layer one
// level up: what the control IS, the real tell that separates signal from noise, and a concrete
// floor technique. One entry per control family, reused by every rule_id that family covers, so
// adding a new rule to an existing family (e.g. a future CASH-005) needs no new playbook entry --
// only a new ruleIds member.
//
// Pure data + one pure lookup. Rendered by security-panel.js's RuleDirectoryRow, inline below the
// rule's own already-live description/investigation_action/false_positives block.
export const SECURITY_PLAYBOOK = [
  {
    key: 'override',
    title: 'POS overrides & manager authorization',
    ruleIds: ['EVENT-003', 'CASH-002'],
    what: 'A manager code bypasses a normal register check — a price correction, a void after tender, a no-sale. A necessary tool, and also the single most common privileged-access control point on the floor.',
    tell: 'Overrides concentrated on one manager, one register, or one time-of-day (especially right before a shift change or a drawer count) is the classic shape of misuse — far more telling than the raw count alone.',
    floor: 'Require a reason code on every override. Keep the manager visibly at the register when one is used. Pull the register\'s own exception report weekly, not monthly. Require dual sign-off above a set dollar threshold.',
  },
  {
    key: 'cash',
    title: 'Cash drawer variance',
    ruleIds: ['CASH-001'],
    what: 'The gap between counted cash and what the register expects, after accounting for tenders and refunds.',
    tell: 'The same drawer or the same cashier recurring across different days is a person-level signal; a variance that moves with total volume is usually just counting noise.',
    floor: 'Never let one person count their own drawer and verify it. Reconcile the bank deposit the same day. Photograph the count.',
  },
  {
    key: 'refund',
    title: 'Refunds & manual overrides',
    ruleIds: ['CASH-003'],
    what: 'A manually keyed refund or correction, outside the normal return flow.',
    tell: 'A refund with no traceable original order, or refunds clustering around a single register regardless of who worked it.',
    floor: 'Require a second login for any refund above a small dollar threshold. Every refund should resolve to a real order number.',
  },
  {
    key: 'promo',
    title: 'Promo & discount usage',
    ruleIds: ['CASH-004'],
    what: 'A discount or promo code applied at the register.',
    tell: 'The simplest real check: usage outside the code\'s actual campaign window. A promo running hot a month after the campaign ended isn\'t a statistical question.',
    floor: 'Compare discount usage against the marketing calendar, not just against peers.',
  },
  {
    key: 'meal',
    title: 'Employee & manager meal discounts',
    ruleIds: ['EVENT-001', 'EVENT-002'],
    what: 'The employee-meal discount category at the register.',
    tell: 'A meal rung outside that employee\'s own scheduled hours, or meals clustering on one register no matter who is working it.',
    floor: 'Spot-check meal timestamps against the clock. A posted, enforced meal policy is the control — this rule only tells you where to look.',
  },
  {
    key: 'inventory',
    title: 'Inventory theoretical-vs-actual variance',
    ruleIds: ['INV-001', 'INV-002', 'INV-003', 'INV-004', 'INV-005'],
    what: 'The gap between what the recipe says should have been used and what inventory shows was actually used.',
    tell: 'A gap NOT covered by logged waste is the real signal — this app already checks that automatically before a finding is treated as material.',
    floor: 'Cross-check against delivery-receiving discrepancies and portioning drift before assuming shrink.',
  },
  {
    key: 'labor',
    title: 'Punch-edit integrity',
    ruleIds: ['LABOR-001', 'LABOR-002', 'LABOR-003'],
    what: 'A manual correction to a clocked time punch.',
    tell: 'Self-approval (the editor IS the employee) and edits dated after someone\'s termination date are not statistical questions — they are hard-rule violations.',
    floor: 'Route high-edit-rate managers through a second reviewer. Treat a post-termination edit as an immediate item, not a trend to monitor.',
  },
];

// One rule_id can belong to at most one playbook entry (ruleIds lists are disjoint by
// construction above) -- returns null when a rule has no playbook entry yet, so a future rule
// family added to security_rules without a matching playbook entry degrades silently, never
// crashes.
export function playbookForRule(ruleId) {
  if (!ruleId) return null;
  return SECURITY_PLAYBOOK.find(p => p.ruleIds.includes(ruleId)) || null;
}
