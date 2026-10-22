// Vault file I/O for the renderer. The renderer only ever hands us sealed text; we never see a password or a key.
// Writes are atomic (unique temp file, fsync, rename), and the previous version is kept as `<file>.bak`, so a crash or a
// full disk mid-save can never leave you with a half-written vault.
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { VaultFileInfo } from '../../../shared/protocol';

export const VAULT_EXT = 'kipas';
/** A vault is JSON text; anything bigger than this is not one of ours (and would be slow to decrypt anyway). */
const MAX_VAULT_BYTES = 64 * 1024 * 1024;

/** Only absolute paths to .kipas files are accepted from the renderer. */
export function checkVaultPath(p: unknown): string {
  if (typeof p !== 'string' || !path.isAbsolute(p) || path.extname(p).toLowerCase() !== `.${VAULT_EXT}`) throw new Error('Not a Kipas vault path.');
  return path.normalize(p);
}

export async function statVault(p: string): Promise<VaultFileInfo | null> {
  try {
    const s = await fs.stat(p);
    return s.isFile() ? { path: p, name: path.basename(p, path.extname(p)), size: s.size, modified: s.mtimeMs } : null;
  } catch {
    return null;
  }
}

export async function readVault(p: string): Promise<string> {
  const s = await fs.stat(p);
  if (s.size > MAX_VAULT_BYTES) throw new Error('The file is too large to be a Kipas vault.');
  return fs.readFile(p, 'utf8');
}

export async function writeVault(p: string, text: string): Promise<VaultFileInfo> {
  if (typeof text !== 'string' || text.length > MAX_VAULT_BYTES) throw new Error('Refusing to write an oversized vault.');
  // Never let a bug in the renderer overwrite a vault with something that is not a sealed vault.
  let format: unknown;
  try {
    format = (JSON.parse(text) as { format?: unknown }).format;
  } catch {
    /* handled below */
  }
  if (format !== 'kipas-vault') throw new Error('Refusing to write: not a sealed vault.');

  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${randomBytes(6).toString('hex')}.tmp`;
  const handle = await fs.open(tmp, 'w', 0o600);
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.copyFile(p, `${p}.bak`).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
    });
    await renameWithRetry(tmp, p);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  return (await statVault(p))!;
}

/** Windows refuses a rename while another program (antivirus, a sync client) briefly holds the file. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 8 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
}
