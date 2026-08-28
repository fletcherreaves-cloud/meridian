// @ts-nocheck
export default {version:'5.239', date:'2026-08-28', changes:[
  'Dispatch #201 -- merged Channel Intel into 3PO Delivery: an overview + drill-down pairing on ' +
  'the same Delivery slice. Channel Intel (ChannelIntelligencePanel, formerly src/views/' +
  'analytics.js) was a 5-channel Drive-Thru/Breakfast/Delivery/MOP/Kiosk sales-mix overview; 3PO ' +
  'Delivery (src/views/delivery-mix.js) is the platform-level DoorDash/UberEats/Grubhub drill-down ' +
  'on that overview\'s Delivery bar specifically. delivery-mix.js survives as the nav entry ' +
  '(already kind:\'nav\'; Channel Intel was kind:\'optional\', a Panel Manager toggle) with ' +
  'Channel Intel\'s overview folded in as DeliveryMixPanel\'s new, default "Channel Overview" tab ' +
  '-- land on the wide mix, click through to "Delivery Platforms" for the platform breakdown of ' +
  'just the Delivery bar. Computations are unchanged and NOT unified (out of scope): Channel ' +
  'Overview still reads ds.laborByLoc (Operations Report Sales-sheet channel columns), Delivery ' +
  'Platforms still reads ds.cashRows (QSRSoft Cash Sheet, cloud auto-pulled) -- ported verbatim, ' +
  'with two dead CSS-var-name fixes (var(--surface) -> var(--surf), var(--text1) -> var(--text); ' +
  'neither token exists anywhere in meridian.css, so those rules were silently falling back to ' +
  'inherited styling in the original panel -- not a computation change). channel-intel retired to ' +
  'kind:\'internal\' in panel-registry.js (id kept for the dispatch<->registry pairing test) and ' +
  'removed from constants.js\'s OPTIONAL_PANELS toggle list -- same "kept registered so old deep ' +
  'links redirect" pattern as calendar-manager\'s (#191) and corr-explorer\'s (#195) retirements; ' +
  'onOpenModal(\'channel-intel\') now redirects into DeliveryMixPanel\'s default Overview tab ' +
  'instead of no-oping. Bonus, opportunistic panel-contract pass while already rewriting this ' +
  'panel\'s render: delivery-mix.js\'s hand-rolled position:fixed/inset:0/rgba(0,0,0 backdrop is ' +
  'gone, replaced by the shared ModalShell; its results table now scrolls horizontally on mobile ' +
  'instead of clipping (overflowX:\'auto\'). Entry chunk budget: unaffected (both panels are lazy) ' +
  '-- eager total 546.03 KB gzip vs a 546.10 KB baseline measured on the same pre-merge tree ' +
  '(budget 850 KB); delivery-mix.js\'s own lazy chunk grew 2.64 -> 4.84 KB gzip absorbing the ' +
  'overview logic, analytics.js shrank 92.09 -> 89.95 KB gzip losing it -- net movement between ' +
  'two lazy chunks, no change to what loads eagerly.',
]}
