import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {asBridgeError, BridgeClient, BridgeError, SESSION_ERRORS, type InstagramApi} from '../api/client';
import type {User} from '../api/types';
import type {ConfigField} from '../config/lumenConfig';
import {createDemoApi} from '../demo/demoApi';
import {setLocaleOverride} from '../i18n/strings';
import {useLumenConfig} from './useLumenConfig';

/** What the whole app shows: the bridge and the Instagram session decide before any screen. */
export type Phase =
  | {kind: 'loading'}
  | {kind: 'setup'; missing: ConfigField[]}
  | {kind: 'invalid'; field: ConfigField}
  /** bad_key, login_required or challenge: nothing works until it is fixed. */
  | {kind: 'session'; error: BridgeError}
  /** The first call to the bridge failed for another reason (network, Instagram). */
  | {kind: 'error'; error: BridgeError}
  | {kind: 'ready'};

/** Runs a call against the current API; session errors switch the app to their screen. */
export type Runner = <T>(request: (api: InstagramApi) => Promise<T>) => Promise<T>;

export type Session = {
  phase: Phase;
  /** Changes whenever the configuration does; stores reset on it. */
  api: InstagramApi | null;
  me: User | null;
  demo: boolean;
  run: Runner;
  retry(): void;
  reloadConfig(): Promise<void>;
};

export function useSession(): Session {
  const [config, reload] = useLumenConfig();
  const [me, setMe] = useState<User | null>(null);
  const [check, setCheck] = useState<{status: 'pending' | 'ok'} | {status: 'failed'; error: BridgeError}>({status: 'pending'});
  const [attempt, setAttempt] = useState(0);

  const api: InstagramApi | null = useMemo(() => {
    if (config.status === 'demo') {
      return createDemoApi();
    }
    return config.status === 'ready' ? new BridgeClient(config.config.url, config.config.key) : null;
  }, [config]);
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    setLocaleOverride(config.status === 'demo' ? 'en' : null);
  }, [config.status]);

  // The first call checks the key and the Instagram session.
  useEffect(() => {
    setMe(null);
    setCheck({status: 'pending'});
    if (!api) {
      return;
    }
    let alive = true;
    api.me().then(
      user => {
        if (alive) {
          setMe(user);
          setCheck({status: 'ok'});
        }
      },
      error => alive && setCheck({status: 'failed', error: asBridgeError(error)}),
    );
    return () => {
      alive = false;
    };
  }, [api, attempt]);

  const run = useCallback<Runner>(async request => {
    const client = apiRef.current;
    if (!client) {
      throw new BridgeError('network');
    }
    try {
      return await request(client);
    } catch (error) {
      const failure = asBridgeError(error);
      if (client === apiRef.current && SESSION_ERRORS.includes(failure.code)) {
        setCheck({status: 'failed', error: failure});
      }
      throw failure;
    }
  }, []);

  const retry = useCallback(() => setAttempt(count => count + 1), []);
  const reloadConfig = useCallback(async () => {
    await reload();
    setAttempt(count => count + 1);
  }, [reload]);

  let phase: Phase;
  if (config.status === 'loading') {
    phase = {kind: 'loading'};
  } else if (config.status === 'missing') {
    phase = {kind: 'setup', missing: config.fields};
  } else if (config.status === 'invalid') {
    phase = {kind: 'invalid', field: config.field};
  } else if (check.status === 'pending') {
    phase = {kind: 'loading'};
  } else if (check.status === 'failed') {
    phase = SESSION_ERRORS.includes(check.error.code) ? {kind: 'session', error: check.error} : {kind: 'error', error: check.error};
  } else {
    phase = {kind: 'ready'};
  }

  return {phase, api, me, demo: config.status === 'demo', run, retry, reloadConfig};
}
