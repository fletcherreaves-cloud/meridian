// @ts-nocheck
import * as React from 'react';
import { supabase } from '../lib/supabase.js';

const { useState, useEffect } = React;
const h = React.createElement;
const div  = (p,...c) => h('div',  p, ...c);
const span = (p,...c) => h('span', p, ...c);
const btn  = (p,...c) => h('button', p, ...c);

// ── Design tokens ───────────────────────────────────────────────────────────────
const AMBER  = '#f59e0b';
const SURF   = 'var(--surf,#10172a)';
const SURF2  = 'var(--surf2,#141d2e)';
const TEXT   = 'var(--text,#e2e8f0)';
const TEXT2  = 'var(--text2,#94a3b8)';
const TEXT3  = 'var(--text3,#475569)';
const BDR    = 'var(--bdr,#1e293b)';
const R      = 'var(--r,6px)';
const GREEN  = '#34d399';

// ── Shared sub-components ───────────────────────────────────────────────────────
function ErrBox({ msg }) {
  if (!msg) return null;
  return div({
    style: { fontSize: 11, color: '#f87171', padding: '6px 10px',
      background: '#1c0a0a', borderRadius: R, border: '1px solid #7f1d1d' }
  }, msg);
}

function OkBox({ msg }) {
  if (!msg) return null;
  return div({
    style: { fontSize: 11, color: GREEN, padding: '6px 10px',
      background: 'rgba(52,211,153,.08)', borderRadius: R, border: `1px solid rgba(52,211,153,.3)` }
  }, msg);
}

function FieldLabel({ children }) {
  return div({ style: { fontSize: 11, color: TEXT3, fontWeight: 600, letterSpacing: '.3px', marginBottom: 4 } }, children);
}

function TextInput({ label, type, value, onChange, placeholder, autoFocus, autoComplete, inputMode }) {
  return div({ style: { display: 'flex', flexDirection: 'column' } },
    h(FieldLabel, null, label),
    h('input', {
      type:         type || 'text',
      value,
      onChange:     e => onChange(e.target.value),
      placeholder:  placeholder || '',
      autoFocus:    !!autoFocus,
      autoComplete: autoComplete || 'off',
      inputMode:    inputMode || undefined,
      style: {
        padding: '9px 12px', background: SURF2, border: `1px solid ${BDR}`,
        borderRadius: R, color: TEXT, fontSize: 13, outline: 'none', width: '100%',
        WebkitAppearance: 'none', boxSizing: 'border-box',
      },
    })
  );
}

function PrimaryBtn({ children, loading, disabled, type }) {
  return btn({
    type: type || 'submit',
    disabled: loading || disabled,
    style: {
      padding: '10px 0', background: loading ? '#78350f' : AMBER,
      color: '#000', border: 'none', borderRadius: R,
      fontSize: 13, fontWeight: 700, width: '100%',
      cursor: loading || disabled ? 'not-allowed' : 'pointer',
      opacity: loading || disabled ? 0.7 : 1, transition: 'all .15s',
    }
  }, loading ? 'Working…' : children);
}

function GhostBtn({ children, onClick }) {
  return btn({
    type: 'button', onClick,
    style: { background: 'none', border: 'none', color: TEXT3, fontSize: 12, cursor: 'pointer', padding: 0 }
  }, children);
}

function LinkBtn({ children, onClick }) {
  return btn({
    type: 'button', onClick,
    style: { background: 'none', border: 'none', color: AMBER, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }
  }, children);
}

// Map Supabase auth error messages to user-friendly strings
function friendlyAuthError(err) {
  if (!err) return '';
  const m = (err.message || '').toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials'))
    return 'Incorrect email or password. Try again or use "Forgot password?"';
  if (m.includes('email not confirmed'))
    return 'Email address not confirmed. Check your inbox for a confirmation email, then try again.';
  if (m.includes('too many requests') || m.includes('rate limit'))
    return 'Too many attempts — please wait a minute and try again.';
  if (m.includes('user not found') || m.includes('no user'))
    return 'No account found for that email address.';
  if (m.includes('token') && (m.includes('invalid') || m.includes('expired')))
    return 'Code is invalid or expired — request a new one.';
  if (m.includes('same password'))
    return 'New password must be different from the current one.';
  return err.message || 'Something went wrong. Try again.';
}

