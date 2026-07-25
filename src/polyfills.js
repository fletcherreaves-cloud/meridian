// @ts-nocheck
// Runtime polyfills for older Safari / iOS. Imported FIRST in the entry point
// so these exist before any module (esp. pdfjs) runs. pdfjs-dist v6 calls
// Promise.withResolvers (Safari 17.4+); older iPhones throw "undefined is not a
// function" mid-parse without these.

// Promise.withResolvers() — Safari 17.4+
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

// Array.prototype.at / String.prototype.at — Safari 15.4+
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    value: function at(n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return (n < 0 || n >= this.length) ? undefined : this[n]; },
    writable: true, configurable: true,
  });
}
if (!String.prototype.at) {
  Object.defineProperty(String.prototype, 'at', {
    value: function at(n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return (n < 0 || n >= this.length) ? undefined : this[n]; },
    writable: true, configurable: true,
  });
}

// Object.hasOwn — Safari 15.4+
if (!Object.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    value: function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); },
    writable: true, configurable: true,
  });
}

// Array.prototype.findLast / findLastIndex — Safari 15.4+
if (!Array.prototype.findLast) {
  Object.defineProperty(Array.prototype, 'findLast', {
    value: function findLast(fn, thisArg) { for (let i = this.length - 1; i >= 0; i--) { if (fn.call(thisArg, this[i], i, this)) return this[i]; } return undefined; },
    writable: true, configurable: true,
  });
}

// structuredClone — Safari 15.4+ (shallow-safe JSON fallback; pdfjs uses it for
// simple transferable payloads)
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = function structuredClone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); };
}
