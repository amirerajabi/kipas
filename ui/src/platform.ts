import type { SystemEvent, TextFileFilter, UpdateStatus, VaultFileInfo } from '../../shared/protocol';

/**
 * What the UI needs from its host. In Electron the preload script exposes `window.kipas`; in a plain browser
 * (npm run dev) the fallbacks below keep vault files in localStorage, so the whole app can be tried without Electron.
 */
export interface DesktopBridge {
  os: 'win32' | 'darwin' | 'linux';
  /** How the window draws its caption buttons over our top bar. */
  titleBar: 'overlay' | 'inset' | null;
  /** The desktop app's version ('' in a browser). */
  appVersion: string;
  setTheme(theme: 'light' | 'dark', colors: { bg: string; fg: string }): void;
  chooseVaultToOpen(): Promise<string | null>;
  chooseVaultToCreate(defaultName: string): Promise<string | null>;
  readVault(path: string): Promise<string>;
  /** Atomic write; the previous version is kept as `<file>.bak`. */
  writeVault(path: string, text: string): Promise<VaultFileInfo>;
  statVault(path: string): Promise<VaultFileInfo | null>;
  saveTextFile(defaultName: string, text: string, filters: TextFileFilter[]): Promise<string | null>;
  openTextFile(filters: TextFileFilter[]): Promise<{ name: string; text: string } | null>;
  /** No filters: any file. */
  openBinaryFile(filters: TextFileFilter[]): Promise<{ name: string; bytes: Uint8Array } | null>;
  /** Put a secret on the clipboard and wipe it after `clearAfterMs` (0 = keep), unless something else was copied since. */
  copySecret(text: string, clearAfterMs: number): void;
  /** Wipe the clipboard if it still holds the last secret we copied. */
  clearClipboard(): void;
  openExternal(url: string): void;
  revealFile(path: string): void;
  onSystemEvent(cb: (e: SystemEvent) => void): () => void;
  /** null: no updater (browser build). */
  getUpdateStatus(): Promise<UpdateStatus | null>;
  checkForUpdates(): Promise<UpdateStatus | null>;
  /** Restart into a downloaded update; false when there is none. */
  installUpdate(): Promise<boolean>;
  setAutoUpdate(on: boolean): void;
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void;
  onCommand(cb: (command: string) => void): () => void;
}

declare global {
  interface Window {
    kipas?: DesktopBridge;
  }
}

export interface Platform extends DesktopBridge {
  kind: 'electron' | 'browser';
}

const noop = () => undefined;
const FILES_KEY = 'kipas.browserFiles';
export const BROWSER_PREFIX = 'browser:';

function browserFiles(): Record<string, { text: string; modified: number }> {
  try {
    return JSON.parse(localStorage.getItem(FILES_KEY) ?? '{}') as Record<string, { text: string; modified: number }>;
  } catch {
    return {};
  }
}

function info(path: string, f: { text: string; modified: number }): VaultFileInfo {
  return { path, name: baseName(path), size: f.text.length, modified: f.modified };
}

/** "C:\\Vaults\\Home.kipas" or "browser:Home.kipas" -> "Home". */
export function baseName(path: string): string {
  return (path.split(/[\\/:]/).pop() ?? path).replace(/\.kipas$/i, '');
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function browserPlatform(): Platform {
  let lastSecret: string | null = null;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  const store = (path: string, text: string): VaultFileInfo => {
    const files = browserFiles();
    files[path] = { text, modified: Date.now() };
    localStorage.setItem(FILES_KEY, JSON.stringify(files));
    return info(path, files[path]);
  };
  return {
    kind: 'browser',
    os: /Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux',
    titleBar: null,
    appVersion: '',
    setTheme: noop,
    async chooseVaultToOpen() {
      const file = await pickFile('.kipas,application/json');
      if (!file) return null;
      const path = `${BROWSER_PREFIX}${file.name}`;
      store(path, await file.text());
      return path;
    },
    chooseVaultToCreate: async (name) => `${BROWSER_PREFIX}${name.replace(/[\\/:*?"<>|]/g, '_') || 'Vault'}.kipas`,
    async readVault(path) {
      const f = browserFiles()[path];
      if (!f) throw new Error('The vault file is gone.');
      return f.text;
    },
    writeVault: async (path, text) => store(path, text),
    async statVault(path) {
      const f = browserFiles()[path];
      return f ? info(path, f) : null;
    },
    async saveTextFile(name, text) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return name;
    },
    async openTextFile(filters) {
      const file = await pickFile(filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(','));
      return file ? { name: file.name, text: await file.text() } : null;
    },
    async openBinaryFile(filters) {
      const file = await pickFile(filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(','));
      return file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null;
    },
    copySecret(text, clearAfterMs) {
      void navigator.clipboard.writeText(text).catch(noop);
      lastSecret = text;
      clearTimeout(clearTimer);
      if (clearAfterMs > 0) clearTimer = setTimeout(() => this.clearClipboard(), clearAfterMs);
    },
    clearClipboard() {
      if (lastSecret === null) return;
      lastSecret = null;
      // A browser only lets a focused page write the clipboard; this is best effort.
      void navigator.clipboard.writeText('').catch(noop);
    },
    openExternal: (url) => void window.open(url, '_blank', 'noopener,noreferrer'),
    revealFile: noop,
    onSystemEvent: () => noop,
    getUpdateStatus: async () => null,
    checkForUpdates: async () => null,
    installUpdate: async () => false,
    setAutoUpdate: noop,
    onUpdateStatus: () => noop,
    onCommand: () => noop,
  };
}

let current: Platform | null = null;

export function getPlatform(): Platform {
  if (!current) current = window.kipas ? { ...window.kipas, kind: 'electron' } : browserPlatform();
  return current;
}
