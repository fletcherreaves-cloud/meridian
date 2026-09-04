// @ts-nocheck
// Shared "print/export a standalone HTML document" helper.
//
// Every print/export flow in the app used to build an HTML string and call
// window.open('', '_blank') + document.write to show it, then (usually)
// setTimeout(() => w.print(), ...). On iOS -- especially inside the
// home-screen PWA, which has no browser chrome at all -- window.open('', ...)
// does not reliably open a real second tab: sometimes it silently no-ops,
// sometimes it navigates the CURRENT webview to the blank document instead
// of opening a new one. Either way there is no back button, so the only way
// out is to force-quit and relaunch the app (reported 2026-09-03).
//
// Fix: never call window.open at all. Render the report inside a same-page
// full-screen overlay (an iframe hosted in THIS document), so the app never
// navigates anywhere -- there is always a real, in-page "Close" button to
// get back, on every platform. print() is invoked on the iframe's own
// window, which triggers the native print/PDF sheet exactly like before;
// dismissing that sheet returns to the overlay, not to a dead tab.
export function printHtml(html, opts = {}) {
  const autoPrint = opts.autoPrint !== false;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;display:flex;flex-direction:column';
  const bar = document.createElement('div');
  bar.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:8px 12px;background:#1c1c1e';
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'flex:1 1 auto;border:0;width:100%;background:#fff';

  const doPrint = () => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch { /* ignore */ } };
  const close = () => { document.removeEventListener('keydown', onKey); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const mkBtn = (label, onClick, bg) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = onClick;
    b.style.cssText = `font:600 13px -apple-system,Segoe UI,Roboto,sans-serif;padding:7px 16px;border-radius:6px;border:none;cursor:pointer;color:#fff;background:${bg}`;
    return b;
  };
  bar.appendChild(mkBtn('🖨 Print', doPrint, '#0f172a'));
  bar.appendChild(mkBtn('✕ Close', close, '#4b5563'));
  overlay.appendChild(bar);
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  if (autoPrint) setTimeout(doPrint, 300);

  return { close, print: doPrint };
}
