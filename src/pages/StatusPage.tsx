import {Page, TextColor, TextStyle, TextView} from '@wearables-ui-toolkit/mrbd';
import {useState} from 'react';
import {LoadingContent, StateContent} from '../components/StateContent';
import type {ConfigField} from '../config/lumenConfig';
import {errorCopy} from '../failure';
import {locale, t, type StringKey} from '../i18n/strings';
import {useInstagram, type Phase} from '../InstagramProvider';

const FIELD_LABELS: Record<ConfigField, StringKey> = {url: 'fieldUrl', key: 'fieldKey'};

/** Shown instead of every route until the bridge answers with a working Instagram session. */
export function StatusPage({phase}: {phase: Exclude<Phase, {kind: 'ready'}>}) {
  const {reloadConfig, retry} = useInstagram();
  const [checked, setChecked] = useState(false);

  if (phase.kind === 'loading') {
    return (
      <Page headerText={t('loadingHeader')} headerIsLoading enableSystemBarInset={false}>
        <LoadingContent />
      </Page>
    );
  }

  const checkAgain = async () => {
    await reloadConfig();
    setChecked(true);
  };

  if (phase.kind === 'setup') {
    const missing = new Intl.ListFormat(locale, {type: 'conjunction'}).format(phase.missing.map(field => t(FIELD_LABELS[field])));
    return (
      <Page headerText={t('setupHeader')} headerMetadata={checked ? t('setupStillMissing') : undefined} enableSystemBarInset={false}>
        <StateContent
          title={t('setupTitle')}
          body={t('setupBody')}
          detail={`${t('setupMissingLabel')}: ${missing}`}
          action={{label: t('checkAgain'), onClick: () => void checkAgain()}}
          role="status"
          ariaLabel={t('setupLabel')}
        />
      </Page>
    );
  }

  if (phase.kind === 'invalid') {
    const [title, body] = phase.field === 'url' ? [t('invalidUrlTitle'), t('invalidUrlBody')] : [t('invalidKeyTitle'), t('invalidKeyBody')];
    return (
      <Page headerText={t('setupHeader')} enableSystemBarInset={false}>
        <StateContent title={title} body={body} action={{label: t('checkAgain'), onClick: () => void checkAgain()}} role="alert" ariaLabel={t('setupLabel')} />
      </Page>
    );
  }

  const [title, body] = errorCopy(phase.error);
  const onRetry = phase.error.code === 'bad_key' ? () => void checkAgain() : retry;
  return (
    <Page headerText={phase.kind === 'session' ? t('setupHeader') : t('errorHeader')} enableSystemBarInset={false}>
      <StateContent
        title={title}
        body={body}
        detail={phase.kind === 'error' && phase.error.status != null ? t('httpStatus', {status: phase.error.status}) : undefined}
        action={{label: phase.error.code === 'bad_key' ? t('checkAgain') : t('retry'), onClick: onRetry}}
        role="alert"
        ariaLabel={t('errorLabel')}
      />
      {phase.kind === 'session' ? (
        <TextView as="span" className="visually-hidden" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
          {phase.error.code}
        </TextView>
      ) : null}
    </Page>
  );
}
