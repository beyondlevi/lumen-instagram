import {ListItem, Page, VerticalList} from '@wearables-ui-toolkit/mrbd';
import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {avatarFallback} from '../components/avatarFallback';
import {ErrorContent, LoadingContent, StateContent} from '../components/StateContent';
import {threadName} from '../format';
import {t, tp} from '../i18n/strings';
import {useInstagram} from '../InstagramProvider';
import {threadAvatar} from './InboxTab';

/** Send a reel to a conversation: Enter on a conversation sends it there. */
export function SendPage() {
  const {reelId = ''} = useParams();
  const {inbox, loadInbox, reelFor, shareReel} = useInstagram();
  const reel = reelFor(reelId);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    loadInbox({quiet: inbox.status === 'ready'});
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadInbox]);

  const send = async (threadId: string, name: string) => {
    if (!reel || sending) {
      return;
    }
    setSending(threadId);
    if (await shareReel(reel, threadId, name)) {
      setSent(previous => new Set(previous).add(threadId));
    }
    setSending(null);
  };

  let content;
  if (inbox.status === 'error' && inbox.items.length === 0) {
    content = <ErrorContent error={inbox.error} onRetry={() => loadInbox()} />;
  } else if ((inbox.status !== 'ready' && inbox.items.length === 0) || !reel) {
    content = <LoadingContent />;
  } else if (inbox.items.length === 0) {
    content = <StateContent title={t('noThreadsTitle')} body={t('noThreadsBody')} ariaLabel={t('emptyLabel')} />;
  } else {
    content = (
      <VerticalList insetForHeader ariaLabel={t('sendLabel')}>
        {inbox.items.map(thread => {
          const name = threadName(thread);
          const picture = threadAvatar(thread);
          const subtitle = sent.has(thread.id)
            ? t('sentSubtitle')
            : thread.isGroup
              ? tp('groupMembers', thread.users.length + 1)
              : thread.users[0]?.fullName || undefined;
          return (
            <ListItem
              key={thread.id}
              title={name}
              subtitle={subtitle}
              avatarSrc={picture}
              avatarPrimaryContent={picture ? undefined : avatarFallback(name, thread.isGroup)}
              avatarAlt={name}
              aria-busy={sending === thread.id}
              onClick={() => void send(thread.id, name)}
            />
          );
        })}
      </VerticalList>
    );
  }

  return (
    <Page headerText={t('sendHeader')} headerIsLoading={sending != null} enableSystemBarInset={false}>
      {content}
    </Page>
  );
}
