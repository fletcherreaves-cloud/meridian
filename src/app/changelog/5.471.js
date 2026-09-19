// @ts-nocheck
export default {version:'5.471', date:'2026-09-19', changes:[
  'Knowledge Base: the "lifelenz_bridge" article stopped naming a panel that hasn\'t existed in ' +
  'the nav for weeks. panel-registry.js\'s live label has been "MBI vs LifeLenz Accuracy" since ' +
  'dispatch #105 (2026-08-24), reached today via Test Kitchen -> Forecast Reports -> its tab ' +
  '(a hub-tab, not a sidebar item, since dispatch #106 Phase B) -- but the article\'s title and ' +
  '"Access:" line still read "LifeLenz Bridge -- WFM Comparison & Adjustment" / "Sidebar -> ' +
  'LifeLenz Bridge".',
  'Also fixed the same stale name in public/forecast-reference.html (the printable reference ' +
  'doc App.js embeds), section 22\'s title and its table-of-contents entry.',
  '2 new tests against the real exported KnowledgeBasePanel (title shows the live name, opening ' +
  'the article shows the real Test Kitchen access path) -- would fail on a revert, since both ' +
  'assertions match text the old copy actually rendered. Full suite 536/536 files, 5067/5067 ' +
  'tests. Build clean, eager payload 551.61 KB gzip (budget 850 KB).',
]};
