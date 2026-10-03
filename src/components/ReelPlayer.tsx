// One reel, full height: the 9:16 video in a column at the centre of the HUD
// (the black around it is see-through on the glasses), its author and caption
// on a MediaWrapper shelf, a thin progress bar, and the counts in the margin.
//
// Enter on the reel pauses it and brings up the actions (feed) or toggles play
// (a reel opened from Direct, whose quick replies are always there). Back while
// paused resumes instead of leaving.
import chevronUpOutline from '@wearables-ui-toolkit/icons/svg/chevronup__outline.svg';
import heartFilled from '@wearables-ui-toolkit/icons/svg/heart__filled.svg';
import mediaPlayFilled from '@wearables-ui-toolkit/icons/svg/mediaplay__filled.svg';
import speakerSlashFilled from '@wearables-ui-toolkit/icons/svg/speakerslash__filled.svg';
import speechBubbleFilled from '@wearables-ui-toolkit/icons/svg/speechbubble__filled.svg';
import {
  ActionHint,
  Avatar,
  AvatarSize,
  IconImage,
  IndeterminateLoader,
  IndeterminateLoaderSize,
  MediaWrapper,
  MediaWrapperPosition,
  MediaWrapperSize,
  ProgressIndicator,
  ProgressIndicatorSize,
  TextColor,
  TextStyle,
  TextView,
} from '@wearables-ui-toolkit/mrbd';
import {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactNode} from 'react';
import type {Reel} from '../api/types';
import {userName} from '../format';
import {formatCount, t} from '../i18n/strings';
import {avatarFallback} from './avatarFallback';

/** A reel counts as watched after this much playback. */
const WATCHED_SECONDS = 2;

export type ReelPlayerHandle = {focusSurface(): void};

type Props = {
  reel: Reel;
  /** The reel on screen: it plays; others stay paused at their frame. */
  active: boolean;
  muted: boolean;
  /** Where to start, in seconds (coming back to a reel). */
  startAt?: number;
  onPosition?: (seconds: number) => void;
  onWatched?: (reel: Reel) => void;
  /** Shows the "Next" hint (the first reel of the feed). */
  showNextHint?: boolean;
  /** Feed: Enter pauses and calls onPause; the controls come from `controls`. */
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  /** The shelf under the caption while paused (feed) or always (Direct). */
  controls?: (state: {position: number; duration: number; seek(seconds: number): void}) => ReactNode;
  /** Controls stay up while playing (a reel opened from Direct). */
  controlsAlwaysShown?: boolean;
  /** Initial focus target when the reel shows. */
  initialFocusEligible?: boolean;
};

type Playback = {position: number; duration: number; status: 'loading' | 'playing' | 'paused' | 'failed'};

