// @ts-nocheck
export default {version:'5.362', date:'2026-09-05', changes:[
  'Fixed: the nav sidebar search input (AppSidebar, src/app/shell.js) had no `id`/`name` ' +
  'attribute -- flagged by Chrome DevTools\' Issues panel as "A form field element should have ' +
  'an id or name attribute" (autofill/accessibility hygiene). Added `id="nav-search"`, ' +
  '`name="nav-search"`, and `autoComplete="off"` (this is an app-nav filter, not a form field a ' +
  'password manager or autofill should ever try to fill).',
]};
