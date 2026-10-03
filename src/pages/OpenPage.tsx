import {Page} from '@wearables-ui-toolkit/mrbd';
import {useEffect} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {LoadingContent} from '../components/StateContent';
import {matchThread} from '../notifications';
import {t} from '../i18n/strings';
import {TAB_DIRECT, useInstagram} from '../InstagramProvider';
import {threadPath} from '../paths';

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
