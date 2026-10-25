import { ArrowUpToLine, ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Inbox, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { emptyTrash, newEntry, newGroup } from '../../app/actions';
import { useList, type Filter } from '../../store/list';
import { useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import { groupTree, KIND_LABEL, KINDS } from '../../vault/model';
import { useMenu } from '../common/Menu';
import { KindIcon } from '../common/visuals';

export const ENTRY_DRAG = 'application/x-kipas-entries';
const GROUP_DRAG = 'application/x-kipas-group';
const COLLAPSED_KEY = 'kipas.collapsedGroups';

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

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
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      /* private mode */
    }
  };

  const counts = useMemo(() => {
    const c = { all: 0, fav: 0, trash: 0, kind: {} as Record<string, number>, group: {} as Record<string, number> };
    const byId = new Map((data?.groups ?? []).map((g) => [g.id, g]));
    for (const e of data?.entries ?? []) {
      if (e.trashed) {
        c.trash++;
        continue;
      }
      c.all++;
      if (e.favorite) c.fav++;
      c.kind[e.kind] = (c.kind[e.kind] ?? 0) + 1;
      // A group counts its own items and its subgroups' (which is what selecting it shows).
      for (let g = e.groupId ? byId.get(e.groupId) : undefined, n = 0; g && n < 64; g = g.parentId ? byId.get(g.parentId) : undefined, n++) c.group[g.id] = (c.group[g.id] ?? 0) + 1;
    }
    return c;
  }, [data]);

  if (!data) return null;
  const pick = (f: Filter) => {
    useList.getState().setFilter(f);
    useUi.getState().set({ view: 'items' });
  };
  const tree = groupTree(data.groups);
  const hasKids = new Set(data.groups.map((g) => g.parentId).filter((p): p is string => !!p));
  // Rows under a collapsed group are hidden.
  const visible: typeof tree = [];
  let hideBelow = Infinity;
  for (const row of tree) {
    if (row.depth > hideBelow) continue;
    hideBelow = collapsed.has(row.group.id) ? row.depth : Infinity;
    visible.push(row);
  }
  const moveGroup = (id: string, parentId: string | null) => {
    if (!useVault.getState().moveGroup(id, parentId)) useUi.getState().toast({ level: 'warning', text: 'A group cannot go inside itself or one of its subgroups' });
    else if (parentId && collapsed.has(parentId)) toggle(parentId);
  };

  const groupMenu = (e: React.MouseEvent, id: string, name: string, parentId: string | null) => {
    e.preventDefault();
    useMenu.getState().show(e.clientX, e.clientY, [
      {
        label: 'New subgroup…',
        icon: FolderPlus,
        run: async () => {
          if ((await newGroup(id)) && collapsed.has(id)) toggle(id);
        },
      },
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
      ...(parentId ? [{ label: 'Move to the top level', icon: ArrowUpToLine, run: () => moveGroup(id, null) }] : []),
      'separator',
      {
        label: 'Delete group',
        icon: Trash2,
        danger: true,
        run: async () => {
          const r = await useUi.getState().askConfirm({
            title: 'Delete group',
            message: `Delete the group "${name}"? Its items (${counts.group[id] ?? 0}) and subgroups stay in the vault, moved up one level.`,
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

  // Drop items on a group to file them there; drop a group on a group to nest it (on the Groups heading: top level).
  const dropProps = (id: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      const isGroup = e.dataTransfer.types.includes(GROUP_DRAG);
      if (!isGroup && (!e.dataTransfer.types.includes(ENTRY_DRAG) || id === null)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(id ?? 'top');
    },
    onDragLeave: () => setDropTarget((t) => (t === (id ?? 'top') ? null : t)),
    onDrop: (e: React.DragEvent) => {
      setDropTarget(null);
      const dragged = e.dataTransfer.getData(GROUP_DRAG);
      if (dragged) {
        e.preventDefault();
        if (dragged !== id) moveGroup(dragged, id);
        return;
      }
      if (id === null) return;
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

      <div className={`tree-heading${dropTarget === 'top' ? ' dropping' : ''}`} {...dropProps(null)}>
        <span>Groups</span>
        <button className="icon-btn xs" title="New group" aria-label="New group" onClick={() => void newGroup()}>
          <FolderPlus size={14} />
        </button>
      </div>
      {visible.map(({ group: g, depth }) => {
        const kids = hasKids.has(g.id);
        const open = !collapsed.has(g.id);
        return (
          <TreeRow
            key={g.id}
            depth={depth}
            icon={kids && open ? <FolderOpen size={16} className="text-accent" /> : <Folder size={16} className="text-accent" />}
            label={g.name}
            count={counts.group[g.id] ?? 0}
            selected={same(filter, { kind: 'group', id: g.id })}
            dropping={dropTarget === g.id}
            twisty={
              kids ? (
                <button className="tree-twisty" aria-label={open ? `Collapse ${g.name}` : `Expand ${g.name}`} onClick={(e) => (e.stopPropagation(), toggle(g.id))}>
                  {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : undefined
            }
            expanded={kids ? open : undefined}
            onToggle={kids ? () => toggle(g.id) : undefined}
            onClick={() => pick({ kind: 'group', id: g.id })}
            onContextMenu={(e) => groupMenu(e, g.id, g.name, g.parentId)}
            onDragStart={(e) => {
              e.dataTransfer.setData(GROUP_DRAG, g.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            {...dropProps(g.id)}
          />
        );
      })}
      {tree.length === 0 && <div className="panel-note">No groups yet. Groups keep work and home apart.</div>}

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
  /** The expand/collapse button of a group with subgroups. */
  twisty?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      role="treeitem"
      aria-selected={props.selected}
      aria-expanded={props.expanded}
      draggable={!!props.onDragStart}
      onDragStart={props.onDragStart}
      tabIndex={props.selected ? 0 : -1}
      className={`tree-row${props.selected ? ' selected' : ''}${props.dropping ? ' dropping' : ''}`}
      style={{ paddingLeft: 2 + props.depth * 14 }}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onClick();
        } else if ((e.key === 'ArrowRight' && props.expanded === false) || (e.key === 'ArrowLeft' && props.expanded === true)) {
          e.preventDefault();
          props.onToggle?.();
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
      <span className="tree-twisty-slot">{props.twisty}</span>
      <span className="tree-icon">{props.icon}</span>
      <span className="tree-label">{props.label}</span>
      {props.count !== undefined && <span className="tree-count">{props.count}</span>}
    </div>
  );
}
