// Launchers:
//   browser      Vite on http://localhost:5174. Vaults live in the browser's localStorage (development only).
//   desktop-dev  Vite + Electron loading it (main and preload are rebuilt first)
//   desktop      Electron on the built UI (run `npm run build` first; `npm start` does both)
// The desktop modes use a separate Electron profile in .dev-data/desktop, so a dev window never shares an installed
// Kipas's profile, recent-vault list or single-instance lock.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'browser';
const win = process.platform === 'win32';
const children = [];
const VITE_PORT = 5174;

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: 'inherit', shell: win, cwd: root, ...opts });
  children.push(child);
  child.on('exit', (code) => {
    // One part exiting ends the session.
    for (const c of children) if (c !== child && c.exitCode === null) c.kill();
    process.exitCode = code ?? 0;
  });
  return child;
}

function npm(args, opts) {
  const r = spawnSync('npm', args, { stdio: 'inherit', shell: win, cwd: root, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function waitForPort(port, timeoutMs = 60000) {
  const until = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => (s.destroy(), resolve()));
      s.once('error', () => {
        s.destroy();
        if (Date.now() > until) reject(new Error(`port ${port} did not open`));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

const devProfile = { ...process.env, KIPAS_USER_DATA: process.env.KIPAS_USER_DATA ?? join(root, '.dev-data', 'desktop') };

function electronBinary() {
  return createRequire(join(root, 'desktop', 'package.json'))('electron');
}

process.on('SIGINT', () => {
  for (const c of children) c.kill();
  process.exit(0);
});

if (mode === 'browser') {
  run('npm', ['--prefix', 'ui', 'run', 'dev', '--', '--host', '127.0.0.1']);
} else if (mode === 'desktop-dev') {
  npm(['--prefix', 'desktop', 'run', 'bundle']);
  run('npm', ['--prefix', 'ui', 'run', 'dev', '--', '--host', '127.0.0.1']);
  await waitForPort(VITE_PORT);
  run(electronBinary(), ['.'], { cwd: join(root, 'desktop'), shell: false, env: { ...devProfile, KIPAS_DEV_URL: `http://127.0.0.1:${VITE_PORT}` } });
} else if (mode === 'desktop') {
  run(electronBinary(), ['.', ...process.argv.slice(3)], { cwd: join(root, 'desktop'), shell: false, env: devProfile });
} else {
  console.error(`unknown mode "${mode}" (browser | desktop-dev | desktop)`);
  process.exit(1);
}
