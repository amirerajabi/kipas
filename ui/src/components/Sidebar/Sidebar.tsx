import { CircleAlert, ClipboardCheck, LoaderCircle, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { lockVault } from '../../app/actions';
import { autoLockIn } from '../../app/boot';
import { formatCountdown } from '../../lib/format';
import { healthOf } from '../../store/list';
import { DOCK_MAX, DOCK_MIN, useUi } from '../../store/ui';
import { useVault } from '../../store/vault';
import { Splitter } from '../common/Splitter';
import { UpdateChip } from '../common/UpdateChip';
import { VaultPanel } from './VaultPanel';

const AUTO_WIDTH = `clamp(${DOCK_MIN}px, 18vw, 240px)`;

/** The left column: the vault tree, then Health, then what is happening now (saving, clipboard, update, auto-lock). */
export function Sidebar() {
  const visible = useUi((s) => s.sidebarVisible);
  const width = useUi((s) => s.sidebarWidth);
  const ref = useRef<HTMLElement>(null);
  const [start, setStart] = useState(width);
  if (!visible) return null;
  return (
    <>
      <nav ref={ref} className="sidebar" style={{ width: width > 0 ? Math.max(DOCK_MIN, Math.min(DOCK_MAX, width)) : AUTO_WIDTH }} aria-label="Vault">
        <div className="sidebar-scroll">
          <VaultPanel />
        </div>
        <SidebarFooter />
      </nav>
      <Splitter
        direction="vertical"
        ariaLabel="Resize side panel"
        onDragStart={() => setStart(ref.current?.offsetWidth ?? DOCK_MIN)}
        onDrag={(d) => useUi.getState().setLayout({ sidebarWidth: Math.max(DOCK_MIN, Math.min(DOCK_MAX, start + d)) })}
        onDoubleClick={() => useUi.getState().setLayout({ sidebarWidth: 0 })}
      />
    </>
  );
}

function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function SidebarFooter() {
  const data = useVault((s) => s.data);
  const save = useVault((s) => s.save);
  const saveError = useVault((s) => s.saveError);
  const view = useUi((s) => s.view);
  const clipboard = useUi((s) => s.clipboard);
  const now = useNow();
  if (!data) return null;
  const report = healthOf(data.entries);
  const toFix = new Set([...report.weak, ...report.reused]).size;
  const lockIn = autoLockIn(now);

  return (
    <div className="sidebar-footer">
      <button className={`health-link${toFix ? ' warn' : ''}${view === 'health' ? ' active' : ''}`} onClick={() => useUi.getState().set({ view: 'health' })}>
        {toFix ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
        <span className="flex-1">{toFix ? `Health · ${toFix} to fix` : 'Health'}</span>
        <span className="health-link-score">{report.score}</span>
      </button>
      {clipboard && (
        <div className="sidebar-note accent" title="Copied secrets are wiped from the clipboard">
          <ClipboardCheck size={13} />
          <span className="ellipsis">
            {clipboard.label} copied{clipboard.clearsAt ? ` · clears in ${Math.max(0, Math.ceil((clipboard.clearsAt - now) / 1000))}s` : ''}
          </span>
        </div>
      )}
      {save !== 'saved' && (
        <div className={`sidebar-note${save === 'error' ? ' danger' : ''}`} title={saveError ?? undefined}>
          {save === 'saving' ? <LoaderCircle size={13} className="spin" /> : <CircleAlert size={13} />}
          <span className="ellipsis">{save === 'saving' ? 'Saving…' : `Not saved: ${saveError ?? 'unknown error'}`}</span>
        </div>
      )}
      <UpdateChip />
      <div className="sidebar-lock">
        <span className={`muted tabular${lockIn !== null && lockIn < 60_000 ? ' text-warning' : ''}`} title="Locks when you are away; any key or mouse move resets it">
          {lockIn === null ? 'Auto-lock off' : `Locks in ${lockIn < 60_000 ? formatCountdown(lockIn) : `${Math.ceil(lockIn / 60_000)} min`}`}
        </span>
        <button className="pill-btn" title="Lock now (Ctrl+L)" onClick={() => void lockVault()}>
          <Lock size={13} /> Lock
        </button>
      </div>
    </div>
  );
}
