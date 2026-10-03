import {ListItem, Page, TimestampPosition, VerticalList} from '@wearables-ui-toolkit/mrbd';
import {useEffect} from 'react';
import {useParams} from 'react-router-dom';
import {avatarFallback} from '../components/avatarFallback';
import {ErrorContent, LoadingContent, StateContent} from '../components/StateContent';
import {formatListTime, userName} from '../format';
import {formatCount, t, tp} from '../i18n/strings';
import {useInstagram} from '../InstagramProvider';

const PREFETCH_ROWS = 4;

/** A reel's comments, read-only. */
export function CommentsPage() {
  const {reelId = ''} = useParams();
  const {comments, loadComments, reelFor} = useInstagram();
  const state = comments(reelId);
  const reel = reelFor(reelId);
  const count = state.count ?? reel?.commentCount ?? null;

  useEffect(() => {
    loadComments(reelId);
  }, [loadComments, reelId]);

  let content;
  if (state.status === 'error' && state.items.length === 0) {
    content = <ErrorContent error={state.error} onRetry={() => loadComments(reelId)} />;
  } else if (state.status !== 'ready' && state.items.length === 0) {
    content = <LoadingContent />;
  } else if (state.items.length === 0) {
    const off = state.disabled || reel?.commentsDisabled;
    content = (
      <StateContent
        title={off ? t('commentsOffTitle') : t('noCommentsTitle')}
        body={off ? t('commentsOffBody') : t('noCommentsBody')}
        ariaLabel={t('emptyLabel')}
      />
    );
  } else {
    content = (
      <VerticalList insetForHeader ariaLabel={t('commentsLabel')}>
        {state.items.map((comment, index) => {
          const author = userName(comment.user);
          return (
            <ListItem
              key={comment.id}
              title={author}
              subtitle={comment.replyCount ? `${comment.text} · ${tp('repliesCount', comment.replyCount)}` : comment.text}
              subtitleMaxLines={4}
              timestamp={formatListTime(comment.createdAt)}
              timestampPosition={TimestampPosition.ACCESSORY_TOP}
              avatarSrc={comment.user?.avatarUrl ?? undefined}
              avatarPrimaryContent={comment.user?.avatarUrl ? undefined : avatarFallback(author)}
              avatarAlt={author}
              aria-label={`${t('commentLabel', {author})}: ${comment.text}`}
              onFocus={index >= state.items.length - PREFETCH_ROWS ? () => loadComments(reelId, {more: true}) : undefined}
            />
          );
        })}
      </VerticalList>
    );
  }

  return (
    <Page
      headerText={t('commentsHeader')}
      headerMetadata={count != null ? formatCount(count) : undefined}
      headerIsLoading={state.status === 'loading'}
      enableSystemBarInset={false}>
      {content}
    </Page>
  );
}
