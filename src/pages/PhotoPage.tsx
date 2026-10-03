import {IndeterminateLoader, IndeterminateLoaderSize, Page, TextStyle, TextView} from '@wearables-ui-toolkit/mrbd';
import {useState} from 'react';
import {Navigate, useParams} from 'react-router-dom';
import {describeMessage, threadName} from '../format';
import {t} from '../i18n/strings';
import {useInstagram} from '../InstagramProvider';
import {threadPath} from '../paths';

/** A photo or a post's picture from a conversation, fitted to the screen. */
export function PhotoPage() {
  const {threadId = '', messageId = ''} = useParams();
  const {thread, threadFor} = useInstagram();
  const message = thread(threadId).messages.find(candidate => candidate.id === messageId);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const image = message?.media?.imageUrl ?? message?.post?.imageUrl ?? null;

  if (!message || !image) {
    return <Navigate to={threadPath(threadId)} replace />;
  }
  const from = message.fromMe ? t('you') : (message.senderName ?? threadName(threadFor(threadId)));
  return (
    <Page headerText={t('sharedHeader', {name: from})} headerIsLoading={!loaded && !failed} enableSystemBarInset={false}>
      <div className="photo-frame" tabIndex={0} aria-label={describeMessage(message)}>
        {!loaded && !failed ? <IndeterminateLoader size={IndeterminateLoaderSize.MEDIUM} /> : null}
        {failed ? (
          <TextView as="p" textStyle={TextStyle.BODY2}>
            {t('audioFailed', {reason: t('reasonNotFound')})}
          </TextView>
        ) : null}
        <img
          className="photo-image"
          src={image}
          alt=""
          hidden={!loaded}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </div>
    </Page>
  );
}
