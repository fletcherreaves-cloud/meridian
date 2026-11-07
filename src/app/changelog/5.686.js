// @ts-nocheck
export default {version:'5.686', date:'2026-11-07', changes:[
  '**Projection/Targets ownership + cross-user awareness (owner request).** Projections lock/edit, ' +
  'Smart Targets "Apply as Official," and Monthly/Yearly Targets saves are now one shared zone, ' +
  'gated to **DO/VP and above by default**, with the ability for those roles to grant a named ' +
  'individual the same standing regardless of role (Admin → **Projections & Targets Owners** tab). ' +
  'Every gated action now notifies the other owners through the existing notification bell, so a ' +
  'second owner sees what a first owner already did before touching the same thing.',
  '**Fixed a real data-forking bug found along the way:** `locked_projections` was stored keyed to ' +
  'the signed-in login, not the organization — two different real user accounts would have silently ' +
  'forked into two disconnected copies of "the truth." Moved to the same shared `org_config` store ' +
  'every other org-wide setting already uses. Lock attribution now reads the real signed-in name, ' +
  'not a free-text settings field.',
]};
