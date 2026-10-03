import {Page} from '@wearables-ui-toolkit/mrbd';
import {useEffect} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import type {Thread} from '../api/types';
import {LoadingContent} from '../components/StateContent';
import {t} from '../i18n/strings';
import {TAB_DIRECT, useInstagram} from '../InstagramProvider';
import {threadPath} from '../paths';

function normal(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase();
}

/**
 * The conversation an Instagram notification on the phone is about, from its
 * title: a thread title, a username or a full name. Instagram titles DMs with
 * the sender ("ana.costa") or "group: sender".
 */
export function matchThread(threads: Thread[], title: string): Thread | null {
  const wanted = normal(title);
  if (!wanted) {
    return null;
  }
  const candidates = [wanted, ...wanted.split(/[:·]/).map(part => part.trim()).filter(Boolean)];
  for (const candidate of candidates) {
    const found = threads.find(
      thread =>
        normal(thread.title) === candidate ||
        thread.users.some(user => normal(user.username) === candidate || (user.fullName && normal(user.fullName) === candidate)),
    );
    if (found) {
      return found;
    }
  }
  return null;
}

/** Opened from a phone notification (manifest `lumen_notifications`): finds the conversation. */
export function OpenPage() {
  const {title = ''} = useParams();
  const navigate = useNavigate();
  const {inbox, loadInbox, setTab} = useInstagram();

  useEffect(() => {
    loadInbox({quiet: inbox.status === 'ready'});
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadInbox]);

  useEffect(() => {
    if (inbox.status !== 'ready' && inbox.status !== 'error') {
      return;
    }
    const thread = matchThread(inbox.items, title);
    setTab(TAB_DIRECT);
    navigate('/', {replace: true});
    if (thread) {
      navigate(threadPath(thread.id));
    }
  }, [inbox.items, inbox.status, navigate, setTab, title]);

  return (
    <Page headerText={t('loadingHeader')} headerIsLoading enableSystemBarInset={false}>
      <LoadingContent />
      <span className="visually-hidden" role="status">
        {t('openingLabel')}
      </span>
    </Page>
  );
}
