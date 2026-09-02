// @ts-nocheck
export default {version:'5.315', date:'2026-09-01', changes:[
  'Pricing Engine promoted to a URL page (route:true) -- owner: "We should make it a URL page ' +
  'for starters, and then begin adding sections/panels/reporting to it." One-field promotion ' +
  '(kind: test-kitchen -> nav), RoutePanelShell replaces its hand-rolled ModalShell mount.',
  'Menu Item # now leads every row in both ranked tables -- owner: "list it first... There are ' +
  'multiple MI #\'s for virtually everything, some have several. They allow for running ' +
  'promotional pricing and can sometimes be slight variations of same product." The item ' +
  'description is now the secondary column; the number was previously a tiny muted afterthought.',
  'Fixed a real "margins seem way off" bug -- live-measured, not assumed: menuPrice is MAX(price) ' +
  'on the single most recent day in the selected window, but that day can still be IN PROGRESS ' +
  '(qsr_product_mix pulls twice daily, a ~2pm CDT "current-day refresh" mid-cycle) -- only ' +
  'whatever price tiers have rung SO FAR that day were visible, understating price and margin. ' +
  'Measured on store 3708: 34 of 359 items showed a lower latest-day price than an earlier day ' +
  'in the same short window -- a menu-wide price rollback across dozens of unrelated items in ' +
  'one day isn\'t plausible; an incomplete day is. New clampToLastClosedDay() (src/engine/' +
  'pricing-engine.js) clamps the window\'s end to the last CLOSED business day before it ever ' +
  'reaches computeItemMargins(). Full writeup: memory/finding-pricing-engine-stale-price-2026-09-01.md.',
]};
