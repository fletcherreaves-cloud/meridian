// @ts-nocheck
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import './meridian.css';
import { ErrorBoundary } from './features/session.js';
import App from './app/App.js';
import { AuthGate } from './components/AuthGate.js';

window._cdnError = function(name) {
  var msg = '<div style="padding:30px;font-family:monospace;background:#090e18;color:#e2e8f0;min-height:100vh">'
    +'<div style="color:#f59e0b;font-size:18px;font-weight:700;margin-bottom:14px">&#9888; Meridian &#8212; Script Load Error</div>'
    +'<div style="color:#f87171;font-size:13px;margin-bottom:16px">Failed to load: <b>'+name+'</b></div>'
    +'<div style="color:#94a3b8;font-size:12px;line-height:1.8;margin-bottom:20px">'
    +'<b>This app requires an internet connection to load its libraries.</b><br><br>'
    +'<b>On iPhone/iPad:</b><br>'
    +'&#9312; Open the file in Safari (not Files preview)<br>'
    +'&#9313; Make sure you have an active internet connection<br>'
    +'&#9314; Share file &#8594; Open in Safari<br><br>'
    +'<b>On Mac/Windows:</b> Open the file in Chrome or Firefox with internet access.<br>'
    +'</div></div>';
  // Safe: use a deferred approach so body exists
  window._cdnErrorMsg = msg;
  window._cdnFailed = true;
};

// Register service worker for PWA installability and Web Share Target
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/';
    navigator.serviceWorker.register(base + 'sw.js', { scope: base })
      .catch(err => console.warn('[Meridian] SW registration failed:', err));
  });
}

try {
  createRoot(document.getElementById('root')).render(
    React.createElement(ErrorBoundary, null,
      React.createElement(AuthGate, null,
        React.createElement(App)
      )
    )
  );
} catch(e) {
  document.getElementById('root').innerHTML =
    `<div style="padding:40px;font-family:monospace;background:#090e18;color:#e2e8f0;min-height:100vh">
      <div style="color:#f59e0b;font-size:20px;font-weight:700;margin-bottom:16px">⚠ McForecast — Startup Error</div>
      <div style="color:#f87171;font-size:13px;margin-bottom:12px">${e.message}</div>
      <pre style="color:#64748b;font-size:11px">${e.stack||''}</pre>
      <button onclick="localStorage.clear();location.reload()" style="margin-top:20px;padding:8px 16px;background:#f59e0b;border:none;border-radius:6px;cursor:pointer;font-weight:600">Clear settings & reload</button>
    </div>`;
}
