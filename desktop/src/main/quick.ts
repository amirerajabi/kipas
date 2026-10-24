// Quick access: Ctrl+Shift+Space (Cmd+Shift+Space on macOS) opens a small search over the vault on top of any app.
//
// The quick window never holds the vault. It sends its query here; we ask the main window, which holds the key, and
// relay what it answers (titles and user names only). Copying works the same way: the quick window names an entry id
// and an action, and the main window copies the secret itself, with its usual clipboard timeout. Locked vault: the
// main window answers "locked" and the quick window offers to open Kipas.
import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import type { QuickAction, QuickAnswer, QuickRequest } from '../../../shared/protocol';
import { CH, QUICK_SHORTCUT } from '../shared/channels';
import { createQuickWindow, QUICK_SIZE } from './window';

const ACTIONS = new Set<QuickAction>(['password', 'username', 'totp', 'open']);
const ASK_TIMEOUT_MS = 3000;

export class QuickAccess {
  private win: BrowserWindow | null = null;
  private registered = false;
  private nextId = 1;
  private pending = new Map<number, (value: unknown) => void>();

  constructor(
    private readonly preloadPath: string,
    private readonly devUrl: string | undefined,
    private readonly mainWindow: () => BrowserWindow | null,
    private readonly showMain: () => void,
    private readonly log: (m: string) => void,
  ) {}

  install(): void {
    const fromQuick = (e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) => !!this.win && e.sender === this.win.webContents;
    ipcMain.handle(CH.quickSearch, (e, query: unknown) => {
      if (!fromQuick(e)) return { locked: true };
      return this.ask({ kind: 'search', query: String(query ?? '').slice(0, 200) }, { locked: true } satisfies QuickAnswer);
    });
    ipcMain.handle(CH.quickAct, async (e, entryId: unknown, action: unknown) => {
      if (!fromQuick(e) || typeof entryId !== 'string' || entryId.length > 64 || !ACTIONS.has(action as QuickAction)) return false;
      const ok = await this.ask({ kind: 'act', entryId, action: action as QuickAction }, false);
      if (ok === true) this.hide();
      return ok === true;
    });
    ipcMain.on(CH.quickHide, (e) => fromQuick(e) && this.hide());
    ipcMain.on(CH.quickShowMain, (e) => {
      if (!fromQuick(e)) return;
      this.hide();
      this.showMain();
    });
    ipcMain.on(CH.quickReply, (e, id: unknown, payload: unknown) => {
      if (e.sender !== this.mainWindow()?.webContents) return;
      const resolve = this.pending.get(Number(id));
      this.pending.delete(Number(id));
      resolve?.(payload);
    });
  }

  /** From the "Quick access" setting. */
  configure(enabled: boolean): void {
    if (enabled === this.registered) return;
    if (enabled) {
      this.registered = globalShortcut.register(QUICK_SHORTCUT, () => this.toggle());
      if (!this.registered) this.log(`quick access: ${QUICK_SHORTCUT} is taken by another app`);
    } else {
      globalShortcut.unregister(QUICK_SHORTCUT);
      this.registered = false;
      this.hide();
    }
  }

  toggle(): void {
    if (this.win?.isVisible()) this.hide();
    else this.show();
  }

  show(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.win = createQuickWindow(this.preloadPath, this.devUrl);
      // A smoke run captures it while another app has the focus, so it must stay up there.
      if (!process.env.KIPAS_SMOKE_QUICK) this.win.on('blur', () => this.hide());
      this.win.on('closed', () => {
        this.win = null;
      });
    }
    const w = this.win;
    // On the screen the mouse is on, centred, a little above the middle (where Spotlight and Raycast open).
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    w.setBounds({ x: Math.round(area.x + (area.width - QUICK_SIZE.width) / 2), y: Math.round(area.y + area.height * 0.18), ...QUICK_SIZE });
    const reveal = () => {
      w.show();
      w.focus();
      w.webContents.send(CH.quickShown);
    };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', reveal);
    else reveal();
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide();
  }

  get window(): BrowserWindow | null {
    return this.win;
  }

  destroy(): void {
    globalShortcut.unregister(QUICK_SHORTCUT);
    this.registered = false;
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }

  /** Ask the main window; a missing or silent main window gets `fallback`. */
  private ask(req: QuickRequest, fallback: unknown): Promise<unknown> {
    const main = this.mainWindow();
    if (!main || main.isDestroyed()) return Promise.resolve(fallback);
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(fallback);
      }, ASK_TIMEOUT_MS);
      this.pending.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
      main.webContents.send(CH.quickRequest, id, req);
    });
  }
}