// ── Screen A: Email + password login ───────────────────────────────────────────
function LoginScreen({ onForgot }) {
  const [email,   setEmail]   = useState('');
  const [pass,    setPass]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const submit = async e => {
    e.preventDefault();
    if (!email.trim() || !pass) return;
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(), password: pass,
    });
    setLoading(false);
    if (err) setError(friendlyAuthError(err));
    // Success → onAuthStateChange fires → AuthGate re-renders with session
  };

  return h('form', { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    h(TextInput, { label: 'Email', type: 'email', value: email, onChange: setEmail,
      placeholder: 'your@email.com', autoFocus: true, autoComplete: 'username' }),
    h(TextInput, { label: 'Password', type: 'password', value: pass, onChange: setPass,
      placeholder: '••••••••', autoComplete: 'current-password' }),
    h(ErrBox, { msg: error }),
    h(PrimaryBtn, { loading, disabled: !email.trim() || !pass }, 'Sign In'),
    div({ style: { textAlign: 'center' } },
      h(LinkBtn, { onClick: onForgot }, 'Forgot password?')
    )
  );
}

// ── Screen B1: Forgot — enter email ────────────────────────────────────────────
function ForgotEmailScreen({ onSent, onBack }) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const submit = async e => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError('');
    // No emailRedirectTo → Supabase sends a 6-digit OTP code instead of a magic link.
    // shouldCreateUser:false ensures only existing accounts can reset.
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (err) setError(friendlyAuthError(err));
    else     onSent(email.trim());
  };

  return h('form', { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    div({ style: { fontSize: 12, color: TEXT2, lineHeight: 1.6 } },
      'Enter your email. We\'ll send a 6-digit verification code — no magic link, no redirect.'),
    h(TextInput, { label: 'Email', type: 'email', value: email, onChange: setEmail,
      placeholder: 'your@email.com', autoFocus: true, autoComplete: 'username' }),
    h(ErrBox, { msg: error }),
    h(PrimaryBtn, { loading, disabled: !email.trim() }, 'Send Code'),
    div({ style: { textAlign: 'center' } },
      h(GhostBtn, { onClick: onBack }, '← Back to sign in')
    )
  );
}

// ── Screen B2: Enter OTP code ───────────────────────────────────────────────────
function ForgotOTPScreen({ email, onVerified, onBack }) {
  const [code,      setCode]    = useState('');
  const [loading,   setLoading] = useState(false);
  const [error,     setError]   = useState('');
  const [resending, setResend]  = useState(false);
  const [resentMsg, setResMsg]  = useState('');

  const submit = async e => {
    e.preventDefault();
    const token = code.replace(/\D/g, '');
    if (token.length !== 6) return;
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setLoading(false);
    if (err) setError(friendlyAuthError(err));
    else     onVerified(); // session is now active — caller shows Set Password screen
  };

  const resend = async () => {
    setResend(true); setResMsg('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email, options: { shouldCreateUser: false },
    });
    setResend(false);
    setResMsg(err ? 'Could not resend — ' + err.message : '✓ New code sent to ' + email);
  };

  return h('form', { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    div({ style: { fontSize: 12, color: TEXT2, lineHeight: 1.6 } },
      'We sent a 6-digit code to ', h('strong', { style: { color: TEXT } }, email), '.'),
    h(TextInput, { label: 'Verification Code', type: 'text', value: code, onChange: setCode,
      placeholder: '123456', autoFocus: true, inputMode: 'numeric', autoComplete: 'one-time-code' }),
    h(ErrBox,  { msg: error }),
    h(OkBox,   { msg: resentMsg }),
    h(PrimaryBtn, { loading, disabled: code.replace(/\D/g,'').length !== 6 }, 'Verify Code'),
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h(GhostBtn, { onClick: onBack }, '← Back'),
      h(LinkBtn, { onClick: resend }, resending ? 'Sending…' : 'Resend code')
    )
  );
}

