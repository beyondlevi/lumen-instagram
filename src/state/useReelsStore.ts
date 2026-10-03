import {Toast} from '@wearables-ui-toolkit/mrbd';
import {useCallback, useEffect, useRef, useState} from 'react';
import {asBridgeError, type BridgeError, type InstagramApi} from '../api/client';
import type {Comment, Reel} from '../api/types';
import {failureReason} from '../failure';
import {t} from '../i18n/strings';
import type {Runner} from './useSession';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ReelsFeed = {
  items: Reel[];
  cursor: string | null;
  status: LoadStatus;
  error: BridgeError | null;
  loadingMore: boolean;
  /** Instagram said there is nothing after the last page. */
  ended: boolean;
};

export type CommentsState = {
  items: Comment[];
  cursor: string | null;
  status: LoadStatus;
  error: BridgeError | null;
  count: number | null;
  disabled: boolean;
};

export type SharedReelState = {status: LoadStatus; reel: Reel | null; error: BridgeError | null};

/** Reels marked as watched are sent in batches of this many (or when the feed closes). */
const SEEN_BATCH = 5;
const MUTED_KEY = 'lumen-instagram.muted';

const EMPTY_FEED: ReelsFeed = {items: [], cursor: null, status: 'idle', error: null, loadingMore: false, ended: false};
const EMPTY_COMMENTS: CommentsState = {items: [], cursor: null, status: 'idle', error: null, count: null, disabled: false};

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export type ReelsStore = {
  feed: ReelsFeed;
  loadReels(options?: {refresh?: boolean}): void;
  loadMoreReels(): void;
  /** The reel the feed shows, kept so coming back from a reel's screens lands on it. */
  reelIndex: number;
  setReelIndex(index: number): void;
  /** A reel by id, from the feed or a shared reel. */
  reelFor(id: string): Reel | null;
  toggleLike(reel: Reel): void;
  toggleSave(reel: Reel): void;
  markWatched(reel: Reel): void;
  muted: boolean;
  setMuted(muted: boolean): void;
  /** Where each reel was left, in seconds. */
  positions: Map<string, number>;
  comments(id: string): CommentsState;
  loadComments(id: string, options?: {more?: boolean}): void;
  sharedReel(code: string): SharedReelState;
  loadSharedReel(code: string): void;
  shareReel(reel: Reel, threadId: string, name: string): Promise<boolean>;
};

