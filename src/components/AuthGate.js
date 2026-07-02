// @ts-nocheck
import * as React from 'react';
import { supabase } from '../lib/supabase.js';

const { useState, useEffect } = React;
const h = React.createElement;
const div = (p,...c) => h('div',p,...c);
const btn = (p,...c) => h('button',p,...c);

const AMBER = '#f59e0b';
const SURF  = 'var(--surf,#10172a)';
const SURF2 = 'var(--surf2,#141d2e)';
const TEXT  = 'var(--text,#e2e8f0)';
const TEXT2 = 'var(--text2,#94a3b8)';
const TEXT3 = 'var(--text3,#475569)';
const BDR   = 'var(--bdr,#1e293b)';
const R     = 'var(--r,6px)';

function LoginForm({ onSent }) {
  const [email, setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const send = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const redirectTo = window.location.origin + (window.location.pathname.startsWith('/meridian') ? '/meridian/' : '/');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setLoading(false);
    if (err) setError(err.message);
    else onSent(email.trim());
  };

  return h('form', { onSubmit: send, style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    div({ style: { fontSize: 12, color: TEXT2, lineHeight: 1.6 } },
      "We'll send a secure sign-in link to your email address. No password required."),
    h('input', {
      type: 'email',
      placeholder: 'your@email.com',
      value: email,
      onChange: e => setEmail(e.target.value),
      required: true,
      style: {
        padding: '9px 12px',
        background: SURF2,
        border: `1px solid ${BDR}`,
        borderRadius: R,
        color: TEXT,
        fontSize: 13,
        outline: 'none',
        width: '100%',
      }
    }),
    error && div({ style: { fontSize: 11, color: '#f87171', padding: '6px 10px', background: '#1c0a0a', borderRadius: R, border: '1px solid #7f1d1d' } }, error),
    btn({
      type: 'submit',
      disabled: loading || !email.trim(),
      style: {
        padding: '9px 0',
        background: loading ? '#78350f' : AMBER,
        color: '#000',
        border: 'none',
        borderRadius: R,
        fontSize: 13,
        fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        transition: 'all .15s',
      }
    }, loading ? 'Sending…' : 'Send Sign-in Link')
  );
}

function SentScreen({ email, onBack }) {
  return div({ style: { display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center' } },
    div({ style: { fontSize: 36 } }, '📬'),
    div({ style: { fontSize: 15, fontWeight: 700, color: TEXT } }, 'Check your inbox'),
    div({ style: { fontSize: 12, color: TEXT2, lineHeight: 1.7 } },
      `We sent a sign-in link to `, h('strong', { style: { color: TEXT } }, email), `.`,
      h('br'), `Click the link in that email to access Meridian. `,
      h('br', null), `The link expires in 1 hour.`),
    div({ style: { fontSize: 11, color: TEXT3 } }, "Didn't get it? Check spam or "),
    btn({
      onClick: onBack,
      style: { background: 'none', border: 'none', color: AMBER, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }
    }, 'try a different email address')
  );
}

// AuthGate wraps the entire app.
// - If Supabase is not configured (local-only mode), renders children immediately.
// - If no session, shows a login screen.
// - Once authenticated, renders children and passes the session user.
export function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sent, setSent]       = useState(false);
  const [sentTo, setSentTo]   = useState('');

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    // On localhost or Netlify preview, bypass auth.
    if (window.location.hostname === 'localhost' || window.location.hostname.endsWith('.netlify.app')) { setLoading(false); return; }

    // Check for an existing session (also handles magic-link redirect tokens in URL)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Local-only mode or bypass domains
  if (!supabase || window.location.hostname === 'localhost' || window.location.hostname.endsWith('.netlify.app')) return children;

  // Initial load
  if (loading) return div({
    style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg,#090e18)', color: TEXT3, fontSize: 12 }
  }, 'Loading Meridian…');

  // Authenticated — render the app
  if (session) return children;

  // Not authenticated — show login card
  return div({
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg,#090e18)', padding: 20,
    }
  },
    div({
      style: {
        width: '100%', maxWidth: 380,
        background: SURF,
        border: `1px solid ${BDR}`,
        borderRadius: 12,
        padding: '32px 28px',
        boxShadow: '0 24px 64px rgba(0,0,0,.6)',
      }
    },
      // Logo / wordmark
      div({ style: { marginBottom: 28 } },
        div({
          style: {
            fontFamily: "'Syne', -apple-system, sans-serif",
            fontSize: 22, fontWeight: 800,
            letterSpacing: '-.03em',
            color: AMBER, marginBottom: 4,
          }
        }, 'Meridian'),
        div({ style: { fontSize: 11, color: TEXT3, textTransform: 'uppercase', letterSpacing: '.6px' } },
          (() => { try { return localStorage.getItem('mf_org_name') || ''; } catch { return ''; } })()
            ? [localStorage.getItem('mf_org_name'), ' · Operations Intelligence'].join('')
            : 'Operations Intelligence'
        )
      ),
      // Form or sent state
      sent
        ? h(SentScreen, { email: sentTo, onBack: () => { setSent(false); setSentTo(''); } })
        : h(LoginForm, { onSent: (email) => { setSentTo(email); setSent(true); } }),
      // Footer
      div({ style: { marginTop: 24, paddingTop: 16, borderTop: `1px solid ${BDR}`, fontSize: 10, color: TEXT3, textAlign: 'center' } },
        'Access is controlled by your administrator. ',
        h('br'),
        'Contact your supervisor if you need access.'
      )
    )
  );
}

// Sign-out button — drop this anywhere in the nav
export function SignOutBtn({ style = {} }) {
  if (!supabase) return null;
  const signOut = async () => {
    await supabase.auth.signOut();
    // Clear local review cache so another user doesn't see stale data
    try { localStorage.removeItem('mf_perf_reviews_v1'); } catch {}
  };
  return btn({
    onClick: signOut,
    style: {
      background: 'none',
      border: `1px solid ${BDR}`,
      color: TEXT3,
      borderRadius: R,
      padding: '4px 10px',
      fontSize: 11,
      cursor: 'pointer',
      ...style,
    }
  }, 'Sign out');
}