// ── Screen B3: Set new password (shown after OTP verify, before app access) ────
function SetPasswordScreen({ onDone }) {
  const [pass,    setPass]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const submit = async e => {
    e.preventDefault();
    if (pass.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (pass !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.updateUser({ password: pass });
    setLoading(false);
    if (err) setError(friendlyAuthError(err));
    else     onDone(); // clear the interstitial — app loads
  };

  return h('form', { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 14 } },
    div({ style: { fontSize: 12, color: TEXT2, lineHeight: 1.6 } },
      'Identity verified. Set a password now so you can sign in directly next time.'),
    h(TextInput, { label: 'New Password', type: 'password', value: pass, onChange: setPass,
      placeholder: 'Min. 8 characters', autoFocus: true, autoComplete: 'new-password' }),
    h(TextInput, { label: 'Confirm Password', type: 'password', value: confirm, onChange: setConfirm,
      placeholder: 'Re-enter password', autoComplete: 'new-password' }),
    h(ErrBox, { msg: error }),
    h(PrimaryBtn, { loading, disabled: !pass || !confirm }, 'Set Password & Enter'),
    div({ style: { textAlign: 'center', fontSize: 11, color: TEXT3 } },
      'You can also skip this and set a password later in Settings.')
  );
}

// ── Login card wrapper ──────────────────────────────────────────────────────────
function LoginCard({ children, showOrgName }) {
  const orgName = (() => { try { return localStorage.getItem('mf_org_name') || ''; } catch { return ''; } })();
  return div({
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg,#090e18)', padding: 20,
    }
  },
    div({
      style: {
        width: '100%', maxWidth: 380,
        background: SURF, border: `1px solid ${BDR}`,
        borderRadius: 12, padding: '32px 28px',
        boxShadow: '0 24px 64px rgba(0,0,0,.6)',
      }
    },
      div({ style: { marginBottom: 28 } },
        div({ style: {
          fontFamily: "'Syne',-apple-system,sans-serif",
          fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', color: AMBER, marginBottom: 4,
        }}, 'Meridian'),
        div({ style: { fontSize: 11, color: TEXT3, textTransform: 'uppercase', letterSpacing: '.6px' } },
          orgName ? orgName + ' · Operations Intelligence' : 'Operations Intelligence')
      ),
      children,
      div({
        style: { marginTop: 24, paddingTop: 16, borderTop: `1px solid ${BDR}`,
          fontSize: 10, color: TEXT3, textAlign: 'center' }
      },
        'Access controlled by your administrator.',
        h('br'),
        'Contact your supervisor if you need access.'
      )
    )
  );
}

// ── AuthGate ────────────────────────────────────────────────────────────────────
// States: 'login' → 'forgot-email' → 'forgot-otp' → (session set) → 'set-password' → app
export function AuthGate({ children }) {
  const [session,           setSession]      = useState(null);
  const [loading,           setLoading]      = useState(true);
  const [screen,            setScreen]       = useState('login'); // login | forgot-email | forgot-otp | set-password
  const [forgotEmail,       setForgotEmail]  = useState('');
  // pendingPasswordSet: true while user has just verified OTP and still needs to set a password.
  // Kept separate so we can show the Set Password screen even though session is now active.
  const [pendingPwSet,      setPendingPwSet] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    if (window.location.hostname === 'localhost') { setLoading(false); return; }

    // Supabase default client already uses localStorage with persistSession:true and
    // autoRefreshToken:true — sessions survive app relaunches and token refreshes happen
    // silently in the background. No extra config needed.
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // If sign-out happens while pendingPwSet, clear that too
      if (!s) { setPendingPwSet(false); setScreen('login'); }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Local-only mode / localhost bypass
  if (!supabase || window.location.hostname === 'localhost') return children;

  // Loading session from storage
  if (loading) {
    return div({
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg,#090e18)', color: TEXT3, fontSize: 12 }
    }, 'Loading Meridian…');
  }

  // Authenticated + password-set interstitial (OTP verified, need password before entering app)
  if (session && pendingPwSet) {
    return h(LoginCard, null,
      h(SetPasswordScreen, {
        onDone: () => { setPendingPwSet(false); setScreen('login'); }
      })
    );
  }

  // Authenticated and ready — render the app
  if (session) return children;

  // ── Not authenticated ─────────────────────────────────────────────────────────
  const content = (() => {
    switch (screen) {
      case 'forgot-email':
        return h(ForgotEmailScreen, {
          onSent: email => { setForgotEmail(email); setScreen('forgot-otp'); },
          onBack: ()    => setScreen('login'),
        });
      case 'forgot-otp':
        return h(ForgotOTPScreen, {
          email:      forgotEmail,
          onVerified: () => { setPendingPwSet(true); }, // session set by verifyOtp
          onBack:     () => setScreen('forgot-email'),
        });
      case 'login':
      default:
        return h(LoginScreen, { onForgot: () => setScreen('forgot-email') });
    }
  })();

  return h(LoginCard, null, content);
}

