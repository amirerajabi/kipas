// Preload (sandboxed): exposes `window.kipas`, the only bridge between the UI and Electron. Every value is coerced to the
// type main expects; main validates again.
import { contextBridge, ipcRenderer } from 'electron';
import type { QuickAction, QuickAnswer, QuickRequest, SystemEvent, TextFileFilter, UpdateStatus } from '../../../shared/protocol';
import { ARG, CH } from '../shared/channels';

function arg(prefix: string): string {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : '';
}

const titleBar = arg(ARG.titleBar);

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: unknown, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('kipas', {
  os: process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux',
  titleBar: titleBar === 'overlay' || titleBar === 'inset' ? titleBar : null,
  appVersion: ipcRenderer.sendSync(CH.appVersion) as string,
  setTheme: (theme: 'light' | 'dark', colors: { bg: string; fg: string }) => ipcRenderer.send(CH.setTheme, theme, { bg: String(colors.bg), fg: String(colors.fg) }),
  chooseVaultToOpen: (): Promise<string | null> => ipcRenderer.invoke(CH.chooseVaultToOpen),
  chooseVaultToCreate: (name: string): Promise<string | null> => ipcRenderer.invoke(CH.chooseVaultToCreate, String(name)),
  readVault: (path: string): Promise<string> => ipcRenderer.invoke(CH.readVault, String(path)),
  writeVault: (path: string, text: string) => ipcRenderer.invoke(CH.writeVault, String(path), String(text)),
  statVault: (path: string) => ipcRenderer.invoke(CH.statVault, String(path)),
  saveTextFile: (name: string, text: string, filters: TextFileFilter[]): Promise<string | null> => ipcRenderer.invoke(CH.saveTextFile, String(name), String(text), filters),
  openTextFile: (filters: TextFileFilter[]) => ipcRenderer.invoke(CH.openTextFile, filters),
  openBinaryFile: (filters: TextFileFilter[]) => ipcRenderer.invoke(CH.openBinaryFile, filters),
  copySecret: (text: string, clearAfterMs: number) => ipcRenderer.send(CH.copySecret, String(text), Number(clearAfterMs)),
  clearClipboard: () => ipcRenderer.send(CH.clearClipboard),
  openExternal: (url: string) => ipcRenderer.send(CH.openExternal, String(url)),
  revealFile: (path: string) => ipcRenderer.send(CH.revealFile, String(path)),
  onSystemEvent: (cb: (e: SystemEvent) => void) => subscribe<SystemEvent>(CH.systemEvent, cb),
  getUpdateStatus: () => ipcRenderer.invoke(CH.updateGet),
  checkForUpdates: () => ipcRenderer.invoke(CH.updateCheck),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke(CH.updateInstall),
  setAutoUpdate: (on: boolean) => ipcRenderer.send(CH.setAutoUpdate, !!on),
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => subscribe<UpdateStatus>(CH.updateStatus, cb),
  isQuickWindow: process.argv.includes(ARG.quick),
  setQuickAccess: (on: boolean) => ipcRenderer.send(CH.setQuickAccess, !!on),
  quickSearch: (query: string): Promise<QuickAnswer> => ipcRenderer.invoke(CH.quickSearch, String(query)),
  quickAct: (entryId: string, action: QuickAction): Promise<boolean> => ipcRenderer.invoke(CH.quickAct, String(entryId), String(action)),
  quickHide: () => ipcRenderer.send(CH.quickHide),
  quickShowMain: () => ipcRenderer.send(CH.quickShowMain),
  onQuickShown: (cb: () => void) => subscribe<void>(CH.quickShown, () => cb()),
  // Main window only: answer the quick window's questions (the reply goes back through main).
  onQuickRequest: (handler: (req: QuickRequest) => unknown) => {
    const listener = (_e: unknown, id: number, req: QuickRequest) => {
      void Promise.resolve()
        .then(() => handler(req))
        .catch(() => null)
        .then((answer) => ipcRenderer.send(CH.quickReply, id, answer));
    };
    ipcRenderer.on(CH.quickRequest, listener);
    return () => ipcRenderer.removeListener(CH.quickRequest, listener);
  },
  onCommand: (cb: (command: string) => void) => subscribe<string>(CH.command, cb),
});
