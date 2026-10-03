// One Direct bubble; based on the UI Toolkit messaging example (as the Telegram
// app's). Activating a bubble opens its menu: Play for a reel or a video, View
// for a photo, Listen and Transcribe for a voice message, the five reactions,
// Reply. Reactions show as a badge under the bubble's bottom-right corner.

import arrowBigReplyFilled from '@wearables-ui-toolkit/icons/svg/arrowbigreply__filled.svg';
import circlePlayFilled from '@wearables-ui-toolkit/icons/svg/circleplay__filled.svg';
import expandFilled from '@wearables-ui-toolkit/icons/svg/expand__filled.svg';
import filmstripFilled from '@wearables-ui-toolkit/icons/svg/filmstrip__filled.svg';
import mediaPauseFilled from '@wearables-ui-toolkit/icons/svg/mediapause__filled.svg';
import speechBubbleMessageFilled from '@wearables-ui-toolkit/icons/svg/speechbubblemessage__filled.svg';
import {
  ButtonContextMenuItemView,
  Chip,
  ChipStyle,
  Container,
  ContextMenu,
  CornerRadius,
  DismissReason,
  EmojiContextMenuItemView,
  IconImage,
  IndeterminateLoader,
  IndeterminateLoaderSize,
  MaterialLibrary,
  ProgressIndicator,
  ProgressIndicatorSize,
  TailShapeProvider,
  TextColor,
  TextStyle,
  TextView,
  TooltipMode,
  type ButtonHandle,
} from '@wearables-ui-toolkit/mrbd';
import {useLayoutEffect, useMemo, useRef, useState, type MouseEvent} from 'react';
import type {Message, Reaction} from '../api/types';
import {describeMessage, formatBubbleTime, formatDuration, isMarker, snippet} from '../format';
import {t} from '../i18n/strings';
import type {AudioState} from '../state/useAudioPlayer';

/** Instagram's quick reactions, the first five. */
export const REACTIONS = ['❤️', '😂', '😮', '😢', '👍'] as const;

type MessageBubbleProps = {
  message: Message;
  /** Shows the sender name above the first bubble of a run (group chats). */
  showSender: boolean;
  /** Shows the time below the last bubble of a run. */
  endsRun: boolean;
  initialFocusEligible: boolean;
  /** Player state when this is the voice message being played. */
  audio?: AudioState;
  onReact: (message: Message, emoji: string) => void;
  onReply: (message: Message) => void;
  onPlay: (message: Message) => void;
  onView: (message: Message) => void;
  onToggleAudio: (message: Message) => void;
  onTranscribe: (message: Message) => void;
  /** The host can transcribe (window.lumen.audio, or demo mode). */
  transcribeAvailable: boolean;
  /** Transcript made this session, shown under a voice message. */
  transcript?: string | null;
};

const OUTBOUND_TOKEN_NAMES = {
  idleFill: '--uit-color-background-message-outbound',
  gradientStep1: '--uit-color-container-message-outbound-target-step1',
  gradientStep2: '--uit-color-container-message-outbound-target-step2',
  gradientStep3: '--uit-color-container-message-outbound-target-step3',
  gradientStep4: '--uit-color-container-message-outbound-target-step4',
  glowTint: '--uit-color-container-message-outbound-glow',
} as const;

function resolveColorToken(token: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (value.length === 0) {
    throw new Error(`Missing toolkit color token: ${token}`);
  }
  return value;
}

// The bubble exposes the same focus handle shape as a toolkit Button trigger.
type TriggerHandle = Pick<ButtonHandle, 'getElement'>;

function reactionsText(reactions: Reaction[]): string {
  return reactions.map(reaction => `${reaction.emoji} ${reaction.count}`).join(', ');
}

function reactionCount(reactions: Reaction[]): number {
  return reactions.reduce((total, reaction) => total + reaction.count, 0);
}

function audioDescription(message: Message, audio: AudioState | undefined): string {
  const duration = formatDuration(audio?.duration || message.voice?.durationSec || 0);
  const position = formatDuration(audio?.position ?? 0);
  switch (audio?.status) {
    case 'playing':
      return t('audioPlaying', {position, duration});
    case 'paused':
      return t('audioPaused', {position, duration});
    case 'loading':
      return t('audioLoading');
    default:
      return t('audioLabel', {duration});
  }
}

const TRANSCRIPT_PREVIEW_LENGTH = 90;

