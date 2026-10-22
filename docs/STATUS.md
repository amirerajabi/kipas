# Status

## Released

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

- Argon2id key derivation (needs a WASM build or Node's `crypto.argon2`), as vault format version 2.
- KDBX (KeePass) import, which needs Argon2 and ChaCha20/Salsa20.
- Detect a vault changed on disk by another device (sync conflicts) before saving over it.
- Browser extension for autofill (Grabbit's extension setup is a template).
- Exclude copied secrets from Windows clipboard history.
- Code signing (Windows and macOS).
