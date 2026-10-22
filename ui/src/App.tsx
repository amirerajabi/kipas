import { useEffect, useRef, useState } from 'react';
import { boot } from './app/boot';
import { installKeyboard } from './app/commands';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { MenuHost } from './components/common/Menu';
import { PromptDialog } from './components/common/PromptDialog';
import { Splitter } from './components/common/Splitter';
import { Toasts } from './components/common/Toasts';
import { DetailsPane } from './components/DetailsPane/DetailsPane';
import { EntryEditor } from './components/EntryEditor/EntryEditor';
import { EntryList } from './components/EntryList/EntryList';
import { GeneratorDialog } from './components/Generator/GeneratorDialog';
import { Dock } from './components/layout/Dock';
import { TopBar } from './components/layout/TopBar';
import { CreateVaultDialog } from './components/LockScreen/CreateVaultDialog';
import { LockScreen } from './components/LockScreen/LockScreen';
import { ChangePasswordDialog } from './components/Settings/ChangePasswordDialog';
import { SettingsDialog } from './components/Settings/SettingsDialog';
import { ShortcutSheet } from './components/Shortcuts/ShortcutSheet';
import { StatusBar } from './components/StatusBar/StatusBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { useUi } from './store/ui';
import { useVault } from './store/vault';
import { useTheme } from './theme/theme';

/** Shell (Grabbit/Rowlit layout): glass top bar, dock | workspace (toolbar, list | details), status bar, overlays. */
export default function App() {
  const theme = useTheme();
  const unlocked = useVault((s) => !!s.data);
  useEffect(() => {
    const stop = boot();
    const keys = installKeyboard();
    return () => {
      stop();
      keys();
    };
  }, []);

  return (
    <div className="app">
      <TopBar theme={theme} />
      {unlocked ? (
        <div className="main">
          <Dock />
          <section className="workspace" aria-label="Items">
            <Toolbar />
            <Workspace />
          </section>
        </div>
      ) : (
        <LockScreen />
      )}
      <StatusBar />
      <MenuHost />
      <CreateVaultDialog />
      <EntryEditor />
      <SettingsDialog />
      <ChangePasswordDialog />
      <GeneratorDialog />
      <CommandPalette />
      <ShortcutSheet />
      <PromptDialog />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}

/** List beside details, with a draggable split; the details width is remembered. */
function Workspace() {
  const visible = useUi((s) => s.detailsVisible);
  const width = useUi((s) => s.detailsWidth);
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(0);
  return (
    <div className="workspace-body" ref={ref}>
      <EntryList />
      {visible && (
        <>
          <Splitter
            direction="vertical"
            ariaLabel="Resize details pane"
            onDragStart={() => setStart((ref.current?.querySelector('.details') as HTMLElement | null)?.offsetWidth ?? 360)}
            onDrag={(d) => {
              const max = (ref.current?.clientWidth ?? 900) - 320;
              useUi.getState().setLayout({ detailsWidth: Math.max(300, Math.min(max, start - d)) });
            }}
            onDoubleClick={() => useUi.getState().setLayout({ detailsWidth: 0 })}
          />
          <div className="details-host" style={{ width: width > 0 ? width : undefined }}>
            <DetailsPane />
          </div>
        </>
      )}
    </div>
  );
}
