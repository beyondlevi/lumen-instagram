// Configuration contract with the Lumen platform.
//
// On the glasses the platform injects `window.lumen.config`, backed by the
// fields declared under `lumen_config` in manifest.webmanifest and filled in on
// the phone companion: the bridge's address and its key. The key is a `secret`
// field: it stays on the glasses and is never bundled, logged or shown.
//
// In a regular browser (development only) `window.lumen` does not exist, so the
// values come from `?bridge.url=…&bridge.key=…` and are kept in localStorage.
// The parameters are removed from the address bar right after they are read.
//
// Demo mode: the optional `demo` field set to exactly `demo-captures` replaces
// the bridge with built-in fictional content (src/demo).

export const URL_KEY = 'bridge.url';
export const KEY_KEY = 'bridge.key';
/** Optional `lumen_config` field that turns on demo mode. */
export const DEMO_KEY = 'demo';
/** The only value of DEMO_KEY that turns on demo mode. */
export const DEMO_ACTIVATION = 'demo-captures';
/** The bridge refuses shorter keys. */
export const MIN_KEY_LENGTH = 24;

const URL_KEYS: readonly string[] = [URL_KEY, KEY_KEY, DEMO_KEY];

export type ConfigValues = Record<string, string>;

export type ConfigField = 'url' | 'key';

export type BridgeConfig = {
  /** Origin and path of the bridge, without a trailing slash. */
  url: string;
  key: string;
};

export type ConfigState =
  | {status: 'loading'}
  | {status: 'missing'; fields: ConfigField[]}
  | {status: 'invalid'; field: ConfigField}
  | {status: 'ready'; config: BridgeConfig}
  | {status: 'demo'};

type LumenConfigApi = {
  get(): Promise<ConfigValues>;
  onChange(callback: (values?: ConfigValues) => void): unknown;
};

declare global {
  /** What the Lumen host injects. */
  interface LumenHost {
    config?: LumenConfigApi;
  }
  interface Window {
    lumen?: LumenHost;
  }
}

export type ConfigSource = {
  kind: 'lumen' | 'dev';
  get(): Promise<ConfigValues>;
  /** Calls back with the new values when known, or with nothing (caller re-reads). */
  subscribe(callback: (values?: ConfigValues) => void): () => void;
};

export const DEV_STORAGE_KEY = 'lumen-instagram.dev-config';

/** The parts of `window` this module uses (lets tests pass a plain object). */
export type HostWindow = {
  location: {href: string};
  localStorage: Storage;
  history: {state: unknown; replaceState(state: unknown, unused: string, url: string): void};
  addEventListener(type: 'storage', listener: (event: StorageEvent) => void): void;
  removeEventListener(type: 'storage', listener: (event: StorageEvent) => void): void;
  lumen?: {config?: LumenConfigApi};
};

function readDevConfig(storage: Storage): ConfigValues {
  try {
    const raw = storage.getItem(DEV_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed == null || typeof parsed !== 'object') {
      return {};
    }
    const values: ConfigValues = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        values[key] = value;
      }
    }
    return values;
  } catch {
    return {};
  }
}

/**
 * Development fallback: moves `bridge.*` (and `demo`) URL parameters into
 * localStorage and strips them from the address bar. An empty value removes
 * the stored key. Always strips the parameters; only stores them when `store`.
 */
export function captureDevConfigFromUrl(store: boolean, win: HostWindow = window): void {
  const url = new URL(win.location.href);
  const keys = URL_KEYS.filter(key => url.searchParams.has(key));
  if (keys.length === 0) {
    return;
  }
  if (store) {
    const values = readDevConfig(win.localStorage);
    for (const key of keys) {
      const value = (url.searchParams.get(key) ?? '').trim();
      if (value) {
        values[key] = value;
      } else {
        delete values[key];
      }
    }
    try {
      win.localStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(values));
    } catch {
      // Storage full or blocked: the values stay unavailable, which shows Setup.
    }
  }
  for (const key of keys) {
    url.searchParams.delete(key);
  }
  win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
}

export function getConfigSource(win: HostWindow = window): ConfigSource {
  const lumenConfig = win.lumen?.config;
  if (lumenConfig != null && typeof lumenConfig.get === 'function') {
    return {
      kind: 'lumen',
      get: () => lumenConfig.get(),
      subscribe(callback) {
        if (typeof lumenConfig.onChange !== 'function') {
          return () => {};
        }
        const unsubscribe = lumenConfig.onChange(values =>
          callback(values != null && typeof values === 'object' ? values : undefined),
        );
        return typeof unsubscribe === 'function' ? () => unsubscribe() : () => {};
      },
    };
  }

  return {
    kind: 'dev',
    get: () => Promise.resolve(readDevConfig(win.localStorage)),
    subscribe(callback) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === DEV_STORAGE_KEY) {
          callback();
        }
      };
      win.addEventListener('storage', onStorage);
      return () => win.removeEventListener('storage', onStorage);
    },
  };
}

export function isDemoActivation(values: ConfigValues | null | undefined): boolean {
  const value = values?.[DEMO_KEY];
  return typeof value === 'string' && value.trim() === DEMO_ACTIVATION;
}

/** The bridge address without a trailing slash, or null when it isn't an http(s) URL. */
export function parseBridgeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) {
      return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** The key as the bridge expects it: printable, no spaces, long enough. */
export function parseBridgeKey(raw: string): string | null {
  const key = raw.trim().replace(/^bearer\s+/i, '');
  return key.length >= MIN_KEY_LENGTH && /^[\x21-\x7e]+$/.test(key) ? key : null;
}

export function parseConfig(values: ConfigValues | null | undefined): ConfigState {
  if (isDemoActivation(values)) {
    return {status: 'demo'};
  }
  const rawUrl = values?.[URL_KEY]?.trim() ?? '';
  const rawKey = values?.[KEY_KEY]?.trim() ?? '';
  const missing: ConfigField[] = [];
  if (!rawUrl) missing.push('url');
  if (!rawKey) missing.push('key');
  if (missing.length) {
    return {status: 'missing', fields: missing};
  }
  const url = parseBridgeUrl(rawUrl);
  if (url == null) {
    return {status: 'invalid', field: 'url'};
  }
  const key = parseBridgeKey(rawKey);
  if (key == null) {
    return {status: 'invalid', field: 'key'};
  }
  return {status: 'ready', config: {url, key}};
}

export function sameConfig(a: ConfigState, b: ConfigState): boolean {
  if (a.status !== b.status) {
    return false;
  }
  if (a.status === 'ready' && b.status === 'ready') {
    return a.config.url === b.config.url && a.config.key === b.config.key;
  }
  if (a.status === 'missing' && b.status === 'missing') {
    return a.fields.join() === b.fields.join();
  }
  if (a.status === 'invalid' && b.status === 'invalid') {
    return a.field === b.field;
  }
  return true;
}
