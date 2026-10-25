// Auto-type end to end on Windows: opens scripts/test-autotype.ps1's window and types "{USERNAME}{TAB}{PASSWORD}" into
// it with the app's real helper (desktop/src/main/autotype.ts). The helper is told to type only into that window's
// process, so if Windows does not let it come to the front, nothing is typed anywhere and the test says so.
//   npx --prefix ui tsx scripts/test-autotype.mts
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAutoType } from '../desktop/src/main/autotype.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const username = 'test-user@example.com';
// Unicode and SendKeys-special characters: typed as characters, whatever the keyboard layout.
const password = 'Pä55-{w0rd}+^%~(π)';

const form = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'test-autotype.ps1'), '9000'], { stdio: ['ignore', 'pipe', 'inherit'] });
let out = '';
const ready = new Promise<number>((resolve) =>
  form.stdout.on('data', (d: Buffer) => {
    out += d.toString();
    const m = /READY (\d+)/.exec(out);
    if (m) resolve(Number(m[1]));
  }),
);
const pid = await ready;
const cacheDir = mkdtempSync(path.join(tmpdir(), 'kipas-autotype-'));
const started = Date.now();
const result = await runAutoType(
  [
    { t: 'text', v: username },
    { t: 'key', v: 'tab' },
    { t: 'text', v: password },
  ],
  { cacheDir, selfPid: process.pid, targetPid: pid },
);
console.log(`helper: ${result} in ${Date.now() - started} ms`);
await new Promise((r) => form.on('close', r));
rmSync(cacheDir, { recursive: true, force: true });
const typed = JSON.parse(/RESULT (.*)/.exec(out)?.[1] ?? '{}') as { user?: string; pass?: string };
if (result === 'no-target') {
  console.log('SKIPPED: Windows did not bring the test window to the front, so nothing was typed.');
} else if (typed.user === username && typed.pass === password) {
  console.log('PASS: user name, Tab, password typed exactly.');
} else {
  console.log('FAIL:', JSON.stringify(typed));
  process.exitCode = 1;
}
