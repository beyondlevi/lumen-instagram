import {ListItem, StatusIndicatorType, TimestampPosition, TimestampTextColor, VerticalList} from '@wearables-ui-toolkit/mrbd';
import {useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import type {Thread} from '../api/types';
import {avatarFallback} from '../components/avatarFallback';
import {ErrorContent, LoadingContent, StateContent} from '../components/StateContent';
import {formatListTime, threadName, threadPreview} from '../format';
import {t} from '../i18n/strings';
import {useInstagram} from '../InstagramProvider';
import {threadPath} from '../paths';
import {INBOX_POLL_MS} from '../state/useDirectStore';

/** Loading older conversations starts when focus gets this close to the end. */
const PREFETCH_ROWS = 4;

/** The picture of a conversation: the other person's, or none for a group. */
export function threadAvatar(thread: Thread): string | undefined {
  return thread.isGroup ? undefined : (thread.users[0]?.avatarUrl ?? undefined);
}

/** Refreshes the inbox every INBOX_POLL_MS while `active` and the app is visible. */
export function useInboxPolling(active: boolean) {
  const {loadInbox} = useInstagram();
  useEffect(() => {
    if (!active) {
      return;
    }
    loadInbox();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadInbox({quiet: true});
      }
    }, INBOX_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, loadInbox]);
}

/** Direct: the conversations, newest first. */
export function InboxTab({active}: {active: boolean}) {
  const navigate = useNavigate();
  const {inbox, loadInbox, loadMoreThreads} = useInstagram();
  useInboxPolling(active);

  if (inbox.status === 'error' && inbox.items.length === 0) {
    return <ErrorContent error={inbox.error} onRetry={() => loadInbox()} />;
  }
  if (inbox.status !== 'ready' && inbox.items.length === 0) {
    return <LoadingContent />;
  }
  if (inbox.items.length === 0) {
    return (
      <StateContent
        title={t('directEmptyTitle')}
        body={t('directEmptyBody')}
        action={{label: t('retry'), onClick: () => loadInbox()}}
        ariaLabel={t('emptyLabel')}
      />
    );
  }

  return (
    <VerticalList insetForHeader ariaLabel={t('inboxLabel')}>
      {inbox.items.map((thread, index) => {
        const name = threadName(thread);
        const picture = threadAvatar(thread);
        return (
          <ListItem
            key={thread.id}
            title={name}
            subtitle={threadPreview(thread)}
            timestamp={formatListTime(thread.lastActivityAt)}
            timestampPosition={TimestampPosition.ACCESSORY_TOP}
            timestampTextColor={thread.unread ? TimestampTextColor.ACCENT : TimestampTextColor.PRIMARY}
            avatarSrc={picture}
            avatarPrimaryContent={picture ? undefined : avatarFallback(name, thread.isGroup)}
            avatarAlt={name}
            avatarStatusIndicator={thread.unread ? StatusIndicatorType.UNREAD : undefined}
            onClick={() => navigate(threadPath(thread.id))}
            onFocus={index >= inbox.items.length - PREFETCH_ROWS ? loadMoreThreads : undefined}
          />
        );
      })}
    </VerticalList>
  );
}
