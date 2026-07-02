// @ts-nocheck
// ── Meridian First-Run Tutorial / Walkthrough ────────────────────────────────
// Triggered automatically on first launch (localStorage 'mf_tutorial_v1' unset).
// Re-launchable from the Help panel at any time.
import * as React from 'react';

const h = React.createElement;
const div = (p,...c) => h('div',p,...c);
const btn = (p,...c) => h('button',p,...c);
const span = (p,...c) => h('span',p,...c);

const TUTORIAL_KEY = 'mf_tutorial_v1';

const STEPS = [
  {
    icon: '🏁',
    title: 'Welcome to Meridian',
    body: 'Meridian is your district intelligence platform. It turns raw QSRSoft, LifeLenz, and SMG data into actionable daily insight — rankings, labor tracking, food cost analysis, guest voice scores, and projections across all your stores.',
    tip: 'This tour takes about 2 minutes. You can skip any time and re-open from Help.',
  },
  {
    icon: '📂',
    title: 'Step 1 — Load Your Data',
    body: 'Every session starts with loading your data. Click "↑ Load" in the top bar, or drag files directly onto the app. Start with your QSRSoft Operations Report — it unlocks most panels immediately.',
    tip: 'Pro tip: load multiple files at once. Meridian auto-detects each file type by name.',
    highlight: 'load',
  },
  {
    icon: '⌂',
    title: 'Step 2 — Command Center',
    body: 'The Command Center (home screen) shows district-level signals at a glance: which stores need attention, projection pulse for the coming week, and live performance indicators. Start here every morning.',
    tip: 'Red indicators on the left sidebar show stores with critical flags — click "⚠ Needs Attention" to see all.',
    highlight: 'command',
  },
  {
    icon: '🎯',
    title: 'Step 3 — Priority Brief',
    body: 'Priority Brief is your daily coaching digest. It ranks every store by urgency and generates specific, actionable directives — no interpretation needed. Run it after loading fresh data.',
    tip: 'Critical flags (cash, T-Reds, overtime) appear at the top in red. Address these first.',
    highlight: 'priority-brief',
  },
  {
    icon: '🏪',
    title: 'Step 4 — Store Dashboards',
    body: 'Click any store in the district grid to open its dashboard. You\'ll see 4-week trends, day-of-week patterns, shift analysis, and an AI-generated Intelligence Brief for GM coaching.',
    tip: 'Use the Intelligence Brief to generate a personalized coaching letter in 10 seconds.',
    highlight: 'store',
  },
  {
    icon: '🥗',
    title: 'Step 5 — FOB & Food Cost',
    body: 'FOB Analysis shows food cost variance ranked by dollar impact. The Root-Cause Priority Matrix tells you WHICH store, WHICH component, and HOW MUCH — so you spend time where it matters most. FOB EOM Check gives end-of-month status.',
    tip: 'Click any row to expand per-store detail. Use Print for a PDF you can share.',
    highlight: 'fob',
  },
  {
    icon: '💬',
    title: 'Step 6 — Guest Voice (SMG)',
    body: 'Guest Voice shows SMG satisfaction scores across all stores. Upload a Full Scale Report (.xlsx) for aggregate monthly scores, or customer comment PDFs for individual feedback. Color-coded green / yellow / red vs your target standard.',
    tip: 'Customize the threshold standard under ⚙ Thresholds inside the Guest Voice panel.',
    highlight: 'smg',
  },
  {
    icon: '📅',
    title: 'Step 7 — Monthly Targets',
    body: 'Monthly Targets shows QSRSoft projections for each store: sales, crew labor, bonus labor, food cost components, and TPPH. Click "📧 Group Report" to open a print-ready email with operator-group rollups and current month actuals vs targets.',
    tip: 'Re-upload the QSRSoft Monthly Projections file each month to refresh targets.',
    highlight: 'monthly-targets',
  },
  {
    icon: '📋',
    title: 'Step 8 — Performance Reviews',
    body: 'Performance Reviews let you complete structured quarterly reviews for each GM. Score them across 6 KPI dimensions, write development notes, and generate a printable PDF review form.',
    tip: 'OSAT scores auto-fill from Guest Voice data if FullScale reports are loaded.',
    highlight: 'perf-reviews',
  },
  {
    icon: '⚙',
    title: 'Step 9 — Settings',
    body: 'Configure Meridian for your district: set your name, district name, store groups by operator, scoring weights, and threshold tolerances. The Dev tab has connection health checks and infrastructure links.',
    tip: 'Settings are saved to your browser. Export JSON if you need to transfer settings to another device.',
    highlight: 'settings',
  },
  {
    icon: '✅',
    title: 'You\'re Ready',
    body: 'That\'s the core workflow. Load data → Check Command Center → Run Priority Brief → Deep-dive any store. The sidebar has more panels as you grow: Scheduling Intel, Delivery Mix, Rankings, Labor Analytics, and more.',
    tip: 'This guide is always available from the "?" Help button in the top bar.',
  },
];

