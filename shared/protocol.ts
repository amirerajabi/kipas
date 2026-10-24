// Types that cross the renderer ⇄ desktop boundary (preload bridge). Types only: both sides import with `import type`.
// The vault itself never crosses decrypted: the desktop side only ever reads and writes the sealed file text.

/** A vault file the desktop side found on disk. */
export interface VaultFileInfo {
  path: string;
  /** File name without the extension, shown as the vault's name until it is unlocked. */
  name: string;
  size: number;
  modified: number;
}

/** Things the OS tells the UI so it can lock: the session locked, the machine went to sleep, the window minimized. */
export type SystemEvent = 'lock-screen' | 'suspend' | 'minimize';

/** install: download in the background and restart into it; notify: link to the release (unsigned macOS). */
export type UpdateMode = 'install' | 'notify' | 'disabled';

export interface UpdateStatus {
  state: 'disabled' | 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';
  mode: UpdateMode;
  currentVersion: string;
  /** The newer version, once one is found. */
  version?: string;
  /** Download progress, 0-100. */
  percent?: number;
  /** Why updates are disabled, or what went wrong. */
  message?: string;
  releaseUrl?: string;
}

/**
 * One row in the quick-access window. The window never holds the vault: it gets titles and user names to show, and
 * asks the main window (which holds the key) to copy a secret by entry id.
 */
export interface QuickResult {
  id: string;
  title: string;
  subtitle: string;
  kind: 'login' | 'card' | 'note' | 'wifi';
  /** For the avatar colour. */
  host: string;
  hasUsername: boolean;
  hasPassword: boolean;
  hasTotp: boolean;
  hasUrl: boolean;
}

export type QuickAnswer = { locked: true } | { locked: false; vaultName: string; results: QuickResult[] };

export type QuickAction = 'password' | 'username' | 'totp' | 'open';

/** What the main process asks the main window on behalf of the quick-access window. */
export type QuickRequest = { kind: 'search'; query: string } | { kind: 'act'; entryId: string; action: QuickAction };

export interface TextFileFilter {
  name: string;
  extensions: string[];
}
