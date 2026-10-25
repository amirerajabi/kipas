import { CornerDownLeft, Lock, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuickAction, QuickAnswer, QuickResult } from '../../../shared/protocol';
import { Avatar } from '../components/common/visuals';
import { getPlatform } from '../platform';
import { useTheme } from '../theme/theme';

/**
 * The quick-access window (#quick): type, pick, copy, gone. It holds no vault data beyond the rows it shows; the main
 * window does the copying. Enter copies the password, Ctrl+B the user name, Ctrl+T the one-time code, Ctrl+U opens
 * the site, Ctrl+V auto-types into the app underneath, Esc closes.
 */
export function QuickApp() {
  useTheme();
  const platform = getPlatform();
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<QuickAnswer | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const asked = useRef(0);

  const search = useCallback(
    (q: string) => {
      const n = ++asked.current;
      void platform.quickSearch(q).then((a) => {
        // Answers can arrive out of order while typing; keep only the newest.
        if (n === asked.current) {
          setAnswer(a);
          setActive(0);
        }
      });
    },
    [platform],
  );

  useEffect(() => search(query), [query, search]);
  useEffect(
    () =>
      platform.onQuickShown(() => {
        setQuery('');
        search('');
        input.current?.focus();
      }),
    [platform, search],
  );

  const results: QuickResult[] = answer && !answer.locked ? answer.results : [];
  const act = (r: QuickResult | undefined, action: QuickAction) => {
    if (!r) return;
    if (action === 'password' && !r.hasPassword) action = r.hasUsername ? 'username' : r.hasTotp ? 'totp' : 'open';
    void platform.quickAct(r.id, action);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') platform.quickHide();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (answer?.locked) platform.quickShowMain();
      else act(results[active], 'password');
    } else if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      act(results[active], 'username');
    } else if (mod && e.key.toLowerCase() === 't') {
      e.preventDefault();
      act(results[active], 'totp');
    } else if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      act(results[active], 'autotype');
    } else if (mod && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      act(results[active], 'open');
    }
  };

  const current = results[active];
  return (
    <div className="quick" onKeyDown={onKeyDown}>
      <label className="quick-search">
        <Search size={18} />
        <input ref={input} autoFocus value={query} placeholder="Find a password" aria-label="Search the vault" spellCheck={false} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
        {answer && !answer.locked && <span className="quick-vault ellipsis">{answer.vaultName}</span>}
      </label>
      {answer?.locked ? (
        <div className="quick-locked">
          <Lock size={26} />
          <strong>Kipas is locked</strong>
          <span className="muted">Unlock it once and quick access works until it locks again.</span>
          <button className="btn btn-primary" onClick={() => platform.quickShowMain()}>
            Open Kipas
          </button>
        </div>
      ) : (
        <div className="quick-list" role="listbox" aria-label="Items">
          {answer && results.length === 0 && <div className="quick-empty muted">Nothing matches “{query}”.</div>}
          {results.map((r, i) => (
            <div
              key={r.id}
              role="option"
              aria-selected={i === active}
              className={`quick-row${i === active ? ' active' : ''}`}
              onMouseMove={() => setActive(i)}
              onClick={() => act(r, 'password')}
            >
              <Avatar entry={{ title: r.title, url: r.host, kind: r.kind }} size={30} />
              <span className="quick-text">
                <strong className="ellipsis">{r.title}</strong>
                <span className="muted ellipsis">{r.subtitle}</span>
              </span>
              {i === active && (
                <span className="quick-hint">
                  <CornerDownLeft size={13} /> {r.hasPassword ? 'Copy password' : r.hasUsername ? 'Copy user name' : r.hasTotp ? 'Copy code' : 'Open'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="quick-footer muted">
        <span>
          <kbd>↵</kbd> password
        </span>
        <span className={current?.hasUsername || current?.hasPassword ? '' : 'off'}>
          <kbd>Ctrl V</kbd> type it
        </span>
        <span className={current?.hasUsername ? '' : 'off'}>
          <kbd>Ctrl B</kbd> user name
        </span>
        <span className={current?.hasTotp ? '' : 'off'}>
          <kbd>Ctrl T</kbd> code
        </span>
        <span className={current?.hasUrl ? '' : 'off'}>
          <kbd>Ctrl U</kbd> open site
        </span>
        <span className="flex-1" />
        <span>
          <kbd>Esc</kbd>
        </span>
      </div>
    </div>
  );
}
