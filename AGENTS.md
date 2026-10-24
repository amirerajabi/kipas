# Kipas — guide for coding agents

Kipas is a KeePass-style offline password manager: Electron desktop app + React UI. Its structure and look follow
Grabbit (`C:\Users\AMIR\Desktop\DownloadManager`), which follows Rowlit. Read [docs/STATUS.md](docs/STATUS.md) first.

## Commands

Run from the repository root (Windows dev machine; examples use Git Bash).

```bash
npm run setup      # npm install in ui and desktop
npm run typecheck  # ui (including tests) and desktop
npm test           # vault core tests (~1 s)
npm run build      # UI + desktop bundle
npm run dev        # UI in a browser on :5174; vaults go to localStorage
npm start          # build, then Electron (profile in .dev-data/desktop)
```

A change is done when `npm run typecheck`, `npm test` and `npm run build` pass. Check UI changes in the running app.

## Rules

- **Security first.** The master password and the key never leave `ui/src/store/vault.ts` (the key is a non-extractable
  `CryptoKey` held outside the store). Nothing decrypted is ever written to disk, localStorage, logs or the desktop side;
  the desktop only sees sealed vault text. Settings in localStorage must never contain a secret.
- **The vault format is a contract.** `crypto.ts` binds the header as AES-GCM associated data. Changing the header, KDF
  or payload shape needs a new `version`, code that still opens version 1, and tests. `normalizeVault` must keep opening
  older and newer payloads.
- **No network** except the updater (desktop main process, GitHub release metadata only, can be turned off in
  Settings → Updates). No favicon fetching or analytics. The renderer's production CSP has `connect-src 'none'`; keep it.
- Releasing: read [.claude/rules/release.md](.claude/rules/release.md) and follow `.claude/skills/release/SKILL.md`.
- Every behaviour change in `ui/src/vault/` gets a test in `ui/test/vault.test.ts` (KeePass import: `ui/test/keepass.test.ts`).
- The KeePass fixtures in `ui/test/fixtures/` are written by real KeePass 2 via `scripts/make-kdbx-fixtures.ps1` (run it with
  Windows PowerShell 5.1). Never replace them with files our own code wrote; that would only test us against ourselves.
- Every user action is a command in `ui/src/app/commands.ts`. Colours, sizes and weights only via
  `ui/src/theme/tokens.css` (light and dark values). Reuse `components/common` (`Dialog`, `Menu`, `Toasts`, `SecretInput`).
- The quick-access window (`desktop/src/main/quick.ts`, `ui/src/quick/`) never gets vault data beyond `quickResults()` in
  `ui/src/store/list.ts` (titles, user names, hosts; never notes or secrets). It asks the main window to copy by entry id.
  `KIPAS_SMOKE_QUICK=1` with `KIPAS_SMOKE_SHOT` captures it.
- The desktop bridge is `desktop/src/preload/preload.ts` (`window.kipas`); main validates every value
  (`checkVaultPath`, sealed-vault check before writing). Types crossing it live in `shared/protocol.ts`.
- Keep dependencies minimal (React, zustand, lucide; Electron). Ask before adding a package.
- Test with throwaway data: `KIPAS_USER_DATA=<scratch dir>` for Electron, and never open the user's real vaults.
  `KIPAS_SMOKE_SHOT=<file.png>` captures the window and quits (add `--hidden`).
