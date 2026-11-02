import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isLanguage, type Language } from '../i18n/locale.ts';

export type ModePreference = 'light' | 'dark' | 'system';

interface Preferences {
  mode: ModePreference;
  resolvedMode: 'light' | 'dark';
  language: Language | null;
  navCollapsed: boolean;
  setMode(mode: ModePreference): void;
  setLanguage(language: Language): void;
  setNavCollapsed(collapsed: boolean): void;
}

const Ctx = createContext<Preferences | null>(null);

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(`tenuro.${key}`);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(`tenuro.${key}`, value);
  } catch {
    // Storage can be unavailable (private windows); preferences then last for the visit.
  }
};

function systemMode(): 'light' | 'dark' {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ModePreference>(() => {
    const v = read('mode');
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  });
  const [language, setLanguageState] = useState<Language | null>(() => {
    const v = read('language');
    return isLanguage(v) ? v : null;
  });
  const [navCollapsed, setNavCollapsedState] = useState(() => read('navCollapsed') === '1');
  const [system, setSystem] = useState(systemMode);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setMode = useCallback((m: ModePreference) => { setModeState(m); write('mode', m); }, []);
  const setLanguage = useCallback((l: Language) => { setLanguageState(l); write('language', l); }, []);
  const setNavCollapsed = useCallback((c: boolean) => { setNavCollapsedState(c); write('navCollapsed', c ? '1' : '0'); }, []);

  const value = useMemo<Preferences>(() => ({
    mode, resolvedMode: mode === 'system' ? system : mode, language, navCollapsed, setMode, setLanguage, setNavCollapsed,
  }), [mode, system, language, navCollapsed, setMode, setLanguage, setNavCollapsed]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences(): Preferences {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePreferences outside PreferencesProvider');
  return ctx;
}
