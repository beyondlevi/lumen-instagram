import microphoneFilled from '@wearables-ui-toolkit/icons/svg/microphone__filled.svg';
import {
  Button,
  ButtonRail,
  InputTextView,
  Page,
  TextStyle,
  TextView,
  Toast,
  VerticalList,
  type ButtonHandle,
  type PageHandle,
} from '@wearables-ui-toolkit/mrbd';
import {useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent} from 'react';
import {Navigate, useLocation, useNavigate, useParams} from 'react-router-dom';
import type {Message} from '../api/types';
import {avatarFallback} from '../components/avatarFallback';
import {MessageBubble} from '../components/MessageBubble';
import {ErrorContent, LoadingContent} from '../components/StateContent';
import {failureReason} from '../failure';
import {endsMessageRun, startsMessageRun, threadName} from '../format';
import {t} from '../i18n/strings';
import {useInstagram} from '../InstagramProvider';
import {photoPath, playPath, recordPath, threadPath, transcriptPath} from '../paths';
import {useAudioPlayer} from '../state/useAudioPlayer';
import {THREAD_POLL_MS} from '../state/useDirectStore';
import {threadAvatar} from './InboxTab';

/**
 * How the conversation was left, read when it shows again: Voice opened the
 * recording screen, or a bubble opened a reel, a photo or a transcript. Any
 * other showing (from the list) is an opening of the conversation.
 */
const returnTo = {voice: false, bubble: false};

export function ThreadPage() {
  const {threadId} = useParams();
  if (!threadId) {
    return <Navigate to="/" replace />;
  }
  return <Thread threadId={threadId} />;
}

/** Header height, measured once laid out and on resize; 0 until known. */
function useHeaderHeight(pageRef: {current: PageHandle | null}): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setHeight(pageRef.current?.getHeaderHeight() ?? 0);
    measure();
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [pageRef]);
  return height;
}

/** Moves the focus from an older bubble of the list to the newest one. */
function focusNewestBubble(list: HTMLElement | null | undefined) {
  const focused = document.activeElement;
  if (list == null || !(focused instanceof HTMLElement) || !list.contains(focused)) {
    return;
  }
  const rows = list.querySelectorAll('.message-row');
  const newest = rows[rows.length - 1]?.querySelector<HTMLElement>('[aria-haspopup="menu"]');
  if (newest != null && !newest.contains(focused)) {
    newest.focus({preventScroll: true});
  }
}

/** Reloads the conversation every THREAD_POLL_MS while it is open and the app is visible. */
function useThreadPolling(threadId: string) {
  const {loadThread} = useInstagram();
  useEffect(() => {
    loadThread(threadId);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadThread(threadId, {quiet: true});
      }
    }, THREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadThread, threadId]);
}

export function isComposerOpen(state: unknown): boolean {
  return state != null && typeof state === 'object' && 'replyComposer' in state && state.replyComposer === true;
}

