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
} as const;

/** additionalArguments passed to the renderer: --kipas-titlebar=<kind> */
export const ARG = {
  titleBar: '--kipas-titlebar=',
} as const;
