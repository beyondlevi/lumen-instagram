import arrowBigReplyFilled from '@wearables-ui-toolkit/icons/svg/arrowbigreply__filled.svg';
import arrowBigShareFilled from '@wearables-ui-toolkit/icons/svg/arrowbigshare__filled.svg';
import emojiLaughFilled from '@wearables-ui-toolkit/icons/svg/emojilaugh__filled.svg';
import heartFilled from '@wearables-ui-toolkit/icons/svg/heart__filled.svg';
import {ButtonRail, Page, QuickReplyButton, Toast} from '@wearables-ui-toolkit/mrbd';
import {useEffect, useState} from 'react';
import {Navigate, useNavigate, useParams} from 'react-router-dom';
import type {Message, Reel} from '../api/types';
import {ReelPlayer} from '../components/ReelPlayer';
import {ErrorContent, LoadingContent} from '../components/StateContent';
import {failureReason} from '../failure';
import {threadName} from '../format';
import {t} from '../i18n/strings';
import {useInstagram} from '../InstagramProvider';
import {sendPath, threadPath} from '../paths';

/** A video sent in Direct, shown with the reel player. */
function videoAsReel(message: Message): Reel | null {
  const media = message.media;
  if (!media?.videoUrl) {
    return null;
  }
  return {
    id: message.id,
    pk: message.id,
    code: '',
    user: null,
    caption: '',
    takenAt: message.timestamp,
    videoUrl: media.videoUrl,
    videoProxyUrl: media.videoProxyUrl,
    posterUrl: media.imageUrl,
    width: null,
    height: null,
    durationSec: null,
    likeCount: null,
    commentCount: 0,
    liked: false,
    saved: false,
    commentsDisabled: true,
    audioTitle: null,
  };
}

/** A reel (or a video) someone sent: it plays with quick replies to the message. */
export function PlayPage() {
  const {threadId = '', messageId = ''} = useParams();
  const navigate = useNavigate();
  const {thread, threadFor, sharedReel, loadSharedReel, react, muted} = useInstagram();
  const message = thread(threadId).messages.find(candidate => candidate.id === messageId);
  const code = message?.kind === 'reel' ? message.reel?.code ?? null : null;
  const shared = code ? sharedReel(code) : null;
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (code) {
      loadSharedReel(code);
    }
  }, [code, loadSharedReel]);

  if (!message) {
    return <Navigate to={threadPath(threadId)} replace />;
  }
  const reel = code ? (shared?.reel ?? null) : videoAsReel(message);
  const from = message.fromMe ? t('you') : (message.senderName ?? threadName(threadFor(threadId)));
  const header = {headerText: t('sharedHeader', {name: from}), enableSystemBarInset: false};

  if (code && shared?.status === 'error') {
    return (
      <Page {...header}>
        <ErrorContent error={shared.error} onRetry={() => loadSharedReel(code)} />
      </Page>
    );
  }
  if (!reel) {
    return (
      <Page {...header} headerIsLoading>
        <LoadingContent />
      </Page>
    );
  }

  const reactWith = (emoji: string) => {
    react(threadId, message, emoji)
      .then(result => Toast.show(result === 'added' ? t('reactionSent', {emoji}) : t('reactionRemoved')))
      .catch(error => Toast.show(t('reactionFailed', {reason: failureReason(error)})));
  };

  return (
    <Page {...header} className="play-page">
      <ReelPlayer
        reel={reel}
        active
        muted={muted}
        paused={paused}
        onPausedChange={setPaused}
        controlsAlwaysShown
        controls={() => (
          <ButtonRail centerContentWhenSmallerThanWidth>
            <QuickReplyButton icon={heartFilled} aria-label={t('sharedReactHeart')} onClick={() => reactWith('❤️')} />
            <QuickReplyButton icon={emojiLaughFilled} aria-label={t('sharedReactLaugh')} onClick={() => reactWith('😂')} />
            <QuickReplyButton
              title={t('replyAction')}
              icon={arrowBigReplyFilled}
              onClick={() => navigate(threadPath(threadId), {replace: true, state: {replyComposer: true}})}
            />
            {code && reel.code ? (
              <QuickReplyButton title={t('sendAction')} icon={arrowBigShareFilled} onClick={() => navigate(sendPath(reel.id))} />
            ) : null}
          </ButtonRail>
        )}
      />
    </Page>
  );
}
