import arrowBigShareFilled from '@wearables-ui-toolkit/icons/svg/arrowbigshare__filled.svg';
import bookmarkFilled from '@wearables-ui-toolkit/icons/svg/bookmark__filled.svg';
import heartFilled from '@wearables-ui-toolkit/icons/svg/heart__filled.svg';
import speakerHiFilled from '@wearables-ui-toolkit/icons/svg/speakerhi__filled.svg';
import speakerSlashFilled from '@wearables-ui-toolkit/icons/svg/speakerslash__filled.svg';
import speechBubbleFilled from '@wearables-ui-toolkit/icons/svg/speechbubble__filled.svg';
import {Button, ButtonRail, Pager, PagerOrientation, PagerPage, Scrubber, type ButtonHandle} from '@wearables-ui-toolkit/mrbd';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import type {Reel} from '../api/types';
import {ReelPlayer} from '../components/ReelPlayer';
import {ErrorContent, LoadingContent, StateContent} from '../components/StateContent';
import {formatCount, t, tp} from '../i18n/strings';
import {useInstagram} from '../InstagramProvider';
import {commentsPath, sendPath} from '../paths';

/** The next page loads when the feed gets this close to its end. */
const PREFETCH_REELS = 3;

/**
 * Coming back from a reel's Comments or Send: that reel shows paused with its
 * actions, so the focus the route restores lands on the button that was used.
 */
let returnPausedOn: string | null = null;

type ActionsProps = {
  reel: Reel;
  position: number;
  duration: number;
  seek(seconds: number): void;
  firstRef: React.Ref<ButtonHandle>;
};

/** Paused reel: the position, then Like, Comments, Send, Save and Sound. */
function ReelActions({reel, position, duration, seek, firstRef}: ActionsProps) {
  const navigate = useNavigate();
  const {toggleLike, toggleSave, muted, setMuted} = useInstagram();
  const likes = reel.likeCount != null ? tp('likesLabel', reel.likeCount) : t('likeCountHidden');
  const open = (path: string) => {
    returnPausedOn = reel.id;
    navigate(path);
  };
  return (
    <div className="reel-actions">
      {duration > 0 ? (
        <div className="reel-scrubber">
          <Scrubber
            aria-label={t('positionLabel')}
            value={Math.min(100, (position / duration) * 100)}
            durationSeconds={Math.round(duration)}
            hideScrim
            onValueChanged={value => seek((value / 100) * duration)}
          />
        </div>
      ) : null}
      <ButtonRail centerContentWhenSmallerThanWidth>
        <Button
          ref={firstRef}
          title={reel.likeCount != null ? formatCount(reel.likeCount) : t('likeAction')}
          icon={heartFilled}
          alwaysShowText
          showIconActiveIndicator={reel.liked}
          aria-label={`${reel.liked ? t('unlikeAction') : t('likeAction')}, ${likes}`}
          aria-pressed={reel.liked}
          initialFocusEligible={false}
          onClick={() => toggleLike(reel)}
        />
        <Button
          title={formatCount(reel.commentCount)}
          icon={speechBubbleFilled}
          alwaysShowText
          aria-label={tp('commentsCount', reel.commentCount)}
          initialFocusEligible={false}
          onClick={() => open(commentsPath(reel.id))}
        />
        <Button
          title={t('sendAction')}
          icon={arrowBigShareFilled}
          aria-label={t('sendAction')}
          initialFocusEligible={false}
          onClick={() => open(sendPath(reel.id))}
        />
        <Button
          icon={bookmarkFilled}
          showIconActiveIndicator={reel.saved}
          aria-label={reel.saved ? t('unsaveAction') : t('saveAction')}
          aria-pressed={reel.saved}
          initialFocusEligible={false}
          onClick={() => toggleSave(reel)}
        />
        <Button
          icon={muted ? speakerSlashFilled : speakerHiFilled}
          aria-label={muted ? t('soundOnAction') : t('soundOffAction')}
          aria-pressed={!muted}
          initialFocusEligible={false}
          onClick={() => setMuted(!muted)}
        />
      </ButtonRail>
    </div>
  );
}

/** The Reels feed: one reel per page of a vertical pager; up and down move between reels. */
export function ReelsTab({active}: {active: boolean}) {
  const {feed, loadReels, loadMoreReels, reelIndex, setReelIndex, markWatched, muted, positions} = useInstagram();
  const current = feed.items[reelIndex] ?? null;
  const [paused, setPaused] = useState(() => current != null && returnPausedOn === current.id);
  const firstActionRef = useRef<ButtonHandle>(null);
  const pausedOnOpenRef = useRef(paused);

  useEffect(() => {
    returnPausedOn = null;
  }, []);

  useEffect(() => {
    if (active) {
      loadReels();
    }
  }, [active, loadReels]);

  useEffect(() => {
    if (feed.items.length && reelIndex >= feed.items.length - PREFETCH_REELS) {
      loadMoreReels();
    }
  }, [feed.items.length, loadMoreReels, reelIndex]);

  // Pausing brings the actions up with the focus on Like (not when the route
  // restored a paused reel: it restores the focus too).
  useEffect(() => {
    if (!paused) {
      return;
    }
    if (pausedOnOpenRef.current) {
      pausedOnOpenRef.current = false;
      return;
    }
    const frame = window.requestAnimationFrame(() => firstActionRef.current?.getElement()?.focus({preventScroll: true}));
    return () => window.cancelAnimationFrame(frame);
  }, [paused]);

  const changePage = useCallback(
    (index: number) => {
      setPaused(false);
      setReelIndex(index);
    },
    [setReelIndex],
  );

  if (feed.status === 'error' && feed.items.length === 0) {
    return <ErrorContent error={feed.error} onRetry={() => loadReels({refresh: true})} />;
  }
  if (feed.status !== 'ready' && feed.items.length === 0) {
    return <LoadingContent />;
  }
  if (feed.items.length === 0) {
    return (
      <StateContent
        title={t('reelsEmptyTitle')}
        body={t('reelsEmptyBody')}
        action={{label: t('retry'), onClick: () => loadReels({refresh: true})}}
        ariaLabel={t('emptyLabel')}
      />
    );
  }

  return (
    <Pager
      className="reels-pager"
      orientation={PagerOrientation.VERTICAL}
      currentPageIndex={Math.min(reelIndex, feed.items.length - 1)}
      onPageChange={changePage}
      useBackButtonForHome={false}
      ariaLabel={t('reelsLabel')}>
      {feed.items.map((reel, index) => (
        <PagerPage key={reel.id}>
          {Math.abs(index - reelIndex) <= 1 ? (
            <ReelPlayer
              reel={reel}
              active={active && index === reelIndex}
              muted={muted}
              startAt={positions.get(reel.id) ?? 0}
              onPosition={seconds => positions.set(reel.id, seconds)}
              onWatched={markWatched}
              showNextHint={index === 0 && reelIndex === 0 && feed.items.length > 1}
              paused={index === reelIndex && paused}
              onPausedChange={setPaused}
              initialFocusEligible={index === reelIndex}
              controls={({position, duration, seek}) => (
                <ReelActions reel={reel} position={position} duration={duration} seek={seek} firstRef={firstActionRef} />
              )}
            />
          ) : (
            <div className="reel-placeholder" />
          )}
        </PagerPage>
      ))}
    </Pager>
  );
}