function AudioContent({message, audio, transcript}: {message: Message; audio?: AudioState; transcript?: string | null}) {
  const status = audio?.status ?? 'idle';
  const duration = audio?.duration || message.voice?.durationSec || 0;
  const position = audio?.position ?? 0;
  const started = status === 'playing' || status === 'paused';
  return (
    <div className="audio-block">
      <div className="audio-content">
        {status === 'loading' ? (
          <IndeterminateLoader size={IndeterminateLoaderSize.SMALL} />
        ) : (
          <IconImage className="audio-icon" source={status === 'playing' ? mediaPauseFilled : circlePlayFilled} />
        )}
        <div className="audio-track">
          <ProgressIndicator
            size={ProgressIndicatorSize.THIN}
            value={started ? position : 0}
            maximumValue={duration || 1}
            isActive={status === 'playing'}
            announceUpdatesForAccessibility={false}
            aria-label={t('audioLabel', {duration: formatDuration(duration)})}
          />
          <TextView as="p" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
            {status === 'error'
              ? t('markerVoice')
              : started
                ? `${formatDuration(position)} / ${formatDuration(duration)}`
                : duration
                  ? formatDuration(duration)
                  : t('markerVoice')}
          </TextView>
        </div>
      </div>
      {transcript ? (
        <TextView as="p" className="audio-transcript" textStyle={TextStyle.META1}>
          {snippet(transcript, TRANSCRIPT_PREVIEW_LENGTH)}
        </TextView>
      ) : null}
    </div>
  );
}

/** A picture in the bubble: a shared reel's or post's thumbnail, a photo or a video's frame. */
function MediaContent({message}: {message: Message}) {
  const image = message.reel?.thumbnailUrl ?? message.post?.imageUrl ?? message.media?.imageUrl ?? null;
  const playable = message.kind === 'reel' || message.kind === 'video';
  const caption = message.kind === 'reel' ? message.reel?.author : message.kind === 'post' ? message.post?.author : null;
  const text = message.kind === 'post' ? message.text : '';
  return (
    <div className="media-block">
      {image ? (
        <div className={`media-thumb ${message.kind === 'reel' ? 'media-thumb--reel' : ''}`}>
          <img src={image} alt="" decoding="async" loading="lazy" />
          {playable ? <IconImage className="media-thumb-icon" source={message.kind === 'reel' ? filmstripFilled : circlePlayFilled} /> : null}
          {caption ? (
            <TextView as="span" className="media-thumb-caption" textStyle={TextStyle.META2}>
              {caption}
            </TextView>
          ) : null}
        </div>
      ) : (
        <TextView as="p" className="message-text" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
          {describeMessage(message)}
        </TextView>
      )}
      {text ? (
        <TextView as="p" className="message-text media-text" textStyle={TextStyle.META1}>
          {snippet(text, TRANSCRIPT_PREVIEW_LENGTH)}
        </TextView>
      ) : null}
    </div>
  );
}

