import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startupSettings } from '../../desktop/src/main/startup';

function fixture(os = 'win32', packaged = true) {
  let items: { name: string; scope: string; enabled: boolean }[] = [];
  const reads: unknown[] = [];
  const writes: unknown[] = [];
  let apply = true;
  const startup = startupSettings({
    isPackaged: packaged,
    getLoginItemSettings(options) {
      reads.push(options);
      return { launchItems: items };
    },
    setLoginItemSettings(settings) {
      writes.push(settings);
      if (apply) items = settings.openAtLogin ? [{ name: settings.name, scope: 'user', enabled: settings.enabled }] : [];
    },
  }, os, 'C:\\Program Files\\Kipas\\Kipas.exe');
  return { startup, reads, writes, items: (value: typeof items) => { items = value; }, failWrite: () => { apply = false; } };
}

test('startup is opt-in: reading an absent entry never writes one', () => {
  const f = fixture();
  assert.deepEqual(f.startup.get(), { available: true, enabled: false });
  assert.equal(f.writes.length, 0);
});

test('startup uses the quoted packaged executable with no arguments and can be removed', () => {
  const f = fixture();
  assert.equal(f.startup.set(true).enabled, true);
  assert.deepEqual(f.writes[0], {
    name: 'com.kipas.app', path: '"C:\\Program Files\\Kipas\\Kipas.exe"', args: [], openAtLogin: true, enabled: true,
  });
  assert.deepEqual(f.reads[0], { path: '"C:\\Program Files\\Kipas\\Kipas.exe"', args: [] });
  assert.equal(f.startup.set(false).enabled, false);
  assert.deepEqual(f.writes[1], { ...(f.writes[0] as object), openAtLogin: false, enabled: false });
});

test('startup reflects a Task Manager disable and an external re-enable', () => {
  const f = fixture();
  f.items([{ name: 'com.kipas.app', scope: 'user', enabled: false }]);
  assert.equal(f.startup.get().enabled, false);
  f.items([{ name: 'com.kipas.app', scope: 'user', enabled: true }]);
  assert.equal(f.startup.get().enabled, true);
  assert.equal(f.writes.length, 0);
});

test('startup ignores other registry entries and machine-wide settings', () => {
  const f = fixture();
  f.items([{ name: 'other-app', scope: 'user', enabled: true }, { name: 'com.kipas.app', scope: 'machine', enabled: true }]);
  assert.equal(f.startup.get().enabled, false);
});

test('unsupported systems and development builds never read or change login items', () => {
  for (const f of [fixture('darwin'), fixture('linux'), fixture('win32', false)]) {
    assert.equal(f.startup.get().available, false);
    assert.equal(f.startup.set(true).available, false);
    assert.equal(f.reads.length, 0);
    assert.equal(f.writes.length, 0);
  }
});

test('startup rejects malformed IPC values without touching Windows', () => {
  const f = fixture();
  for (const value of ['true', 1, null, undefined, {}]) assert.throws(() => f.startup.set(value), /boolean/);
  assert.equal(f.reads.length, 0);
  assert.equal(f.writes.length, 0);
});

test('startup reports when Windows did not apply a requested change', () => {
  const f = fixture();
  f.failWrite();
  assert.throws(() => f.startup.set(true), /Windows did not apply/);
});
