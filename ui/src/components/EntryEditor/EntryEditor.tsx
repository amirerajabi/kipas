import { Plus, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useList } from '../../store/list';
import { useSettings } from '../../store/settings';
import { useUi, type EditorState } from '../../store/ui';
import { useVault } from '../../store/vault';
import { blankEntry, groupTree, hostOf, KIND_LABEL, KINDS, newId, type Entry } from '../../vault/model';
import { parseTotp } from '../../vault/totp';
import { Dialog, Field } from '../common/Dialog';
import { SecretInput } from '../common/SecretInput';
import { SequenceInput, sequenceProblem } from '../common/SequenceInput';
import { KindIcon, StrengthMeter } from '../common/visuals';

/** New and edit, in one dialog. Fields adapt to the kind: a note has no password, a card has its numbers. */
export function EntryEditor() {
  const editor = useUi((s) => s.editor);
  if (!editor) return null;
  return <Editor key={editor.mode === 'edit' ? editor.id : 'new'} editor={editor} />;
}

function initial(editor: EditorState): Entry | null {
  if (editor.mode === 'new') return blankEntry(editor.kind, editor.groupId);
  return useVault.getState().data?.entries.find((e) => e.id === editor.id) ?? null;
}

function Editor({ editor }: { editor: EditorState }) {
  const start = useMemo(() => initial(editor), [editor]);
  const [draft, setDraft] = useState<Entry | null>(start);
  const [tags, setTags] = useState(start?.tags.join(', ') ?? '');
  const groups = useVault((s) => s.data?.groups ?? []);
  const defaultSequence = useSettings((s) => s.settings.autoTypeSequence);
  if (!draft || !start) return null;

  const isNew = editor.mode === 'new';
  const set = (p: Partial<Entry>) => setDraft({ ...draft, ...p });
  const kind = draft.kind;
  const hasLogin = kind === 'login' || kind === 'wifi';
  const totpBad = draft.totp.trim() !== '' && !parseTotp(draft.totp);
  const autoTypeBad = !!sequenceProblem(draft.autoType, true);
  const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
  const title = draft.title.trim() || hostOf(draft.url);
  const empty = !title && !draft.username && !draft.password && !draft.notes.trim();
  const dirty = JSON.stringify({ ...draft, tags: tagList }) !== JSON.stringify(start);

  const close = async () => {
    if (dirty && !empty) {
      const r = await useUi.getState().askConfirm({ title: 'Discard changes?', message: 'You have changes that are not saved.', confirmLabel: 'Discard', danger: true });
      if (!r.ok) return;
    }
    useUi.getState().set({ editor: null });
  };

  const save = () => {
    if (empty || totpBad || autoTypeBad) return;
    const final: Entry = { ...draft, title: title || 'Untitled', tags: tagList, totp: draft.totp.trim(), autoType: draft.autoType.trim(), fields: draft.fields.filter((f) => f.name.trim() || f.value) };
    if (isNew) {
      useVault.getState().addEntry(final);
      useUi.getState().toast({ level: 'success', text: `Saved "${final.title}"` });
    } else {
      const { id, created, ...patch } = final;
      void created;
      useVault.getState().updateEntry(id, patch);
    }
    useList.getState().select([final.id]);
    useUi.getState().set({ editor: null });
    setTimeout(() => (document.querySelector('.entry-list') as HTMLElement | null)?.focus(), 0);
  };

  const setField = (id: string, p: Partial<Entry['fields'][number]>) => set({ fields: draft.fields.map((f) => (f.id === id ? { ...f, ...p } : f)) });

  return (
    <Dialog
      title={isNew ? `New ${KIND_LABEL[kind].toLowerCase()}` : `Edit ${draft.title || 'item'}`}
      icon={<KindIcon kind={kind} size={18} />}
      width={620}
      className="editor"
      onClose={() => void close()}
      onSubmit={save}
      footer={
        <>
          <label className="check footer-left">
            <input type="checkbox" checked={draft.favorite} onChange={(e) => set({ favorite: e.target.checked })} />
            <Star size={14} className={draft.favorite ? 'text-warning' : 'muted'} /> Favorite
          </label>
          <div className="flex-1" />
          <button className="btn" onClick={() => void close()}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={empty || totpBad || autoTypeBad} title={empty ? 'Give it a title first' : undefined}>
            {isNew ? 'Save' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="form">
        {isNew && (
          <div className="segmented kind-picker" role="radiogroup" aria-label="Type">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={k === kind}
                className={k === kind ? 'on' : ''}
                onClick={() => setDraft({ ...blankEntry(k, draft.groupId), id: draft.id, title: draft.title, notes: draft.notes, favorite: draft.favorite, username: draft.username, password: draft.password })}
              >
                <KindIcon kind={k} size={14} /> {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        <div className="form-row">
          <Field label="Title">
            <input
              className="input"
              autoFocus
              value={draft.title}
              placeholder={hostOf(draft.url) || (kind === 'login' ? 'e.g. GitHub' : kind === 'card' ? 'e.g. Visa debit' : kind === 'wifi' ? 'e.g. Home Wi-Fi' : 'e.g. Passport number')}
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
          <Field label="Group">
            <select className="input select" value={draft.groupId ?? ''} onChange={(e) => set({ groupId: e.target.value || null })}>
              <option value="">No group</option>
              {groupTree(groups).map(({ group: g, depth }) => (
                <option key={g.id} value={g.id}>
                  {'\u2003'.repeat(depth)}
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {hasLogin && (
          <>
            <Field label={kind === 'wifi' ? 'Network name (SSID)' : 'User name or email'}>
              <input className="input" value={draft.username} spellCheck={false} autoComplete="off" onChange={(e) => set({ username: e.target.value })} />
            </Field>
            <Field label="Password" hint={<StrengthMeter password={draft.password} />}>
              <SecretInput value={draft.password} onChange={(password) => set({ password })} generator />
            </Field>
          </>
        )}
        {kind === 'login' && (
          <>
            <Field label="Website">
              <input className="input" value={draft.url} placeholder="https://" spellCheck={false} autoComplete="off" onChange={(e) => set({ url: e.target.value })} />
            </Field>
            <Field
              label="Two-factor secret (optional)"
              hint={totpBad ? <span className="text-danger">That is not a valid setup key or otpauth:// link.</span> : 'Paste the setup key or otpauth:// link the site shows when you turn on an authenticator app.'}
            >
              <SecretInput value={draft.totp} onChange={(totp) => set({ totp })} className={totpBad ? 'invalid' : ''} />
            </Field>
          </>
        )}

        {draft.fields.length > 0 && (
          <div className="custom-fields">
            {draft.fields.map((f) => (
              <div key={f.id} className="custom-field">
                <input className="input custom-name" value={f.name} placeholder="Label" onChange={(e) => setField(f.id, { name: e.target.value })} aria-label="Field label" />
                {f.secret ? (
                  <SecretInput value={f.value} onChange={(value) => setField(f.id, { value })} aria-label={`${f.name || 'Field'} value`} />
                ) : (
                  <input className="input" value={f.value} spellCheck={false} onChange={(e) => setField(f.id, { value: e.target.value })} aria-label={`${f.name || 'Field'} value`} />
                )}
                <label className="check" title="Hide the value and clear it from the clipboard after copying">
                  <input type="checkbox" checked={f.secret} onChange={(e) => setField(f.id, { secret: e.target.checked })} /> Hidden
                </label>
                <button type="button" className="icon-btn sm" aria-label="Remove field" title="Remove field" onClick={() => set({ fields: draft.fields.filter((x) => x.id !== f.id) })}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div>
          <button type="button" className="link-btn" onClick={() => set({ fields: [...draft.fields, { id: newId(), name: '', value: '', secret: false }] })}>
            <Plus size={14} /> Add a field
          </button>
        </div>

        {hasLogin && (
          <Field label="Auto-type (Ctrl+V)" hint="What Kipas types into the window you came from. Leave empty to use the default from Settings.">
            <SequenceInput value={draft.autoType} onChange={(autoType) => set({ autoType })} placeholder={defaultSequence} optional />
          </Field>
        )}
        <Field label="Notes">
          <textarea className="input textarea" rows={kind === 'note' ? 8 : 3} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <Field label="Tags" hint="Separate with commas.">
          <input className="input" value={tags} placeholder="e.g. banking, family" onChange={(e) => setTags(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
