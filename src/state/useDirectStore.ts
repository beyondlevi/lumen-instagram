import {useCallback, useEffect, useRef, useState} from 'react';
import {asBridgeError, type BridgeError, type InstagramApi} from '../api/client';
import type {Message, Thread} from '../api/types';
import type {LoadStatus} from './useReelsStore';
import type {Runner} from './useSession';

export type InboxState = {
  items: Thread[];
  cursor: string | null;
  status: LoadStatus;
  error: BridgeError | null;
  loadingMore: boolean;
};

export type ThreadState = {
  thread: Thread | null;
  /** Oldest first. */
  messages: Message[];
  olderCursor: string | null;
  status: LoadStatus;
  error: BridgeError | null;
};

/** How often the open screen asks the bridge again (the bridge caches briefly too). */
export const INBOX_POLL_MS = 30_000;
export const THREAD_POLL_MS = 6_000;

const EMPTY_INBOX: InboxState = {items: [], cursor: null, status: 'idle', error: null, loadingMore: false};
const EMPTY_THREAD: ThreadState = {thread: null, messages: [], olderCursor: null, status: 'idle', error: null};

export type DirectStore = {
  inbox: InboxState;
  loadInbox(options?: {quiet?: boolean}): void;
  loadMoreThreads(): void;
  threadFor(id: string): Thread | null;
  thread(id: string): ThreadState;
  loadThread(id: string, options?: {quiet?: boolean}): void;
  sendText(threadId: string, text: string): Promise<void>;
  sendVoice(threadId: string, audio: Blob, levels: number[]): Promise<void>;
  /** Adds the reaction, or takes yours back when it is the same emoji. */
  react(threadId: string, message: Message, emoji: string): Promise<'added' | 'removed'>;
  transcriptFor(messageId: string): string | null;
  saveTranscript(messageId: string, text: string): void;
};

/** Keeps the messages sent from the glasses that a reload doesn't list yet. */
function mergeMessages(loaded: Message[], previous: Message[]): Message[] {
  const pending = previous.filter(message => message.pending);
  if (!pending.length) {
    return loaded;
  }
  const newestLoaded = loaded[loaded.length - 1]?.timestamp ?? 0;
  const still = pending.filter(message => (message.timestamp ?? 0) > newestLoaded);
  return [...loaded, ...still];
}

