import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── buildBrief's finding vocabulary ─────────────────────────────────────────
// `buildBrief` (src/engine/pipeline.js) tags each finding with `t`. It emits 'crit',
// 'watch', 'ok' and 'fc' — it has NEVER emitted 'warn'. Three consumers filtered for
// 'warn' alone anyway, so until v4.858:
//   · analytics.js  — the "🟡 Watch" tab was permanently empty, header always "0 on watch"
//   · store-dash.js — the Watch filter matched no stores
//   · store-dash.js — the "Watch Flags" KPI tile always displayed 0
// One site (store-dash.js:1714) already accepted both, which is how the bug survived:
// someone hit it, fixed the line in front of them, and the other three kept lying.
//
// These tests pin the vocabulary at the producer and require every consumer to accept
// 'watch' wherever it accepts 'warn'.

const SRC = new URL('../', import.meta.url).pathname;

const walk = (dir) => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n === '__tests__' ? [] : walk(p);
  return p.endsWith('.js') ? [p] : [];
});

describe('findings vocabulary', () => {
  it('pipeline.js emits exactly the documented severity tags', () => {
    const src = readFileSync(join(SRC, 'engine/pipeline.js'), 'utf8');
    const tags = new Set([...src.matchAll(/\bt:\s*'(crit|watch|warn|ok|fc)'/g)].map(m => m[1]));
    expect([...tags].sort()).toEqual(['crit', 'fc', 'ok', 'watch']);
    // The point of the test: adding 'warn' here means the consumers below need revisiting.
    expect(tags.has('warn'), "pipeline.js now emits 'warn' — revisit every consumer").toBe(false);
  });

  it('no consumer filters on t===\'warn\' without also accepting \'watch\'', () => {
    const bad = [];
    for (const file of walk(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // Only lines testing a *finding's* `t` against 'warn'. `.t` is a generic field
        // name in this codebase — graded-visits.js:589 uses msg.t with its own unrelated
        // vocabulary — so require the line to be reading from `findings` as well.
        if (!/\.t\s*===\s*'warn'/.test(line)) return;
        if (!/findings/.test(line)) return;                  // not a buildBrief finding
        if (/'watch'/.test(line)) return;                    // accepts both — fine
        bad.push(`${file.replace(SRC, 'src/')}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }
    expect(bad, `these will always match zero findings:\n${bad.join('\n')}`).toEqual([]);
  });
});
