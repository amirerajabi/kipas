// Kipas desktop: opens the window and owns the native bits the vault needs: file dialogs and atomic vault writes, a
// clipboard that forgets secrets, OS events (screen lock, sleep, minimize) that lock the vault, and the quick-access
// window (quick.ts).
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, powerMonitor, shell } from 'electron';
import { promises as fs, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { SystemEvent, TextFileFilter } from '../../../shared/protocol';
import { CH } from '../shared/channels';
import { checkVaultPath, readVault, statVault, VAULT_EXT, writeVault } from './files';
import { QuickAccess } from './quick';
import { Updater } from './updater';
import { createMainWindow, DARK, LIGHT, titleBarKind } from './window';

const devUrl = process.env.KIPAS_DEV_URL;
// Separate profile (tests, portable use): recent vaults, settings and window state all live under it.
if (process.env.KIPAS_USER_DATA) app.setPath('userData', process.env.KIPAS_USER_DATA);
let win: BrowserWindow | null = null;
/** The last secret we put on the clipboard, so we only ever wipe our own. */
let lastSecret: string | null = null;
let clearTimer: NodeJS.Timeout | undefined;
let updater: Updater | null = null;
let quick: QuickAccess | null = null;

const MAX_TEXT_FILE = 32 * 1024 * 1024;
const VAULT_FILTERS = [{ name: 'Kipas vault', extensions: [VAULT_EXT] }];

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  void app.whenReady().then(start);
}

async function start(): Promise<void> {
  app.setAppUserModelId('com.kipas.app');
  // A smoke test stays offline unless it points the updater at a test feed.
  updater = await Updater.create((m) => console.log(m), !!process.env.KIPAS_SMOKE_SHOT && !process.env.KIPAS_UPDATE_FEED);
  quick = new QuickAccess(path.join(__dirname, 'preload.js'), devUrl, () => win, showWindow, (m) => console.log(m));
  quick.install();
  installIpc();
  installMenu();
  openWindow();
  const forward = (e: SystemEvent) => () => win?.webContents.send(CH.systemEvent, e);
  powerMonitor.on('lock-screen', forward('lock-screen'));
  powerMonitor.on('suspend', forward('suspend'));
}

function openWindow(): void {
  win = createMainWindow(path.join(__dirname, 'preload.js'), devUrl);
  win.on('minimize', () => win?.webContents.send(CH.systemEvent, 'minimize' satisfies SystemEvent));
  win.webContents.once('did-finish-load', () => {
    const shot = process.env.KIPAS_SMOKE_SHOT;
    if (shot) smokeShot(shot);
  });
  win.on('closed', () => {
    win = null;
    // The quick window is only hidden between uses; without this it would keep the app running after the main window closes.
    quick?.destroy();
  });
}

function showWindow(): void {
  if (!win) openWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendCommand(command: string): void {
  showWindow();
  win?.webContents.send(CH.command, command);
}

function installMenu(): void {
  if (process.platform !== 'darwin') {
    // The in-app menu button replaces the menu bar on Windows and Linux.
    Menu.setApplicationMenu(null);
    return;
  }
  const cmd = (label: string, command: string, accelerator?: string): Electron.MenuItemConstructorOptions => ({ label, accelerator, click: () => sendCommand(command) });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: 'Vault',
        submenu: [cmd('Create new vault…', 'vault.create'), cmd('Open vault file…', 'vault.open', 'CmdOrCtrl+O'), { type: 'separator' }, cmd('Lock vault', 'vault.lock', 'CmdOrCtrl+L')],
      },
      { role: 'editMenu' },
      { label: 'Items', submenu: [cmd('New login…', 'entry.new', 'CmdOrCtrl+N'), cmd('Password generator', 'tools.generator', 'CmdOrCtrl+G')] },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );
}

function owner(e: Electron.IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(e.sender) ?? undefined;
}

function filters(raw: unknown): Electron.FileFilter[] {
  if (!Array.isArray(raw)) return [];
  return (raw as TextFileFilter[])
    .filter((f) => typeof f?.name === 'string' && Array.isArray(f.extensions))
    .map((f) => ({ name: f.name.slice(0, 40), extensions: f.extensions.map(String).filter((x) => /^[a-z0-9]{1,8}$/i.test(x)) }));
}

function wipeClipboard(): void {
  clearTimeout(clearTimer);
  if (lastSecret !== null && clipboard.readText() === lastSecret) clipboard.clear();
  lastSecret = null;
}

