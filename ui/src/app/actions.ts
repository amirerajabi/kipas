// Actions shared by commands, menus and dialogs: copying secrets, locking, creating and removing entries.
import { getPlatform } from '../platform';
import { useList, visibleEntries } from '../store/list';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useVault } from '../store/vault';
import { exportCsv, importCsv } from '../vault/csv';
import { blankEntry, openableUrl, type Entry, type EntryKind } from '../vault/model';
import { AutoTypeError, buildSteps, needsTotp, sequenceFor } from '../vault/autotype';
import { parseTotp, totpNow } from '../vault/totp';

export function toastError(text: string, e: unknown): void {
  useUi.getState().toast({ level: 'error', text, detail: e instanceof Error ? e.message : String(e) });
}

/** The selected entries that still exist, in selection order. */
export function selectedEntries(): Entry[] {
  const data = useVault.getState().data;
  if (!data) return [];
  const byId = new Map(data.entries.map((e) => [e.id, e]));
  return useList.getState().selected.map((id) => byId.get(id)).filter((e): e is Entry => !!e);
}

export function current(): Entry | undefined {
  return selectedEntries()[0];
}

/**
 * Copy to the clipboard. Secrets are wiped after the configured delay (only if the clipboard still holds them), and the
 * status bar counts down.
 */
export function copyText(text: string, label: string, secret = true): void {
  const secs = secret ? useSettings.getState().settings.clipboardSeconds : 0;
  getPlatform().copySecret(text, secs * 1000);
  useUi.getState().set({ clipboard: secret ? { label, clearsAt: secs ? Date.now() + secs * 1000 : null } : null });
  useUi.getState().toast({ level: 'success', text: `${label} copied`, detail: secret && secs ? `The clipboard clears in ${secs} seconds.` : undefined });
}

export async function copyTotp(e: Entry): Promise<void> {
  const spec = parseTotp(e.totp);
  if (!spec) return;
  const { code } = await totpNow(spec);
  copyText(code, 'One-time code');
}

export function openUrl(e: Entry): void {
  const url = openableUrl(e.url);
  if (url) getPlatform().openExternal(url);
}

export function newEntry(kind: EntryKind = 'login'): void {
  if (!useVault.getState().data) return;
  const f = useList.getState().filter;
  useUi.getState().set({ editor: { mode: 'new', kind: f.kind === 'type' ? f.id : kind, groupId: f.kind === 'group' ? f.id : null } });
}

export function editEntry(id: string): void {
  useUi.getState().set({ editor: { mode: 'edit', id } });
}

export function duplicate(e: Entry): void {
  const copy: Entry = { ...blankEntry(e.kind, e.groupId), ...structuredClone(e) };
  copy.id = crypto.randomUUID();
  copy.title = `${e.title} (copy)`;
  copy.created = copy.modified = copy.passwordChanged = Date.now();
  copy.history = [];
  copy.fields = copy.fields.map((f) => ({ ...f, id: crypto.randomUUID() }));
  useVault.getState().addEntry(copy);
  useList.getState().select([copy.id]);
}

/** Move to the trash, or delete for good when the entries are already there. */
export async function deleteEntries(ids: string[]): Promise<void> {
  const data = useVault.getState().data;
  if (!data || ids.length === 0) return;
  const entries = data.entries.filter((e) => ids.includes(e.id));
  const name = entries.length === 1 ? `"${entries[0].title || 'Untitled'}"` : `${entries.length} items`;
  const nextSelection = () => {
    // Keep the keyboard flow going: select the row that took the deleted one's place.
    const list = visibleEntries(useVault.getState().data, useList.getState());
    useList.getState().select(list.length ? [list[0].id] : []);
  };
  if (entries.every((e) => e.trashed)) {
    const r = await useUi.getState().askConfirm({ title: 'Delete for good', message: `Delete ${name} permanently? This cannot be undone.`, confirmLabel: 'Delete', danger: true });
    if (!r.ok) return;
    useVault.getState().purge(ids);
    nextSelection();
    return;
  }
  useVault.getState().trash(ids);
  nextSelection();
  useUi.getState().toast({ level: 'info', text: `Moved ${name} to the trash` });
}

export async function emptyTrash(): Promise<void> {
  const data = useVault.getState().data;
  const ids = data?.entries.filter((e) => e.trashed).map((e) => e.id) ?? [];
  if (!ids.length) return;
  const r = await useUi.getState().askConfirm({ title: 'Empty trash', message: `Delete ${ids.length} item${ids.length === 1 ? '' : 's'} in the trash permanently?`, confirmLabel: 'Empty trash', danger: true });
  if (r.ok) useVault.getState().purge(ids);
}

