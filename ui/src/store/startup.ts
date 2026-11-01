import { create } from 'zustand';
import type { StartupStatus } from '../../../shared/protocol';
import { getPlatform } from '../platform';
import { useUi } from './ui';

interface StartupState {
  status: StartupStatus | null;
  busy: boolean;
  error: string | null;
  refresh(): Promise<void>;
  toggle(): Promise<void>;
}

// Windows is the source of truth. Reading this never changes a startup entry or saves it to localStorage.
export const useStartup = create<StartupState>((set, get) => ({
  status: null,
  busy: false,
  error: null,
  async refresh() {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      set({ status: await getPlatform().getStartupStatus() });
    } catch {
      set({ status: null, error: 'Could not read the Windows startup setting. Reopen Settings to try again.' });
    } finally {
      set({ busy: false });
    }
  },
  async toggle() {
    const { status, busy } = get();
    if (busy || !status?.available) return;
    set({ busy: true, error: null });
    try {
      set({ status: await getPlatform().setStartAtLogin(!status.enabled) });
    } catch {
      useUi.getState().toast({ level: 'error', text: 'Could not change the Windows startup setting', detail: 'Try again in Settings.' });
      // A failed write may still have changed Windows; read back before allowing another attempt.
      try {
        set({ status: await getPlatform().getStartupStatus() });
      } catch {
        set({ status: null, error: 'Could not read the Windows startup setting. Reopen Settings to try again.' });
      }
    } finally {
      set({ busy: false });
    }
  },
}));