// ── Change-password button + modal (shown when logged in via magic link) ────────
export function ChangePasswordBtn({ style = {} }) {
  if (!supabase) return null;
  const [open,    setOpen]    = useState(false);
  const [pass,    setPass]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  const reset = () => { setPass(''); setConfirm(''); setError(''); setSuccess(false); };
  const close = () => { setOpen(false); reset(); };

  const submit = async e => {
    e.preventDefault();
    if (pass.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    if (pass !== confirm)  { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.updateUser({ password: pass });
    setLoading(false);
    if (err) setError(friendlyAuthError(err));
    else     setSuccess(true);
  };

  return h(React.Fragment, null,
    btn({
      onClick: () => { reset(); setOpen(true); },
      style: {
        background: 'none', border: `1px solid ${BDR}`, color: TEXT3,
        borderRadius: R, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
        ...style,
      },
    }, 'Change password'),

    open && div({
      style: {
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.65)', padding: 20,
      },
      onClick: e => { if (e.target === e.currentTarget) close(); },
    },
      div({
        style: {
          width: '100%', maxWidth: 340, background: SURF,
          border: `1px solid ${BDR}`, borderRadius: 12,
          padding: '24px 22px', boxShadow: '0 24px 64px rgba(0,0,0,.6)',
        }
      },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 } },
          div({ style: { fontSize: 13, fontWeight: 700, color: TEXT } }, 'Change Password'),
          btn({ onClick: close, style: { background: 'none', border: 'none', color: TEXT3, fontSize: 18, cursor: 'pointer', lineHeight: 1 } }, '×')
        ),
        success
          ? div({ style: { display: 'flex', flexDirection: 'column', gap: 14 } },
              h(OkBox, { msg: '✓ Password updated. Sign in with your new password next time.' }),
              btn({
                onClick: close,
                style: { padding: '9px 0', background: BDR, color: TEXT, border: 'none', borderRadius: R, fontSize: 13, cursor: 'pointer' }
              }, 'Done')
            )
          : h('form', { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: 12 } },
              h(TextInput, { label: 'New Password', type: 'password', value: pass, onChange: setPass,
                placeholder: 'Min. 6 characters', autoFocus: true, autoComplete: 'new-password' }),
              h(TextInput, { label: 'Confirm Password', type: 'password', value: confirm, onChange: setConfirm,
                placeholder: 'Re-enter password', autoComplete: 'new-password' }),
              h(ErrBox, { msg: error }),
              h(PrimaryBtn, { loading, disabled: !pass || !confirm }, 'Set Password')
            )
      )
    )
  );
}

// ── Sign-out button — drop anywhere in nav ──────────────────────────────────────
export function SignOutBtn({ style = {} }) {
  if (!supabase) return null;
  const signOut = async () => {
    await supabase.auth.signOut();
    try { localStorage.removeItem('mf_perf_reviews_v1'); } catch {}
  };
  return btn({
    onClick: signOut,
    style: {
      background: 'none', border: `1px solid ${BDR}`, color: TEXT3,
      borderRadius: R, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
      ...style,
    }
  }, 'Sign out');
}
