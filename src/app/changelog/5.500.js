// @ts-nocheck
export default {version:'5.500', date:'2026-10-06', changes:[
  'QSRSoft Security Events Pull: real root cause finally identified, with hard evidence -- and ' +
  'it is NOT fixable from this repo. Owner ran workflow_dispatch against the Referer fix (v5.499) ' +
  'immediately and it still failed; the raw log showed the actual AWS error body for the first ' +
  'time: AccessDeniedException, "User is not authorized to access this resource with an explicit ' +
  'deny in an identity-based policy." That is AWS IAM, not QSRSoft\'s own app-level RBAC (already ' +
  'confirmed correct) -- a separate authorization layer in front of the Security Events API, and ' +
  'in IAM an explicit deny always wins over any allow. Most likely mechanism: this script\'s ' +
  'direct Cognito username/password login resolves to a different IAM role than the one a real ' +
  'interactive SSO-based browser login gets, and that role has an explicit deny on this specific ' +
  'action. No header, Referer, or request-shape change can route around an IAM explicit deny.',
  'This now gives the owner a concrete, specific QSRSoft support ticket to file (exact AWS ' +
  'exception + why the account-permission angle is already ruled out), instead of a vague ' +
  '"it 403s." Cadence stays at once/day while that gets resolved on QSRSoft\'s side. Updated ' +
  'memory/finding-failed-pull-email-audit-2026-10-06.md with the full evidence chain. No src/ or ' +
  'scripts/ changes -- documentation only, v5.499\'s Referer fix stays (real bug, just not this ' +
  'one\'s cause).',
]};
