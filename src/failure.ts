import {asBridgeError, type BridgeError} from './api/client';
import {formatWait} from './format';
import {t, type StringKey} from './i18n/strings';

/** Short reason for a failed call, for toasts. */
export function failureReason(error: unknown): string {
  const failure = asBridgeError(error);
  const keys: Partial<Record<BridgeError['code'], StringKey>> = {
    network: 'reasonNetwork',
    timeout: 'reasonTimeout',
    bad_key: 'reasonSession',
    login_required: 'reasonSession',
    challenge: 'reasonSession',
    rate_limited: 'reasonRate',
    blocked: 'reasonBlocked',
    comments_disabled: 'reasonBlocked',
    not_found: 'reasonNotFound',
    bad_audio: 'reasonAudio',
    too_large: 'reasonAudio',
  };
  if (error instanceof Error && error.message === 'decode') {
    return t('reasonFormat');
  }
  return t(keys[failure.code] ?? 'reasonServer');
}

/** Title and body for a failed request shown as a screen. */
export function errorCopy(error: unknown): [string, string] {
  const failure = asBridgeError(error);
  switch (failure.code) {
    case 'network':
      return [t('errNetworkTitle'), t('errNetworkBody')];
    case 'timeout':
      return [t('errTimeoutTitle'), t('errTimeoutBody')];
    case 'rate_limited':
      return [t('errRateTitle'), t('errRateBody', {time: formatWait(failure.retryAfter ?? 60)})];
    case 'blocked':
      return [t('errBlockedTitle'), t('errBlockedBody')];
    case 'not_found':
      return [t('errNotFoundTitle'), t('errNotFoundBody')];
    case 'comments_disabled':
      return [t('commentsOffTitle'), t('commentsOffBody')];
    case 'bad_key':
      return [t('badKeyTitle'), t('badKeyBody')];
    case 'login_required':
      return [t('loginTitle'), t('loginBody')];
    case 'challenge':
      return [t('challengeTitle'), t('challengeBody')];
    default:
      return [t('errServerTitle'), t('errServerBody')];
  }
}
