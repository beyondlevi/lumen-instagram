import {createContext, useContext, useMemo, useState, type ReactNode} from 'react';
import type {User} from './api/types';
import {hostAudio, type LumenAudio} from './audio/lumenAudio';
import {demoAudio} from './audio/demoAudio';
import {useDirectStore, type DirectStore} from './state/useDirectStore';
import {useReelsStore, type ReelsStore} from './state/useReelsStore';
import {useSession, type Phase} from './state/useSession';

export type {Phase} from './state/useSession';

/** The two sections of the home pager. */
export const TAB_REELS = 0;
export const TAB_DIRECT = 1;

type InstagramContextValue = ReelsStore &
  DirectStore & {
    phase: Phase;
    me: User | null;
    demo: boolean;
    /** The glasses' microphone and dictation (window.lumen.audio), or the demo's; null without one. */
    audio: LumenAudio | null;
    /** The home pager's section, kept here so it survives opening a screen and coming back. */
    tab: number;
    setTab(index: number): void;
    retry(): void;
    reloadConfig(): Promise<void>;
  };

const InstagramContext = createContext<InstagramContextValue | null>(null);

/** One store for the app, mounted outside the page transitions so every route sees the same state. */
export function InstagramProvider({children}: {children: ReactNode}) {
  const session = useSession();
  const reels = useReelsStore(session.api, session.run);
  const direct = useDirectStore(session.api, session.run, session.me?.id ?? null);
  const [tab, setTab] = useState(TAB_REELS);
  const audio = useMemo(() => hostAudio() ?? (session.demo ? demoAudio() : null), [session.demo]);

  const value = useMemo<InstagramContextValue>(
    () => ({
      ...reels,
      ...direct,
      phase: session.phase,
      me: session.me,
      demo: session.demo,
      audio,
      tab,
      setTab,
      retry: session.retry,
      reloadConfig: session.reloadConfig,
    }),
    [audio, direct, reels, session.demo, session.me, session.phase, session.reloadConfig, session.retry, tab],
  );
  return <InstagramContext.Provider value={value}>{children}</InstagramContext.Provider>;
}

export function useInstagram(): InstagramContextValue {
  const value = useContext(InstagramContext);
  if (!value) {
    throw new Error('useInstagram must be used inside InstagramProvider');
  }
  return value;
}
