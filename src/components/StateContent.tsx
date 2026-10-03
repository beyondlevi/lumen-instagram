import {Button, ScrollView, Shimmer, ShimmerItem, ShimmerItemCornerRadius, TextColor, TextStyle, TextView} from '@wearables-ui-toolkit/mrbd';
import {asBridgeError} from '../api/client';
import {errorCopy} from '../failure';
import {t} from '../i18n/strings';

type Props = {
  title: string;
  body: string;
  /** Recovery command; without one the text itself takes focus. */
  action?: {label: string; onClick(): void};
  detail?: string;
  role?: 'alert' | 'status';
  ariaLabel: string;
  insetForHeader?: boolean;
};

/** Empty and error states: copy in the route's single ScrollView, with its recovery Button below. */
export function StateContent({title, body, action, detail, role, ariaLabel, insetForHeader = true}: Props) {
  return (
    <ScrollView insetForHeader={insetForHeader} tabIndex={action ? undefined : 0} ariaLabel={ariaLabel}>
      <div className="content-inset" role={role}>
        <TextView as="p" textStyle={TextStyle.BODY2_EMPHASIZED}>
          {title}
        </TextView>
        <TextView as="p" textStyle={TextStyle.LABEL} textColor={TextColor.SECONDARY}>
          {body}
        </TextView>
        {detail ? (
          <TextView as="p" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
            {detail}
          </TextView>
        ) : null}
        {action ? (
          <div className="state-action">
            <Button title={action.label} alwaysShowText onClick={action.onClick} />
          </div>
        ) : null}
      </div>
    </ScrollView>
  );
}

/** The error state of a collection, with Try again. */
export function ErrorContent({error, onRetry, insetForHeader}: {error: unknown; onRetry(): void; insetForHeader?: boolean}) {
  const [title, body] = errorCopy(error);
  const failure = asBridgeError(error);
  return (
    <StateContent
      title={title}
      body={body}
      detail={failure.status != null && failure.code !== 'rate_limited' ? t('httpStatus', {status: failure.status}) : undefined}
      action={{label: t('retry'), onClick: onRetry}}
      role="alert"
      ariaLabel={t('errorLabel')}
      insetForHeader={insetForHeader}
    />
  );
}

/** While a collection loads: placeholders shaped like its rows. Focus stays where it was. */
export function LoadingContent({rows = 3, insetForHeader = true}: {rows?: number; insetForHeader?: boolean}) {
  return (
    <ScrollView insetForHeader={insetForHeader} ariaLabel={t('loadingLabel')}>
      <div className="content-inset" role="status" aria-label={t('loadingLabel')}>
        <Shimmer>
          <div className="shimmer-rows">
            {Array.from({length: rows}, (_, index) => (
              <div key={index} className="shimmer-row">
                <ShimmerItem className="shimmer-avatar" cornerRadius={ShimmerItemCornerRadius.XLARGE} />
                <div className="shimmer-lines">
                  <ShimmerItem className="shimmer-line shimmer-line--short" />
                  <ShimmerItem className="shimmer-line" />
                </div>
              </div>
            ))}
          </div>
        </Shimmer>
      </div>
    </ScrollView>
  );
}
