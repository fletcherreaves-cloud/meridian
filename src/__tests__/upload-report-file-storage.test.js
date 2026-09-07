// @ts-nocheck
// backlog-open-2026-09-06.md §14 "pending_reports stores report base64 blobs directly in a
// Supabase column instead of Storage" -- uploadReportFile() (src/lib/supabase.js) was
// base64-encoding the whole file into pending_reports.file_data despite its own comment saying
// it uploads to the 'reports' Storage bucket (which already existed for exactly this, unused).
// A 12.37 MB base64 blob was observed exceeding the read side's statement timeout on every
// fetch. Fixed to actually use supabase.storage.from('reports').upload(), with file_data
// cleared on upsert. This drives the real exported function against a mock Supabase client
// (same pattern as dispatch-218-fetchall-retry.test.js), not a reimplementation of its logic.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = { uploads: [], upserts: [] };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from(bucket) {
        return {
          upload(path, file, opts) {
            calls.uploads.push({ bucket, path, file, opts });
            return Promise.resolve(calls.uploadError ? { error: calls.uploadError } : { data: { path }, error: null });
          },
        };
      },
    },
    from(table) {
      return {
        upsert(row, opts) {
          calls.upserts.push({ table, row, opts });
          return {
            select() {
              return {
                single: () => Promise.resolve(
                  calls.upsertError ? { data: null, error: calls.upsertError } : { data: { id: 'row-1' }, error: null }
                ),
              };
            },
          };
        },
      };
    },
  }),
}));

let uploadReportFile;
beforeEach(async () => {
  vi.resetModules();
  calls.uploads = []; calls.upserts = []; calls.uploadError = null; calls.upsertError = null;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ uploadReportFile } = await import('../lib/supabase.js'));
});

function fakeFile(name, type, content = 'hello') {
  const f = new File([content], name, { type });
  return f;
}

describe('uploadReportFile', () => {
  it('uploads the real file to the "reports" Storage bucket, not a base64 column', async () => {
    const file = fakeFile('labor.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const result = await uploadReportFile(file, 'labor');

    expect(result).toEqual({ id: 'row-1' });
    expect(calls.uploads).toHaveLength(1);
    expect(calls.uploads[0].bucket).toBe('reports');
    expect(calls.uploads[0].path).toMatch(/^manual\/\d{4}-\d{2}-\d{2}\/labor\.xlsx$/);
    expect(calls.uploads[0].file).toBe(file);
  });

  it('writes storage_path to pending_reports and never sets a base64 file_data payload', async () => {
    const file = fakeFile('cash.xlsx', 'application/vnd.ms-excel');
    await uploadReportFile(file, 'cash-sheet');

    expect(calls.upserts).toHaveLength(1);
    const row = calls.upserts[0].row;
    expect(row.source).toBe('manual');
    expect(row.storage_path).toMatch(/^manual\/\d{4}-\d{2}-\d{2}\/cash\.xlsx$/);
    expect(row.file_data).toBeNull();
  });

  it('returns null and does not touch pending_reports when the Storage upload fails', async () => {
    calls.uploadError = { message: 'bucket rejected mime type' };
    const file = fakeFile('weird.exe', 'application/octet-stream');
    const result = await uploadReportFile(file, 'unknown');

    expect(result).toBeNull();
    expect(calls.upserts).toHaveLength(0);
  });
});
