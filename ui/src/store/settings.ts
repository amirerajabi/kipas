import { create } from 'zustand';
import { DEFAULT_GENERATOR, type GeneratorOptions } from '../vault/generator';

export type ThemePref = 'system' | 'light' | 'dark';

/**
 * App preferences. They describe this device, not the vault, so they live in localStorage (never inside the vault and
 * never containing a secret).
 */
export interface Settings {
  theme: ThemePref;
  /** Lock after this many idle minutes; 0 = never. */
  autoLockMinutes: number;
  /** Wipe a copied secret from the clipboard after this many seconds; 0 = never. */
  clipboardSeconds: number;
  lockOnMinimize: boolean;
  lockOnSystemLock: boolean;
  /** Show the password column masked in the list. */
  showPasswordColumn: boolean;
  /** Check GitHub Releases for a new version at start and every 6 hours (desktop app). */
  autoUpdate: boolean;
  generator: GeneratorOptions;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  autoLockMinutes: 5,
  clipboardSeconds: 20,
  lockOnMinimize: false,
  lockOnSystemLock: true,
  showPasswordColumn: false,
  autoUpdate: true,
  generator: DEFAULT_GENERATOR,
};

const KEY = 'kipas.settings';

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...s, generator: { ...DEFAULT_GENERATOR, ...s.generator } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsState {
  settings: Settings;
  update(p: Partial<Settings>): void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: load(),
  update(p) {
    const settings = { ...get().settings, ...p };
    set({ settings });
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* private mode */
    }
  },
}));
