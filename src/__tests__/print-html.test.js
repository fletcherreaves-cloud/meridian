// @vitest-environment happy-dom
// @ts-nocheck
// print-html.js's printHtml() replaces the app-wide window.open('','_blank') + document.write
// print/export pattern, which trapped iOS users in a dead window with no way back (reported
// 2026-09-03 -- see the file's own header comment for the full root cause). Covers the in-page
// overlay it renders instead: close button removes it, Escape removes it, Print/Close buttons
// exist, and it never calls window.open.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printHtml } from '../utils/print-html.js';

describe('printHtml', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('never calls window.open (the root cause of the iOS stuck-window bug)', () => {
    const spy = vi.spyOn(window, 'open');
    printHtml('<html><body>x</body></html>', { autoPrint: false });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('renders an in-page overlay with an iframe hosting the given HTML, plus Print/Close buttons', () => {
    printHtml('<html><body>hello</body></html>', { autoPrint: false });
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    const labels = Array.from(document.querySelectorAll('button')).map(b => b.textContent);
    expect(labels).toEqual(expect.arrayContaining([expect.stringContaining('Print'), expect.stringContaining('Close')]));
  });

  it('the Close button removes the overlay from the document', () => {
    printHtml('<html><body>x</body></html>', { autoPrint: false });
    expect(document.querySelector('iframe')).toBeTruthy();
    const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Close'));
    closeBtn.click();
    expect(document.querySelector('iframe')).toBeFalsy();
  });

  it('the returned close() also removes the overlay', () => {
    const { close } = printHtml('<html><body>x</body></html>', { autoPrint: false });
    expect(document.querySelector('iframe')).toBeTruthy();
    close();
    expect(document.querySelector('iframe')).toBeFalsy();
  });

  it('Escape removes the overlay', () => {
    printHtml('<html><body>x</body></html>', { autoPrint: false });
    expect(document.querySelector('iframe')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('iframe')).toBeFalsy();
  });

  it('autoPrint:false does not invoke print on its own', () => {
    printHtml('<html><body>x</body></html>', { autoPrint: false });
    const iframe = document.querySelector('iframe');
    const printSpy = iframe.contentWindow.print = vi.fn();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('the returned print() invokes print on the iframe window, not the host window', () => {
    const hostPrintSpy = window.print = vi.fn();
    const { print } = printHtml('<html><body>x</body></html>', { autoPrint: false });
    const iframe = document.querySelector('iframe');
    const framePrintSpy = iframe.contentWindow.print = vi.fn();
    print();
    expect(framePrintSpy).toHaveBeenCalledTimes(1);
    expect(hostPrintSpy).not.toHaveBeenCalled();
  });
});
