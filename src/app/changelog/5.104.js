// @ts-nocheck
export default {version:'5.104', date:'2026-08-22', changes:[
  'Dispatch #61 -- makes promoting a Test Kitchen panel the one-field kind: flip CLAUDE.md\'s '
  + 'standing rule already claimed it was. It wasn\'t: ⚗ TEST KITCHEN in shell.js was a hand-'
  + 'maintained list of 11 literal navPBeta(\'id\') calls, so promoting a panel meant flipping '
  + 'kind: AND deleting its navPBeta line, and skipping the second edit rendered it TWICE -- '
  + 'once under its new section, once still under Test Kitchen (measured 2026-08-21 on '
  + 'fcst-accuracy, header and all).\n\n'
  + 'Verified before touching anything: 11 uncommented navPBeta call sites, 11 '
  + "kind:'test-kitchen' registry panels, zero set difference either direction -- membership "
  + "hadn't drifted, so this is a behaviour-preserving derivation, not a decision about which "
  + 'list was right.\n\n'
  + "The blocker #55 Part A deferred this behind was ORDER, not effort: the registry's "
  + "declaration order is alphabetical, shell.js's was curated, and the two share no positions "
  + '-- deriving membership alone would have moved all eleven items. Fixed by adding an '
  + "explicit tkOrder field (1-11) to each test-kitchen entry in panel-registry.js, numbered to "
  + "reproduce today's rendered order exactly, and a new testKitchenPanels(can) export that "
  + "filters kind==='test-kitchen', applies the permission check, and sorts by tkOrder. "
  + "shell.js's Test Kitchen block is now four lines that call it, replacing the 18-line literal "
  + "list.\n\n"
  + "forecast-audit's { disabled: !selStore } was the one per-item option live in the old list --"
  + " represented declaratively as disabledWhen:'noStore' on its registry entry, mapped to the "
  + 'real predicate in shell.js, rather than special-cased in the derivation loop (a special case '
  + 'is how the literal list started). The commented-out prune record for the exact-duplicate '
  + "\"proj\" nav line (Notes 24, v4.517) had nowhere left to live once its line was deleted -- "
  + 'moved to memory/panel-catalog.md instead of silently dropped.\n\n'
  + "panel-registry.test.js:93's guard over literal navPBeta('id') call sites is now trivially "
  + 'true (there are none left to scan) -- rewritten to assert testKitchenPanels() returns '
  + "exactly the registry's kind:'test-kitchen' set with distinct tkOrder values, plus a ratchet "
  + "against a NEW hardcoded navPBeta('literal-id') call reappearing. shell-nav-snapshot.test.js's "
  + 'promotion test now also asserts the actual defect through the real rendered sidebar: '
  + 'flipping a panel to kind:\'nav\' must render its label exactly once, not twice -- reverting '
  + 'the shell.js derivation back to the old hardcoded list reproduces the double-render and '
  + 'fails 12 tests, confirmed before restoring the fix. The pre-existing exact-text-content '
  + 'snapshot (:62) and eleven-panel ratchet (:221) both pass UNCHANGED, proving zero nav motion.\n\n'
  + '2006/2006 tests. Build clean; entry chunk +0.14 KB gzip (511.50 -> 511.64 KB), net-neutral.',
]};
