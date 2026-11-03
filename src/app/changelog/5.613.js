// @ts-nocheck
export default {version:'5.613', date:'2026-11-03', changes:[
  '**Sidebar: section menus now start collapsed (owner-reported: "side panel menus still ' +
  'opening expanded").** The 2026-11-02 condense-sidebar ship deliberately defaulted every ' +
  'section open; once the accordion and auto-collapse-on-pick mechanics both shipped, an ' +
  'all-open default stopped making sense next to them — every first page load still showed the ' +
  'full uncondensed wall of links. Sections now start collapsed; click a header to open one, ' +
  'exactly as before. v2 nav style only, same scoping every sidebar-section change this week ' +
  'has used.',
  '**SAGE memory search: added an explicit tenant_id filter (hardening, no live behavior ' +
  'change today).** `sage_memory_kb` already carried `tenant_id` + real RLS policies, but the ' +
  'one reader (`search_project_memory`, sage-chat/index.ts) runs on the service-role client, ' +
  'which bypasses RLS entirely — and had no filter of its own. A no-op in today\'s single-tenant ' +
  'deployment (one tenant_id on every row), but it closes a real gap before any second tenant\'s ' +
  'data could ever land in the same table. See memory/plan-knowledge-backbone-2026-11-03.md ' +
  '(task #70) for the fuller product/tenant-knowledge design this is the first slice of.',
]};