function installIpc(): void {
  ipcMain.on(CH.setTheme, (_e, theme: unknown, colors: { bg?: unknown; fg?: unknown }) => {
    nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light';
    if (titleBarKind() !== 'overlay' || !win) return;
    const fallback = theme === 'dark' ? DARK : LIGHT;
    const color = /^#[0-9a-f]{3,8}$/i.test(String(colors?.bg)) ? String(colors.bg) : fallback.bg;
    const symbolColor = /^#[0-9a-f]{3,8}$/i.test(String(colors?.fg)) ? String(colors.fg) : fallback.fg;
    win.setTitleBarOverlay({ color, symbolColor });
    win.setBackgroundColor(color);
  });

  ipcMain.handle(CH.chooseVaultToOpen, async (e) => {
    const opts: Electron.OpenDialogOptions = { title: 'Open a Kipas vault', properties: ['openFile'], filters: VAULT_FILTERS };
    const w = owner(e);
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });
  ipcMain.handle(CH.chooseVaultToCreate, async (e, name: unknown) => {
    const safe = String(name ?? 'Vault').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'Vault';
    const dir = path.join(app.getPath('documents'), 'Kipas');
    await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
    const opts: Electron.SaveDialogOptions = { title: 'Save the new vault', defaultPath: path.join(dir, `${safe}.${VAULT_EXT}`), filters: VAULT_FILTERS };
    const w = owner(e);
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    return path.extname(r.filePath).toLowerCase() === `.${VAULT_EXT}` ? r.filePath : `${r.filePath}.${VAULT_EXT}`;
  });
  ipcMain.handle(CH.readVault, (_e, p: unknown) => readVault(checkVaultPath(p)));
  ipcMain.handle(CH.writeVault, (_e, p: unknown, text: unknown) => writeVault(checkVaultPath(p), String(text)));
  ipcMain.handle(CH.statVault, (_e, p: unknown) => statVault(checkVaultPath(p)));

  ipcMain.handle(CH.saveTextFile, async (e, name: unknown, text: unknown, f: unknown) => {
    const opts: Electron.SaveDialogOptions = { defaultPath: path.join(app.getPath('documents'), path.basename(String(name ?? 'export.txt'))), filters: filters(f) };
    const w = owner(e);
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    await fs.writeFile(r.filePath, String(text), { encoding: 'utf8', mode: 0o600 });
    return r.filePath;
  });
  ipcMain.handle(CH.openTextFile, async (e, f: unknown) => {
    const opts: Electron.OpenDialogOptions = { properties: ['openFile'], filters: filters(f) };
    const w = owner(e);
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    const file = r.canceled ? undefined : r.filePaths[0];
    if (!file) return null;
    if ((await fs.stat(file)).size > MAX_TEXT_FILE) throw new Error('The file is too large.');
    return { name: path.basename(file), text: await fs.readFile(file, 'utf8') };
  });
  // KeePass databases and key files. No filters means any file (key files can be anything).
  ipcMain.handle(CH.openBinaryFile, async (e, f: unknown) => {
    const opts: Electron.OpenDialogOptions = { properties: ['openFile'], filters: filters(f) };
    const w = owner(e);
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
    const file = r.canceled ? undefined : r.filePaths[0];
    if (!file) return null;
    if ((await fs.stat(file)).size > MAX_TEXT_FILE) throw new Error('The file is too large.');
    return { name: path.basename(file), bytes: new Uint8Array(await fs.readFile(file)) };
  });

  ipcMain.on(CH.copySecret, (_e, text: unknown, clearAfterMs: unknown) => {
    const value = String(text ?? '');
    clipboard.writeText(value);
    lastSecret = value;
    clearTimeout(clearTimer);
    const ms = Number(clearAfterMs);
    if (Number.isFinite(ms) && ms > 0) clearTimer = setTimeout(wipeClipboard, Math.min(ms, 3_600_000));
  });
  ipcMain.on(CH.clearClipboard, wipeClipboard);
  ipcMain.on(CH.openExternal, (_e, url: unknown) => {
    try {
      const u = new URL(String(url));
      if (u.protocol === 'https:' || u.protocol === 'http:') void shell.openExternal(u.href);
    } catch {
      /* not a URL */
    }
  });
  ipcMain.on(CH.revealFile, (_e, p: unknown) => {
    try {
      shell.showItemInFolder(checkVaultPath(p));
    } catch {
      /* not a vault path */
    }
  });
  ipcMain.on(CH.appVersion, (e) => {
    e.returnValue = app.getVersion();
  });
  ipcMain.handle(CH.updateGet, () => updater?.current ?? null);
  ipcMain.handle(CH.updateCheck, () => updater?.check() ?? null);
  // The renderer saves the vault before asking for this, so nothing pending is lost in the restart.
  ipcMain.handle(CH.updateInstall, () => {
    if (!updater) return false;
    wipeClipboard();
    return updater.quitAndInstall();
  });
  ipcMain.on(CH.setAutoUpdate, (_e, on: unknown) => updater?.configure(on !== false));
  ipcMain.on(CH.setQuickAccess, (e, on: unknown) => e.sender === win?.webContents && quick?.configure(on === true));
}

/** Smoke test (KIPAS_SMOKE_SHOT=<file.png>): let the UI paint, capture the window, quit. KIPAS_SMOKE_QUICK=1 captures the quick window. */
function smokeShot(file: string): void {
  if (process.env.KIPAS_SMOKE_QUICK) setTimeout(() => quick?.show(), 1000);
  setTimeout(async () => {
    try {
      const target = process.env.KIPAS_SMOKE_QUICK ? quick?.window : win;
      const image = await target!.webContents.capturePage();
      writeFileSync(file, image.toPNG());
      console.log(`smoke: wrote ${file}`);
    } catch (e) {
      console.error('smoke: capture failed', e);
      process.exitCode = 1;
    }
    app.quit();
  }, Number(process.env.KIPAS_SMOKE_DELAY_MS) || 2500);
}

// A secret must not outlive the app on the clipboard.
app.on('will-quit', () => {
  wipeClipboard();
  quick?.destroy();
});
app.on('window-all-closed', () => app.quit());
app.on('activate', showWindow);
