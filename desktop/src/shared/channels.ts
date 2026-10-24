/** IPC channel names shared by main and preload. */
export const CH = {
  setTheme: 'kipas:set-theme',
  chooseVaultToOpen: 'kipas:choose-vault-open',
  chooseVaultToCreate: 'kipas:choose-vault-create',
  readVault: 'kipas:read-vault',
  writeVault: 'kipas:write-vault',
  statVault: 'kipas:stat-vault',
  saveTextFile: 'kipas:save-text-file',
  openTextFile: 'kipas:open-text-file',
  openBinaryFile: 'kipas:open-binary-file',
  copySecret: 'kipas:copy-secret',
  clearClipboard: 'kipas:clear-clipboard',
  openExternal: 'kipas:open-external',
  revealFile: 'kipas:reveal-file',
  systemEvent: 'kipas:system-event',
  command: 'kipas:command',
  appVersion: 'kipas:app-version',
  updateStatus: 'kipas:update-status',
  updateGet: 'kipas:update-get',
  updateCheck: 'kipas:update-check',
  updateInstall: 'kipas:update-install',
  setAutoUpdate: 'kipas:set-auto-update',
  // Quick-access window: it asks main, main asks the main window (which holds the vault) and relays the answer.
  setQuickAccess: 'kipas:set-quick-access',
  quickSearch: 'kipas:quick-search',
  quickAct: 'kipas:quick-act',
  quickHide: 'kipas:quick-hide',
  quickShowMain: 'kipas:quick-show-main',
  quickShown: 'kipas:quick-shown',
  quickRequest: 'kipas:quick-request',
  quickReply: 'kipas:quick-reply',
} as const;

/** additionalArguments passed to the renderer: --kipas-titlebar=<kind> */
export const ARG = {
  titleBar: '--kipas-titlebar=',
  /** Present only in the quick-access window. */
  quick: '--kipas-quick',
} as const;

export const QUICK_SHORTCUT = 'CommandOrControl+Shift+Space';