/** A new group, at the top level or inside `parentId`; the list then shows it. */
export async function newGroup(parentId: string | null = null): Promise<string | null> {
  const parent = parentId ? useVault.getState().data?.groups.find((g) => g.id === parentId) : undefined;
  const name = (await useUi.getState().askText({ title: parent ? `New group in ${parent.name}` : 'New group', label: 'Name', value: '', confirmLabel: 'Create' }))?.trim();
  if (!name) return null;
  const id = useVault.getState().addGroup(name, parent?.id ?? null);
  useList.getState().setFilter({ kind: 'group', id });
  return id;
}

/** Lock now. If the last change could not be saved, ask before throwing it away. */
export async function lockVault(auto = false): Promise<void> {
  const v = useVault.getState();
  if (!v.data) return;
  if (await v.lock()) return;
  if (auto) {
    useUi.getState().toast({ level: 'error', text: 'Not locked: the last change could not be saved', detail: v.saveError ?? undefined });
    return;
  }
  const r = await useUi.getState().askConfirm({
    title: 'Changes not saved',
    message: `The last change could not be written to the vault file (${useVault.getState().saveError}). Lock anyway and lose it?`,
    confirmLabel: 'Lock anyway',
    danger: true,
  });
  if (r.ok) await useVault.getState().lock(true);
}

/** Lock (if needed) and pick another vault file; the lock screen then offers it. */
export async function openVaultFile(): Promise<void> {
  const path = await getPlatform().chooseVaultToOpen();
  if (!path) return;
  await lockVault();
  if (useVault.getState().data) return;
  useVault.getState().remember(path);
}

export async function createVault(): Promise<void> {
  await lockVault();
  if (!useVault.getState().data) useUi.getState().set({ createVaultOpen: true });
}

export async function importFromCsv(): Promise<void> {
  const v = useVault.getState();
  if (!v.data) return;
  const file = await getPlatform().openTextFile([{ name: 'CSV', extensions: ['csv'] }]);
  if (!file) return;
  try {
    const r = importCsv(file.text, v.data);
    if (!r.entries.length) throw new Error('No entries found in the file.');
    useVault.getState().importEntries(r.entries, r.groups);
    useList.getState().setFilter({ kind: 'all' });
    useUi.getState().toast({
      level: 'success',
      text: `Imported ${r.entries.length} item${r.entries.length === 1 ? '' : 's'} from ${file.name}`,
      detail: [r.groups.length ? `${r.groups.length} new group${r.groups.length === 1 ? '' : 's'}` : '', r.skipped ? `${r.skipped} empty rows skipped` : '', 'Delete the CSV file now: it holds your passwords in plain text.']
        .filter(Boolean)
        .join(' · '),
    });
  } catch (e) {
    toastError('Could not import the file', e);
  }
}

export async function exportToCsv(): Promise<void> {
  const data = useVault.getState().data;
  if (!data) return;
  const r = await useUi.getState().askConfirm({
    title: 'Export to CSV',
    message: 'The CSV file is not encrypted: anyone who can open it can read every password. Keep it only as long as you need it.',
    confirmLabel: 'Export',
    danger: true,
  });
  if (!r.ok) return;
  try {
    const saved = await getPlatform().saveTextFile(`${data.name}.csv`, exportCsv(data), [{ name: 'CSV', extensions: ['csv'] }]);
    if (saved) useUi.getState().toast({ level: 'success', text: 'Exported', detail: saved });
  } catch (e) {
    toastError('Could not export', e);
  }
}

const AUTOTYPE_FAILED: Record<string, string> = {
  'no-target': 'No other window came to the front, so nothing was typed. Click into the login form first, then come back and press Ctrl+V.',
  'focus-lost': 'The window changed while typing, so Kipas stopped.',
  unsupported: 'Auto-type works in the Windows app for now. Copy the user name (Ctrl+B) and password (Ctrl+C) instead.',
  failed: 'The typing helper did not run.',
};

/**
 * KeePass's Ctrl+V: type the entry into the window you were in before Kipas, following its auto-type sequence (its own,
 * or the default from Settings), e.g. user name, Tab, password, Enter.
 */
export async function autoTypeEntry(e: Entry): Promise<boolean> {
  try {
    const sequence = sequenceFor(e, useSettings.getState().settings.autoTypeSequence);
    const spec = needsTotp(sequence) ? parseTotp(e.totp) : null;
    const steps = buildSteps(sequence, {
      title: e.title,
      username: e.username,
      password: e.password,
      url: e.url,
      totp: spec ? (await totpNow(spec)).code : '',
      fields: e.fields,
    });
    const result = await getPlatform().autoType(steps);
    if (result === 'ok') return true;
    useUi.getState().toast({ level: result === 'unsupported' ? 'info' : 'warning', text: 'Auto-type did not run', detail: AUTOTYPE_FAILED[result] });
  } catch (err) {
    if (err instanceof AutoTypeError) useUi.getState().toast({ level: 'warning', text: `Cannot auto-type "${e.title || 'this item'}"`, detail: err.message });
    else toastError('Auto-type failed', err);
  }
  return false;
}
