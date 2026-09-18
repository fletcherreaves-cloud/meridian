// @ts-nocheck
export default {version:'5.468', date:'2026-09-18', changes:[
  'Panel Manager: adds a "Core panels" reference section listing every always-shown (kind:' +
  '"nav") panel, grouped by its real section label -- previously the footer just described ' +
  'these in prose ("the forecast / engineered-model diagnostic tools are always shown and are ' +
  'not listed here"), with no actual list. Collapsed by default (44 core panels vs. the 9 ' +
  'toggleable optional ones -- expanding all of them by default would swamp the panel); click ' +
  '"Core panels" to expand. Reused panel-registry.js\'s own PANELS/SECTIONS directly rather ' +
  'than a second hand-maintained list -- the exact drift class that registry was built to end.',
  'Same dimmed "no access" convention as the existing optional-panel rows for a panel the ' +
  'current role can\'t open, for visual consistency within the same modal.',
  '2 new tests against the real exported PanelManagerPanel (collapsed-by-default + expand ' +
  'reveals every nav panel under its real section, and the no-access dimming) -- would fail on ' +
  'a revert. Full suite 531/531 files, 5051/5051 tests. Build clean, eager payload 551.58 KB ' +
  'gzip (budget 850 KB).',
]};
