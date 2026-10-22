# Release rules

- **One version for everything:** `package.json`, `ui/` and `desktop/` (all via `npm version <v> --no-git-tag-version`
  so the lock files follow).
- **The tag is `v<version>`** and must match `desktop/package.json`; the release workflow refuses anything else. Every
  release needs `docs/release-notes/v<version>.md` (the workflow uses it as the release body).
- **Release assets have no spaces in their names** (GitHub would rename them and break `latest*.yml`). The
  `artifactName` patterns in `desktop/electron-builder.yml` set this; keep them.
- **The auto-updater contract:** installed copies read `latest.yml` (Windows), `latest-mac.yml` and `latest-linux.yml`
  from the newest release (`publish:` in `electron-builder.yml` → `amirerajabi/kipas`). The release workflow checks
  that all three exist, name this version and point at uploaded files. Never remove those checks.
- **A version that shipped is never rebuilt under the same number.** Installed copies compare versions, not checksums.
  Fix forward with the next patch version.
- **The vault format must keep opening.** A release that changes `crypto.ts` or the payload must still open every vault
  an older version wrote; users update the app, not their files.
- **Builds are unsigned.** macOS can't auto-install them (the updater only announces them); on Windows SmartScreen warns
  and the release notes say how to get past it.
- **Update tests:** `KIPAS_UPDATE_FEED=<url>` points the updater at a local feed. Run such tests with a throwaway
  profile (`KIPAS_USER_DATA`) and `--hidden`, stop the feed as soon as the check is done, and never point a test at the
  real release while an installed Kipas could be updated by it.
- Pushing, tagging and publishing are public. Do them only when the user asked in this session; hide a bad release with
  `gh release edit <tag> --draft=true` and ask before deleting anything.
