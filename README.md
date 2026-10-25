# Kipas

A modern, friendly password manager in the spirit of KeePass: your passwords live in **one encrypted file on your
device**. No account, no cloud, no tracking. Electron + React, with the same shell as
[Grabbit](https://github.com/amirerajabi/grabbit).

## Features

- **Vaults are files** (`.kipas`). Keep several, back them up by copying, sync them with any folder sync.
- **Strong encryption:** AES-256-GCM, key from PBKDF2-SHA256 (600 000 rounds) with a random salt, fresh nonce on every
  save, authenticated header. Atomic saves with a `.bak` of the previous version.
- **Logins, cards, secure notes and Wi-Fi**, with custom (optionally hidden) fields, tags, favourites, groups and a trash.
- **Two-factor codes (TOTP)** built in: paste the setup key or `otpauth://` link and Kipas shows the live code.
- **Password generator**: random passwords or easy-to-type passphrases, with entropy shown.
- **Password health**: weak, reused and old passwords, and websites without two-factor, checked on your device only.
- **Safe clipboard**: copied secrets are wiped after 20 seconds (configurable), only if still on the clipboard.
- **Auto-lock** after idle time, when the computer locks or sleeps, and optionally on minimize.
- **Password history** per entry, so an accidental change can be undone.
- **Import KeePass databases** (`.kdbx`, KDBX 3.1 and 4.x from KeePass 2, KeePassXC, KeeWeb, Strongbox) directly, with
  their password and key file: groups, custom fields, two-factor secrets, password history and the recycle bin come along.
- **Import** CSV from KeePass, KeePassXC, Bitwarden, 1Password, LastPass, Chrome, Edge, Firefox. **Export** to CSV.
- **Auto-type (Windows)**: Ctrl+V on an item types it into the window you came from, by default user name, Tab,
  password, Enter. Change the sequence for all items (Settings) or one item (Edit), e.g. `{USERNAME}{TAB 2}{PASSWORD}`.
  Ctrl+B copies the user name, Ctrl+C the password.
- **Quick access**: Ctrl+Shift+Space opens a small search over any app; Enter copies the password, Ctrl+B the user
  name, Ctrl+T the one-time code. It never holds the vault: the main window does the copying.
- **Keyboard first**: command palette (Ctrl+K, Ctrl+Enter copies a result's password), KeePass shortcuts (Ctrl+B user
  name, Ctrl+C password, Ctrl+U open site), drag items onto groups, light and dark themes.
- **Automatic updates** from GitHub Releases (Windows and Linux install in the background; macOS gets a link).
- Privacy by design: no favicon fetching, no telemetry, a strict Content-Security-Policy with `connect-src 'none'`.

## Download

Get the installer from [Releases](https://github.com/amirerajabi/kipas/releases/latest): Windows (`Kipas-Setup-<version>.exe`),
macOS Apple silicon (`.dmg`) or Linux (`.AppImage`). Installed copies update themselves (Settings → Updates).

## Develop

```bash
npm run setup        # npm install in ui and desktop
npm run dev          # the UI in a browser on http://localhost:5174 (vaults in localStorage, for development)
npm run dev:desktop  # Vite + Electron
npm test             # vault core tests (crypto, TOTP, generator, CSV, health, auto-type, KeePass)
npm run test:autotype  # Windows: types into a throwaway test window with the real helper
npm run typecheck
npm run build
npm start            # build, then launch Electron
npm run dist         # Windows installer into desktop/release/
```

## Layout

| Path | What |
| --- | --- |
| `ui/src/vault/` | The vault core, DOM-free: `crypto.ts`, `model.ts`, `totp.ts`, `generator.ts`, `strength.ts`, `csv.ts`, `health.ts`. |
| `ui/src/vault/keepass/` | KeePass import: `kdbx.ts` (KDBX 3/4 reader), `argon2.ts` (Argon2 + BLAKE2b), `streams.ts` (ChaCha20, Salsa20), `xml.ts`, `import.ts`. |
| `ui/src/store/` | zustand stores: `vault` (open vault, saving), `list` (filter, search, selection), `ui`, `settings`. |
| `ui/src/app/commands.ts` | The command registry: toolbar, menus, palette and shortcuts all read it. |
| `ui/src/platform.ts` | The bridge to Electron (`window.kipas`), with a localStorage fallback in a browser. |
| `ui/src/quick/` | The quick-access window's screen (the same page, loaded with `#quick`). |
| `desktop/` | Electron main + preload: file dialogs, atomic vault writes, clipboard wiping, lock on OS events, the quick-access window (`quick.ts`). |
| `shared/protocol.ts` | Types that cross the renderer ⇄ desktop boundary. |

## Security notes

The master password is never stored; a forgotten one cannot be recovered. Decrypted entries live in the app's memory
while the vault is unlocked (JavaScript cannot reliably wipe strings), and locking drops them. The vault format records
its key-derivation settings, so a stronger KDF (Argon2id) can be added later without breaking existing files.

## License

MIT
