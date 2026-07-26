---
name: project-qsrsoft-coachq
description: Discovered CoachQ (QSRSoft's AI) API surface — the "agents/services" endpoints on api.sso.myqsrsoft.com. First confirmed endpoint = page-context autoprompts. Path to the Notes-29 goal of surfacing CoachQ recommended prompts in the EOM panel + exploring direct CoachQ integration. Uses AWS Cognito auth (different token from reports/eBOS).
metadata:
  node_type: memory
  type: project
---

# CoachQ (QSRSoft AI) — API surface (captured 2026-07-26)

⚠️ **The capture contained a live AWS Cognito **ID token** (RS256, from
`cognito-idp.us-east-1.amazonaws.com/us-east-1_OdhPNFLDP`, aud `2vt4qrqcakbeo9sh0ivli3lbui`).
NEVER commit that token. NOTE: this is a **different auth** from the reports/eBOS `x-auth-token`
— CoachQ is behind AWS Cognito, so any integration needs the Cognito ID token, not the
QSRSOFT_TOKEN we already store. Capturing/refreshing it is its own problem (Playwright can grab it
from the v3 session the same way).**

## Base
```
https://api.sso.myqsrsoft.com/agents/services/...
```
`agents/services/` strongly implies a small family of endpoints (autoprompts confirmed; an
**ask/chat/completion** endpoint almost certainly exists — find it next by opening the CoachQ chat
panel and watching Network while sending a message).

## Confirmed endpoint — page-context autoprompts
```
POST https://api.sso.myqsrsoft.com/agents/services/autoprompts/v1/{orgId}
     orgId = a546d4ef-684a-4f25-8bc0-6580af068875   (our org)
Headers: x-auth-token: <Cognito ID token>, Content-Type: application/json,
         Origin/Referer: https://v3.myqsrsoft.com
Body:    {"page": "Inventory > On Hand Inventory"}
```
Returns the suggested prompts CoachQ shows on that page:
```json
{ "autoprompts": [
    "How do I add an email-based user to MyQsrSoft?",
    "When do I work next?"
] }
```
- The `page` string is the **breadcrumb of the QSRSoft screen** — so we can request prompts for any
  page context ("Inventory > On Hand Inventory", presumably "Inventory > Variance Stat", FOB pages, etc.).
- The On-Hand page's current autoprompts are generic (not FOB-diagnosis-specific) — so for the EOM panel
  we'll likely **author our own FOB-diagnosis prompt set** and optionally blend in whatever CoachQ returns.

## Toward the Notes-29 CoachQ goals
1. **"Recommended prompts in the EOM panel"** — MVP can be our own curated FOB-diagnosis prompts
   (no CoachQ dependency), optionally augmented by a call to this autoprompts endpoint per page.
2. **"Tap into CoachQ AI / initiate prompts / view previous prompts"** — needs the **ask/chat endpoint**
   (not yet captured) + Cognito auth. NEXT CAPTURE: open the CoachQ chat, send a prompt, grab that
   request (URL + body + response shape). Also look for a history/conversations endpoint.
3. Feasibility unknown until the chat endpoint + auth refresh are proven — keep this an exploration spike,
   MVP the curated-prompts path first.

## Sibling: Alerts/Notifications GraphQL (captured 2026-07-26)
```
POST https://api.sso.myqsrsoft.com/alerts/graphql
Headers: authorization: <Cognito ID token>   (NOTE: 'authorization', not 'x-auth-token'), content-type: application/json
Body:    {"operationName":"guac","variables":{},"query":"query guac { getNumberOfUnreadNotificationsByUser(userId: \"<cognito-sub>\") }"}
Resp:    {"data":{"getNumberOfUnreadNotificationsByUser":139}}
```
- A **GraphQL** API for QSRSoft's alerts/notifications, same Cognito auth as CoachQ. `getNumberOfUnreadNotificationsByUser`
  confirmed; the schema surely exposes list/read operations (introspect or watch the notifications panel to find them).
- Path to **pulling QSRSoft's own operational alerts into Meridian** (e.g. surface store alerts alongside our Signals).
  Backlog — same Cognito-auth problem to solve as the CoachQ chat endpoint.

## Related endpoints logged elsewhere
- `memory/project-qsrsoft-controls-endpoint.md` — storewide_controls (thresholds/discounts/metrics).
- Reports API (FOB/DAR) + eBOS ledger — see CLAUDE.md + scripts/qsrsoft-*.mjs.