export function MessageBubble({
  message,
  showSender,
  endsRun,
  initialFocusEligible,
  audio,
  onReact,
  onReply,
  onPlay,
  onView,
  onToggleAudio,
  onTranscribe,
  transcribeAvailable,
  transcript,
}: MessageBubbleProps) {
  const isOutgoing = message.fromMe;
  const reactions = message.reactions;
  const isAudio = message.kind === 'voice' && message.voice != null;
  const hasMedia = ['reel', 'post', 'photo', 'video'].includes(message.kind);
  const canPlay = (message.kind === 'reel' && message.reel?.playable === true) || (message.kind === 'video' && message.media?.videoUrl != null);
  const canView = (message.kind === 'photo' && message.media?.imageUrl != null) || (message.kind === 'post' && message.post?.imageUrl != null);
  const tailDirection = endsRun ? (isOutgoing ? 'right' : 'left') : 'none';
  const shapeProvider = useMemo(() => new TailShapeProvider(tailDirection, CornerRadius.MEDIUM), [tailDirection]);
  const material = useMemo(() => {
    if (!isOutgoing) {
      return MaterialLibrary.inboundMessage();
    }
    return MaterialLibrary.outboundMessage({
      idleFill: resolveColorToken(OUTBOUND_TOKEN_NAMES.idleFill),
      gradientStep1: resolveColorToken(OUTBOUND_TOKEN_NAMES.gradientStep1),
      gradientStep2: resolveColorToken(OUTBOUND_TOKEN_NAMES.gradientStep2),
      gradientStep3: resolveColorToken(OUTBOUND_TOKEN_NAMES.gradientStep3),
      gradientStep4: resolveColorToken(OUTBOUND_TOKEN_NAMES.gradientStep4),
      glowTint: resolveColorToken(OUTBOUND_TOKEN_NAMES.glowTint),
    });
  }, [isOutgoing]);
  const text = describeMessage(message);
  const time = formatBubbleTime(message.timestamp);
  const sender = isOutgoing ? t('you') : message.senderName;
  const body = isAudio ? audioDescription(message, audio) : text;
  const spokenBase = sender ? t('bubbleLabel', {sender, text: body, time}) : `${body}, ${time}`;
  const spoken = reactions.length ? `${spokenBase}, ${t('reactionsLabel', {list: reactionsText(reactions)})}` : spokenBase;
  const reactionTotal = reactionCount(reactions);
  const canReact = !message.pending;

  const [menuOpen, setMenuOpen] = useState(false);
  const bubbleElementRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<TriggerHandle>({getElement: () => bubbleElementRef.current});

  const shouldReturnFocusToTriggerRef = useRef(false);
  useLayoutEffect(() => {
    if (!menuOpen && shouldReturnFocusToTriggerRef.current) {
      shouldReturnFocusToTriggerRef.current = false;
      triggerRef.current?.getElement()?.focus({preventScroll: true});
    }
  }, [menuOpen]);

  const toggleMenu = () => setMenuOpen(open => !open);
  const dismissMenuToTrigger = (event?: MouseEvent<HTMLElement>) => {
    // Menu items render in a portal owned by the bubble; keep the click from
    // reaching the bubble and reopening the menu.
    event?.stopPropagation();
    shouldReturnFocusToTriggerRef.current = true;
    setMenuOpen(false);
  };
  const leaveMenu = (event: MouseEvent<HTMLElement> | undefined, action: () => void) => {
    event?.stopPropagation();
    setMenuOpen(false);
    action();
  };
  const playing = audio?.status === 'playing';

  const menu = (
    <ContextMenu
      aria-label={t('messageActionsLabel', {message: text})}
      onDismiss={reason => {
        if (reason === DismissReason.BACK_BUTTON || reason === DismissReason.NAVIGATION) {
          dismissMenuToTrigger();
        }
      }}>
      {canPlay ? (
        <ButtonContextMenuItemView title={t('playAction')} icon={circlePlayFilled} onClick={(event?: MouseEvent<HTMLElement>) => leaveMenu(event, () => onPlay(message))} />
      ) : null}
      {canView ? (
        <ButtonContextMenuItemView title={t('viewAction')} icon={expandFilled} onClick={(event?: MouseEvent<HTMLElement>) => leaveMenu(event, () => onView(message))} />
      ) : null}
      {isAudio ? (
        <ButtonContextMenuItemView
          title={playing ? t('pauseAction') : t('listenAction')}
          icon={playing ? mediaPauseFilled : circlePlayFilled}
          onClick={(event?: MouseEvent<HTMLElement>) => {
            // Back on the bubble, where the position and progress show.
            dismissMenuToTrigger(event);
            onToggleAudio(message);
          }}
        />
      ) : null}
      {isAudio ? (
        <ButtonContextMenuItemView
          title={t('transcribeAction')}
          ariaLabel={transcribeAvailable ? undefined : t('transcribeUnavailable')}
          icon={speechBubbleMessageFilled}
          disabled={!transcribeAvailable}
          onClick={(event?: MouseEvent<HTMLElement>) => leaveMenu(event, () => onTranscribe(message))}
        />
      ) : null}
      {canReact
        ? REACTIONS.map(emoji => (
            <EmojiContextMenuItemView
              key={emoji}
              emoji={emoji}
              ariaLabel={t('reactWith', {emoji})}
              onClick={(event?: MouseEvent<HTMLElement>) => {
                dismissMenuToTrigger(event);
                onReact(message, emoji);
              }}
            />
          ))
        : null}
      <ButtonContextMenuItemView title={t('replyAction')} icon={arrowBigReplyFilled} onClick={(event?: MouseEvent<HTMLElement>) => leaveMenu(event, () => onReply(message))} />
    </ContextMenu>
  );

  return (
    <div className={`message-row ${isOutgoing ? 'message-row--outgoing' : ''}`}>
      <div className="message-column">
        {showSender && message.senderName ? (
          <TextView className="message-sender" as="p" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
            {message.senderName}
          </TextView>
        ) : null}
        <div className="message-stack">
          <Container
            ref={bubbleElementRef}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            ariaLabel={t('messageActionsLabel', {message: spoken})}
            clickable
            focusable
            initialFocusEligible={initialFocusEligible}
            material={material}
            onClick={toggleMenu}
            shapeProvider={shapeProvider}
            tooltipMode={menuOpen ? TooltipMode.FOCUSED : TooltipMode.NONE}
            tooltipFocusable
            tooltipHidesFocusState
            tooltipContentDescription={t('messageActionsLabel', {message: text})}
            tooltipContent={menu}>
            <div className={`message-bubble-content ${message.kind === 'like' ? 'message-bubble-content--like' : ''}`}>
              {isAudio ? (
                <AudioContent message={message} audio={audio} transcript={transcript} />
              ) : hasMedia ? (
                <MediaContent message={message} />
              ) : (
                <TextView
                  className={`message-text ${message.kind === 'like' ? 'message-like' : ''}`}
                  as="p"
                  textStyle={TextStyle.BODY2}
                  textColor={isMarker(message) ? TextColor.SECONDARY : undefined}>
                  {text}
                </TextView>
              )}
            </div>
          </Container>
          {reactions.length ? (
            <div className="message-reactions" aria-hidden="true">
              <Chip
                chipStyle={ChipStyle.ELEVATED}
                text={reactions.map(reaction => reaction.emoji).join('')}
                metadata={reactionTotal > 1 ? String(reactionTotal) : undefined}
              />
            </div>
          ) : null}
        </div>
        {endsRun ? (
          <TextView className="message-timestamp" as="p" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
            {time}
          </TextView>
        ) : null}
      </div>
    </div>
  );
}
