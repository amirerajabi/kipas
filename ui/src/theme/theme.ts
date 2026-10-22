import { useEffect, useState } from 'react';
import { getPlatform } from '../platform';
import { useSettings, type ThemePref } from '../store/settings';

export type EffectiveTheme = 'light' | 'dark';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function resolve(pref: ThemePref): EffectiveTheme {
  return pref === 'system' ? (media().matches ? 'dark' : 'light') : pref;
}

function apply(theme: EffectiveTheme): void {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.dataset.theme = theme;
  const css = getComputedStyle(root);
  // The window's caption buttons (Windows title bar overlay) follow the theme.
  getPlatform().setTheme(theme, { bg: css.getPropertyValue('--bg-app').trim(), fg: css.getPropertyValue('--fg').trim() });
}

/** First paint: settings are already in localStorage, so a dark user never sees a white flash. */
export function applyBootTheme(): void {
  apply(resolve(useSettings.getState().settings.theme));
}

/** Follows settings.theme and, for 'system', the OS appearance live. */
export function useTheme(): EffectiveTheme {
  const pref = useSettings((s) => s.settings.theme);
  const [theme, setTheme] = useState<EffectiveTheme>(() => (document.documentElement.dataset.theme as EffectiveTheme) ?? 'light');
  useEffect(() => {
    const update = () => {
      const t = resolve(pref);
      apply(t);
      setTheme(t);
    };
    update();
    const mq = media();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [pref]);
  return theme;
}
