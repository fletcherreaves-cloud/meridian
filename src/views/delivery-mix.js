// @ts-nocheck
import * as React from 'react';
import { f$, fPct } from '../utils/fmt.js';
import { STORE_NAMES } from '../constants.js';

const h = React.createElement;
const { useState, useMemo } = React;

// ── Platform brand colors ────────────────────────────────────────────────────
const DD_COLOR = '#ef4444';   // DoorDash red
const UE_COLOR = '#06b6d4';   // UberEats teal (readable on dark bg)
const GH_COLOR = '#f97316';   // Grubhub orange

// ── Aggregate cashRows into per-store totals for a given lookback window ─────
function aggregate(cashRows, days) {
  if (!cashRows?.length) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const byLoc = {};
  for (const r of cashRows) {
    if (!r.loc || !r.date) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    if (d < cutoff) continue;
    if (!byLoc[r.loc]) byLoc[r.loc] = {
      loc: r.loc, days: 0,
      doorDashSales: 0, doorDashGC: 0,
      uberEatsSales: 0, uberEatsGC: 0,
      grubhubSales:  0, grubhubGC:  0,
      total3poSales: 0, allNetSales: 0,
      cashOS: 0, cashOSPct: 0,
      mopEatIn: 0, mopTakeout: 0, kioskEatIn: 0, kioskTakeout: 0,
    };
    const s = byLoc[r.loc];
    s.doorDashSales += r.doorDashSales || 0;
    s.doorDashGC    += r.doorDashGC    || 0;
    s.uberEatsSales += r.uberEatsSales || 0;
    s.uberEatsGC    += r.uberEatsGC    || 0;
    s.grubhubSales  += r.grubhubSales  || 0;
    s.grubhubGC     += r.grubhubGC     || 0;
    s.total3poSales += r.total3poSales || (r.doorDashSales + r.uberEatsSales + r.grubhubSales) || 0;
    s.allNetSales   += r.allNetSales   || 0;
    s.cashOS        += r.cashOS        || 0;
    s.mopEatIn      += r.mopEatIn      || 0;
    s.mopTakeout    += r.mopTakeout    || 0;
    s.kioskEatIn    += r.kioskEatIn    || 0;
    s.kioskTakeout  += r.kioskTakeout  || 0;
    s.days++;
  }
  return Object.values(byLoc).map(s => {
    const tpo = s.total3poSales || (s.doorDashSales + s.uberEatsSales + s.grubhubSales);
    const leader = s.doorDashSales >= s.uberEatsSales && s.doorDashSales >= s.grubhubSales ? 'DoorDash'
                 : s.uberEatsSales >= s.grubhubSales ? 'UberEats' : 'Grubhub';
    return {
      ...s,
      total3poSales: tpo,
      total3poPct: s.allNetSales > 0 ? tpo / s.allNetSales : 0,
      doorDashPct: tpo > 0 ? s.doorDashSales / tpo : 0,
      uberEatsPct: tpo > 0 ? s.uberEatsSales / tpo : 0,
      grubhubPct:  tpo > 0 ? s.grubhubSales  / tpo : 0,
      leader,
    };
  }).sort((a, b) => b.total3poPct - a.total3poPct);
}

