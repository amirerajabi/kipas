import type { StartupStatus } from '../../../shared/protocol';

const NAME = 'com.kipas.app';

interface StartupHost {
  isPackaged: boolean;
  getLoginItemSettings(options: { path: string; args: string[] }): {
    launchItems: { name: string; scope: string; enabled: boolean }[];
  };
  setLoginItemSettings(settings: { name: string; path: string; args: string[]; openAtLogin: boolean; enabled: boolean }): void;
}

/** Register only the packaged executable, with no vault path or development arguments. */
export function startupSettings(host: StartupHost, os: string, executable: string) {
  // Electron 33 parses this as a command line on both reads and writes; quote paths containing spaces.
  const options = { path: `"${executable}"`, args: [] as string[] };
  function get(): StartupStatus {
    if (os !== 'win32') return { available: false, enabled: false, message: 'Available in the Windows desktop app.' };
    if (!host.isPackaged) return { available: false, enabled: false, message: 'Available in the packaged Windows app.' };
    const settings = host.getLoginItemSettings(options);
    return { available: true, enabled: settings.launchItems.some((item) => item.name === NAME && item.scope === 'user' && item.enabled) };
  }
  return {
    get,
    set(on: unknown): StartupStatus {
      if (typeof on !== 'boolean') throw new Error('Startup setting must be a boolean.');
      const current = get();
      if (!current.available) return current;
      host.setLoginItemSettings({ ...options, name: NAME, openAtLogin: on, enabled: on });
      const updated = get();
      if (updated.enabled !== on) throw new Error('Windows did not apply the startup setting.');
      return updated;
    },
  };
}