export function TutorialOverlay({ onClose }) {
  const [step, setStep] = React.useState(0);
  const total = STEPS.length;
  const s = STEPS[step];
  const isLast = step === total - 1;

  const finish = () => {
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch {}
    onClose();
  };

  const progress = ((step + 1) / total) * 100;

  return div({
    style: {
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0 16px 24px',
      backdropFilter: 'blur(2px)',
    },
    onClick: (e) => { if (e.target === e.currentTarget) finish(); }
  },
    div({
      style: {
        width: '100%', maxWidth: 520,
        background: 'var(--surf)', border: '.5px solid var(--bdr2)',
        borderRadius: 12, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,.6)',
      }
    },

      // Progress bar
      div({ style: { height: 3, background: 'var(--bdr)' } },
        div({ style: { height: '100%', width: progress+'%',
          background: 'var(--amber)', transition: 'width .3s ease' } })
      ),

      // Header
      div({ style: { padding: '16px 20px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 } },
        div({ style: { fontSize: 32, flexShrink: 0, lineHeight: 1 } }, s.icon),
        div({ style: { flex: 1 } },
          div({ style: { fontSize: '9px', fontWeight: 700, letterSpacing: '.8px',
            textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 } },
            `Step ${step + 1} of ${total}`),
          div({ style: { fontSize: '15px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 } },
            s.title)
        ),
        btn({
          onClick: finish,
          style: { background: 'none', border: 'none', color: 'var(--text3)',
            fontSize: 18, cursor: 'pointer', padding: '0 0 4px 4px', lineHeight: 1 }
        }, '×')
      ),

      // Body
      div({ style: { padding: '0 20px 12px' } },
        div({ style: { fontSize: 13, lineHeight: 1.65, color: 'var(--text2)', marginBottom: 10 } },
          s.body),
        s.tip && div({
          style: {
            display: 'flex', gap: 8, alignItems: 'flex-start',
            background: 'rgba(245,188,0,.07)', border: '.5px solid rgba(245,188,0,.2)',
            borderRadius: 6, padding: '8px 12px', fontSize: 11, color: 'var(--text3)'
          }
        },
          span({ style: { flexShrink: 0, fontSize: 13 } }, '💡'),
          s.tip
        )
      ),

      // Footer
      div({
        style: {
          padding: '12px 20px', borderTop: '.5px solid var(--bdr)',
          display: 'flex', alignItems: 'center', gap: 8
        }
      },
        // Step dots
        div({ style: { display: 'flex', gap: 4, flex: 1 } },
          ...STEPS.map((_,i) =>
            div({
              key: i,
              onClick: () => setStep(i),
              style: {
                width: i === step ? 16 : 6, height: 6, borderRadius: 3,
                background: i === step ? 'var(--amber)' : i < step ? 'rgba(245,188,0,.3)' : 'var(--bdr2)',
                cursor: 'pointer', transition: 'all .2s'
              }
            })
          )
        ),
        step > 0 && btn({
          onClick: () => setStep(s => s - 1),
          style: { padding: '6px 14px', fontSize: 12, background: 'var(--surf2)',
            border: '.5px solid var(--bdr)', borderRadius: 6, cursor: 'pointer', color: 'var(--text2)' }
        }, '← Back'),
        btn({
          onClick: isLast ? finish : () => setStep(s => s + 1),
          style: {
            padding: '6px 18px', fontSize: 12, fontWeight: 700,
            background: isLast ? '#10b981' : 'var(--amber)',
            color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer'
          }
        }, isLast ? '✓ Done' : 'Next →'),
        !isLast && btn({
          onClick: finish,
          style: { padding: '6px 10px', fontSize: 11, background: 'none',
            border: 'none', color: 'var(--text3)', cursor: 'pointer' }
        }, 'Skip')
      )
    )
  );
}

// Returns true if the tutorial has never been completed on this device.
export function shouldShowTutorial() {
  try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return false; }
}

export function resetTutorial() {
  try { localStorage.removeItem(TUTORIAL_KEY); } catch {}
}