export function useDirectStore(api: InstagramApi | null, run: Runner, viewerId: string | null): DirectStore {
  const [inbox, setInbox] = useState<InboxState>(EMPTY_INBOX);
  const [threads, setThreads] = useState<Record<string, ThreadState>>({});
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const inflight = useRef(new Set<string>());
  const seenRef = useRef(new Map<string, string>());

  useEffect(() => {
    setInbox(EMPTY_INBOX);
    setThreads({});
    setTranscripts({});
    inflight.current.clear();
    seenRef.current.clear();
  }, [api]);

  const loadInbox = useCallback(
    (options: {quiet?: boolean} = {}) => {
      if (inflight.current.has('inbox')) {
        return;
      }
      inflight.current.add('inbox');
      if (!options.quiet) {
        setInbox(previous => ({...previous, status: previous.items.length ? previous.status : 'loading', error: null}));
      }
      run(client => client.inbox())
        .then(
          page =>
            setInbox(previous => {
              // A reload replaces the first page and keeps older pages already loaded.
              const fresh = new Set(page.items.map(item => item.id));
              const older = previous.items.filter(item => !fresh.has(item.id) && previous.cursor !== null);
              return {
                items: [...page.items, ...(previous.cursor ? older : [])],
                cursor: previous.cursor && older.length ? previous.cursor : page.nextCursor,
                status: 'ready',
                error: null,
                loadingMore: false,
              };
            }),
          error => {
            if (!options.quiet || inboxRef.current.status !== 'ready') {
              setInbox(previous => ({...previous, status: 'error', error: asBridgeError(error)}));
            }
          },
        )
        .finally(() => inflight.current.delete('inbox'));
    },
    [run],
  );

  const loadMoreThreads = useCallback(() => {
    const current = inboxRef.current;
    if (current.status !== 'ready' || current.loadingMore || !current.cursor) {
      return;
    }
    setInbox(previous => ({...previous, loadingMore: true}));
    run(client => client.inbox(current.cursor)).then(
      page =>
        setInbox(previous => {
          const known = new Set(previous.items.map(item => item.id));
          return {
            ...previous,
            items: [...previous.items, ...page.items.filter(item => !known.has(item.id))],
            cursor: page.nextCursor,
            loadingMore: false,
          };
        }),
      () => setInbox(previous => ({...previous, loadingMore: false})),
    );
  }, [run]);

  const threadFor = useCallback(
    (id: string) => threadsRef.current[id]?.thread ?? inboxRef.current.items.find(item => item.id === id) ?? null,
    // Re-created when either store changes so screens re-render with fresh data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inbox, threads],
  );

  const threadState = useCallback((id: string) => threads[id] ?? EMPTY_THREAD, [threads]);

  /** Marks the conversation read up to its newest message from someone else, once per message. */
  const markRead = useCallback(
    (id: string, messages: Message[], thread: Thread | null) => {
      const newest = [...messages].reverse().find(message => !message.fromMe && !message.pending);
      if (!newest || seenRef.current.get(id) === newest.id || (thread && !thread.unread && seenRef.current.has(id))) {
        return;
      }
      seenRef.current.set(id, newest.id);
      if (thread && !thread.unread) {
        return;
      }
      run(client => client.markSeen(id, newest.id)).catch(() => seenRef.current.delete(id));
      setInbox(previous => ({...previous, items: previous.items.map(item => (item.id === id ? {...item, unread: false} : item))}));
    },
    [run],
  );

  const loadThread = useCallback(
    (id: string, options: {quiet?: boolean} = {}) => {
      const key = `thread:${id}`;
      if (inflight.current.has(key)) {
        return;
      }
      inflight.current.add(key);
      if (!options.quiet) {
        setThreads(previous => {
          const current = previous[id] ?? EMPTY_THREAD;
          return {...previous, [id]: {...current, status: current.messages.length ? current.status : 'loading', error: null}};
        });
      }
      run(client => client.thread(id))
        .then(
          page => {
            setThreads(previous => {
              const current = previous[id] ?? EMPTY_THREAD;
              return {
                ...previous,
                [id]: {
                  thread: page.thread ?? current.thread,
                  messages: mergeMessages(page.messages, current.messages),
                  olderCursor: page.olderCursor,
                  status: 'ready',
                  error: null,
                },
              };
            });
            if (page.thread) {
              setInbox(previous => ({
                ...previous,
                items: previous.items.map(item => (item.id === id ? {...page.thread!, unread: item.unread && page.thread!.unread} : item)),
              }));
            }
            markRead(id, page.messages, page.thread);
          },
          error => {
            setThreads(previous => {
              const current = previous[id] ?? EMPTY_THREAD;
              if (options.quiet && current.status === 'ready') {
                return previous;
              }
              return {...previous, [id]: {...current, status: 'error', error: asBridgeError(error)}};
            });
          },
        )
        .finally(() => inflight.current.delete(key));
    },
    [markRead, run],
  );

  const appendPending = useCallback(
    (threadId: string, fields: Partial<Message>) => {
      const message: Message = {
        id: `pending-${Date.now()}`,
        senderId: viewerId,
        senderName: null,
        fromMe: true,
        timestamp: Date.now(),
        kind: 'text',
        text: '',
        reactions: [],
        replyTo: null,
        pending: true,
        ...fields,
      };
      setThreads(previous => {
        const current = previous[threadId] ?? EMPTY_THREAD;
        return {...previous, [threadId]: {...current, messages: [...current.messages, message]}};
      });
      setInbox(previous => ({
        ...previous,
        items: previous.items.map(item => (item.id === threadId ? {...item, lastMessage: message, lastActivityAt: message.timestamp} : item)),
      }));
    },
    [viewerId],
  );

  const sendText = useCallback(
    async (threadId: string, text: string) => {
      await run(client => client.sendText(threadId, text));
      appendPending(threadId, {kind: 'text', text});
      loadThread(threadId, {quiet: true});
    },
    [appendPending, loadThread, run],
  );

  const sendVoice = useCallback(
    async (threadId: string, audio: Blob, levels: number[]) => {
      await run(client => client.sendVoice(threadId, audio, levels));
      appendPending(threadId, {kind: 'voice', voice: {audioUrl: URL.createObjectURL(audio), audioProxyUrl: null, durationSec: null}});
      loadThread(threadId, {quiet: true});
    },
    [appendPending, loadThread, run],
  );

  const react = useCallback(
    async (threadId: string, message: Message, emoji: string) => {
      const mine = message.reactions.find(reaction => reaction.mine);
      const remove = mine?.emoji === emoji;
      const update = (reactions: Message['reactions']) =>
        setThreads(previous => {
          const current = previous[threadId];
          if (!current) {
            return previous;
          }
          return {
            ...previous,
            [threadId]: {...current, messages: current.messages.map(item => (item.id === message.id ? {...item, reactions} : item))},
          };
        });
      const others = message.reactions
        .map(reaction => (reaction.mine ? {...reaction, count: reaction.count - 1, mine: false} : reaction))
        .filter(reaction => reaction.count > 0);
      const withMine = remove
        ? others
        : (() => {
            const existing = others.find(reaction => reaction.emoji === emoji);
            return existing
              ? others.map(reaction => (reaction.emoji === emoji ? {...reaction, count: reaction.count + 1, mine: true} : reaction))
              : [...others, {emoji, count: 1, mine: true}];
          })();
      update(withMine);
      try {
        await run(client => client.react(threadId, message.id, emoji, remove));
      } catch (error) {
        update(message.reactions);
        throw error;
      }
      return remove ? 'removed' : 'added';
    },
    [run],
  );

  const transcriptFor = useCallback((messageId: string) => transcripts[messageId] ?? null, [transcripts]);
  const saveTranscript = useCallback((messageId: string, text: string) => {
    setTranscripts(previous => ({...previous, [messageId]: text}));
  }, []);

  return {
    inbox,
    loadInbox,
    loadMoreThreads,
    threadFor,
    thread: threadState,
    loadThread,
    sendText,
    sendVoice,
    react,
    transcriptFor,
    saveTranscript,
  };
}