// ── Stacked horizontal platform bar ─────────────────────────────────────────
function PlatformBar({ dd = 0, ue = 0, gh = 0 }) {
  const total = dd + ue + gh;
  if (!total) return h('div', {
    style: { height: 10, background: 'var(--surf2)', borderRadius: 5, width: '100%' }
  });
  return h('div', {
    style: { display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', width: '100%', gap: 1 }
  },
    dd > 0 && h('div', {
      title: `DoorDash ${(dd/total*100).toFixed(1)}%`,
      style: { width: (dd/total*100)+'%', background: DD_COLOR, minWidth: 2 }
    }),
    ue > 0 && h('div', {
      title: `UberEats ${(ue/total*100).toFixed(1)}%`,
      style: { width: (ue/total*100)+'%', background: UE_COLOR, minWidth: 2 }
    }),
    gh > 0 && h('div', {
      title: `Grubhub ${(gh/total*100).toFixed(1)}%`,
      style: { width: (gh/total*100)+'%', background: GH_COLOR, minWidth: 2 }
    }),
  );
}

// ── Summary card ─────────────────────────────────────────────────────────────
function Card({ label, value, sub, color }) {
  return h('div', {
    style: {
      background: 'var(--surf)', border: '1px solid var(--bdr)',
      borderRadius: 10, padding: '14px 18px', minWidth: 140,
    }
  },
    h('div', { style: { fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' } }, label),
    h('div', { style: { fontSize: 22, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1.1 } }, value),
    sub && h('div', { style: { fontSize: 11, color: 'var(--text3)', marginTop: 3 } }, sub),
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────
export function DeliveryMixPanel({ ds, onClose }) {
  const [period, setPeriod] = useState(28);
  const [sort, setSort]     = useState('pct');  // 'pct' | 'sales' | 'dd' | 'ue' | 'gh'

  const cashRows = ds?.cashRows || [];
  const stores   = useMemo(() => aggregate(cashRows, period), [cashRows, period]);

  const sorted = useMemo(() => {
    const rows = [...stores];
    if (sort === 'sales') rows.sort((a, b) => b.total3poSales - a.total3poSales);
    else if (sort === 'dd') rows.sort((a, b) => b.doorDashPct - a.doorDashPct);
    else if (sort === 'ue') rows.sort((a, b) => b.uberEatsPct - a.uberEatsPct);
    else if (sort === 'gh') rows.sort((a, b) => b.grubhubPct  - a.grubhubPct);
    else rows.sort((a, b) => b.total3poPct - a.total3poPct);
    return rows;
  }, [stores, sort]);

  // District totals
  const dist = useMemo(() => {
    const d = { doorDashSales: 0, uberEatsSales: 0, grubhubSales: 0, total3poSales: 0, allNetSales: 0 };
    for (const s of stores) {
      d.doorDashSales  += s.doorDashSales;
      d.uberEatsSales  += s.uberEatsSales;
      d.grubhubSales   += s.grubhubSales;
      d.total3poSales  += s.total3poSales;
      d.allNetSales    += s.allNetSales;
    }
    const tpo = d.total3poSales;
    return {
      ...d,
      total3poPct:  d.allNetSales > 0 ? d.total3poSales / d.allNetSales : 0,
      doorDashPct:  tpo > 0 ? d.doorDashSales / tpo : 0,
      uberEatsPct:  tpo > 0 ? d.uberEatsSales / tpo : 0,
      grubhubPct:   tpo > 0 ? d.grubhubSales  / tpo : 0,
    };
  }, [stores]);

  const isEmpty = !cashRows.length;

  // ── Overlay ──────────────────────────────────────────────────────────────
  return h('div', {
    style: {
      position: 'fixed', inset: 0, zIndex: 1200,
      background: 'rgba(0,0,0,.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    },
    onClick: e => { if (e.target === e.currentTarget) onClose(); }
  },
    h('div', {
      style: {
        background: 'var(--bg)', border: '1px solid var(--bdr)',
        borderRadius: 14, width: '100%', maxWidth: 900,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }
    },

      // ── Header ────────────────────────────────────────────────────────────
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--bdr)', flexShrink: 0,
        }
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { style: { fontSize: 20 } }, '🛵'),
          h('span', { style: { fontWeight: 700, fontSize: 16 } }, '3rd Party Delivery Mix'),
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          // Period selector
          ['7', '28', '90'].map(d =>
            h('button', {
              key: d,
              onClick: () => setPeriod(+d),
              style: {
                padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                background: period === +d ? 'var(--amber)' : 'var(--surf)',
                color: period === +d ? '#000' : 'var(--text2)',
                border: `1px solid ${period === +d ? 'var(--amber)' : 'var(--bdr)'}`,
                fontWeight: period === +d ? 700 : 400,
              }
            }, d === '7' ? '7d' : d === '28' ? '28d' : '90d')
          ),
          h('button', {
            onClick: onClose,
            style: {
              marginLeft: 8, background: 'none', border: '1px solid var(--bdr)',
              borderRadius: 6, color: 'var(--text3)', cursor: 'pointer',
              padding: '4px 10px', fontSize: 13,
            }
          }, '✕'),
        ),
      ),

      // ── Body ──────────────────────────────────────────────────────────────
      h('div', { style: { overflowY: 'auto', flex: 1, padding: 20 } },

        isEmpty
          // ── Empty state ─────────────────────────────────────────────────
          ? h('div', {
              style: {
                textAlign: 'center', padding: '60px 20px',
                color: 'var(--text3)',
              }
            },
              h('div', { style: { fontSize: 40, marginBottom: 12 } }, '🛵'),
              h('div', { style: { fontSize: 16, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 } },
                'No Cash Sheet data yet'
              ),
              h('div', { style: { fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.6 } },
                'QSRSoft Cash Sheet reports start arriving daily at 10:30 AM. ' +
                'You can also drag-drop a Cash Sheet file to load it now.'
              ),
            )

          // ── Data view ───────────────────────────────────────────────────
          : h(React.Fragment, null,

              // Summary cards
              h('div', {
                style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }
              },
                h(Card, {
                  label: `Total 3PO Sales (${period}d)`,
                  value: f$(dist.total3poSales),
                  sub: `${fPct(dist.total3poPct)} of all sales`,
                }),
                h(Card, {
                  label: 'DoorDash',
                  value: fPct(dist.doorDashPct),
                  sub: f$(dist.doorDashSales),
                  color: DD_COLOR,
                }),
                h(Card, {
                  label: 'UberEats',
                  value: fPct(dist.uberEatsPct),
                  sub: f$(dist.uberEatsSales),
                  color: UE_COLOR,
                }),
                h(Card, {
                  label: 'Grubhub',
                  value: fPct(dist.grubhubPct),
                  sub: f$(dist.grubhubSales),
                  color: GH_COLOR,
                }),
              ),

              // District platform bar
              h('div', { style: { marginBottom: 20 } },
                h('div', { style: { fontSize: 11, color: 'var(--text3)', marginBottom: 6 } }, 'DISTRICT PLATFORM MIX'),
                h(PlatformBar, { dd: dist.doorDashPct, ue: dist.uberEatsPct, gh: dist.grubhubPct }),
                h('div', { style: { display: 'flex', gap: 16, marginTop: 6 } },
                  h('span', { style: { fontSize: 11, color: DD_COLOR } }, `● DoorDash ${fPct(dist.doorDashPct)}`),
                  h('span', { style: { fontSize: 11, color: UE_COLOR } }, `● UberEats ${fPct(dist.uberEatsPct)}`),
                  h('span', { style: { fontSize: 11, color: GH_COLOR } }, `● Grubhub ${fPct(dist.grubhubPct)}`),
                ),
              ),

              // Store table
              h('table', {
                style: {
                  width: '100%', borderCollapse: 'collapse', fontSize: 13,
                }
              },
                h('thead', null,
                  h('tr', { style: { borderBottom: '1px solid var(--bdr)' } },
                    ['Store', '3PO Sales', '% of Sales', 'DoorDash', 'UberEats', 'Grubhub', 'Platform Mix'].map((col, i) => {
                      const sortKey = ['', 'sales', 'pct', 'dd', 'ue', 'gh', ''][i];
                      return h('th', {
                        key: col,
                        onClick: sortKey ? () => setSort(sortKey) : undefined,
                        style: {
                          padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right',
                          color: sort === sortKey ? 'var(--amber)' : 'var(--text3)',
                          fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
                          letterSpacing: '0.05em', whiteSpace: 'nowrap',
                          cursor: sortKey ? 'pointer' : 'default',
                          userSelect: 'none',
                        }
                      }, col + (sort === sortKey ? ' ↓' : ''));
                    })
                  ),
                ),
                h('tbody', null,
                  sorted.map((s, i) => {
                    const name = STORE_NAMES?.[s.loc] || s.loc;
                    const leaderColor = s.leader === 'DoorDash' ? DD_COLOR
                                      : s.leader === 'UberEats' ? UE_COLOR : GH_COLOR;
                    return h('tr', {
                      key: s.loc,
                      style: {
                        borderBottom: '1px solid var(--bdr)',
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)',
                      }
                    },
                      h('td', { style: { padding: '10px 10px', fontWeight: 600 } },
                        h('div', null, name),
                        h('div', { style: { fontSize: 11, color: 'var(--text3)' } },
                          s.days, ' day', s.days !== 1 ? 's' : '', ' · ',
                          h('span', { style: { color: leaderColor } }, s.leader, ' leads')
                        ),
                      ),
                      h('td', { style: { padding: '10px 10px', textAlign: 'right', fontWeight: 600 } }, f$(s.total3poSales)),
                      h('td', {
                        style: {
                          padding: '10px 10px', textAlign: 'right', fontWeight: 700,
                          color: s.total3poPct > 0.12 ? 'var(--amber)' : 'var(--text)',
                        }
                      }, fPct(s.total3poPct)),
                      h('td', { style: { padding: '10px 10px', textAlign: 'right', color: DD_COLOR, fontWeight: 600 } },
                        fPct(s.doorDashPct)
                      ),
                      h('td', { style: { padding: '10px 10px', textAlign: 'right', color: UE_COLOR, fontWeight: 600 } },
                        fPct(s.uberEatsPct)
                      ),
                      h('td', { style: { padding: '10px 10px', textAlign: 'right', color: GH_COLOR, fontWeight: 600 } },
                        fPct(s.grubhubPct)
                      ),
                      h('td', { style: { padding: '10px 10px', minWidth: 120 } },
                        h(PlatformBar, {
                          dd: s.doorDashSales, ue: s.uberEatsSales, gh: s.grubhubSales
                        }),
                      ),
                    );
                  })
                ),
              ),
            ),
      ),
    ),
  );
}
