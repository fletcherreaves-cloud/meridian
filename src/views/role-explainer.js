// @ts-nocheck
// "What You Can Do" — fresh-eyes role audit (2026-11-11, memory/finding-fresh-eyes-role-audit-
// 2026-11-11.md §4 Q11a, owner-approved "implement all of the items"): "no in-app way for a user
// to SEE which panels their own role has access to without opening Settings -> Roles & Permissions
// and reading a table meant for an admin -- a plain-language 'here's what you can do in this app'
// screen for a non-admin role would reduce the first-login confusion more than most UI polish
// would."
//
// Deliberately NOT a second, hand-written description of every panel/permission -- that would be
// a parallel taxonomy that drifts the moment a panel/permission changes (exactly the doc-rot
// CLAUDE.md's own Dev Rules warn about repeatedly). Every section below reads straight from the
// SAME single sources of truth the real Settings -> Roles & Permissions admin table and the real
// sidebar already use: PANELS/SECTIONS (panel-registry.js) + PERMISSION_GROUPS (permissions.js),
// filtered through the exact same hasPermission()/isPanelEnabledForRole() gates App.js's own
// perm()/panelEnabled() helpers call. If the admin table or the sidebar ever drift from this
// screen, it is because one of them stopped calling the shared functions -- not because this
// screen has its own copy to go stale.
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { PANELS, SECTIONS } from '../app/panel-registry.js';
import { PERMISSION_GROUPS, getRoleById, hasPermission, isPanelEnabledForRole } from '../engine/permissions.js';
import { altitudeForRole } from '../engine/curated-home.js';
import { STORE_NAMES, sNameC } from '../constants.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const ALTITUDE_BLURB = {
  store: 'You manage one store (or a small, named handful). Everything on your screens is scoped to it — you are not seeing other stores\' numbers.',
  patch: 'You oversee a group of stores (a patch). Dashboards and reports here roll up across every store in your patch, not just one.',
  district: 'You have district-wide visibility — every store, every patch, rolled up together.',
};

export function RoleExplainerPanel({ userRole, orgRoles, accessibleLocs, onClose }) {
  const role = getRoleById(userRole, orgRoles);
  const altitude = altitudeForRole(userRole);

  const grantedGroups = React.useMemo(() => PERMISSION_GROUPS
    .map(g => ({ group: g.group, items: g.items.filter(it => hasPermission(userRole, it.key, orgRoles)) }))
    .filter(g => g.items.length),
    [userRole, orgRoles]);

  const sectionsWithPanels = React.useMemo(() => SECTIONS
    .map(s => ({
      section: s,
      panels: PANELS.filter(p =>
        p.section === s.id && p.kind === 'nav' &&
        (!p.perm || hasPermission(userRole, p.perm, orgRoles)) &&
        isPanelEnabledForRole(p.id, userRole, orgRoles)),
    }))
    .filter(s => s.panels.length),
    [userRole, orgRoles]);

  const storesLine = Array.isArray(accessibleLocs) && accessibleLocs.length
    ? accessibleLocs.length + ' of ' + Object.keys(STORE_NAMES).length + ' stores: ' + accessibleLocs.map(l => sNameC(l) || l).join(', ')
    : 'All ' + Object.keys(STORE_NAMES).length + ' stores';

  return h(RoutePanelShell, {
    title: 'What You Can Do', icon: '🧭', onBack: onClose,
    subtitle: span(null, 'A plain-language map of your own role\'s access — not a judgment call, just what\'s already true'),
  },
    div({ style: { maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 } },

      // Who you are, in plain words.
      div({ style: { background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 10, padding: '14px 16px' } },
        div({ style: { fontSize: 16, fontWeight: 800, color: 'var(--text)' } }, role?.label || userRole),
        div({ style: { fontSize: 12, color: 'var(--text2)', marginTop: 6, lineHeight: 1.5 } }, ALTITUDE_BLURB[altitude] || ALTITUDE_BLURB.store),
        div({ style: { fontSize: 11, color: 'var(--text3)', marginTop: 8 } }, 'Your stores: ' + storesLine),
      ),

      // What you're allowed to do (plain-language permission labels, grouped — same labels the
      // admin Roles & Permissions table uses, never a second set of wording).
      grantedGroups.length > 0 && div(null,
        div({ style: { fontSize: '10px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 } }, 'What You Can Do'),
        div({ style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          grantedGroups.map(g => div({ key: g.group, style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '10px 14px' } },
            div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 } }, g.group),
            g.items.map(it => div({ key: it.key, style: { fontSize: 12, color: 'var(--text)', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 } },
              span({ style: { color: '#10b981' } }, '✓'), it.label)),
          )),
        ),
      ),

      // Which panels your sidebar actually shows, grouped by the same sections the real sidebar
      // uses — a user can confirm "yes, that's what I see" rather than trusting a description.
      div(null,
        div({ style: { fontSize: '10px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 } }, 'Where To Find It'),
        div({ style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          sectionsWithPanels.map(({ section, panels }) => div({ key: section.id, style: { background: 'var(--surf)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '10px 14px' } },
            div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 } }, section.label),
            div({ style: { display: 'flex', flexWrap: 'wrap', gap: 10 } },
              panels.map(p => div({ key: p.id, style: { fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 } },
                span(null, p.icon || '•'), p.label))),
          )),
        ),
      ),

      div({ style: { fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center' } },
        'If something here looks wrong for your job, contact an admin — this screen shows what your account is set up for today, it doesn\'t change anything.'),
    ),
  );
}
