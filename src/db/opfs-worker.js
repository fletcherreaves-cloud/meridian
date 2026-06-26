// @ts-nocheck
// OPFS Worker — reads the app snapshot using FileSystemSyncAccessHandle.
//
// WHY THIS IS DIFFERENT from file.text() or IDB reads:
//   Both file.text() and IDB reads send data from the browser process to the
//   renderer via Mojo IPC. Chrome tracks the IPC callback as a 'message'
//   handler. For 72MB of data, this callback blocks for 129 seconds.
//
//   FileSystemSyncAccessHandle bypasses the IPC data path entirely. It uses
//   a capability token to give this Worker direct OS-level file access in the
//   renderer process. read() fills an ArrayBuffer via a POSIX-style read()
//   syscall — no browser process involved, no Mojo message, no violation.
//
//   The Worker then TRANSFERS the ArrayBuffer to the main thread (zero-copy
//   pointer swap). The main thread 'message' handler receives only a pointer
//   — completes in < 1ms — and parses JSON in a separate macrotask.

self.onmessage = async ({ data }) => {
  if (data.cmd !== 'load') return;
  try {
    const root = await navigator.storage.getDirectory();

    let fh;
    try {
      fh = await root.getFileHandle('meridian-data.json');
    } catch(e) {
      self.postMessage({ cmd: 'load', ok: false, notFound: true });
      return;
    }

    // Primary path: FileSystemSyncAccessHandle — direct OS read, no IPC on data path
    try {
      const sh  = await fh.createSyncAccessHandle();
      const size = sh.getSize();
      const buf = new ArrayBuffer(size);
      sh.read(buf, { at: 0 });
      sh.close();
      self.postMessage({ cmd: 'load', ok: true, buf, path: 'sync' }, [buf]);
      return;
    } catch(syncErr) {
      console.warn('[opfs-worker] sync handle failed, falling back:', syncErr.name, syncErr.message);
    }

    // Fallback: async arrayBuffer() — Worker thread blocks, main thread stays free
    const file = await fh.getFile();
    const buf  = await file.arrayBuffer();
    self.postMessage({ cmd: 'load', ok: true, buf, path: 'async' }, [buf]);

  } catch(e) {
    console.error('[opfs-worker] error:', e);
    self.postMessage({ cmd: 'load', ok: false, err: String(e) });
  }
};
