import {
  Button,
  ButtonRail,
  IndeterminateLoader,
  IndeterminateLoaderSize,
  Page,
  ScrollView,
  TextColor,
  TextStyle,
  TextView,
} from '@wearables-ui-toolkit/mrbd';
import {useCallback, useEffect, useState} from 'react';
import {Navigate, useParams} from 'react-router-dom';
import {audioErrorMessage} from '../audio/audioErrors';
import {audioErrorCode} from '../audio/lumenAudio';
import {failureReason} from '../failure';
import {formatDuration, threadName} from '../format';
import {t} from '../i18n/strings';
import {useInstagram} from '../InstagramProvider';
import {threadPath} from '../paths';

type TranscriptState =
  | {status: 'working'; partial: string}
  | {status: 'done'; text: string}
  | {status: 'error'; message: string};

/** The audio of a voice message: from the CDN, or through the bridge when that fails. */
async function fetchAudio(urls: (string | null | undefined)[]): Promise<Blob> {
  let failure: unknown = new Error('decode');
  for (const url of urls) {
    if (!url) continue;
    try {
      const response = await fetch(url, {credentials: 'omit'});
      if (response.ok) {
        return await response.blob();
      }
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

/** Transcript of a voice message, made by the Lumen host's dictation engine. */
export function TranscriptPage() {
  const {threadId, messageId} = useParams();
  if (!threadId || !messageId) {
    return <Navigate to="/" replace />;
  }
  return <Transcript threadId={threadId} messageId={messageId} />;
}

function Transcript({threadId, messageId}: {threadId: string; messageId: string}) {
  const {thread, threadFor, audio, transcriptFor, saveTranscript} = useInstagram();
  const message = thread(threadId).messages.find(candidate => candidate.id === messageId);
  const cached = transcriptFor(messageId);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<TranscriptState>(cached != null ? {status: 'done', text: cached} : {status: 'working', partial: ''});

  useEffect(() => {
    if (message?.voice == null || audio == null || (attempt === 0 && cached != null)) {
      return;
    }
    const voice = message.voice;
    const controller = new AbortController();
    setState({status: 'working', partial: ''});
    (async () => {
      let blob: Blob;
      try {
        blob = await fetchAudio([voice.audioUrl, voice.audioProxyUrl]);
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({status: 'error', message: t('audioFailed', {reason: failureReason(error)})});
        }
        return;
      }
      try {
        const result = await audio.transcribe(blob, {
          signal: controller.signal,
          onPartial: partial => {
            if (!controller.signal.aborted) {
              setState({status: 'working', partial});
            }
          },
        });
        if (!controller.signal.aborted) {
          saveTranscript(messageId, result.text);
          setState({status: 'done', text: result.text});
        }
      } catch (error) {
        if (!controller.signal.aborted && audioErrorCode(error) !== 'cancelled') {
          setState({status: 'error', message: audioErrorMessage(error)});
        }
      }
    })();
    // Back stops the transcription.
    return () => controller.abort();
    // Once per opening (and Try again); polls of the thread must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, audio, message?.id]);

  const retry = useCallback(() => setAttempt(count => count + 1), []);

  if (message?.voice == null || audio == null) {
    return <Navigate to={threadPath(threadId)} replace />;
  }

  const sender = message.fromMe ? t('you') : (message.senderName ?? threadName(threadFor(threadId)));
  const meta = `${sender}, ${formatDuration(message.voice.durationSec ?? 0)}`.toUpperCase();
  const text = state.status === 'done' ? state.text || t('transcriptEmpty') : state.status === 'working' ? state.partial : state.message;

  return (
    <Page headerText={t('transcriptHeader')} enableSystemBarInset={false}>
      <div className="action-page-shell">
        <ScrollView insetForHeader tabIndex={0} ariaLabel={t('transcriptLabel', {name: sender})}>
          <div className="content-inset" role="status" aria-live="polite">
            <TextView as="p" textStyle={TextStyle.LABEL} textColor={TextColor.SECONDARY}>
              {meta}
            </TextView>
            {state.status === 'error' ? (
              <TextView as="p" textStyle={TextStyle.BODY2_EMPHASIZED}>
                {t('transcriptFailedTitle')}
              </TextView>
            ) : null}
            {text ? (
              <TextView as="p" textStyle={TextStyle.BODY2}>
                {text}
              </TextView>
            ) : null}
            {state.status === 'working' ? (
              <div className="transcript-progress">
                <IndeterminateLoader size={IndeterminateLoaderSize.SMALL} />
                <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                  {t('transcribing')}
                </TextView>
              </div>
            ) : null}
          </div>
        </ScrollView>
        {state.status === 'error' ? (
          <div className="action-dock">
            <ButtonRail>
              <Button title={t('retry')} onClick={retry} />
            </ButtonRail>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
