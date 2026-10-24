import { Folder, FolderPlus, Inbox, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { emptyTrash, newEntry, newGroup } from '../../app/actions';
import { useList, type Filter } from '../../store/list';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import { KIND_LABEL, KINDS } from '../../vault/model';
import { useMenu } from '../common/Menu';
import { KindIcon } from '../common/visuals';

export const ENTRY_DRAG = 'application/x-kipas-entries';

function same(a: Filter | { kind: 'none' }, b: Filter): boolean {
  return a.kind === b.kind && (a as { id?: string }).id === (b as { id?: string }).id;
}

const PLURAL: Record<string, string> = { login: 'Logins', card: 'Cards', note: 'Secure notes', wifi: 'Wi-Fi networks' };

/** The vault tree: everything, favourites, item types, groups (drop items on one to move them), trash. */
export function VaultPanel() {
  const data = useVault((s) => s.data);
  const listFilter = useList((s) => s.filter);
  const view = useUi((s) => s.view);
  // On the Health page no list filter is highlighted.
  const filter: Filter | { kind: 'none' } = view === 'items' ? listFilter : { kind: 'none' };
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { all: 0, fav: 0, trash: 0, kind: {} as Record<string, number>, group: {} as Record<string, number> };
    for (const e of data?.entries ?? []) {
      if (e.trashed) {
        c.trash++;
        continue;
      }
      c.all++;
      if (e.favorite) c.fav++;
      c.kind[e.kind] = (c.kind[e.kind] ?? 0) + 1;
      if (e.groupId) c.group[e.groupId] = (c.group[e.groupId] ?? 0) + 1;
    }
    return c;
  }, [data]);

  if (!data) return null;
  const pick = (f: Filter) => {
    useList.getState().setFilter(f);
    useUi.getState().set({ view: 'items' });
  };
  const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name));

  const groupMenu = (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    useMenu.getState().show(e.clientX, e.clientY, [
      {
        label: 'New item here…',
        icon: Plus,
        run: () => {
          pick({ kind: 'group', id });
          newEntry();
        },
      },
      {
        label: 'Rename…',
        icon: Pencil,
        run: async () => {
          const v = (await useUi.getState().askText({ title: 'Rename group', label: 'Name', value: name, confirmLabel: 'Rename' }))?.trim();
          if (v) useVault.getState().renameGroup(id, v);
        },
      },
      'separator',
      {
        label: 'Delete group',
        icon: Trash2,
        danger: true,
        run: async () => {
          const r = await useUi.getState().askConfirm({
            title: 'Delete group',
            message: `Delete the group "${name}"? Its ${counts.group[id] ?? 0} items stay in the vault, without a group.`,
            confirmLabel: 'Delete group',
            danger: true,
          });
          if (!r.ok) return;
          useVault.getState().deleteGroup(id);
          if (same(listFilter, { kind: 'group', id })) pick({ kind: 'all' });
        },
      },
    ]);
  };

  const dropProps = (id: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(ENTRY_DRAG)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(id);
    },
    onDragLeave: () => setDropTarget((t) => (t === id ? null : t)),
    onDrop: (e: React.DragEvent) => {
      setDropTarget(null);
      const ids = (JSON.parse(e.dataTransfer.getData(ENTRY_DRAG) || '[]') as string[]).filter((x) => typeof x === 'string');
      for (const x of ids) useVault.getState().updateEntry(x, { groupId: id });
      const g = data.groups.find((x) => x.id === id);
      if (ids.length) useUi.getState().toast({ level: 'success', text: `Moved ${ids.length === 1 ? 'the item' : `${ids.length} items`} to ${g?.name ?? 'the group'}` });
    },
  });

  return (
    <div className="tree" role="tree" aria-label="Vault">
      <TreeRow depth={0} icon={<Inbox size={16} />} label="All items" count={counts.all} selected={same(filter, { kind: 'all' })} onClick={() => pick({ kind: 'all' })} />
      <TreeRow depth={0} icon={<Star size={16} className="text-warning" />} label="Favorites" count={counts.fav} selected={same(filter, { kind: 'favorites' })} onClick={() => pick({ kind: 'favorites' })} />

      <div className="tree-heading">Types</div>
      {KINDS.map((k) => (
        <TreeRow
          key={k}
          depth={0}
          icon={<KindIcon kind={k} />}
          label={PLURAL[k] ?? KIND_LABEL[k]}
          count={counts.kind[k] ?? 0}
          selected={same(filter, { kind: 'type', id: k })}
          onClick={() => pick({ kind: 'type', id: k })}
        />
      ))}

      <div className="tree-heading">
        <span>Groups</span>
        <button className="icon-btn xs" title="New group" aria-label="New group" onClick={() => void newGroup()}>
          <FolderPlus size={14} />
        </button>
      </div>
      {groups.map((g) => (
        <TreeRow
          key={g.id}
          depth={0}
          icon={<Folder size={16} className="text-accent" />}
          label={g.name}
          count={counts.group[g.id] ?? 0}
          selected={same(filter, { kind: 'group', id: g.id })}
          dropping={dropTarget === g.id}
          onClick={() => pick({ kind: 'group', id: g.id })}
          onContextMenu={(e) => groupMenu(e, g.id, g.name)}
          {...dropProps(g.id)}
        />
      ))}
      {groups.length === 0 && <div className="panel-note">No groups yet. Groups keep work and home apart.</div>}

      <div className="tree-gap" />
      <TreeRow
        depth={0}
        icon={<Trash2 size={16} />}
        label="Trash"
        count={counts.trash || undefined}
        selected={same(filter, { kind: 'trash' })}
        onClick={() => pick({ kind: 'trash' })}
        onContextMenu={(e) => {
          e.preventDefault();
          useMenu.getState().show(e.clientX, e.clientY, [{ label: 'Empty trash', icon: Trash2, danger: true, disabled: counts.trash ? false : 'The trash is empty', run: emptyTrash }]);
        }}
      />
    </div>
  );
}

export function TreeRow(props: {
  depth: number;
  icon: ReactNode;
  label: string;
  count?: number;
  selected: boolean;
  dropping?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      role="treeitem"
      aria-selected={props.selected}
      tabIndex={props.selected ? 0 : -1}
      className={`tree-row${props.selected ? ' selected' : ''}${props.dropping ? ' dropping' : ''}`}
      style={{ paddingLeft: 8 + props.depth * 16 }}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onClick();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const rows = [...(e.currentTarget.closest('.tree')?.querySelectorAll<HTMLElement>('.tree-row') ?? [])];
          const i = rows.indexOf(e.currentTarget);
          const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
          next?.click();
          next?.focus();
        }
      }}
    >
      <span className="tree-icon">{props.icon}</span>
      <span className="tree-label">{props.label}</span>
      {props.count !== undefined && <span className="tree-count">{props.count}</span>}
    </div>
  );
}
