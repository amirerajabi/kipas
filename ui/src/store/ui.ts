import { create } from 'zustand';
import type { EntryKind } from '../vault/model';

/** The main area: the item list with details, or the password health page. */
export type MainView = 'items' | 'health';
export type SettingsSection = 'general' | 'security' | 'data' | 'updates' | 'about';

export interface Toast {
  id: number;
  level: 'info' | 'success' | 'warning' | 'error';
  text: string;
  detail?: string;
}

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  /** Optional checkbox (e.g. "I understand"). */
  checkbox?: string;
  resolve(result: { ok: boolean; checked: boolean }): void;
}

export interface PromptState {
  title: string;
  label: string;
  value: string;
  confirmLabel: string;
  resolve(value: string | null): void;
}

/** The entry editor: a new entry of a kind, or an existing one. */
export type EditorState = { mode: 'new'; kind: EntryKind; groupId: string | null } | { mode: 'edit'; id: string };

/** The generator dialog; `onUse` puts the result into the field that opened it. */
export interface GeneratorState {
  onUse?: (password: string) => void;
}

/** A copied secret, for the countdown in the side panel. */
export interface ClipboardState {
  label: string;
  clearsAt: number | null;
}

export const DOCK_MIN = 180;
export const DOCK_MAX = 420;

type Layout = Pick<UiState, 'sidebarVisible' | 'sidebarWidth' | 'detailsVisible' | 'detailsWidth'>;

interface UiState {
  sidebarVisible: boolean;
  sidebarWidth: number;
  view: MainView;
  detailsVisible: boolean;
  detailsWidth: number;
  editor: EditorState | null;
  generator: GeneratorState | null;
  createVaultOpen: boolean;
  keepassImportOpen: boolean;
  settingsOpen: SettingsSection | null;
  changePasswordOpen: boolean;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  /** Entry ids whose secrets are shown in the details pane; cleared when the selection changes or the vault locks. */
  revealed: Set<string>;
  clipboard: ClipboardState | null;
  confirm: ConfirmState | null;
  prompt: PromptState | null;
  toasts: Toast[];
  setLayout(p: Partial<Layout>): void;
  set(p: Partial<Pick<UiState, 'view' | 'editor' | 'generator' | 'createVaultOpen' | 'keepassImportOpen' | 'settingsOpen' | 'changePasswordOpen' | 'paletteOpen' | 'shortcutsOpen' | 'clipboard' | 'revealed'>>): void;
  askConfirm(c: Omit<ConfirmState, 'resolve'>): Promise<{ ok: boolean; checked: boolean }>;
  resolveConfirm(ok: boolean, checked?: boolean): void;
  askText(p: Omit<PromptState, 'resolve'>): Promise<string | null>;
  resolvePrompt(value: string | null): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
  /** Close every dialog (the vault locked). */
  closeAll(): void;
}

const LAYOUT_KEY = 'kipas.layout';

function loadLayout(): Partial<Layout> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Partial<Layout>;
  } catch {
    return {};
  }
}

let toastId = 0;

export const useUi = create<UiState>((set, get) => ({
  sidebarVisible: true,
  sidebarWidth: 0,
  view: 'items',
  detailsVisible: true,
  detailsWidth: 0,
  ...loadLayout(),
  editor: null,
  generator: null,
  createVaultOpen: false,
  keepassImportOpen: false,
  settingsOpen: null,
  changePasswordOpen: false,
  paletteOpen: false,
  shortcutsOpen: false,
  revealed: new Set(),
  clipboard: null,
  confirm: null,
  prompt: null,
  toasts: [],

  setLayout(p) {
    set(p);
    const s = get();
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ sidebarVisible: s.sidebarVisible, sidebarWidth: s.sidebarWidth, detailsVisible: s.detailsVisible, detailsWidth: s.detailsWidth }));
    } catch {
      /* private mode */
    }
  },
  set: (p) => set(p),
  askConfirm(c) {
    get().confirm?.resolve({ ok: false, checked: false });
    return new Promise((resolve) => set({ confirm: { ...c, resolve } }));
  },
  resolveConfirm(ok, checked = false) {
    const c = get().confirm;
    set({ confirm: null });
    c?.resolve({ ok, checked });
  },
  askText(p) {
    get().prompt?.resolve(null);
    return new Promise((resolve) => set({ prompt: { ...p, resolve } }));
  },
  resolvePrompt(value) {
    const p = get().prompt;
    set({ prompt: null });
    p?.resolve(value);
  },
  toast(t) {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismissToast(id), t.level === 'error' ? 9000 : 4000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  closeAll() {
    get().resolveConfirm(false);
    get().resolvePrompt(null);
    set({ view: 'items', editor: null, generator: null, keepassImportOpen: false, settingsOpen: null, changePasswordOpen: false, paletteOpen: false, shortcutsOpen: false, revealed: new Set() });
  },
}));
