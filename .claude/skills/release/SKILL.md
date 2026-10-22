---
name: release
description: Publish a new Kipas version to GitHub Releases (bump every package, write release notes, tag, watch the release workflow, verify installers and auto-update metadata). Use when the user asks to release, publish, ship or tag a version.
---

# Release Kipas

Publishing is public and installed copies update to it: only release when the user asked in this session. Read
`.claude/rules/release.md` first. `gh` is at `C:\Program Files\GitHub CLI\gh.exe`.

## 1. Check the starting point

```bash
git status --short && git log --oneline -1 && git log --oneline "$(git describe --tags --abbrev=0)"..HEAD
npm run typecheck && npm test
```

The tree must be clean and `main` pushed. Confirm the version number if the user did not give one (patch for fixes,
minor for features).

## 2. Bump, write notes, commit, tag, push

```bash
V=1.0.1
npm version $V --no-git-tag-version >/dev/null
for p in desktop ui; do (cd $p && npm version $V --no-git-tag-version >/dev/null); done
```

Write `docs/release-notes/v$V.md` in the shape of the previous notes (summary, "installed copies update themselves",
downloads with exact file names, New / Fixes for users, the unsigned-builds note). Update `docs/STATUS.md`.

```bash
git add -A && git commit -m "Release $V" && git tag -a v$V -m "Kipas $V"
git push origin main && git push origin v$V
```

## 3. Watch the workflow (about 6 to 10 minutes; run it in the background)

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"; R=amirerajabi/kipas
ID=$("$GH" run list --repo $R --workflow Release --limit 1 --json databaseId --jq '.[0].databaseId')
"$GH" run watch $ID --repo $R --interval 30 --exit-status > /dev/null; echo "exit $?"
```

On failure: `"$GH" run view $ID --repo $R --log-failed`.

## 4. Verify

```bash
"$GH" release view v$V --repo $R --json isDraft,assets --jq '"draft=\(.isDraft)", (.assets[] | "\(.name) \(.size)")'
```

Expect 8 assets: `Kipas-Setup-$V.exe` (+ `.blockmap`), `latest.yml`; `Kipas-$V-mac-arm64.dmg` and `.zip` (each +
`.blockmap`), `latest-mac.yml`; `Kipas-$V-x86_64.AppImage`, `latest-linux.yml`.

Check the installer's SHA-512 against `latest.yml`:

```bash
D=$(mktemp -d); cd $D
curl -sL -o latest.yml https://github.com/amirerajabi/kipas/releases/download/v$V/latest.yml && grep -E '^(version|sha512):' latest.yml
curl -sL -o setup.exe https://github.com/amirerajabi/kipas/releases/download/v$V/Kipas-Setup-$V.exe
openssl dgst -sha512 -binary setup.exe | base64 -w0; echo; cd - >/dev/null; rm -rf $D
```

## 5. Report

The release URL, what is in it, and that installed copies pick it up on their next check (Settings → Updates).