export function useReelsStore(api: InstagramApi | null, run: Runner): ReelsStore {
  const [feed, setFeed] = useState<ReelsFeed>(EMPTY_FEED);
  const [reelIndex, setReelIndex] = useState(0);
  const [comments, setComments] = useState<Record<string, CommentsState>>({});
  const [shared, setShared] = useState<Record<string, SharedReelState>>({});
  const [muted, setMutedState] = useState(readMuted);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  const seenRef = useRef<{pending: Set<string>; sent: Set<string>}>({pending: new Set(), sent: new Set()});
  const positions = useRef(new Map<string, number>()).current;

  const flushSeen = useCallback(() => {
    const ids = [...seenRef.current.pending];
    if (!ids.length) {
      return;
    }
    seenRef.current.pending.clear();
    ids.forEach(id => seenRef.current.sent.add(id));
    run(client => client.markReelsSeen(ids)).catch(() => undefined);
  }, [run]);

  // A new bridge or demo: everything starts over.
  useEffect(() => {
    setFeed(EMPTY_FEED);
    setReelIndex(0);
    setComments({});
    setShared({});
    positions.clear();
    seenRef.current = {pending: new Set(), sent: new Set()};
    return () => flushSeen();
  }, [api, flushSeen, positions]);

  const loadReels = useCallback(
    (options: {refresh?: boolean} = {}) => {
      const current = feedRef.current;
      if (current.status === 'loading' || (current.status === 'ready' && !options.refresh)) {
        return;
      }
      setFeed(previous => ({...previous, status: 'loading', error: null}));
      run(client => client.reels()).then(
        page => {
          setFeed({items: page.items, cursor: page.nextCursor, status: 'ready', error: null, loadingMore: false, ended: page.nextCursor == null});
          setReelIndex(0);
        },
        error => setFeed(previous => ({...previous, status: 'error', error: asBridgeError(error)})),
      );
    },
    [run],
  );

  const loadMoreReels = useCallback(() => {
    const current = feedRef.current;
    if (current.status !== 'ready' || current.loadingMore || current.ended || !current.cursor) {
      return;
    }
    setFeed(previous => ({...previous, loadingMore: true}));
    run(client => client.reels(current.cursor)).then(
      page => {
        setFeed(previous => {
          const known = new Set(previous.items.map(item => item.id));
          const fresh = page.items.filter(item => !known.has(item.id));
          return {...previous, items: [...previous.items, ...fresh], cursor: page.nextCursor, loadingMore: false, ended: page.nextCursor == null};
        });
      },
      () => setFeed(previous => ({...previous, loadingMore: false})),
    );
  }, [run]);

  const patchReel = useCallback((id: string, patch: Partial<Reel>) => {
    setFeed(previous => ({...previous, items: previous.items.map(item => (item.id === id ? {...item, ...patch} : item))}));
    setShared(previous => {
      const next = {...previous};
      for (const [code, entry] of Object.entries(previous)) {
        if (entry.reel?.id === id) {
          next[code] = {...entry, reel: {...entry.reel, ...patch}};
        }
      }
      return next;
    });
  }, []);

  const reelFor = useCallback((id: string): Reel | null => {
    const inFeed = feedRef.current.items.find(item => item.id === id);
    if (inFeed) {
      return inFeed;
    }
    return Object.values(sharedRef.current).find(entry => entry.reel?.id === id)?.reel ?? null;
  }, []);

  const toggleLike = useCallback(
    (reel: Reel) => {
      const liked = !reel.liked;
      const likeCount = reel.likeCount == null ? null : Math.max(0, reel.likeCount + (liked ? 1 : -1));
      patchReel(reel.id, {liked, likeCount});
      run(client => client.setLiked(reel.id, liked)).then(
        () => Toast.show(liked ? t('liked') : t('unliked')),
        error => {
          patchReel(reel.id, {liked: reel.liked, likeCount: reel.likeCount});
          Toast.show(t('likeFailed', {reason: failureReason(error)}));
        },
      );
    },
    [patchReel, run],
  );

  const toggleSave = useCallback(
    (reel: Reel) => {
      const saved = !reel.saved;
      patchReel(reel.id, {saved});
      run(client => client.setSaved(reel.id, saved)).then(
        () => Toast.show(saved ? t('saved') : t('unsaved')),
        error => {
          patchReel(reel.id, {saved: reel.saved});
          Toast.show(t('saveFailed', {reason: failureReason(error)}));
        },
      );
    },
    [patchReel, run],
  );

  const markWatched = useCallback(
    (reel: Reel) => {
      const seen = seenRef.current;
      if (seen.sent.has(reel.id) || seen.pending.has(reel.id)) {
        return;
      }
      seen.pending.add(reel.id);
      if (seen.pending.size >= SEEN_BATCH) {
        flushSeen();
      }
    },
    [flushSeen],
  );

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    try {
      localStorage.setItem(MUTED_KEY, next ? '1' : '0');
    } catch {
      // Not remembered: sound comes back on next time.
    }
  }, []);

  const commentsFor = useCallback((id: string) => comments[id] ?? EMPTY_COMMENTS, [comments]);

  const loadComments = useCallback(
    (id: string, options: {more?: boolean} = {}) => {
      const current = commentsRef.current[id] ?? EMPTY_COMMENTS;
      if (current.status === 'loading' || (options.more ? !current.cursor : current.status === 'ready')) {
        return;
      }
      const cursor = options.more ? current.cursor : null;
      setComments(previous => ({...previous, [id]: {...current, status: 'loading', error: null}}));
      run(client => client.comments(id, cursor)).then(
        page =>
          setComments(previous => {
            const before = options.more ? (previous[id]?.items ?? []) : [];
            const known = new Set(before.map(item => item.id));
            return {
              ...previous,
              [id]: {
                items: [...before, ...page.items.filter(item => !known.has(item.id))],
                cursor: page.nextCursor,
                status: 'ready',
                error: null,
                count: page.commentCount,
                disabled: page.commentsDisabled,
              },
            };
          }),
        error => setComments(previous => ({...previous, [id]: {...current, status: 'error', error: asBridgeError(error)}})),
      );
    },
    [run],
  );

  const sharedReel = useCallback((code: string) => shared[code] ?? {status: 'idle' as const, reel: null, error: null}, [shared]);

  const loadSharedReel = useCallback(
    (code: string) => {
      const current = sharedRef.current[code];
      if (current?.status === 'loading' || current?.status === 'ready') {
        return;
      }
      const inFeed = feedRef.current.items.find(item => item.code === code);
      if (inFeed) {
        setShared(previous => ({...previous, [code]: {status: 'ready', reel: inFeed, error: null}}));
        return;
      }
      setShared(previous => ({...previous, [code]: {status: 'loading', reel: null, error: null}}));
      run(client => client.reelByCode(code)).then(
        reel => setShared(previous => ({...previous, [code]: {status: 'ready', reel, error: null}})),
        error => setShared(previous => ({...previous, [code]: {status: 'error', reel: null, error: asBridgeError(error)}})),
      );
    },
    [run],
  );

  const shareReel = useCallback(
    async (reel: Reel, threadId: string, name: string) => {
      try {
        await run(client => client.shareReel(reel.id, [threadId]));
        Toast.show(t('sentTo', {name}));
        return true;
      } catch (error) {
        Toast.show(t('shareFailed', {reason: failureReason(error)}));
        return false;
      }
    },
    [run],
  );

  return {
    feed,
    loadReels,
    loadMoreReels,
    reelIndex,
    setReelIndex,
    reelFor,
    toggleLike,
    toggleSave,
    markWatched,
    muted,
    setMuted,
    positions,
    comments: commentsFor,
    loadComments,
    sharedReel,
    loadSharedReel,
    shareReel,
  };
}
