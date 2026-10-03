import {describe, expect, it} from 'vitest';
import {BridgeClient, BridgeError, resolveUrl} from '../../src/api/client';

const BASE = 'https://bridge.example.com/ig';
const KEY = 'k'.repeat(32);

type Call = {url: string; init?: RequestInit};

function client(responses: ((call: Call) => Response | Promise<Response>)[]) {
  const calls: Call[] = [];
  const api = new BridgeClient(`${BASE}/`, KEY, async (url, init) => {
    const call = {url, init};
    calls.push(call);
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next(call);
  });
  return {api, calls};
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...headers}});

describe('BridgeClient', () => {
  it('sends the key as a Bearer header, never in the URL', async () => {
    const {api, calls} = client([() => json({items: [], nextCursor: null})]);
    await api.reels('cursor 2');
    expect(calls[0].url).toBe(`${BASE}/v1/reels?cursor=cursor+2`);
    expect(calls[0].url).not.toContain(KEY);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].init?.credentials).toBe('omit');
  });

  it('makes bridge links absolute and leaves CDN links alone', async () => {
    const {api} = client([
      () =>
        json({
          items: [
            {
              id: '1_2', pk: '1', code: 'C', caption: '', takenAt: null, width: null, height: null, durationSec: null,
              likeCount: 1, commentCount: 0, liked: false, saved: false, commentsDisabled: false, audioTitle: null,
              user: {id: '2', username: 'maya', fullName: '', avatarUrl: '/v1/m/avatar.sig', verified: false},
              videoUrl: 'https://instagram.fgru2-1.fna.fbcdn.net/v.mp4',
              videoProxyUrl: '/v1/m/video.sig',
              posterUrl: '/v1/m/poster.sig',
            },
          ],
          nextCursor: null,
        }),
    ]);
    const page = await api.reels();
    const reel = page.items[0];
    expect(reel.videoUrl).toBe('https://instagram.fgru2-1.fna.fbcdn.net/v.mp4');
    expect(reel.videoProxyUrl).toBe(`https://bridge.example.com/v1/m/video.sig`);
    expect(reel.posterUrl).toBe('https://bridge.example.com/v1/m/poster.sig');
    expect(reel.user?.avatarUrl).toBe('https://bridge.example.com/v1/m/avatar.sig');
  });

  it('maps bridge errors to codes', async () => {
    const {api} = client([
      () => json({error: {code: 'challenge', message: 'x'}}, 409),
      () => json({error: {code: 'rate_limited', message: 'x', retryAfter: 300}}, 429),
      () => json({error: {code: 'login_required', message: 'x'}}, 401),
      () => new Response('<html>tunnel page</html>', {status: 200}),
      () => Promise.reject(new TypeError('Failed to fetch')),
    ]);
    await expect(api.inbox()).rejects.toMatchObject({code: 'challenge', status: 409});
    await expect(api.inbox()).rejects.toMatchObject({code: 'rate_limited', retryAfter: 300});
    await expect(api.inbox()).rejects.toMatchObject({code: 'login_required'});
    await expect(api.inbox()).rejects.toMatchObject({code: 'network'});
    await expect(api.inbox()).rejects.toBeInstanceOf(BridgeError);
  });

  it('sends writes with the right methods and bodies', async () => {
    const ok = () => json({ok: true});
    const {api, calls} = client([ok, ok, ok, ok, ok]);
    await api.setLiked('1_2', false);
    await api.react('77', '88', '😂', true);
    await api.sendText('77', 'hi');
    await api.markSeen('77', '88');
    await api.sendVoice('77', new Blob(['x'], {type: 'audio/ogg'}), [0.12345, 1]);
    expect(calls.map(call => `${call.init?.method} ${call.url.replace(BASE, '')}`)).toEqual([
      'DELETE /v1/reels/1_2/like',
      'POST /v1/threads/77/items/88/reaction',
      'POST /v1/threads/77/text',
      'POST /v1/threads/77/seen',
      'POST /v1/threads/77/voice',
    ]);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({emoji: '😂', remove: true});
    const form = calls[4].init?.body as FormData;
    expect(form.get('levels')).toBe('[0.123,1]');
    expect((form.get('audio') as File).name).toBe('voice.ogg');
  });
});

describe('resolveUrl', () => {
  it('resolves against the bridge', () => {
    expect(resolveUrl('https://b.example.com/ig', '/v1/m/x')).toBe('https://b.example.com/v1/m/x');
    expect(resolveUrl('https://b.example.com', null)).toBeNull();
    expect(resolveUrl('https://b.example.com', 'blob:http://x/1')).toBe('blob:http://x/1');
  });
});