export const ReelPlayer = forwardRef<ReelPlayerHandle, Props>(function ReelPlayer(
  {reel, active, muted, startAt = 0, onPosition, onWatched, showNextHint, paused, onPausedChange, controls, controlsAlwaysShown, initialFocusEligible},
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const surfaceRef = useRef<HTMLButtonElement>(null);
  const [playback, setPlayback] = useState<Playback>({position: startAt, duration: reel.durationSec ?? 0, status: 'loading'});
  const [source, setSource] = useState(reel.videoUrl);
  /** The engine refused sound without a key press: muted until the next one. */
  const [autoMuted, setAutoMuted] = useState(false);
  const watchedRef = useRef(false);
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  useImperativeHandle(ref, () => ({focusSurface: () => surfaceRef.current?.focus({preventScroll: true})}), []);

  useEffect(() => {
    setSource(reel.videoUrl);
    watchedRef.current = false;
  }, [reel.videoUrl]);

  // Play the reel on screen, pause the others.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (!active || paused) {
      video.pause();
      return;
    }
    video.muted = muted || autoMuted;
    video.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'NotAllowedError' && !video.muted) {
        setAutoMuted(true);
        video.muted = true;
        video.play().catch(() => setPlayback(current => ({...current, status: 'paused'})));
      }
    });
  }, [active, autoMuted, muted, paused, source]);

  // Any key press counts as the user's gesture the engine wanted for sound.
  useEffect(() => {
    if (!autoMuted || !active) {
      return;
    }
    const restore = () => {
      setAutoMuted(false);
      const video = videoRef.current;
      if (video) {
        video.muted = muted;
      }
    };
    window.addEventListener('keydown', restore, {once: true, capture: true});
    return () => window.removeEventListener('keydown', restore, {capture: true});
  }, [active, autoMuted, muted]);

  const onLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (startAt > 0 && startAt < (video.duration || 0) - 0.5) {
      video.currentTime = startAt;
    }
    setPlayback(current => ({...current, duration: Number.isFinite(video.duration) ? video.duration : current.duration}));
  }, [startAt]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setPlayback(current => ({...current, position: video.currentTime}));
    onPositionRef.current?.(video.currentTime);
    if (!watchedRef.current && video.currentTime >= WATCHED_SECONDS) {
      watchedRef.current = true;
      onWatched?.(reel);
    }
  }, [onWatched, reel]);

  const onError = useCallback(() => {
    if (reel.videoProxyUrl && source !== reel.videoProxyUrl) {
      setSource(reel.videoProxyUrl);
      return;
    }
    setPlayback(current => ({...current, status: 'failed'}));
  }, [reel.videoProxyUrl, source]);

  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (video && Number.isFinite(seconds)) {
      video.currentTime = Math.max(0, seconds);
      setPlayback(current => ({...current, position: video.currentTime}));
    }
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && paused && !controlsAlwaysShown) {
        event.preventDefault();
        event.stopPropagation();
        onPausedChange(false);
        surfaceRef.current?.focus({preventScroll: true});
      }
    },
    [controlsAlwaysShown, onPausedChange, paused],
  );

  const author = userName(reel.user);
  const failed = playback.status === 'failed';
  const showControls = controls != null && (controlsAlwaysShown || paused);
  const stateLabel = paused ? t('reelPaused') : t('reelPlaying');
  const shelf = (
    <>
      <div className="reel-caption">
        <div className="reel-author">
          <Avatar
            size={AvatarSize.SMALL}
            src={reel.user?.avatarUrl ?? undefined}
            primaryContent={reel.user?.avatarUrl ? undefined : avatarFallback(author)}
            alt=""
          />
          <TextView as="span" className="reel-author-name" textStyle={TextStyle.LABEL_EMPHASIZED}>
            {author}
          </TextView>
        </div>
        {reel.caption ? (
          <TextView as="p" className="reel-caption-text" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
            {reel.caption}
          </TextView>
        ) : null}
        <TextView as="span" className="reel-audio" textStyle={TextStyle.META3} textColor={TextColor.SECONDARY}>
          {reel.audioTitle ?? t('originalAudio')}
        </TextView>
      </div>
      <ProgressIndicator
        className="reel-progress"
        size={ProgressIndicatorSize.THIN}
        value={playback.position}
        maximumValue={playback.duration || 1}
        isActive={playback.status === 'playing'}
        announceUpdatesForAccessibility={false}
        aria-label={t('positionLabel')}
      />
    </>
  );

  return (
    <div className={controlsAlwaysShown ? 'reel-player reel-player--shelf' : 'reel-player'} onKeyDown={onKeyDown}>
      <div className="reel-frame">
        <video
          ref={videoRef}
          className="reel-video"
          src={source}
          poster={reel.posterUrl ?? undefined}
          playsInline
          loop
          muted={muted || autoMuted}
          preload={active ? 'auto' : 'metadata'}
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onPlaying={() => setPlayback(current => ({...current, status: 'playing'}))}
          onWaiting={() => setPlayback(current => (current.status === 'failed' ? current : {...current, status: 'loading'}))}
          onPause={() => setPlayback(current => (current.status === 'failed' ? current : {...current, status: 'paused'}))}
          onError={onError}
        />
        {active && playback.status === 'loading' && !paused ? (
          <div className="reel-center" role="status" aria-label={t('reelLoading')}>
            <IndeterminateLoader size={IndeterminateLoaderSize.LARGE} />
          </div>
        ) : null}
        {paused && !failed ? (
          <div className="reel-paused-icon" aria-hidden="true">
            <IconImage className="reel-paused-glyph" source={mediaPlayFilled} />
          </div>
        ) : null}
        {failed ? (
          <div className="reel-center reel-failed" role="alert">
            <TextView as="p" textStyle={TextStyle.BODY2_EMPHASIZED}>
              {t('reelFailed')}
            </TextView>
            <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
              {t('reelFailedBody')}
            </TextView>
          </div>
        ) : null}
        {!showControls ? (
          <MediaWrapper className="reel-shelf" position={MediaWrapperPosition.BOTTOM} size={MediaWrapperSize.LARGE}>
            {shelf}
          </MediaWrapper>
        ) : null}
        <button
          ref={surfaceRef}
          type="button"
          className="reel-surface"
          aria-label={`${t('reelLabel', {author})}. ${reel.caption ? `${reel.caption}. ` : ''}${stateLabel}`}
          data-initial-focus={initialFocusEligible ? 'true' : undefined}
          onClick={() => onPausedChange(!paused)}
        />
      </div>
      {!showControls ? (
        <div className="reel-stats" aria-hidden="true">
          <div className="reel-stat">
            <IconImage source={heartFilled} className={reel.liked ? 'reel-stat-icon reel-stat-icon--on' : 'reel-stat-icon'} />
            <TextView as="span" textStyle={TextStyle.META3} textColor={TextColor.SECONDARY}>
              {reel.likeCount != null ? formatCount(reel.likeCount) : ''}
            </TextView>
          </div>
          <div className="reel-stat">
            <IconImage source={speechBubbleFilled} className="reel-stat-icon" />
            <TextView as="span" textStyle={TextStyle.META3} textColor={TextColor.SECONDARY}>
              {formatCount(reel.commentCount)}
            </TextView>
          </div>
        </div>
      ) : null}
      {!showControls && (showNextHint || autoMuted || muted) ? (
        <div className="reel-hints" aria-hidden="true">
          {muted || autoMuted ? <ActionHint icon={speakerSlashFilled} text={t('soundOffHint')} /> : null}
          {showNextHint ? <ActionHint icon={chevronUpOutline} text={t('nextHint')} /> : null}
        </div>
      ) : null}
      {showControls ? (
        <MediaWrapper className="reel-controls" position={MediaWrapperPosition.BOTTOM} size={MediaWrapperSize.LARGE}>
          {controlsAlwaysShown ? <div className="reel-controls-caption">{shelf}</div> : null}
          {controls?.({position: playback.position, duration: playback.duration, seek})}
        </MediaWrapper>
      ) : null}
    </div>
  );
});
