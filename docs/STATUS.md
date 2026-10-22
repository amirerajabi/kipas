# Status

## Released

- **v1.1.0** (2026-10-22): import from KeePass. Notes: [release-notes/v1.1.0.md](release-notes/v1.1.0.md).
  - **Import from KeePass** (`.kdbx`, KDBX 3.1 and 4.x; AES-KDF, Argon2d/id; AES or ChaCha20; key files). Tested on files
    KeePass 2.61 wrote (`ui/test/fixtures`) and through the dialog in the browser preview. Twofish databases and KeePass
    1.x `.kdb` files are refused with a message; attachments are counted, not imported.
- **v1.0.0** (2026-10-22): first public release. Notes: [release-notes/v1.0.0.md](release-notes/v1.0.0.md).

## On `main`, not released yet

Nothing.

## Checked

- Vault core: 24 passing tests (AES-256-GCM + PBKDF2-SHA256, tamper detection, TOTP RFC 6238 vectors, generator,
  strength, CSV import/export, health, list filtering).
- UI in the browser preview: create vault, add a login with a generated password and TOTP, copy with clipboard
  countdown, lock, wrong and right unlock, Health tab, dark theme.
- Electron: starts and renders (smoke shot); the desktop file writer (atomic write, `.bak`, refuses non-vault paths and
  content); the updater reads a local feed.

Not yet checked by hand in Electron: file dialogs, clipboard wiping, lock on screen lock/minimize, a real update from
one release to the next.

## Ideas / open work

- Argon2id key derivation for Kipas's own vaults, as vault format version 2 (`keepass/argon2.ts` can provide it).
- Attachments (KeePass imports carry them; Kipas has nowhere to keep them yet).
- Argon2 runs on the UI thread (about 4 s for KeePass's default 64 MiB; KeePassXC files tuned to 1 s natively can take
  much longer). A Web Worker or WASM would keep the window responsive.
- Detect a vault changed on disk by another device (sync conflicts) before saving over it.
- Browser extension for autofill (Grabbit's extension setup is a template).
- Exclude copied secrets from Windows clipboard history.
- Code signing (Windows and macOS).
