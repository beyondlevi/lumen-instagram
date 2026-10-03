import filmstripFilled from '@wearables-ui-toolkit/icons/svg/filmstrip__filled.svg';
import speechBubbleFilled from '@wearables-ui-toolkit/icons/svg/speechbubble__filled.svg';
import {SubNavigationPager, type SubNavigationItem} from '@wearables-ui-toolkit/mrbd';
import {useMemo} from 'react';
import {t} from '../i18n/strings';
import {TAB_DIRECT, TAB_REELS, useInstagram} from '../InstagramProvider';
import {InboxTab} from './InboxTab';
import {ReelsTab} from './ReelsTab';

/** The app's top level: Reels and Direct as peer sections. */
export function HomePage() {
  const {tab, setTab, feed, inbox} = useInstagram();
  const unread = inbox.items.filter(thread => thread.unread).length;
  const items = useMemo<SubNavigationItem[]>(
    () => [
      {label: t('tabReels'), icon: filmstripFilled, isLoading: feed.status === 'loading'},
      {label: unread ? `${t('tabDirect')} · ${unread}` : t('tabDirect'), icon: speechBubbleFilled, isLoading: inbox.status === 'loading'},
    ],
    [feed.status, inbox.status, unread],
  );

  return (
    <SubNavigationPager
      items={items}
      currentPageIndex={tab}
      onPageChange={next => setTab(next)}
      // Over a reel the tabs fade out until focus goes back to them.
      autoHide={tab === TAB_REELS && feed.items.length > 0}
      ariaLabel={t('sectionsLabel')}>
      <ReelsTab active={tab === TAB_REELS} />
      <InboxTab active={tab === TAB_DIRECT} />
    </SubNavigationPager>
  );
}
