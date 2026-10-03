import {describe, expect, it} from 'vitest';
import {captureDevConfigFromUrl, parseBridgeKey, parseBridgeUrl, parseConfig, sameConfig, type HostWindow} from '../../src/config/lumenConfig';

const KEY = 'k'.repeat(32);

describe('parseConfig', () => {
  it('lists what is missing', () => {
    expect(parseConfig({})).toEqual({status: 'missing', fields: ['url', 'key']});
    expect(parseConfig({'bridge.url': 'https://bridge.example.com'})).toEqual({status: 'missing', fields: ['key']});
  });

  it('accepts a bridge URL and key', () => {
    expect(parseConfig({'bridge.url': ' https://bridge.example.com/ig/ ', 'bridge.key': KEY})).toEqual({
      status: 'ready',
      config: {url: 'https://bridge.example.com/ig', key: KEY},
    });
  });

  it('refuses a URL that is not http(s) or carries credentials, a query or a hash', () => {
    for (const url of ['ftp://bridge.example.com', 'https://user:pass@bridge.example.com', 'https://b.example.com/?x=1', 'https://b.example.com/#a', 'bridge']) {
      expect(parseConfig({'bridge.url': url, 'bridge.key': KEY})).toEqual({status: 'invalid', field: 'url'});
    }
  });

  it('refuses short keys and keys with spaces, and takes off a Bearer prefix', () => {
    expect(parseConfig({'bridge.url': 'https://b.example.com', 'bridge.key': 'short'})).toEqual({status: 'invalid', field: 'key'});
    expect(parseBridgeKey(`${'a'.repeat(20)} ${'b'.repeat(10)}`)).toBeNull();
    expect(parseBridgeKey(`Bearer ${KEY}`)).toBe(KEY);
  });

  it('turns on demo mode with the exact value only', () => {
    expect(parseConfig({demo: 'demo-captures'})).toEqual({status: 'demo'});
    expect(parseConfig({demo: 'yes'}).status).toBe('missing');
  });

  it('compares states', () => {
    const ready = parseConfig({'bridge.url': 'https://b.example.com', 'bridge.key': KEY});
    expect(sameConfig(ready, parseConfig({'bridge.url': 'https://b.example.com/', 'bridge.key': KEY}))).toBe(true);
    expect(sameConfig(ready, parseConfig({'bridge.url': 'https://c.example.com', 'bridge.key': KEY}))).toBe(false);
    expect(parseBridgeUrl('http://192.168.0.10:8787')).toBe('http://192.168.0.10:8787');
  });
});

describe('captureDevConfigFromUrl', () => {
  function fakeWindow(href: string) {
    const store = new Map<string, string>();
    const replaced: string[] = [];
    const win: HostWindow = {
      location: {href},
      localStorage: {
        getItem: key => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
      } as Storage,
      history: {state: null, replaceState: (_state, _unused, url) => void replaced.push(url)},
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    return {win, store, replaced};
  }

  it('stores the parameters and strips them from the address', () => {
    const {win, store, replaced} = fakeWindow(`http://127.0.0.1:4173/direct/1?bridge.url=https%3A%2F%2Fb.example.com&bridge.key=${KEY}&x=1`);
    captureDevConfigFromUrl(true, win);
    expect(JSON.parse(store.get('lumen-instagram.dev-config') ?? '{}')).toEqual({'bridge.url': 'https://b.example.com', 'bridge.key': KEY});
    expect(replaced).toEqual(['/direct/1?x=1']);
  });

  it('only strips them on the glasses', () => {
    const {win, store, replaced} = fakeWindow(`http://127.0.0.1:4173/?bridge.key=${KEY}`);
    captureDevConfigFromUrl(false, win);
    expect(store.size).toBe(0);
    expect(replaced).toEqual(['/']);
  });
});