function Thread({threadId}: {threadId: string}) {
  const {threadFor, thread, loadThread, sendText, react, audio: lumenAudio, transcriptFor} = useInstagram();
  const location = useLocation();
  const navigate = useNavigate();
  const summary = threadFor(threadId);
  const state = thread(threadId);
  const name = threadName(summary);
  const messages = state.messages;
  const isGroup = summary?.isGroup ?? false;
  const picture = summary ? threadAvatar(summary) : undefined;

  useThreadPolling(threadId);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const replyButtonRef = useRef<ButtonHandle>(null);
  const voiceButtonRef = useRef<ButtonHandle>(null);
  const pageRef = useRef<PageHandle>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const headerHeight = useHeaderHeight(pageRef);

  const showAudioError = useCallback((error: unknown) => Toast.show(t('audioFailed', {reason: failureReason(error)})), []);
  const [audio, toggleAudio] = useAudioPlayer(showAudioError);

  const composerOpen = isComposerOpen(location.state);
  const composerWasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (composerWasOpenRef.current && !composerOpen) {
      setDraft('');
      replyButtonRef.current?.getElement()?.focus({preventScroll: true});
    }
    composerWasOpenRef.current = composerOpen;
  }, [composerOpen]);

  const openComposer = useCallback(() => {
    if (!composerOpen) {
      navigate(location.pathname, {state: {replyComposer: true}});
    }
  }, [composerOpen, location.pathname, navigate]);

  const openFromBubble = useCallback(
    (path: string) => {
      returnTo.bubble = true;
      navigate(path);
    },
    [navigate],
  );
  const play = useCallback((message: Message) => openFromBubble(playPath(threadId, message.id)), [openFromBubble, threadId]);
  const view = useCallback((message: Message) => openFromBubble(photoPath(threadId, message.id)), [openFromBubble, threadId]);
  const transcribe = useCallback((message: Message) => openFromBubble(transcriptPath(threadId, message.id)), [openFromBubble, threadId]);
  const record = useCallback(() => {
    returnTo.voice = true;
    navigate(recordPath(threadId));
  }, [navigate, threadId]);

  // Each time the conversation shows (not the reply composer):
  // - back from the recording screen: focus Voice, with the sent note in view;
  // - back from a reel, a photo or a transcript: keep the restored bubble;
  // - opened from the list: show the newest message.
  useEffect(() => {
    if (composerOpen || location.pathname !== threadPath(threadId)) {
      return;
    }
    const fromVoice = returnTo.voice;
    const fromBubble = returnTo.bubble;
    returnTo.voice = false;
    returnTo.bubble = false;
    if (fromBubble && !fromVoice) {
      return;
    }
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        if (fromVoice) {
          voiceButtonRef.current?.getElement()?.focus({preventScroll: true});
        } else {
          focusNewestBubble(endRef.current?.parentElement);
        }
        endRef.current?.scrollIntoView({block: 'end'});
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [composerOpen, location.key, location.pathname, threadId]);

  const reactTo = useCallback(
    (message: Message, emoji: string) => {
      react(threadId, message, emoji)
        .then(result => Toast.show(result === 'added' ? t('reactionSent', {emoji}) : t('reactionRemoved')))
        .catch(error => Toast.show(t('reactionFailed', {reason: failureReason(error)})));
    },
    [react, threadId],
  );

  // Reveal the newest message on entry, after sending, and when a new one
  // arrives while the end of the conversation is on screen.
  const lastMessageId = messages.length ? messages[messages.length - 1].id : null;
  const lastMessageFromMe = messages.length ? messages[messages.length - 1].fromMe : false;
  const endVisibleRef = useRef(true);
  const revealedRef = useRef(false);
  useEffect(() => {
    const end = endRef.current;
    if (end == null || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(entries => {
      endVisibleRef.current = entries.some(entry => entry.isIntersecting);
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, [state.status]);
  useLayoutEffect(() => {
    if (lastMessageId == null) {
      return;
    }
    if (!revealedRef.current || endVisibleRef.current || lastMessageFromMe) {
      endRef.current?.scrollIntoView({block: 'end'});
      revealedRef.current = true;
    }
  }, [lastMessageId, lastMessageFromMe]);

  const handleSend = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!body || sending) {
        return;
      }
      setSending(true);
      sendText(threadId, body)
        .then(() => {
          Toast.show(t('messageSent'));
          // Closing the composer entry clears the draft and refocuses Reply.
          navigate(-1);
        })
        .catch(error => Toast.show(t('sendFailed', {reason: failureReason(error)})))
        .finally(() => setSending(false));
    },
    [navigate, sendText, sending, threadId],
  );

  // The host hands focus to the document root while its own text entry (the
  // dictation composer) is open. Reclaim only that handoff so the reply field
  // keeps focus when the dictated text arrives.
  const handleDraftBlur = useCallback((event: FocusEvent<HTMLTextAreaElement>) => {
    const input = event.currentTarget;
    window.requestAnimationFrame(() => {
      const focused = document.activeElement;
      const focusLeftTheDocument = focused == null || focused === document.body || focused === document.documentElement;
      if (input.isConnected && focusLeftTheDocument) {
        input.focus({preventScroll: true});
      }
    });
  }, []);

  const header = {
    headerText: name,
    headerShowAvatar: true,
    headerAvatarSrc: picture,
    headerAvatarPrimaryContent: picture ? undefined : avatarFallback(name, isGroup),
    headerAvatarAlt: name,
    enableSystemBarInset: false,
  };

  if (state.status === 'error' && messages.length === 0) {
    return (
      <Page {...header}>
        <ErrorContent error={state.error} onRetry={() => loadThread(threadId)} />
      </Page>
    );
  }
  if (state.status !== 'ready' && messages.length === 0) {
    return (
      <Page {...header} headerIsLoading>
        <LoadingContent />
      </Page>
    );
  }

  return (
    <Page ref={pageRef} {...header}>
      <div
        className={headerHeight > 0 ? 'thread-shell thread-shell--below-header' : 'thread-shell'}
        style={headerHeight > 0 ? ({'--thread-header-height': `${headerHeight}px`} as CSSProperties) : undefined}>
        <VerticalList insetForHeader={headerHeight === 0} contentClassName="message-list" ariaLabel={t('threadLabel', {name})}>
          {messages.length === 0 ? (
            <div className="thread-status" role="status">
              <TextView as="p" textStyle={TextStyle.BODY2_EMPHASIZED}>
                {t('threadEmptyTitle')}
              </TextView>
              <TextView as="p" textStyle={TextStyle.BODY2}>
                {t('threadEmptyBody')}
              </TextView>
            </div>
          ) : null}
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              showSender={isGroup && !message.fromMe && startsMessageRun(messages, index)}
              endsRun={endsMessageRun(messages, index)}
              initialFocusEligible={!composerOpen && index === messages.length - 1}
              audio={audio.id === message.id ? audio : undefined}
              onReact={reactTo}
              onReply={openComposer}
              onPlay={play}
              onView={view}
              onTranscribe={transcribe}
              transcribeAvailable={lumenAudio != null}
              transcript={message.kind === 'voice' ? transcriptFor(message.id) : null}
              onToggleAudio={toggleAudio}
            />
          ))}
          <div className="message-end" ref={endRef} />
        </VerticalList>
        <div className="action-dock">
          {composerOpen ? (
            <div className="draft-input">
              <InputTextView
                text={draft}
                hint={t('replyHint')}
                actionLabel={t('sendLabelButton')}
                loadingLabel={t('sendingLabel')}
                showLoader={sending}
                onTextChange={setDraft}
                onSend={handleSend}
                inputProps={{
                  'aria-label': t('replyFieldLabel', {name}),
                  autoFocus: true,
                  onBlur: handleDraftBlur,
                  readOnly: sending,
                }}
              />
            </div>
          ) : (
            <ButtonRail centerContentWhenSmallerThanWidth={false}>
              <Button ref={replyButtonRef} title={t('replyAction')} initialFocusEligible={messages.length === 0} onClick={openComposer} />
              <Button
                ref={voiceButtonRef}
                title={t('voiceAction')}
                icon={microphoneFilled}
                disabled={lumenAudio == null}
                initialFocusEligible={false}
                onClick={record}
              />
            </ButtonRail>
          )}
        </div>
      </div>
    </Page>
  );
}
